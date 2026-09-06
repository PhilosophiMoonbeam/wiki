import { describe, it, expect } from '../bun-test.mts'
import { createStorageRuntimeQueue } from '../../helpers/storage-runtime-queue.ts'
describe('Storage runtime ordering', () => {
  it('finishes an existing effect before replacement and starts later effects after replacement', async () => {
    const queue = createStorageRuntimeQueue(),
      gate = Promise.withResolvers<void>(),
      events: string[] = []
    const before = queue.run(async () => {
      events.push('before')
      await gate.promise
      events.push('before-finished')
    })
    const replacement = queue.run(async () => {
      events.push('replace')
    })
    const after = queue.run(async () => {
      events.push('after')
    })
    await Promise.resolve()
    expect(events).toEqual(['before'])
    gate.resolve()
    await Promise.all([before, replacement, after])
    expect(events).toEqual(['before', 'before-finished', 'replace', 'after'])
  })
  it('allows awaited nested effects and recovers the queue after rejection', async () => {
    const queue = createStorageRuntimeQueue(),
      events: string[] = []
    await queue.run(async () => {
      events.push('outer')
      await queue.run(async () => {
        events.push('nested')
      })
    })
    await expect(
      queue.run(async () => {
        throw Error('failed effect')
      })
    ).rejects.toThrow('failed effect')
    await queue.run(async () => {
      events.push('recovered')
    })
    expect(events).toEqual(['outer', 'nested', 'recovered'])
  })
  it('does not let a later callback inherit an already-completed turn', async () => {
    const queue = createStorageRuntimeQueue(),
      gate = Promise.withResolvers<void>(),
      trigger = Promise.withResolvers<void>(),
      events: string[] = []
    let later: Promise<void> = Promise.resolve()
    await queue.run(async () => {
      later = trigger.promise.then(() =>
        queue.run(async () => {
          events.push('later')
        })
      )
    })
    const active = queue.run(async () => {
      events.push('active')
      await gate.promise
    })
    await Promise.resolve()
    trigger.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(events).toEqual(['active'])
    gate.resolve()
    await Promise.all([active, later])
    expect(events).toEqual(['active', 'later'])
  })
})
