import fs from 'node:fs'
import { describe, expect, it, vi } from '../../../server/test/bun-test.mts'

const source = fs.readFileSync('client/components/admin/admin-search.vue', 'utf8')
const script = source.match(/<script lang='ts'>([\s\S]*?)<\/script>/)[1]
const executable = new Bun.Transpiler({ loader: 'ts' }).transformSync(script.replace(/^import .*$/gm, '').replace('export default', 'return'))
const engine = () => ({ key: 'postgres', title: 'PostgreSQL', isEnabled: true, isAvailable: true, config: [{ key: 'dictLanguage', value: { value: 'english' } }] })

function harness() {
  const fetchEngines = vi.fn(async () => [engine()])
  const saveEngines = vi.fn(async () => ({ message: 'saved' }))
  const inspectIndex = vi.fn(async () => ({ engine: 'postgres', inspection: null }))
  const options = new Function('AdminSearchEvaluate', 'fetchSearchEngines', 'saveSearchEngines', 'rebuildSearchIndex', 'inspectSearchIndex', 'wikiStore', 'getErrorMessage', 'loadingStart', 'loadingStop', 'showNotification', 'pushGraphError', executable)(
    {}, fetchEngines, saveEngines, vi.fn(), inspectIndex, {}, (error) => error.message, vi.fn(), vi.fn(), vi.fn(), vi.fn()
  )
  const instance = { ...options.data(), $t: (key) => key }
  for (const [key, value] of Object.entries(options.methods)) { if (typeof value === 'function') instance[key] = value.bind(instance) }
  for (const [key, value] of Object.entries(options.computed)) { if (typeof value === 'function') Object.defineProperty(instance, key, { get: value.bind(instance) }) }
  return { instance, fetchEngines, saveEngines, inspectIndex, options }
}

describe('search administration drafts', () => {
  it('requires a change before saving and resets a draft without mutating its baseline', async () => {
    const { instance, saveEngines } = harness()
    await instance.loadEngines()
    expect(instance.canSave).toBe(false)
    await instance.save()
    expect(saveEngines).not.toHaveBeenCalled()
    instance.engine.config[0].value.value = 'simple'
    expect(instance.dirty).toBe(true)
    expect(instance.canSave).toBe(true)
    expect(instance.savedEngines[0].config[0].value.value).toBe('english')
    instance.resetDraft()
    expect(instance.engine.config[0].value.value).toBe('english')
    expect(instance.dirty).toBe(false)
  })

  it('retains a failed save as a dirty draft and does not refresh it away', async () => {
    const { instance, fetchEngines, saveEngines } = harness()
    await instance.loadEngines()
    instance.engine.config[0].value.value = 'simple'
    saveEngines.mockRejectedValueOnce(new Error('Connection failed'))
    await instance.save()
    expect(instance.dirty).toBe(true)
    expect(instance.operationError).toBe('Connection failed')
    expect(instance.saving).toBe(false)
    await instance.refresh()
    expect(fetchEngines).toHaveBeenCalledTimes(1)
  })

  it('requires an explicit decision before leaving a dirty configuration', async () => {
    const { instance, options } = harness()
    await instance.loadEngines()
    expect(options.beforeRouteLeave.call(instance)).toBe(true)
    instance.engine.config[0].value.value = 'simple'
    const pending = options.beforeRouteLeave.call(instance)
    instance.finishLeave(false)
    expect(await pending).toBe(false)
    expect(instance.dirty).toBe(true)
  })

  it('does not call an unsupported inspection healthy', async () => {
    const { instance } = harness()
    await instance.inspect()
    expect(instance.inspectionUnsupported).toBe(true)
    expect(instance.indexAligned).toBe(false)
  })
})
