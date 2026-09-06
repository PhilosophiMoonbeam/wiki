import { beforeEach, afterEach, describe, expect, it, vi } from '../bun-test.mts'
const fetchCatalog = vi.fn(),
  fetchStrings = vi.fn(),
  publish = vi.fn()
vi.mockModule('../../repositories/locale-packages.ts', import.meta.url, () => ({ fetchLocaleCatalog: fetchCatalog, fetchLocaleStrings: fetchStrings }))
vi.mockModule('../../operations/locale-synchronization.ts', import.meta.url, () => ({ publishLocaleSynchronization: publish }))
const originalWiki = globalThis.WIKI
const fr = { code: 'fr', name: 'French', nativeName: 'Français', isRTL: false, availability: 90 }
const createWiki = () => ({
  config: { graphEndpoint: 'https://languages.example.test', offline: false, lang: { code: 'fr', autoUpdate: true, namespacing: false, namespaces: [] } },
  models: {
    knex: vi.fn(() => ({
      select: async () => [
        { code: 'fr', updatedAt: 'before' },
        { code: 'ar', updatedAt: 'before' }
      ]
    }))
  },
  cache: { set: vi.fn() },
  lang: { refreshNamespaces: vi.fn() },
  configSvc: { loadFromDb: vi.fn() },
  events: { outbound: { emit: vi.fn() } },
  logger: { info: vi.fn(), error: vi.fn() }
})
let wiki: ReturnType<typeof createWiki>
beforeEach(() => {
  wiki = createWiki()
  globalThis.WIKI = wiki as never
  fetchCatalog.mockResolvedValue([fr])
  fetchStrings.mockResolvedValue({ common: { title: 'Bonjour' } })
  publish.mockResolvedValue({ changed: ['fr'] })
})
afterEach(() => {
  globalThis.WIKI = originalWiki
})
const load = async () => (await vi.importFresh('../../jobs/sync-graph-locales.ts', import.meta.url)).default
describe('automatic language synchronization', () => {
  it('stages every active package before a guarded publication and activates the committed revision', async () => {
    await (await load())()
    expect(fetchStrings).toHaveBeenCalledTimes(1)
    expect(fetchStrings).toHaveBeenCalledWith(wiki.config.graphEndpoint, 'fr')
    expect(publish).toHaveBeenCalledWith(
      wiki.models.knex,
      expect.objectContaining({ updates: [{ locale: fr, expectedUpdatedAt: 'before', strings: { common: { title: 'Bonjour' } } }] })
    )
    expect(wiki.configSvc.loadFromDb).toHaveBeenCalled()
    expect(wiki.lang.refreshNamespaces).toHaveBeenCalled()
    expect(wiki.events.outbound.emit).toHaveBeenCalledWith('reloadConfig')
  })
  it('preserves installed state if any package fetch fails', async () => {
    fetchStrings.mockRejectedValue(new Error('private source details'))
    await expect((await load())()).rejects.toThrow('could not complete')
    expect(publish).not.toHaveBeenCalled()
    expect(wiki.cache.set).not.toHaveBeenCalled()
    expect(JSON.stringify(wiki.logger.error.mock.calls)).not.toContain('private source')
  })
  it('refreshes only the catalog when updates are disabled and skips all remote work offline', async () => {
    wiki.config.lang.autoUpdate = false
    publish.mockResolvedValue({ changed: [] })
    await (await load())()
    expect(fetchStrings).not.toHaveBeenCalled()
    expect(wiki.lang.refreshNamespaces).not.toHaveBeenCalled()
    fetchCatalog.mockClear()
    wiki.config.offline = true
    await (await load())()
    expect(fetchCatalog).not.toHaveBeenCalled()
  })
  it('retains an installed language absent from the upstream catalog', async () => {
    fetchCatalog.mockResolvedValue([])
    publish.mockResolvedValue({ changed: [] })
    await (await load())()
    expect(fetchStrings).not.toHaveBeenCalled()
    expect(publish).toHaveBeenCalledWith(wiki.models.knex, expect.objectContaining({ updates: [] }))
  })
})
