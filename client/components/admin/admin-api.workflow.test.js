import fs from 'node:fs'
import { describe, expect, it, vi } from '../../../server/test/bun-test.mts'
const script = fs.readFileSync('client/components/admin/admin-api-create.vue', 'utf8').match(/<script lang='ts'>([\s\S]*?)<\/script>/)[1]
const executable = new Bun.Transpiler({ loader: 'ts' }).transformSync(script.replace(/^import .*$/gm, '').replace('export default', 'return'))
function harness() {
  const create = vi.fn(async () => ({ key: 'one-time-fixture-key' }))
  const options = new Function('createAdminApiKey', 'fetchGroupOptions', 'getErrorMessage', 'wikiStore', 'window', executable)(create, vi.fn(), error => error.message, { startLoading() {}, stopLoading() {}, showNotification() {}, showError() {} }, { fetch() {} })
  const instance = { ...options.data(), $refs: { createForm: { validate: vi.fn(async () => ({ valid: true })) } }, $nextTick: vi.fn(), $emit: vi.fn(), $t: key => key, connections: { mcpEnabled: true, mcpConfigurationError: false, groups: [] }, refreshApiKeys: vi.fn(async () => true) }
  for (const [key, fn] of Object.entries(options.methods)) instance[key] = fn.bind(instance)
  for (const [key, fn] of Object.entries(options.computed)) { if (typeof fn === 'function') Object.defineProperty(instance, key, { get: fn.bind(instance) }) }
  return { instance, create, options }
}
describe('guided API-key issuance', () => {
  it('keeps invalid identity and unavailable groups from reaching review', () => {
    const { instance } = harness()
    instance.name = 'x';instance.nextStep();expect(instance.step).toBe(1)
    instance.name = 'Indexer';instance.nextStep();expect(instance.step).toBe(2)
    instance.groupLoadState = 'success';instance.groups = [{ id: 3, name: 'Readers' }];instance.group = 2
    instance.nextStep();expect(instance.step).toBe(2)
    instance.group = 3;instance.nextStep();expect(instance.step).toBe(3)
  })
  it('preserves the one-time credential when an inventory refresh rejects', async () => {
    const { instance, create } = harness()
    Object.assign(instance, { name: 'Indexer', step: 3, scope: 'group', group: 3, groupLoadState: 'success', mcpAccess: false })
    instance.refreshApiKeys.mockRejectedValueOnce(new Error('Inventory unavailable'))
    await instance.generate()
    expect(create).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ name: 'Indexer', group: 3, mcpAccess: false }))
    expect(instance.key).toBe('one-time-fixture-key')
    expect(instance.isCopyKeyDialogShown).toBe(true)
    expect(instance.flowProtected).toBe(true)
    instance.finishCopyKey()
    expect(instance.key).toBe('')
    expect(instance.flowProtected).toBe(false)
  })
  it('retains a failed issuance draft and surfaces the error', async () => {
    const { instance, create } = harness()
    Object.assign(instance, { name: 'Indexer', step: 3, scope: 'full' })
    create.mockRejectedValueOnce(new Error('Creation rejected'))
    await instance.generate()
    expect(instance.name).toBe('Indexer')
    expect(instance.step).toBe(3)
    expect(instance.formError).toBe('Creation rejected')
    expect(instance.isCopyKeyDialogShown).toBe(false)
  })
  it('requires a deliberate decision when a replacement needs unavailable MCP configuration', () => {
    const { instance } = harness()
    Object.assign(instance, { name: 'Agent replacement', step: 2, scope: 'full', mcpAccess: true, connections: null })
    instance.nextStep()
    expect(instance.step).toBe(2)
    expect(instance.formError).toContain('MCP configuration is unavailable')
    instance.mcpAccess = false
    instance.nextStep()
    expect(instance.step).toBe(3)
  })
})
