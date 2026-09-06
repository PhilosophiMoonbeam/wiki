
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'

const { forkMock } = vi.hoisted(() => ({ forkMock: vi.fn() }))
vi.mockModule('node:child_process', import.meta.url, () => ({ fork: forkMock }))

const loadScheduler = async (jobs = {}) => {
  vi.resetModules()
  global.WIKI = {
    ROOTPATH: '/wiki',
    config: { offline: false },
    data: { jobs },
    logger: { warn: vi.fn() }
  }
  return (await vi.importFresh('../../core/scheduler.ts', import.meta.url)).default
}

class WorkerProcess extends EventEmitter {
  exitCode = null
  killed = false
  stderr = new PassThrough()

  kill(signal) {
    this.killed = true
    this.emit('exit', null, signal)
    return true
  }
}

describe('scheduler lifecycle', () => {
  beforeEach(() => {
    forkMock.mockReset()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts configured timers once and clears them on stop', async () => {
    const scheduler = await loadScheduler({ purgeUploads: { repeat: true, schedule: 'PT5M' } })

    scheduler.start()
    scheduler.start()

    expect(scheduler.jobs).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(1)

    await scheduler.stop()

    expect(scheduler.jobs).toHaveLength(0)
    expect(scheduler.started).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects unsafe runtime-selected job names before scheduling', async () => {
    const scheduler = await loadScheduler()

    expect(() => scheduler.registerJob({ name: '../worker', schedule: 'PT1M' })).toThrow('Invalid scheduler job name')
    expect(scheduler.jobs).toHaveLength(0)
  })

  it('serializes worker payloads and terminates an active child during shutdown', async () => {
    const child = new WorkerProcess()
    forkMock.mockReturnValue(child)
    const scheduler = await loadScheduler()

    scheduler.registerJob({ name: 'render-page', immediate: true, worker: true }, { pageId: 7 })
    await vi.waitFor(() => expect(forkMock).toHaveBeenCalledOnce())

    expect(forkMock.mock.calls[0][1]).toEqual([
      '--job=render-page',
      '--data={"pageId":7}'
    ])

    await scheduler.stop()

    expect(child.killed).toBe(true)
    expect(scheduler.jobs).toHaveLength(0)
  })

  it('observes waiting, running, completion and the next repeated invocation without exposing worker data', async () => {
    const child = new WorkerProcess()
    forkMock.mockReturnValue(child)
    const scheduler = await loadScheduler()
    const job = scheduler.registerJob({name:'render-page', worker:true, repeat:true, schedule:'PT5M'}, {secret:'private payload'})
    expect(scheduler.snapshot().jobs[0]).toMatchObject({state:'waiting', runs:0, lastOutcome:null})
    expect(scheduler.snapshot().jobs[0].nextRunAt).not.toBeNull()
    vi.advanceTimersByTime(300000)
    expect(scheduler.snapshot().jobs[0]).toMatchObject({state:'running', runs:1, nextRunAt:null})
    child.emit('exit', 0, null)
    await job.finished
    expect(scheduler.snapshot().jobs[0]).toMatchObject({state:'waiting', runs:1, failures:0, lastOutcome:'succeeded'})
    expect(JSON.stringify(scheduler.snapshot())).not.toContain('private payload')
    const copied = scheduler.snapshot()
    copied.jobs[0].state = 'failed'
    expect(scheduler.snapshot().jobs[0].state).toBe('waiting')
    await scheduler.stop()
    expect(scheduler.snapshot()).toMatchObject({started:false, jobs:[{state:'stopped', nextRunAt:null}]})
  })

  it('retains failed execution observations without raw stderr, then observes recovery', async () => {
    const child = new WorkerProcess()
    forkMock.mockReturnValue(child)
    const scheduler = await loadScheduler()
    const job = scheduler.registerJob({name:'render-page', worker:true, repeat:true, immediate:true, schedule:'PT5M'})
    child.stderr.write('credential-bearing error')
    child.emit('exit', 1, null)
    await job.finished.catch(()=>{})
    expect(scheduler.snapshot().jobs[0]).toMatchObject({state:'waiting', lastOutcome:'failed', failures:1})
    expect(JSON.stringify(scheduler.snapshot())).not.toContain('credential-bearing')
    const recovered = new WorkerProcess()
    forkMock.mockReturnValue(recovered)
    vi.advanceTimersByTime(300000)
    recovered.emit('exit', 0, null)
    await job.finished
    expect(scheduler.snapshot().jobs[0]).toMatchObject({lastOutcome:'succeeded', runs:2, failures:1})
    await scheduler.stop()
  })

  it('records offline skips and retains a bounded history of completed tasks', async () => {
    const scheduler = await loadScheduler({syncGraphLocales:{offlineSkip:true,repeat:true}})
    global.WIKI.config.offline = true
    scheduler.start()
    expect(scheduler.snapshot().jobs[0]).toMatchObject({name:'sync-graph-locales',state:'skipped',runs:0})
    for(let i=0;i<55;i++) {
      const child = new WorkerProcess()
      forkMock.mockReturnValue(child)
      const job = scheduler.registerJob({name:'render-page',worker:true,immediate:true})
      child.emit('exit',0,null)
      await job.finished
    }
    expect(scheduler.snapshot().jobs.filter(job=>job.state==='finished')).toHaveLength(50)
    expect(scheduler.jobs).toHaveLength(0)
    await scheduler.stop()
  })
})
