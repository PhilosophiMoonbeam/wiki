import { beforeEach, describe, expect, it, vi } from '../bun-test.mts'
const store = { inspect: vi.fn(), enqueue: vi.fn() }
vi.mockModule('../../operations/locale-administration.ts', import.meta.url, () => ({ getLocaleAdministrationStore: () => store }))
const { default: fetchGraphLocale } = await import('../../jobs/fetch-graph-locale.ts')
beforeEach(() => {
  store.inspect.mockResolvedValue({ fingerprint: 'review' })
  store.enqueue.mockResolvedValue({ jobId: 'job' })
})
describe('legacy locale scheduler entry', () => {
  it('requires an attributed administrative request instead of an unscoped language string', async () => {
    await expect(fetchGraphLocale('fr' as never)).rejects.toThrow('attributed')
    expect(store.inspect).not.toHaveBeenCalled()
  })
  it('uses the reviewed durable operation boundary', async () => {
    const requester = { id: 1, authVersion: 0 } as never
    await fetchGraphLocale({ code: 'fr', requester })
    expect(store.inspect).toHaveBeenCalledWith(requester)
    expect(store.enqueue).toHaveBeenCalledWith(requester, expect.objectContaining({ code: 'fr', fingerprint: 'review', kind: 'install' }))
  })
})
