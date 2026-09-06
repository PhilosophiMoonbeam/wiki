import { beforeEach, describe, expect, it, vi } from './bun-test.mts'
const unlock = vi.fn(async () => {})
vi.mockModule('../operations/page-protection.ts', import.meta.url, () => ({ assertPageUnlocked: unlock }))
const page = { id: 42, localeCode: 'en', path: 'docs/start', title: 'Start', description: 'A guide', sourceRevision: '8', updatedAt: new Date('2026-09-01T00:00:00Z'), visibility: 'public', isPublished: true, ownerId: null, tags: [], editorKey: 'markdown', extra: {}, content: 'source', render: '<p>Authorized preview text</p>', authorEmail: 'do-not-expose@example.test' }
const getPage = vi.fn(async () => page)
const checkAccess = vi.fn(() => true)
beforeEach(() => {
  vi.resetModules(); unlock.mockReset().mockResolvedValue(undefined); getPage.mockReset().mockResolvedValue(page); checkAccess.mockReset().mockReturnValue(true)
  global.WIKI = { auth: { checkAccess }, models: { pages: { getPageFromDb: getPage } } } as unknown as typeof WIKI
})
describe('source preview access', () => {
  it('projects only safe source fields after checking current page access and password unlock', async () => {
    const { default: operations } = await vi.importFresh('../operations/pages.ts', import.meta.url)
    const result = await operations.preview({ id: 42, requester: { id: 7 }, sessionId: 'session' })
    expect(unlock).toHaveBeenCalledWith({ requester: { id: 7 }, pageId: 42, sessionId: 'session' })
    expect(result).toMatchObject({ id: 42, excerpt: 'Authorized preview text', sourceRevision: '8' })
    expect(result).not.toHaveProperty('content')
    expect(result).not.toHaveProperty('authorEmail')
    expect(result).not.toHaveProperty('render')
  })
  it('does not produce an excerpt for a revoked page or a locked page', async () => {
    const { default: operations } = await vi.importFresh('../operations/pages.ts', import.meta.url)
    checkAccess.mockReturnValue(false)
    await expect(operations.preview({ id: 42, requester: { id: 7 } })).rejects.toMatchObject({ status: 404 })
    expect(unlock).not.toHaveBeenCalled()
    checkAccess.mockReturnValue(true)
    unlock.mockRejectedValue(new Error('PAGE_LOCKED'))
    await expect(operations.preview({ id: 42, requester: { id: 7 } })).rejects.toThrow('PAGE_LOCKED')
  })
  it('withholds scheduled or unpublished public previews from readers', async () => {
    const { default: operations } = await vi.importFresh('../operations/pages.ts', import.meta.url)
    checkAccess.mockImplementation((_user, permissions) => permissions.includes('read:pages'))
    getPage.mockResolvedValue({ ...page, isPublished: false })
    await expect(operations.preview({ id: 42, requester: { id: 7 } })).rejects.toMatchObject({ status: 404 })
    getPage.mockResolvedValue({ ...page, publishStartDate: '2099-01-01T00:00:00Z' })
    await expect(operations.preview({ id: 42, requester: { id: 7 } })).rejects.toMatchObject({ status: 404 })
  })

  it('resolves private paths in the requesting owner namespace', async () => {
    getPage.mockResolvedValue({ ...page, visibility: 'private', ownerId: 7 })
    const { default: operations } = await vi.importFresh('../operations/pages.ts', import.meta.url)
    const result = await operations.preview({ locale: 'en', path: 'docs/start', visibility: 'private', requester: { id: 7 } })
    expect(getPage).toHaveBeenCalledWith({ locale: 'en', path: 'docs/start', visibility: 'private', ownerId: 7 })
    expect(result.visibility).toBe('private')
  })
})
