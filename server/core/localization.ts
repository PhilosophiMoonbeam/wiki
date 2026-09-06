import _ from 'lodash'
import dotize from 'dotize'
import * as i18nMiddleware from 'i18next-http-middleware'
import i18next from 'i18next'
import fs from 'fs-extra'
import path from 'node:path'
import * as yaml from 'js-yaml'
import type { Express } from 'express'
import { LocaleCodeSchema } from '../../shared/locale-policy.ts'

interface LocaleRow { strings?: unknown }
type WikiSource = typeof WIKI
type WikiContext = WikiSource & {
  IS_DEBUG: boolean
  SERVERPATH: string
  config: { lang: { code: string; namespaces: string[]; namespacing: boolean; revision?: string } }
  data: { localeNamespaces: string[] }
  logger: { info(message: string): void; error(message: string): void }
  models: { locales: { query(): { select(column: string): Promise<{ code: string }[]>; findOne(column: string, value: string): Promise<LocaleRow | null> } } }
}
const wiki = WIKI as WikiContext
let refreshQueue: Promise<void> = Promise.resolve()
const loadedBundles = new Map<string, Set<string>>()
const engineLocale = (locale: string): string => Intl.getCanonicalLocales(locale)[0] ?? locale
const localization = {
  engine: i18next,
  namespaces: [] as string[],
  localeCodes: [] as string[],
  appliedRevision: null as string | null,
  appliedLocale: null as string | null,
  init() {
    this.namespaces = [...wiki.data.localeNamespaces]
    void this.engine.init({ load: 'all', ns: this.namespaces, defaultNS: 'common', saveMissing: false, lng: engineLocale(wiki.config.lang.code), fallbackLng: 'en' })
      .then(() => this.refreshNamespaces(true))
      .catch(error => wiki.logger.error(`Locale initialization failed: ${error instanceof Error ? error.message : String(error)}`))
    return this
  },
  attachMiddleware(app: Express) {
    const middleware = i18nMiddleware.handle(this.engine)
    app.use((req, res, next) => Reflect.apply(middleware, undefined, [req, res, next]))
  },
  async getByNamespace(locale: string, namespace: string) {
    locale = engineLocale(locale)
    if (!this.engine.hasResourceBundle(locale, namespace)) throw new Error('Invalid locale or namespace')
    const data = this.engine.getResourceBundle(locale, namespace) as Record<string, unknown>
    return _.map(dotize.convert(data), (value, key) => ({ key, value }))
  },
  async refreshNamespaces(silent = false): Promise<void> {
    const next = refreshQueue.catch(() => {}).then(async () => {
      const config = structuredClone(wiki.config.lang)
      const codes = [...new Set(['en', config.code, ...(config.namespacing ? config.namespaces : [])])]
      for (const code of codes) LocaleCodeSchema.parse(code)
      const english: unknown = await fs.readJson(path.join(wiki.SERVERPATH, 'locales/en.json'))
      if (!_.isPlainObject(english)) throw new Error('Bundled English locale is invalid.')
      const installed = await wiki.models.locales.query().select('code')
      const resources = new Map<string, Record<string, unknown>>()
      // Read every package before mutating the engine; failed refreshes retain the last good resources.
      for (const code of codes) {
        const resource: Record<string, unknown> = code === 'en' ? _.cloneDeep(english as Record<string, unknown>) : {}
        const row = await wiki.models.locales.query().findOne('code', code)
        if (!row && code !== 'en' && !silent) throw new Error(`Locale ${code} is not installed.`)
        if (row?.strings != null) {
          if (!_.isPlainObject(row.strings)) throw new Error(`Locale ${code} has an invalid translation package.`)
          _.merge(resource, row.strings)
        }
        if (wiki.IS_DEBUG) {
          try {
            const entries = yaml.load(await fs.readFile(path.join(wiki.SERVERPATH, `locales/${code}.yml`), 'utf8'))
            if (_.isPlainObject(entries)) {
              _.merge(resource, entries)
              wiki.logger.info(`Loaded dev locales from ${code}.yml`)
            }
          } catch (error) { void error }
        }
        resources.set(engineLocale(code), resource)
      }
      // Replacing complete snapshots removes deleted keys and disabled languages.
      for (const [code, namespaces] of loadedBundles) for (const namespace of namespaces) this.engine.removeResourceBundle(code, namespace)
      loadedBundles.clear()
      const namespaces = new Set(wiki.data.localeNamespaces)
      for (const [code, resource] of resources) {
        const loaded = new Set<string>()
        for (const [namespace, data] of Object.entries(resource)) {
          if (!_.isPlainObject(data)) continue
          this.engine.removeResourceBundle(code, namespace)
          this.engine.addResourceBundle(code, namespace, data, true, true)
          loaded.add(namespace)
          namespaces.add(namespace)
        }
        loadedBundles.set(code, loaded)
      }
      this.namespaces = [...namespaces]
      this.localeCodes = installed.map(locale => locale.code).filter(code => LocaleCodeSchema.safeParse(code).success)
      await this.engine.changeLanguage(engineLocale(config.code))
      this.appliedLocale = config.code
      this.appliedRevision = config.revision ?? null
    })
    refreshQueue = next
    return next
  },
  async setCurrentLocale(locale: string) {
    await this.engine.changeLanguage(engineLocale(locale))
  }
}
export default localization
