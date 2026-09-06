import { beforeAll, beforeEach, describe, expect, it, vi } from '../bun-test.mts'
const read = vi.fn(), write = vi.fn(), list = vi.fn(), inspect = vi.fn(), moderate = vi.fn(), policy = vi.fn(), setPolicy = vi.fn(), closedPages = vi.fn()
vi.mockModule('../../operations/discussion-settings.ts', import.meta.url, () => ({ readDiscussionWorkspace: read, writeDiscussionWorkspace: write }))
vi.mockModule('../../operations/discussion-moderation.ts', import.meta.url, () => ({ discussionModeration: () => ({ list, inspect, moderate, policy, setPolicy, closedPages }) }))
vi.mockModule('../../operations/comments.ts', import.meta.url, () => ({ default: {} }))
vi.mockModule('../../operations/page-protection.ts', import.meta.url, () => ({ assertPageUnlocked: vi.fn() }))
const router = { get: vi.fn(), put: vi.fn(), patch: vi.fn(), post: vi.fn(), delete: vi.fn(), use: vi.fn() }
vi.mockModule('express', import.meta.url, () => ({ default: { Router: () => router } }))
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn(), set: vi.fn() })
type Handler = (request: unknown, response: unknown) => Promise<void>
const handlers = new Map<string, Handler>()
beforeAll(async () => { await vi.importFresh('../../controllers/api/comments.ts', import.meta.url); for (const method of ['get', 'put', 'patch'] as const) for (const [path, handler] of router[method].mock.calls) handlers.set(`${method} ${path}`, handler as Handler) })
beforeEach(() => { globalThis.WIKI = { logger: { warn: vi.fn() } } as never })
describe('discussion workspace transports', () => {
  it('passes the requester and exact reviewed fingerprint to policy writes', async () => {
    const user = { id: 1 }, body = { enabled: true, providers: [], fingerprint: 'reviewed' }, res = response()
    write.mockResolvedValue({ enabled: true, warnings: [] }); await handlers.get('put /workspace')!({ user, body }, res)
    expect(write).toHaveBeenCalledWith(user, body, 'reviewed'); expect(res.json).toHaveBeenCalledWith({ enabled: true, warnings: [] })
  })
  it('keeps all moderation and closure mutations behind the shared requester-aware operations', async () => {
    const user = { id: 1 }, body = { hidden: true, reason: 'Reviewed', fingerprint: 'reviewed' }
    await handlers.get('patch /moderation/:id')!({ user, params: { id: '42' }, body }, response()); expect(moderate).toHaveBeenCalledWith(user, 42, body)
    await handlers.get('patch /page-policy/:id')!({ user, params: { id: '7' }, body }, response()); expect(setPolicy).toHaveBeenCalledWith(user, 7, body)
  })
  it('returns actionable permission/conflict errors and conceals internal failure details', async () => {
    for (const status of [403, 409]) { read.mockRejectedValueOnce(Object.assign(new Error('Review required'), { status })); const res = response(); await handlers.get('get /workspace')!({ user: {} }, res); expect(res.status).toHaveBeenCalledWith(status); expect(res.json).toHaveBeenCalledWith({ error: 'Review required' }) }
    read.mockRejectedValueOnce(new Error('database credentials')); const res = response(); await handlers.get('get /workspace')!({ user: {} }, res); expect(res.status).toHaveBeenCalledWith(500); expect(JSON.stringify(res.json.mock.calls[0])).not.toContain('database credentials')
  })
})
