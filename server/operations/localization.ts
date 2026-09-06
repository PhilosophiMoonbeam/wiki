import { getLocaleAdministrationStore } from './locale-administration.ts'
import { type PagePrincipal } from '../helpers/page-access.ts'
import _ from 'lodash'

import errors from './errors.ts'

const { ApplicationError } = errors

interface Locale {
  code: string
  isRTL: boolean
  updatedAt: unknown
  [key: string]: unknown
}

interface LocaleQuery {
  select(...columns: string[]): LocaleQuery & PromiseLike<Locale[]>
  where(column: string, value: unknown): LocaleQuery
  first(): Promise<Locale | undefined>
}

interface LocaleConfigInput {
  locale: string
  autoUpdate: boolean
  namespacing: boolean
  namespaces: string[]
}

const getRuntime = () => {
  const wiki = WIKI
  return {
    cache: wiki.cache as { get(key: string): Promise<Locale[] | undefined> },
    localesModel: (wiki.models as { locales: { query(): LocaleQuery } }).locales,
    config: wiki.config as { lang: LocaleConfigInput & { code: string, rtl: boolean } },
    language: wiki.lang as {
      getByNamespace(locale: string, namespace: string): unknown
    }
  }
}

const listLocales = async () => {
  const { cache, localesModel } = getRuntime()
  let remoteLocales = await cache.get('locales')
  const localLocales = await localesModel.query().select('code', 'isRTL', 'name', 'nativeName', 'createdAt', 'updatedAt', 'availability')
  remoteLocales = remoteLocales ? [...remoteLocales, ...localLocales.filter(local => !remoteLocales?.some(remote => remote.code === local.code))] : localLocales
  return remoteLocales.map(locale => {
    const installed = localLocales.find(local => local.code === locale.code)
    return { ...locale, isInstalled: Boolean(installed), installDate: installed ? installed.updatedAt : null }
  })
}

const getConfig = () => {
  const { config } = getRuntime()
  return {
    locale: config.lang.code,
    autoUpdate: config.lang.autoUpdate,
    namespacing: config.lang.namespacing,
    namespaces: config.lang.namespaces
  }
}

const getTranslations = ({ locale, namespace }: { locale: string, namespace: string }): unknown =>
  getRuntime().language.getByNamespace(locale, namespace)

const isLocaleConfig = (input: unknown): input is LocaleConfigInput => Boolean(
  input && _.isPlainObject(input) && _.isString(Reflect.get(input as object, 'locale')) && Reflect.get(input as object, 'locale').length > 0 &&
  _.isBoolean(Reflect.get(input as object, 'autoUpdate')) && _.isBoolean(Reflect.get(input as object, 'namespacing')) &&
  Array.isArray(Reflect.get(input as object, 'namespaces')) &&
  Reflect.get(input as object, 'namespaces').every((namespace: unknown) => _.isString(namespace) && namespace.length > 0)
)

const updateConfig = async (input: unknown, requester?: PagePrincipal): Promise<void> => {
  if (!isLocaleConfig(input)) throw new ApplicationError('Invalid locale config payload', { code: 'INVALID_LOCALE_CONFIGURATION', status: 400 })
  const store = getLocaleAdministrationStore(), saved = await store.inspect(requester)
  await store.save(requester, { policy: input, fingerprint: saved.fingerprint, reason: 'Update language settings through the compatibility API' })
}
const download = async (code: unknown, requester?: PagePrincipal) => {
  const store = getLocaleAdministrationStore(), saved = await store.inspect(requester)
  return store.enqueue(requester, { kind: 'install', code, fingerprint: saved.fingerprint, reason: 'Install language package through the compatibility API' })
}

export default { download, getConfig, getTranslations, listLocales, updateConfig }
