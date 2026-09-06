const store = { inspect: vi.fn(), save: vi.fn(), initialize: vi.fn(), enqueue: vi.fn() }
vi.mockModule('../../operations/locale-administration.ts', import.meta.url, () => ({ getLocaleAdministrationStore: () => store }))
vi.mockModule('express', import.meta.url, () => { const router = { get: vi.fn(), post: vi.fn(), put: vi.fn(), use: vi.fn() }; return { default: { Router: () => router, __router: router } } })
const { default: express } = await import('express')
const originalWiki = global.WIKI
const policy = { locale: 'en', autoUpdate: true, namespacing: false, namespaces: [] }
const response = () => ({ json: vi.fn(), status: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis() })
beforeEach(() => {
  global.WIKI = { auth: { checkAccess: vi.fn(() => true) }, config: { lang: { code: 'en', ...policy } }, cache: { get: vi.fn().mockResolvedValue([{ code: 'fr', name: 'French' }]) }, models: { locales: { query: () => ({ select: async () => [{ code: 'en', name: 'English' }] }) } }, lang: { getByNamespace: vi.fn().mockResolvedValue([{ key: 'title', value: 'Hello' }]) } }
  store.inspect.mockResolvedValue({ policy, fingerprint: 'current', history: [], locales: [], operations: [] }); store.save.mockResolvedValue({ activation: 'applied' }); store.initialize.mockResolvedValue({ activation: 'applied' }); store.enqueue.mockResolvedValue({ jobId: 'queued-job' })
})
afterEach(() => { global.WIKI = originalWiki })
const handlers = async () => {
  await vi.importFresh('../../controllers/api/locales.ts', import.meta.url)
  return Object.fromEntries(['get', 'post', 'put'].flatMap(method => express.__router[method].mock.calls.map(([path, handler]) => [method + ' ' + path, handler])))
}
describe('Locale API boundaries', () => {
  it('requires system administration and disables caching for every administrative endpoint', async () => {
    const routes = await handlers(); global.WIKI.auth.checkAccess.mockReturnValue(false)
    for (const name of ['get /workspace', 'put /workspace', 'post /workspace/activate', 'post /workspace/operations', 'get /config', 'post /config', 'post /:code/download']) {
      const res = response(); await routes[name]({ user: { id: 3 }, body: {}, params: { code: 'fr' } }, res)
      expect(res.status).toHaveBeenCalledWith(403); expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store')
    }
    expect(store.inspect).not.toHaveBeenCalled(); expect(store.enqueue).not.toHaveBeenCalled()
  })
  it('passes the current principal, frozen policy, fingerprint and reason to the reviewed store', async () => {
    const routes = await handlers(), user = { id: 1 }, body = { policy, fingerprint: 'review', reason: 'Reviewed settings' }, res = response()
    await routes['put /workspace']({ user, body }, res)
    expect(store.save).toHaveBeenCalledWith(user, body); expect(res.json).toHaveBeenCalledWith({ activation: 'applied' })
  })
  it('returns durable operation acceptance and routes compatibility downloads through the same store', async () => {
    const routes = await handlers(), user = { id: 1 }, res = response()
    await routes['post /workspace/operations']({ user, body: { kind: 'install', code: 'fr', fingerprint: 'review', reason: 'Install French' } }, res)
    expect(res.status).toHaveBeenCalledWith(202); expect(res.json).toHaveBeenCalledWith({ jobId: 'queued-job' })
    const legacy = response(); await routes['post /:code/download']({ user, params: { code: 'fr' } }, legacy)
    expect(legacy.status).toHaveBeenCalledWith(202); expect(store.enqueue).toHaveBeenLastCalledWith(user, expect.objectContaining({ code: 'fr', fingerprint: 'current' }))
    expect(legacy.json).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'queued-job', message: expect.stringContaining('queued') }))
  })
  it('routes compatibility settings through validation and current authority', async () => {
    const routes = await handlers(), user = { id: 1 }, res = response()
    await routes['post /config']({ user, body: policy }, res)
    expect(store.save).toHaveBeenCalledWith(user, expect.objectContaining({ policy, fingerprint: 'current' }))
    const invalid = response(); await routes['post /config']({ user, body: { locale: 'en' } }, invalid); expect(invalid.status).toHaveBeenCalledWith(400)
  })
  it('preserves expected conflicts and redacts unexpected server failures', async () => {
    const routes = await handlers()
    store.inspect.mockRejectedValueOnce(Object.assign(new Error('Settings changed'), { status: 409 }))
    const conflict = response(); await routes['get /workspace']({ user: { id: 1 } }, conflict); expect(conflict.status).toHaveBeenCalledWith(409); expect(conflict.json).toHaveBeenCalledWith({ error: 'Settings changed' })
    store.inspect.mockRejectedValueOnce(new Error('secret database detail'))
    const failed = response(); await routes['get /workspace']({ user: { id: 1 } }, failed); expect(failed.status).toHaveBeenCalledWith(500); expect(JSON.stringify(failed.json.mock.calls)).not.toContain('secret')
  })
  it('retains installed locales missing remotely and serves public translation strings', async () => {
    const routes = await handlers(), list = response(); await routes['get /']({}, list)
    expect(list.json).toHaveBeenCalledWith([expect.objectContaining({ code: 'fr', isInstalled: false }), expect.objectContaining({ code: 'en', isInstalled: true })])
    const strings = response(); await routes['get /:code/strings']({ query: { namespace: 'common' }, params: { code: 'en' } }, strings)
    expect(strings.json).toHaveBeenCalledWith([{ key: 'title', value: 'Hello' }])
  })
})
