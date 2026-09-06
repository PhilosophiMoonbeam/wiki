import { afterEach, describe, it, expect, vi } from '../bun-test.mts'
const originalWiki = globalThis.WIKI
afterEach(() => { globalThis.WIKI = originalWiki })
describe('reader language menu revision cache', () => {
  it('ignores older language lists after a publication and avoids caching rows under a later revision', async () => {
    const lang = { namespacing: true, namespaces: ['en'], revision: 'current' }
    const cache = { get: vi.fn(async (key: string) => key === 'nav:locales:previous' ? [{ code: 'fr', name: 'Français' }] : null), set: vi.fn() }
    const query = { select: vi.fn().mockReturnThis(), whereIn: vi.fn().mockReturnThis(), orderBy: vi.fn(async () => { lang.revision = 'later'; return [{ code: 'en', name: 'English' }] }) }
    globalThis.WIKI = { config: { lang }, cache, models: { locales: { query: () => query } } } as never
    const Locale = (await vi.importFresh('../../models/locales.ts', import.meta.url)).default
    expect(await Locale.getNavLocales({ cache: true })).toEqual([{ code: 'en', name: 'English' }])
    expect(cache.get).toHaveBeenCalledWith('nav:locales:current'); expect(cache.set).toHaveBeenCalledWith('nav:locales:current', [{ code: 'en', name: 'English' }], 300)
    lang.namespacing = false; cache.get.mockClear(); expect(await Locale.getNavLocales({ cache: true })).toEqual([]); expect(cache.get).not.toHaveBeenCalled()
  })
})
