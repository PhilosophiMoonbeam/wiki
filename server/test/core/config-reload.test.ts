import { afterEach, describe, expect, it, vi } from '../bun-test.mts'
import type * as ConfigModule from '../../core/config.ts'

describe('distributed config reload', () => {
  const previousWiki = globalThis.WIKI

  afterEach(() => {
    globalThis.WIKI = previousWiki
    vi.restoreAllMocks()
  })

  it.each([
    ['enabled', true, 1],
    ['disabled', false, false]
  ] as const)('applies %s one-hop proxy trust while preserving canonical config identity', async (_label, securityTrustProxy, expectedTrustProxy) => {
    vi.resetModules()
    let reloadListener: (() => Promise<void>) | undefined
    const canonicalConfig = {
      db: { pass: 'initial-secret' },
      flags: { sqllog: false },
      security: { securityTrustProxy: !securityTrustProxy },
      port: 3000,
      title: 'Before reload',
      host: 'https://before.example.com',
      banner: { isEnabled: true, title: 'Previous notice', content: '', tone: 'info', startsAt: '2026-09-08T10:00:00Z', endsAt: '2026-09-08T12:00:00Z' },
      auth: { audience: 'old-audience' },
      pageExtensions: ['md', 'html', 'txt'],
      seo: { robots: ['index', 'follow'], description: 'Keep missing defaults' }
    }
    const appLocals = { config: canonicalConfig }
    const setAppSetting = vi.fn()
    const knexConfig = { debug: false }
    const getConfig = vi.fn().mockResolvedValue({
      db: { pass: 'reloaded-secret' },
      flags: { sqllog: true },
      security: { securityTrustProxy },
      port: 4000,
      title: 'After reload',
      host: 'https://after.example.com',
      banner: { isEnabled: false, title: '', content: '' },
      auth: { audience: 'new-audience' },
      pageExtensions: ['md'],
      seo: { robots: [] }
    })

    const auth = {
      jwtAudience: 'old-audience',
      strategyHost: 'https://before.example.com',
      activateStrategies: vi.fn(async () => {
        auth.jwtAudience = 'new-audience'
        auth.strategyHost = canonicalConfig.host
      })
    }
    globalThis.WIKI = {
      auth,
      app: { locals: appLocals, set: setAppSetting },
      config: canonicalConfig,
      events: {
        inbound: {
          on: vi.fn((_event: string, listener: () => Promise<void>) => {
            reloadListener = listener
          })
        },
        outbound: { emit: vi.fn() }
      },
      logger: { error: vi.fn(), warn: vi.fn() },
      models: {
        knex: { client: { config: knexConfig } },
        settings: { getConfig, query: vi.fn() }
      },
      product: { name: 'tsEpistle' }
    } as typeof globalThis.WIKI

    const { default: configService } = await vi.importFresh<typeof ConfigModule>('../../core/config.ts', import.meta.url)
    globalThis.WIKI.configSvc = configService
    configService.subscribeToEvents()
    if (!reloadListener) throw new Error('reloadConfig listener was not registered')

    await reloadListener()

    expect(globalThis.WIKI.config).toBe(canonicalConfig)
    expect(appLocals.config).toBe(canonicalConfig)
    expect(appLocals.config).toMatchObject({
      db: { pass: 'reloaded-secret' },
      flags: { sqllog: true },
      security: { securityTrustProxy },
      port: 4000,
      title: 'After reload',
      host: 'https://after.example.com',
      banner: { isEnabled: false, title: '', content: '' },
      pageExtensions: ['md'],
      seo: { robots: [], description: 'Keep missing defaults' }
    })
    expect(canonicalConfig.banner).toEqual({ isEnabled: false, title: '', content: '' })
    expect(knexConfig.debug).toBe(true)
    expect(setAppSetting.mock.calls).toEqual([['trust proxy', expectedTrustProxy]])
    expect(auth.activateStrategies).toHaveBeenCalledOnce()
    await reloadListener()
    expect(auth.activateStrategies).toHaveBeenCalledOnce()
    getConfig.mockResolvedValue({ ...globalThis.WIKI.config, host: 'https://third.example.com' })
    await reloadListener()
    expect(auth.activateStrategies).toHaveBeenCalledTimes(2)
    expect(auth.strategyHost).toBe('https://third.example.com')
  })
})
