import { beforeAll, beforeEach, describe, expect, it, vi } from '../bun-test.mts'
const operations = { remove: vi.fn(), setActive: vi.fn(), verify: vi.fn(), setTfa: vi.fn() }
vi.mockModule('../../operations/users.ts', import.meta.url, () => ({ default: operations }))
vi.mockModule('../../helpers/graph.ts', import.meta.url, () => ({ default: { generateSuccess: () => ({ succeeded: true }), generateError: (err: Error) => ({ error: err.message }) } }))
let resolvers: Record<string, (object: unknown, args: unknown, context: unknown) => Promise<unknown>>
beforeAll(async () => { resolvers = (await vi.importFresh('../../graph/resolvers/user.ts', import.meta.url)).default.UserMutation })
beforeEach(() => { for (const fn of Object.values(operations)) fn.mockReset() })
describe('legacy GraphQL account authority handoff', () => {
  it('carries the actual requester through deletion, verification, availability and authenticator actions', async () => {
    const user = { id: 8, ownershipUserId: 8 }, context = { req: { user } }, args = { id: 7, replaceId: 9 }
    await resolvers.delete!(null, args, context); expect(operations.remove).toHaveBeenCalledWith({ id: 7, replaceId: 9, requester: user })
    await resolvers.verify!(null, args, context); expect(operations.verify).toHaveBeenCalledWith(7, user)
    for (const [name, isActive] of [['activate',true],['deactivate',false]] as const) { await resolvers[name]!(null, args, context); expect(operations.setActive).toHaveBeenCalledWith({ id: 7, isActive, requester: user }) }
    for (const [name, enabled] of [['enableTFA',true],['disableTFA',false]] as const) { await resolvers[name]!(null, args, context); expect(operations.setTfa).toHaveBeenCalledWith({ id: 7, enabled, requester: user }) }
  })
})
