import type { Knex } from 'knex'
import { fetchLocaleCatalog, fetchLocaleStrings } from '../repositories/locale-packages.ts'
import { publishLocaleSynchronization, type AutomaticLocaleUpdate } from '../operations/locale-synchronization.ts'
interface WikiContext {
  config: { graphEndpoint: string; offline?: boolean; lang: { autoUpdate: boolean; namespacing: boolean; namespaces: string[]; code: string } }
  logger: { info(message: string): void; error(message: string): void }
  cache: { set(key: string, value: unknown): unknown }
  models: { knex: Knex }
  configSvc: { loadFromDb(): Promise<void> }
  lang: { refreshNamespaces(): Promise<void> }
  events: { outbound: { emit(event: string): void } }
}
const wiki = WIKI as unknown as WikiContext
export default async function syncGraphLocales(): Promise<void> {
  if (wiki.config.offline) return
  const endpoint = wiki.config.graphEndpoint
  wiki.logger.info('Syncing interface language catalog and active packages...')
  try {
    const catalog = await fetchLocaleCatalog(endpoint),
      updates: AutomaticLocaleUpdate[] = []
    const installed = await wiki.models.knex('locales').select('code', 'updatedAt')
    if (wiki.config.lang.autoUpdate) {
      const active = new Set([wiki.config.lang.code, ...(wiki.config.lang.namespacing ? wiki.config.lang.namespaces : [])])
      for (const current of installed) {
        if (!active.has(current.code)) continue
        const locale = catalog.find(row => row.code === current.code)
        if (!locale) continue // An installed package can outlive its upstream catalog entry.
        updates.push({ locale, expectedUpdatedAt: current.updatedAt, strings: await fetchLocaleStrings(endpoint, current.code) })
      }
    }
    const result = await publishLocaleSynchronization(wiki.models.knex, { endpoint, catalog, updates, fallback: wiki.config })
    await wiki.cache.set('locales', catalog)
    if (result.changed.length) {
      await wiki.configSvc.loadFromDb()
      await wiki.lang.refreshNamespaces()
      wiki.events.outbound.emit('reloadConfig')
    }
    wiki.logger.info(`Language synchronization completed; ${result.changed.length} installed packages changed.`)
  } catch {
    wiki.logger.error('Language synchronization failed. Saved packages remain available; review the configured source and Locale operations.')
    throw new Error('Language synchronization could not complete.')
  }
}
