const legacySecurity = vi.fn().mockResolvedValue(undefined)
vi.mockModule('../../operations/security-administration.ts', import.meta.url, () => ({ legacySecurityKeys: ['securityTrustProxy', 'authAutoLogin', 'securityHSTSDuration', 'uploadMaxFileSize', 'uploadMaxFiles', 'uploadForceDownload'], patchLegacySecurityConfiguration: legacySecurity, getSecurityAdministrationStore: vi.fn() }))
const patchFeatures = vi.fn(async features => { global.WIKI.config.features = { ...global.WIKI.config.features, ...features } })
vi.mockModule('../../operations/discussion-settings.ts', import.meta.url, () => ({ patchSiteFeatures: patchFeatures }))
vi.mockModule('../../operations/editors.ts', import.meta.url, () => ({ updateEditorAvailability: async available => { global.WIKI.config.editors = { ...global.WIKI.config.editors, available } } }))
vi.mockModule('express', import.meta.url, () => {
  const routers = []

  const expressMock = {
    Router: () => {
      const router = {
        get: vi.fn(),
        put: vi.fn(), post: vi.fn()
      }
      routers.push(router)
      return router
    },
    __routers: routers
  }

  return { default: expressMock, ...expressMock }
})

const express = await import('express')

describe('controllers/api site endpoints', () => {
  beforeEach(() => {
    vi.resetModules()
    express.__routers.length = 0

    global.WIKI = {
      auth: {
        checkAccess: vi.fn(() => true)
      },
      app: {
        set: vi.fn()
      },
      configSvc: {
        saveToDb: vi.fn().mockResolvedValue(undefined)
      },
      config: {
        host: 'https://wiki.example.com',
        title: 'Wiki',
        company: 'Company',
        contentLicense: 'ccby',
        footerOverride: 'Footer',
        banner: {
          isEnabled: true,
          title: 'Maintenance',
          content: 'Read the **status page**.'
        },
        logoUrl: '/logo.svg',
        pageExtensions: ['md', 'markdown'],
        editors: {
          available: ['markdown', 'visual-markdown', 'ckeditor', 'asciidoc', 'code']
        },
        seo: {
          description: 'Description',
          robots: ['index', 'follow'],
          analyticsService: 'ga',
          analyticsId: 'UA-1'
        },
        auth: {
          autoLogin: false,
          enforce2FA: true,
          hideLocal: false,
          loginBgUrl: '/login.jpg',
          audience: 'urn:wiki.js',
          tokenExpiration: '30m',
          tokenRenewal: '14d'
        },
        editShortcuts: {
          editFab: true,
          editMenuBar: true,
          editMenuBtn: false,
          editMenuExternalBtn: false,
          editMenuExternalName: 'Docs',
          editMenuExternalIcon: 'open_in_new',
          editMenuExternalUrl: 'https://docs.example.com'
        },
        features: {
          featurePageRatings: true,
          featurePageComments: false,
          featurePersonalWikis: true
        },
        security: {
          securityOpenRedirect: false,
          securityIframe: true,
          securityReferrerPolicy: true,
          securityTrustProxy: false,
          securitySRI: true,
          securityHSTS: false,
          securityHSTSDuration: 300,
          securityCSP: false,
          securityCSPDirectives: "default-src 'self'"
        },
        uploads: {
          maxFileSize: 1048576,
          maxFiles: 10,
          scanSVG: true,
          forceDownload: false
        }
      }
    }
  })

  const loadRouter = async () => {
    expect(await vi.importFresh('../../controllers/api/site.ts', import.meta.url)).toBeDefined()
    return express.__routers[0]
  }

  const loadGetConfigHandler = async () => {
    const router = await loadRouter()
    return router.get.mock.calls.find(([path]) => path === '/config')[1]
  }

  const loadPutConfigHandler = async () => {
    const router = await loadRouter()
    return router.put.mock.calls.find(([path]) => path === '/config')[1]
  }

  it('registers site config routes', async () => {
    const router = await loadRouter()

    expect(router.get.mock.calls.map(([path]) => path)).toEqual(['/config', '/security'])
    expect(router.put.mock.calls.map(([path]) => path)).toEqual(['/config', '/security'])
  })

  it.each([
    ['fetch', async () => await loadGetConfigHandler(), { body: {} }],
    ['save', async () => await loadPutConfigHandler(), { body: {} }]
  ])('rejects forbidden site config %s requests with JSON', async (label, getHandler, req) => {
    const handler = await getHandler()
    global.WIKI.auth.checkAccess.mockReturnValue(false)
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }

    await handler({ user: {}, ...req }, res)

    expect(global.WIKI.auth.checkAccess).toHaveBeenCalledWith({}, ['manage:system'])
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' })
  })

  it('returns the flattened site config shape used by GraphQL clients', async () => {
    const handler = await loadGetConfigHandler()
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }

    await handler({ user: {}, body: {} }, res)

    expect(res.status).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      host: 'https://wiki.example.com',
      title: 'Wiki',
      description: 'Description',
      robots: ['index', 'follow'],
      analyticsService: 'ga',
      analyticsId: 'UA-1',
      company: 'Company',
      contentLicense: 'ccby',
      footerOverride: 'Footer',
      banner: {
        isEnabled: true,
        title: 'Maintenance',
        content: 'Read the **status page**.'
      },
      logoUrl: '/logo.svg',
      pageExtensions: 'md, markdown',
      availableEditors: ['markdown', 'visual-markdown', 'ckeditor', 'asciidoc', 'code'],
      authAutoLogin: false,
      authEnforce2FA: true,
      authHideLocal: false,
      authLoginBgUrl: '/login.jpg',
      authJwtAudience: 'urn:wiki.js',
      authJwtExpiration: '30m',
      authJwtRenewablePeriod: '14d',
      editFab: true,
      featurePageRatings: true,
      securityTrustProxy: false,
      uploadMaxFileSize: 1048576,
      uploadMaxFiles: 10,
      uploadScanSVG: true,
      uploadForceDownload: false
    }))
  })

  it('rejects a live HTTPS-to-HTTP host downgrade before mutating or saving configuration', async () => {
    const handler = await loadPutConfigHandler()
    const originalConfig = structuredClone(global.WIKI.config)
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }

    await handler({
      user: {},
      body: {
        host: ' http://wiki.example.com/ ',
        title: 'Must not be applied',
      }
    }, res)

    expect(global.WIKI.config).toEqual(originalConfig)
    expect(global.WIKI.configSvc.saveToDb).not.toHaveBeenCalled()
    expect(global.WIKI.app.set).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Changing the site host from HTTPS to a non-HTTPS URL cannot be applied live; restart with the new host configuration.'
    })
  })

  it('allows replacing the legacy placeholder host with HTTPS', async () => {
    const handler = await loadPutConfigHandler()
    global.WIKI.config.host = 'http://'
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }

    await handler({ user: {}, body: { host: ' https://wiki.example.com/ ' } }, res)

    expect(global.WIKI.config.host).toBe('https://wiki.example.com')
    expect(global.WIKI.configSvc.saveToDb).toHaveBeenCalledWith(expect.arrayContaining(['host']))
    expect(res.status).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith({ message: 'Site configuration updated successfully' })
  })

  it('keeps HTTP localhost host updates supported when configured in HTTP mode', async () => {
    const handler = await loadPutConfigHandler()
    global.WIKI.config.host = 'http://localhost:3000'
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }

    await handler({
      user: {},
      body: {
        host: ' http://localhost:8080/ ',
        title: ' Local Wiki '
      }
    }, res)

    expect(global.WIKI.config.host).toBe('http://localhost:8080')
    expect(global.WIKI.config.title).toBe('Local Wiki')
    expect(global.WIKI.configSvc.saveToDb).toHaveBeenCalledWith(expect.arrayContaining(['host', 'title']))
    expect(global.WIKI.app.set).toHaveBeenCalledWith('trust proxy', false)
    expect(res.status).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith({ message: 'Site configuration updated successfully' })
  })

  it('updates site config with GraphQL-compatible normalization and save side effects', async () => {
    const handler = await loadPutConfigHandler()
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }

    await handler({
      user: {},
      body: {
        host: ' https://next.example.com/ ',
        title: ' Next Wiki ',
        company: ' Next Company ',
        contentLicense: 'cc0',
        footerOverride: '<strong>Footer</strong>',
        banner: {
          isEnabled: true,
          title: ' Planned maintenance ',
          content: ' **Starts at 20:00 UTC.** '
        },
        logoUrl: ' /next.svg ',
        pageExtensions: ' MD, Wiki,  ',
        availableEditors: ['code', 'markdown'],
        description: 'Next description',
        robots: ['noindex'],
        analyticsService: '',
        analyticsId: '',
        editFab: false,
        featurePageComments: true,
      }
    }, res)

    expect(global.WIKI.config.host).toBe('https://next.example.com')
    expect(global.WIKI.config.title).toBe('Next Wiki')
    expect(global.WIKI.config.company).toBe('Next Company')
    expect(global.WIKI.config.banner).toEqual({
      isEnabled: true,
      title: 'Planned maintenance',
      content: '**Starts at 20:00 UTC.**'
    })
    expect(global.WIKI.config.logoUrl).toBe('/logo.svg')
    expect(global.WIKI.config.pageExtensions).toEqual(['md', 'wiki'])
    expect(global.WIKI.config.editors.available).toEqual(['markdown', 'code'])
    expect(global.WIKI.config.seo).toEqual({
      description: 'Next description',
      robots: ['noindex'],
      analyticsService: '',
      analyticsId: ''
    })
    expect(global.WIKI.config.auth).toEqual({
      autoLogin: false,
      enforce2FA: true,
      hideLocal: false,
      loginBgUrl: '/login.jpg',
      audience: 'urn:wiki.js',
      tokenExpiration: '30m',
      tokenRenewal: '14d'
    })
    expect(global.WIKI.config.editShortcuts.editFab).toBe(false)
    expect(global.WIKI.config.editShortcuts.editMenuBar).toBe(true)
    expect(global.WIKI.config.features.featurePageComments).toBe(true)
    expect(patchFeatures).toHaveBeenCalledWith({ featurePageComments: true })
    expect(global.WIKI.config.features.featurePageRatings).toBe(true)
    expect(global.WIKI.config.security.securityTrustProxy).toBe(false)
    expect(global.WIKI.config.security.securityHSTSDuration).toBe(300)
    expect(global.WIKI.config.uploads.maxFileSize).toBe(1048576)
    expect(global.WIKI.config.uploads.maxFiles).toBe(10)
    expect(global.WIKI.config.uploads.forceDownload).toBe(false)
    expect(global.WIKI.configSvc.saveToDb).toHaveBeenCalledWith(['host', 'title', 'company', 'contentLicense', 'footerOverride', 'banner', 'seo', 'pageExtensions', 'editShortcuts'])
    expect(global.WIKI.app.set.mock.calls).toEqual([['trust proxy', false]])
    expect(res.status).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith({ message: 'Site configuration updated successfully' })
  })

  it('normalizes missing legacy banner configuration before saving other settings', async () => {
    const handler = await loadPutConfigHandler()
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    delete global.WIKI.config.banner

    await handler({ user: {}, body: { title: 'Updated title' } }, res)

    expect(global.WIKI.config.banner).toEqual({ isEnabled: false, title: '', content: '' })
    expect(global.WIKI.configSvc.saveToDb).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('delegates legacy security writes with the authenticated actor without changing unrelated configuration', async () => {
    const handler = await loadPutConfigHandler(), user = { id: 1, authVersion: 2 }, res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    await handler({ user, body: { securityTrustProxy: true } }, res)
    expect(legacySecurity).toHaveBeenCalledWith(user, { securityTrustProxy: true })
    expect(global.WIKI.config.security.securityTrustProxy).toBe(false)
    expect(global.WIKI.configSvc.saveToDb).not.toHaveBeenCalled()
  })

  it('does not report a failed persistence result as a successful save', async () => {
    global.WIKI.configSvc.saveToDb.mockResolvedValue(false)
    const handler = await loadPutConfigHandler()
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    await handler({ user: {}, body: { title: 'A change' } }, res)
    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ error: 'Site configuration could not be persisted. Reload before retrying.' })
  })

  it('uses the initialized application when it becomes available after import', async () => {
    const handler = await loadPutConfigHandler()
    const initializedApp = {
      set: vi.fn()
    }
    global.WIKI.app = initializedApp
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }

    await handler({ user: {}, body: { title: 'Updated title' } }, res)

    expect(initializedApp.set.mock.calls).toEqual([['trust proxy', false]])
    expect(res.status).not.toHaveBeenCalled()
  })

  it('rejects invalid save payloads with JSON', async () => {
    const handler = await loadPutConfigHandler()
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }

    await handler({ user: {}, body: [] }, res)

    expect(global.WIKI.configSvc.saveToDb).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'Site configuration must be an object' })
  })

  it('rejects invalid site banners before mutating or saving configuration', async () => {
    const handler = await loadPutConfigHandler()
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }

    await handler({
      user: {},
      body: {
        title: 'Should not be applied',
        banner: { isEnabled: true, title: '', content: '' }
      }
    }, res)

    expect(global.WIKI.config.title).toBe('Wiki')
    expect(global.WIKI.configSvc.saveToDb).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'An enabled site banner must have a title or content.' })
  })

  it.each([
    [[], 'At least one editor must remain available.'],
    [['markdown', 'unknown'], 'Available editors contains an unsupported editor.'],
    [['markdown', 'markdown'], 'Available editors must not contain duplicates.']
  ])('rejects invalid editor availability before mutating or saving configuration', async (availableEditors, message) => {
    const handler = await loadPutConfigHandler()
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }

    await handler({
      user: {},
      body: {
        title: 'Should not be applied',
        availableEditors
      }
    }, res)

    expect(global.WIKI.config.title).toBe('Wiki')
    expect(global.WIKI.config.editors.available).toEqual(['markdown', 'visual-markdown', 'ckeditor', 'asciidoc', 'code'])
    expect(global.WIKI.configSvc.saveToDb).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: message })
  })

  it('returns JSON errors from save failures', async () => {
    const handler = await loadPutConfigHandler()
    global.WIKI.configSvc.saveToDb.mockRejectedValue(new Error('save failed'))
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }

    await handler({ user: {}, body: {} }, res)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ error: 'save failed' })
  })
})
