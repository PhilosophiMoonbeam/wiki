import { beforeEach, describe, expect, it, vi } from '../bun-test.mts'
const router = { use: vi.fn(), get: vi.fn(), put: vi.fn(), post: vi.fn() }, read = vi.fn(), write = vi.fn(), inspect = vi.fn(), warn = vi.fn()
vi.mockModule('express', import.meta.url, () => ({ default: { Router: () => router } }))
vi.mockModule('../../operations/rendering-workspace.ts', import.meta.url, () => ({ readRenderingWorkspace: read, writeRenderingWorkspace: write, inspectRenderingOutput: inspect }))
vi.mockModule('../../operations/rendering.ts', import.meta.url, () => ({ default: {} }))
vi.mockModule('../../controllers/_types.ts', import.meta.url, () => ({ getWikiAuth: () => ({}), getTransportRuntime: () => ({ logger: { warn } }), errorStatus: (error: { status?: number }) => error.status }))
await import('../../controllers/api/rendering.ts')
const middleware = router.use.mock.calls[0]![0], get = router.get.mock.calls.find(([path]) => path === '/workspace')![1], put = router.put.mock.calls[0]![1], output = router.get.mock.calls.find(([path]) => path === '/output/:id')![1]
const response = () => ({ set: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() })
describe('rendering workspace transport', () => {
  beforeEach(() => { for (const mock of [read, write, inspect, warn]) mock.mockReset() })
  it('keeps configuration and private output out of shared caches', () => { const res = response(), next = vi.fn(); middleware({}, res, next); expect(res.set).toHaveBeenCalledWith('Cache-Control', 'private, no-store'); expect(next).toHaveBeenCalled() })
  it('carries the principal and reviewed revision to protected operations', async () => {
    const user = { id: 1 }, body = { modules: [], fingerprint: 'review' }, res = response()
    read.mockResolvedValue({}); write.mockResolvedValue({}); inspect.mockResolvedValue({})
    await get({ user }, res); await put({ user, body }, res); await output({ user, params: { id: '7' } }, res)
    expect(read).toHaveBeenCalledWith(user); expect(write).toHaveBeenCalledWith(user, [], 'review'); expect(inspect).toHaveBeenCalledWith(user, 7)
  })
  it('preserves actionable conflicts and denies without leaking server failures', async () => {
    let res = response(); write.mockRejectedValue(Object.assign(new Error('Reload configuration'), { status: 409 })); await put({ user: {}, body: {} }, res)
    expect(res.status).toHaveBeenCalledWith(409); expect(res.json).toHaveBeenCalledWith({ error: 'Reload configuration' })
    res = response(); const failure = new Error('database password or internal detail'); read.mockRejectedValue(failure); await get({}, res)
    expect(res.status).toHaveBeenCalledWith(500); expect(warn).toHaveBeenCalledWith(failure); expect(res.json).toHaveBeenCalledWith({ error: 'Rendering request failed. Try again or check server logs.' })
  })
})
