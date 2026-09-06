import { AsyncLocalStorage } from 'node:async_hooks'

/** Orders runtime replacement and storage effects; awaited nested effects share the current turn. */
export const createStorageRuntimeQueue = () => {
  let tail: Promise<unknown> = Promise.resolve()
  const context = new AsyncLocalStorage<{ active: boolean }>()
  return {
    run<T>(action: () => Promise<T>): Promise<T> {
      if (context.getStore()?.active) return action()
      const next = tail.then(() => {
        const turn = { active: true }
        return context.run(turn, async () => {
          try {
            return await action()
          } finally {
            turn.active = false
          }
        })
      })
      tail = next.catch(() => undefined)
      return next
    }
  }
}
