import { beforeEach, describe, expect, it, vi } from '../bun-test.mts'
const getPage = vi.fn(), access = vi.fn()
vi.mockModule('../../operations/pages.ts', import.meta.url, () => ({ default: { get: getPage } }))
const { inspectRenderingOutput, readRenderingWorkspace, writeRenderingWorkspace } = await import('../../operations/rendering-workspace.ts')
const user = { id: 1 }
describe('rendering inspection access and projection', () => {
  beforeEach(() => { getPage.mockReset(); access.mockReset(); vi.stubGlobal('WIKI', { auth: { checkAccess: access } }) })
  it('rejects non-administrators before reading any policy, usage or stored content', async () => {
    access.mockReturnValue(false)
    await expect(inspectRenderingOutput(user, 7)).rejects.toMatchObject({ status: 403 })
    await expect(readRenderingWorkspace(user)).rejects.toMatchObject({ status: 403 })
    await expect(writeRenderingWorkspace(user, [], 'fingerprint')).rejects.toMatchObject({ status: 403 })
    expect(getPage).not.toHaveBeenCalled()
  })
  it('delegates source access and unlock policy and preserves denial', async () => {
    access.mockReturnValue(true); getPage.mockRejectedValue(Object.assign(new Error('Page locked'), { status: 403 }))
    await expect(inspectRenderingOutput(user, 7)).rejects.toMatchObject({ status: 403 })
    expect(getPage).toHaveBeenCalledWith({ requester: user, id: 7 })
  })
  it('returns actual stored HTML and structural markers without page scripts or private metadata', async () => {
    access.mockReturnValue(true)
    const render = '<h2 id="intro"><a class="toc-anchor">¶</a> Introduction</h2><a class="is-internal-link is-invalid-page">Unknown</a><a class="is-external-link">Remote</a><img src="https://remote.test/image"><iframe></iframe>'
    getPage.mockResolvedValue({ id: 7, title: 'Private note', path: 'notes/example', localeCode: 'en', visibility: 'private', sourceRevision: 3, updatedAt: '2026-09-01', contentType: 'markdown', render, extra: { js: 'secret-script' }, content: 'secret-source', ownerId: 55 })
    const result = await inspectRenderingOutput(user, 7)
    expect(result.html).toBe(render); expect(result.headings).toEqual([{ level: 2, text: 'Introduction', id: 'intro' }])
    expect(result.links).toEqual({ internal: 1, unresolved: 1, external: 1 }); expect(result.images).toBe(1); expect(result.frames).toBe(1)
    expect(result.page).toMatchObject({ visibility: 'private', sourceRevision: '3' }); expect(JSON.stringify(result)).not.toContain('secret-'); expect(result.page).not.toHaveProperty('ownerId')
  })
  it('bounds inspection before parsing oversized HTML', async () => {
    access.mockReturnValue(true); getPage.mockResolvedValue({ render: 'x'.repeat(2 * 1024 * 1024 + 1) })
    await expect(inspectRenderingOutput(user, 7)).rejects.toMatchObject({ status: 413 })
  })
})
