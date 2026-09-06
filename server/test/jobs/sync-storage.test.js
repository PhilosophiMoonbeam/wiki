describe('scheduled storage dispatch', () => {
  let run, syncTarget, info
  beforeEach(async () => {
    syncTarget = vi.fn().mockResolvedValue(true)
    info = vi.fn()
    global.WIKI = { models: { storage: { syncTarget } }, logger: { info } }
    run = (await vi.importFresh('../../jobs/sync-storage.ts', import.meta.url)).default
  })
  it('requires generation-bound payloads and never invokes legacy bare target names', async () => {
    for (const input of ['disk', null, { targetKey: 'disk' }, { targetKey: 1, generation: 'old' }]) {
      await expect(run(input)).rejects.toThrow('requires a target and runtime generation')
    }
    expect(syncTarget).not.toHaveBeenCalled()
  })
  it('delegates the exact runtime generation and records skipped work', async () => {
    syncTarget.mockResolvedValueOnce(false)
    await run({ targetKey: 'disk', generation: 'old' })
    expect(syncTarget).toHaveBeenCalledWith('disk', 'old')
    expect(info).toHaveBeenCalledWith(expect.stringContaining('skipped'))
  })
  it('propagates failed synchronization so scheduler observations do not report success', async () => {
    syncTarget.mockRejectedValueOnce(new Error('sync failed'))
    await expect(run({ targetKey: 'disk', generation: 'current' })).rejects.toThrow('sync failed')
    expect(info).not.toHaveBeenCalled()
  })
})
