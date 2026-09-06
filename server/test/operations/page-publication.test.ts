import { beforeEach, describe, expect, it, vi } from '../bun-test.mts'
const unlock = vi.fn(async () => {})
vi.mockModule('../../operations/page-protection.ts', import.meta.url, () => ({ assertPageUnlocked: unlock }))
let operations: typeof import('../../operations/pages.ts').default
const updatePage = vi.fn(async (input: unknown) => input)
const requester = { id: 8, permissions: ['write:pages'] }
beforeEach(async () => {
  vi.resetModules(); unlock.mockClear(); updatePage.mockReset(); updatePage.mockImplementation(async input => input)
  globalThis.WIKI = { config: { db: { type: 'postgres' } }, models: { pages: { updatePage } } } as unknown as typeof WIKI
  operations = (await import('../../operations/pages.ts')).default
})
describe('administration publication changes', () => {
  it('uses the protected editor update with reviewed revision and a narrow payload', async () => {
    await operations.setPublication({ requester, sessionId: 'signed-in-session', id: 5, expectedSourceRevision: '23', isPublished: true, title: 'must not overwrite', visibility: 'public', content: 'must not overwrite' })
    expect(unlock).toHaveBeenCalledWith({ requester, pageId: 5, sessionId: 'signed-in-session' })
    expect(updatePage).toHaveBeenCalledWith({ user: requester, id: 5, expectedSourceRevision: '23', isPublished: true })
  })
  it('normalizes schedule boundaries and permits explicit clearing', async () => {
    await operations.setPublication({ requester, id: 5, expectedSourceRevision: '23', isPublished: true, publishStartDate: '2026-09-07T10:00:00+02:00', publishEndDate: null })
    expect(updatePage).toHaveBeenCalledWith(expect.objectContaining({ publishStartDate: '2026-09-07T08:00:00.000Z', publishEndDate: '' }))
  })
  it('rejects invalid state, revision and schedule before any write', async () => {
    for (const patch of [{ publishStartDate: '2026-02-30T00:00:00Z', publishEndDate: '' }, { publishStartDate: '2026-09-07T12:00:00', publishEndDate: '' }, { isPublished: 'yes' }, { expectedSourceRevision: undefined }, { publishStartDate: 'tomorrow', publishEndDate: '' }, { publishStartDate: '2026-10-01T00:00:00Z' }, { publishStartDate: '2026-10-01T00:00:00Z', publishEndDate: '2026-09-01T00:00:00Z' }]) {
      await expect(operations.setPublication({ requester, id: 5, expectedSourceRevision: '23', isPublished: true, ...patch })).rejects.toThrow()
    }
    expect(updatePage).not.toHaveBeenCalled()
  })
  it('propagates protection denial and stale revision errors without retrying a newer page', async () => {
    unlock.mockRejectedValueOnce(new Error('Page is locked'))
    await expect(operations.setPublication({ requester, id: 5, expectedSourceRevision: '23', isPublished: false })).rejects.toThrow('Page is locked')
    expect(updatePage).not.toHaveBeenCalled()
    updatePage.mockRejectedValueOnce(new Error('Page changed'))
    await expect(operations.setPublication({ requester, id: 5, expectedSourceRevision: '23', isPublished: false })).rejects.toThrow('Page changed')
    expect(updatePage).toHaveBeenCalledTimes(1)
  })
})
