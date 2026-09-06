import { beforeAll, beforeEach, describe, expect, it, vi } from '../bun-test.mts'
const store = {
  list: vi.fn(),
  creationOptions: vi.fn(),
  create: vi.fn(),
  inspect: vi.fn(),
  members: vi.fn(),
  savePolicy: vi.fn(),
  changeMembers: vi.fn(),
  evaluate: vi.fn(),
  remove: vi.fn()
}
vi.mockModule('../../operations/group-administration.ts', import.meta.url, () => ({ getGroupAdministrationStore: () => store }))
const router = { get: vi.fn(), put: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }
vi.mockModule('express', import.meta.url, () => ({ default: { Router: () => router } }))
type Handler = (request: unknown, response: unknown) => Promise<void>
const handlers = new Map<string, Handler>(),
  response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() })
beforeAll(async () => {
  await vi.importFresh('../../controllers/api/groups.ts', import.meta.url)
  for (const method of ['get', 'put', 'post', 'patch', 'delete'] as const)
    for (const [path, handler] of router[method].mock.calls) if (path.includes('workspace')) handlers.set(`${method} ${path}`, handler as Handler)
})
beforeEach(() => {
  for (const fn of Object.values(store)) fn.mockReset()
  globalThis.WIKI = { auth: { checkAccess: vi.fn().mockReturnValue(true) } } as never
})
describe('reviewed group workspace transports', () => {
  it('passes current requester and the exact review to each write', async () => {
    const user = { id: 7 },
      body = { fingerprint: 'review', reason: 'Reviewed', policy: {}, action: 'add', userIds: [8] }
    for (const [route, method] of [
      ['put /workspace/:id/policy', 'savePolicy'],
      ['post /workspace/:id/members', 'changeMembers'],
      ['post /workspace/:id/evaluate', 'evaluate'],
      ['delete /workspace/:id', 'remove']
    ] as const) {
      await handlers.get(route)!({ user, params: { id: '3' }, body }, response())
      expect(store[method]).toHaveBeenCalledWith(user, 3, body)
    }
    store.create.mockResolvedValue({ id: 13 })
    const res = response()
    await handlers.get('post /workspace')!({ user, body }, res)
    expect(res.status).toHaveBeenCalledWith(201)
    expect(store.create).toHaveBeenCalledWith(user, body)
  })
  it('gates every workspace route and rejects malformed identifiers', async () => {
    ;(WIKI.auth.checkAccess as ReturnType<typeof vi.fn>).mockReturnValue(false)
    for (const handler of handlers.values()) {
      const res = response()
      await handler({ params: { id: '3' }, query: {}, body: {} }, res)
      expect(res.status).toHaveBeenCalledWith(403)
    }
    for (const fn of Object.values(store)) expect(fn).not.toHaveBeenCalled()
    ;(WIKI.auth.checkAccess as ReturnType<typeof vi.fn>).mockReturnValue(true)
    for (const id of ['0', '-1', '3x', '3.2']) {
      const res = response()
      await handlers.get('post /workspace/:id/members')!({ params: { id }, body: {} }, res)
      expect(res.status).toHaveBeenCalledWith(400)
    }
  })
  it('preserves actionable conflicts and hides unexpected persistence errors', async () => {
    store.savePolicy.mockRejectedValue(Object.assign(new Error('Reload this policy'), { status: 409 }))
    const conflict = response()
    await handlers.get('put /workspace/:id/policy')!({ params: { id: '3' }, body: {} }, conflict)
    expect(conflict.status).toHaveBeenCalledWith(409)
    expect(conflict.json).toHaveBeenCalledWith({ error: 'Reload this policy' })
    store.savePolicy.mockRejectedValue(new Error('SQL contains internal credentials'))
    const failed = response()
    await handlers.get('put /workspace/:id/policy')!({ params: { id: '3' }, body: {} }, failed)
    expect(failed.status).toHaveBeenCalledWith(500)
    expect(JSON.stringify(failed.json.mock.calls)).not.toContain('credentials')
  })
  it('keeps account-manager membership access narrower than policy access', async () => {
    ;(WIKI.auth.checkAccess as ReturnType<typeof vi.fn>).mockImplementation((_user, permissions) => permissions.includes('manage:users'))
    const user = { id: 9 }
    await handlers.get('get /workspace/:id/members')!({ user, params: { id: '3' }, query: {} }, response())
    expect(store.members).toHaveBeenCalledWith(user, 3, {})
    const res = response()
    await handlers.get('put /workspace/:id/policy')!({ user, params: { id: '3' }, body: {} }, res)
    expect(res.status).toHaveBeenCalledWith(403)
  })
})
