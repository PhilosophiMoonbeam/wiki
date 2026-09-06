const template = Object.fromEntries(
  ['init', 'deactivated', 'created', 'updated', 'deleted', 'renamed', 'assetUploaded', 'assetDeleted', 'assetRenamed', 'getLocalLocation', 'sync', 'dump'].map(
    key => [key, vi.fn()]
  )
)
vi.mockModule('../../modules/storage/disk/storage.ts', import.meta.url, () => ({ default: template }))
describe('Storage runtime replacement and synchronization', () => {
  let Storage, rows, scheduler
  const row = (value = 'first') => ({
    key: 'disk',
    isEnabled: true,
    mode: 'push',
    syncInterval: 'P0D',
    config: { path: value, nested: { value } },
    state: { status: 'warning', message: 'previous', lastAttempt: null, lastOperation: { message: 'Keep the manual receipt' } },
    $query: vi.fn(() => ({ patch: vi.fn().mockResolvedValue(1) }))
  })
  beforeEach(async () => {
    for (const method of Object.values(template)) method.mockReset().mockResolvedValue(undefined)
    template.init.mockImplementation(async function () {
      this.initializedPath = this.config.path
      this.config.path += '-runtime'
    })
    rows = [row()]
    scheduler = { jobs: [], registerJob: vi.fn() }
    global.WIKI = {
      SERVERPATH: '/wiki/server',
      data: { storage: [{ key: 'disk', isAvailable: true, props: {}, schedule: false, internalSchedule: 'P1D', actions: [{ handler: 'dump' }] }] },
      scheduler,
      logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
      models: { storage: class {}, knex: vi.fn(), Objection: { transaction: { start: vi.fn() } } }
    }
    Storage = (await vi.importFresh('../../models/storage.ts', import.meta.url)).default
    global.WIKI.models.storage = Storage
    vi.spyOn(Storage, 'query').mockImplementation(() => ({ where: () => ({ orderBy: async () => rows }) }))
  })
  it('isolates template, row and runtime configuration and binds the declared internal interval to a generation', async () => {
    await Storage.initTargets()
    const first = Storage.targets[0],
      firstImplementation = first.fn
    expect(first.config.path).toBe('first')
    expect(firstImplementation.config.path).toBe('first-runtime')
    expect(template.config).toBeUndefined()
    expect(scheduler.registerJob).toHaveBeenCalledWith(
      { name: 'sync-storage', immediate: false, schedule: 'P1D', repeat: true },
      { targetKey: 'disk', generation: first.runtimeGeneration }
    )
    rows = [row('second')]
    await Storage.initTargets()
    const second = Storage.targets[0]
    expect(second.fn).not.toBe(firstImplementation)
    expect(second.fn.config.path).toBe('second-runtime')
    expect(firstImplementation.config.path).toBe('first-runtime')
    firstImplementation.config.nested.value = 'changed'
    expect(first.config.nested.value).toBe('first')
    expect(second.config.nested.value).toBe('second')
    expect(second.runtimeGeneration).not.toBe(first.runtimeGeneration)
    expect(template.deactivated).toHaveBeenCalledTimes(1)
  })
  it('preserves the latest manual receipt during scheduled success and failure and ignores stale generations', async () => {
    await Storage.initTargets()
    const target = Storage.targets[0],
      receipt = target.state.lastOperation
    expect(await Storage.syncTarget('disk', 'stale')).toBe(false)
    expect(template.sync).not.toHaveBeenCalled()
    expect(await Storage.syncTarget('disk', target.runtimeGeneration)).toBe(true)
    expect(target.state.lastOperation).toEqual(receipt)
    template.sync.mockRejectedValueOnce(new Error('sync failure'))
    await expect(Storage.syncTarget('disk', target.runtimeGeneration)).rejects.toThrow('sync failure')
    expect(target.state).toMatchObject({ status: 'error', message: 'sync failure', lastOperation: receipt })
  })
  it('finishes an active action, replaces the runtime, and drains a cancelled stale timer without deadlock', async () => {
    await Storage.initTargets()
    const target = Storage.targets[0],
      gate = Promise.withResolvers()
    target.fn.dump = vi.fn(async () => {
      await gate.promise
    })
    const action = Storage.executeAction('disk', 'dump')
    await vi.waitFor(() => expect(target.fn.dump).toHaveBeenCalledTimes(1))
    let stale
    const stop = vi.fn(() => stale)
    scheduler.jobs = [{ name: 'sync-storage', stop }]
    rows = [row('replacement')]
    const replacement = Storage.initTargets()
    stale = Storage.syncTarget('disk', target.runtimeGeneration)
    gate.resolve()
    await action
    await replacement
    expect(await stale).toBe(false)
    expect(stop).toHaveBeenCalledTimes(1)
    expect(Storage.activeTargets[0].config.path).toBe('replacement')
    expect(template.sync).not.toHaveBeenCalled()
  })
  it('closes partially initialized targets and keeps failed targets out of active event dispatch', async () => {
    template.init.mockRejectedValueOnce(new Error('connection failed'))
    await Storage.initTargets()
    expect(Storage.activeTargets).toHaveLength(0)
    expect(template.deactivated).toHaveBeenCalledTimes(1)
    await Storage.pageEvent({ event: 'created', page: { path: 'guide' } })
    expect(template.created).not.toHaveBeenCalled()
  })
  it('retains the active runtime when the replacement configuration cannot be read', async () => {
    await Storage.initTargets()
    const active = Storage.activeTargets[0]
    Storage.query.mockImplementationOnce(() => ({
      where: () => ({
        orderBy: async () => {
          throw Error('database unavailable')
        }
      })
    }))
    await expect(Storage.initTargets()).rejects.toThrow('database unavailable')
    expect(Storage.activeTargets).toEqual([active])
    expect(template.deactivated).not.toHaveBeenCalled()
  })
  it('quarantines and unschedules a target when its second timer registration fails', async () => {
    global.WIKI.data.storage[0].schedule = 'PT1M'
    rows[0].syncInterval = 'PT1M'
    const job = { name: 'sync-storage', stop: vi.fn().mockResolvedValue(undefined) }
    scheduler.registerJob
      .mockImplementationOnce(() => {
        scheduler.jobs.push(job)
        return job
      })
      .mockImplementationOnce(() => {
        throw Error('timer registration failed')
      })
    await Storage.initTargets()
    expect(Storage.activeTargets).toHaveLength(0)
    expect(scheduler.jobs).toHaveLength(0)
    expect(job.stop).toHaveBeenCalledTimes(1)
    expect(template.deactivated).toHaveBeenCalledTimes(1)
    expect(rows[0].state.status).toBe('error')
  })
})
