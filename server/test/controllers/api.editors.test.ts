import { beforeEach, describe, expect, it, vi } from '../bun-test.mts'
const router = { use: vi.fn(), get: vi.fn(), put: vi.fn() }, read = vi.fn(), write = vi.fn(), access = vi.fn(), warn = vi.fn()
vi.mockModule('express', import.meta.url, () => ({ default: { Router: () => router } }))
vi.mockModule('../../operations/editors.ts', import.meta.url, () => ({ editorWorkspace: read, saveEditorPolicy: write }))
vi.mockModule('../../controllers/_types.ts', import.meta.url, () => ({ getWikiAuth: () => ({ checkAccess: access }), getTransportRuntime: () => ({ logger: { warn } }), errorStatus: (error: { status?: number }) => error.status }))
await import('../../controllers/api/editors.ts')
const middleware = router.use.mock.calls[0]![0], get = router.get.mock.calls[0]![1], put = router.put.mock.calls[0]![1]
const response = () => ({ set: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() })
describe('editor policy transport', () => {
  beforeEach(() => { for (const mock of [read, write, access, warn]) mock.mockReset() })
  it('requires system administration and prevents caching policy or private usage counts', () => {
    const res = response(), next = vi.fn()
    access.mockReturnValue(false); middleware({ user: undefined }, res, next)
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'private, no-store'); expect(res.status).toHaveBeenCalledWith(403); expect(next).not.toHaveBeenCalled()
    access.mockReturnValue(true); middleware({ user: { id: 1 } }, res, next); expect(next).toHaveBeenCalledTimes(1)
  })
  it('passes the authenticated principal and concurrency evidence to the policy operation', async () => {
    const user = { id: 1 }, body = { available: ['markdown'], recommended: 'markdown', fingerprint: 'observed' }, res = response()
    write.mockResolvedValue({ policy: body, warnings: [] })
    await put({ user, body }, res)
    expect(write).toHaveBeenCalledWith(user, body, 'observed')
    expect(res.json).toHaveBeenCalledWith({ policy: body, warnings: [] })
  })
  it('preserves review conflicts and redacts internal persistence errors', async () => {
    let res = response(); write.mockRejectedValue(Object.assign(new Error('Reload the saved policy'), { status: 409 }))
    await put({ user: {}, body: {} }, res); expect(res.status).toHaveBeenCalledWith(409); expect(res.json).toHaveBeenCalledWith({ error: 'Reload the saved policy' })
    const failure = new Error('internal database details'); read.mockRejectedValue(failure); res = response()
    await get({ user: {} }, res); expect(res.status).toHaveBeenCalledWith(500); expect(warn).toHaveBeenCalledWith(failure)
    expect(res.json).toHaveBeenCalledWith({ error: 'Editor settings could not be saved or loaded. Try again or check server logs.' })
  })
})
