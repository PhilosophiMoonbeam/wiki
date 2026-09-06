import path from 'node:path'
import { afterEach, describe, expect, it, vi } from './bun-test.mts'
import englishLocale from '../locales/en.json'

const originalWiki = Reflect.get(globalThis, 'WIKI')

afterEach(() => {
  vi.unmockModule('i18next', import.meta.url)
  vi.resetModules()
  if (originalWiki === undefined) Reflect.deleteProperty(globalThis, 'WIKI')
  else Reflect.set(globalThis, 'WIKI', originalWiki)
})

describe('bundled English locale fallback', () => {
  it('contains the critical setup, authentication, and administration labels', () => {
    expect(englishLocale).toMatchObject({
      common: {
        welcome: {
          title: 'Welcome to your wiki!',
          createhome: 'Create Home Page'
        },
        header: {
          admin: 'Administration',
          account: 'Account'
        }
      },
      auth: {
        actions: {
          login: 'Log In'
        }
      },
      admin: {
        dashboard: {
          title: 'Dashboard'
        }
      }
    })
  })

  it('loads bundled English before installed locale overrides', async () => {
    const engine = {
      addResourceBundle: vi.fn(),
      removeResourceBundle: vi.fn(),
      changeLanguage: vi.fn()
    }
    vi.mockModule('i18next', import.meta.url, () => ({ default: engine }))
    Reflect.set(globalThis, 'WIKI', {
      IS_DEBUG: false,
      SERVERPATH: path.join(process.cwd(), 'server'),
      config: { lang: { code: 'en', namespaces: [], namespacing: false } },
      data: { localeNamespaces: ['admin'] },
      logger: { info: vi.fn() },
      models: {
        locales: {
          query: () => ({
            select: async () => [{ code: 'en' }],
            findOne: vi.fn().mockResolvedValue({
              strings: { admin: { dashboard: { title: 'Installed Dashboard' } } }
            })
          })
        }
      }
    })

    const localization = (await vi.importFresh('../core/localization.ts', import.meta.url)).default
    await localization.refreshNamespaces()

    const adminBundles = engine.addResourceBundle.mock.calls
      .filter(([, namespace]) => namespace === 'admin')
    expect(adminBundles).toHaveLength(1)
    expect(adminBundles[0]?.slice(0, 2)).toEqual(['en', 'admin'])
    expect(adminBundles[0]?.[2]).toMatchObject({ dashboard: { title: 'Installed Dashboard' }, agents: { title: 'Agents', subtitle: expect.any(String) } })
    expect(adminBundles[0]?.slice(3)).toEqual([true, true])
    expect(engine.changeLanguage).toHaveBeenCalledWith('en')
  })
})
