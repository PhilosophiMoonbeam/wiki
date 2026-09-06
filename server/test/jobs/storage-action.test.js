import { createStorageActionHandler } from '../../jobs/storage-action.ts'
import { executingStorageOperations } from '../../helpers/storage-active-operations.ts'
const summary = {
  targetKey: 'disk',
  handler: 'dump',
  outcome: 'succeeded',
  total: 0,
  succeeded: 0,
  failed: 0,
  formats: { okf: 0, legacyV1: 0, legacyWiki: 0, plain: 0, invalid: 0 },
  items: [],
  startedAt: '2026-09-06T00:00:00Z',
  completedAt: '2026-09-06T00:01:00Z',
  message: 'provider-secret'
}
describe('Durable storage execution', () => {
  let store, context, job, signal, handler, effect
  beforeEach(() => {
    job = { id: 'job', type: 'storage-action', version: 1, payload: { operationId: 'operation' } }
    signal = new AbortController().signal
    context = { id: 'operation', targetKey: 'disk', handler: 'dump', credentials: ['provider-secret'] }
    effect = vi.fn().mockResolvedValue(summary)
    store = {
      actions: { begin: vi.fn(async () => context), finish: vi.fn().mockResolvedValue(undefined), rejectBeforeStart: vi.fn().mockResolvedValue(undefined) },
      runtime: {
        performAdministrativeOperation: vi.fn(async (before, after) => {
          await before()
          return after(await effect())
        })
      }
    }
    handler = createStorageActionHandler({ store: () => store })
  })
  it('records an honest uncounted result and tracks local execution through the effect', async () => {
    effect.mockImplementationOnce(async () => {
      expect(executingStorageOperations.has('operation')).toBe(true)
      return summary
    })
    await handler(job, { signal })
    expect(store.actions.finish).toHaveBeenCalledWith(job, expect.objectContaining({ outcome: 'succeeded', counts: null }))
    expect(JSON.stringify(store.actions.finish.mock.calls)).not.toContain('provider-secret')
    expect(executingStorageOperations.has('operation')).toBe(false)
  })
  it('does not perform effects after rejected review and records a safe unstarted failure', async () => {
    store.actions.begin.mockRejectedValueOnce(Error('provider-secret'))
    await expect(handler(job, { signal })).rejects.toThrow('Storage operation did not complete')
    expect(effect).not.toHaveBeenCalled()
    expect(store.actions.rejectBeforeStart).toHaveBeenCalledWith(job)
    expect(store.actions.finish).not.toHaveBeenCalled()
  })
  it('propagates a target-reported failure after recording it exactly once', async () => {
    effect.mockResolvedValueOnce({ ...summary, outcome: 'failed' })
    await expect(handler(job, { signal })).rejects.toThrow('Storage operation did not complete')
    expect(store.actions.finish).toHaveBeenCalledTimes(1)
    expect(store.actions.finish).toHaveBeenCalledWith(job, expect.objectContaining({ outcome: 'failed' }))
  })
  it('leaves completed effects unresolved if their receipt cannot be recorded and never retries the effect', async () => {
    store.actions.finish.mockRejectedValueOnce(Error('database unavailable'))
    await expect(handler(job, { signal })).rejects.toThrow('Storage operation did not complete')
    expect(effect).toHaveBeenCalledTimes(1)
    expect(store.actions.finish).toHaveBeenCalledTimes(1)
    expect(store.actions.rejectBeforeStart).not.toHaveBeenCalled()
  })
  it('does not record a false failure after losing the lease during an external effect', async () => {
    const controller = new AbortController()
    effect.mockImplementationOnce(async () => {
      controller.abort()
      return summary
    })
    await expect(handler(job, { signal: controller.signal })).rejects.toThrow('Storage operation did not complete')
    expect(store.actions.finish).not.toHaveBeenCalled()
    expect(store.actions.rejectBeforeStart).not.toHaveBeenCalled()
    expect(executingStorageOperations.has('operation')).toBe(false)
  })
  it('reports offline suspension separately from failed activation', async () => {
    context = { ...context, targetKey: null, handler: 'activate' }
    effect.mockResolvedValueOnce([
      { key: 'disk', active: true, paused: false },
      { key: 'sftp', active: false, paused: true }
    ])
    await handler(job, { signal })
    expect(store.actions.finish).toHaveBeenCalledWith(
      job,
      expect.objectContaining({
        outcome: 'succeeded',
        targets: [
          { key: 'disk', active: true, paused: false },
          { key: 'sftp', active: false, paused: true }
        ]
      })
    )
  })
  it('records partial activation when another enabled target fails to initialize', async () => {
    context = { ...context, targetKey: null, handler: 'activate' }
    effect.mockResolvedValueOnce([
      { key: 'disk', active: true, paused: false },
      { key: 'sftp', active: false, paused: false }
    ])
    await handler(job, { signal })
    expect(store.actions.finish).toHaveBeenCalledWith(job, expect.objectContaining({ outcome: 'partial' }))
  })
})
