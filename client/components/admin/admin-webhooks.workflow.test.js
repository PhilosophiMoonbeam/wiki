import fs from 'node:fs'
import { describe, expect, it, vi } from '../../../server/test/bun-test.mts'
import { WEBHOOK_EVENTS, isWebhookEventName } from '../../../shared/webhook-events.ts'
const source = fs.readFileSync('client/components/admin/admin-webhooks.vue', 'utf8')
const script = source.match(/<script lang='ts'>([\s\S]*?)<\/script>/)[1]
const executable = new Bun.Transpiler({ loader: 'ts' }).transformSync(script.replace(/^import [\s\S]*? from [^\n]+\n/gm, '').replace('export default', 'return'))
const hook = { id: 'one', name: 'Knowledge sync', url: 'https://example.test/hook', events: ['page.updated'], isEnabled: true }
function harness() {
  const update = vi.fn(async () => {})
  const sendTest = vi.fn(async () => 'test-one')
  const fetchHooks = vi.fn(async () => [hook])
  const options = new Function('window', 'AdminWebhookGuide', 'WEBHOOK_EVENTS', 'isWebhookEventName', 'wikiStore', 'updateWebhook', 'sendWebhookTest', 'fetchWebhooks', 'fetchWebhookDeliveries', executable)(
    { location: { hash: '', href: 'https://example.test/a/webhooks' }, history: { replaceState() {} }, fetch() {} }, {}, WEBHOOK_EVENTS, isWebhookEventName, { showError() {}, showNotification() {} }, update, sendTest, fetchHooks, vi.fn(async () => [])
  )
  const instance = { ...options.data(), $nextTick: vi.fn(), $refs: {} }
  for (const [key, fn] of Object.entries(options.methods)) instance[key] = fn.bind(instance)
  for (const [key, fn] of Object.entries(options.computed)) Object.defineProperty(instance, key, { get: fn.bind(instance) })
  instance.hooks = [hook]
  instance.selectHookNow(hook)
  return { instance, options, update, sendTest, fetchHooks }
}
describe('webhook administration workflow', () => {
  it('protects changes when switching endpoints or leaving the route', async () => {
    const { instance, options } = harness()
    expect(instance.dirty).toBe(false)
    instance.draft.name = 'Changed'
    instance.newHook()
    expect(instance.draft.id).toBe('one')
    instance.finishChange(false)
    expect(instance.draft.name).toBe('Changed')
    const leaving = options.beforeRouteLeave.call(instance)
    instance.finishChange(false)
    expect(await leaving).toBe(false)
    instance.resetDraft()
    expect(instance.dirty).toBe(false)
    expect(instance.draft.name).toBe(hook.name)
  })
  it('preserves a failed save and the saved endpoint baseline', async () => {
    const { instance, update, fetchHooks } = harness()
    instance.draft.name = 'Changed'
    update.mockRejectedValueOnce(new Error('Connection failed'))
    await instance.save()
    expect(instance.dirty).toBe(true)
    expect(instance.operationError).toBe('Connection failed')
    expect(instance.savedHook.name).toBe(hook.name)
    expect(fetchHooks).not.toHaveBeenCalled()
    expect(instance.webhookBusy).toBe(false)
  })
  it('protects a revealed secret even after a clean save', async () => {
    const { instance, options } = harness()
    instance.revealedSecret = 'one-time-fixture'
    const leaving = options.beforeRouteLeave.call(instance)
    instance.finishChange(false)
    expect(await leaving).toBe(false)
    expect(instance.revealedSecret).toBe('one-time-fixture')
  })
  it('gates test sends on saved, enabled settings and then exposes queue identity', async () => {
    const { instance, sendTest } = harness()
    instance.draft.name = 'Unsaved'
    await instance.sendTest()
    expect(sendTest).not.toHaveBeenCalled()
    instance.resetDraft()
    await instance.sendTest()
    expect(sendTest).toHaveBeenCalledTimes(1)
    expect(instance.testMessage).toContain('test-one')
    expect(instance.webhookBusy).toBe(false)
  })
  it('supports actual hyphenated events and does not silently drop custom subscriptions', () => {
    const { instance } = harness()
    instance.eventsText = 'custom.event\npage.updated'
    instance.toggleEvent('page.visibility-changed')
    expect(instance.subscribedEvents).toEqual(['custom.event', 'page.updated', 'page.visibility-changed'])
    expect(instance.isWebhookValid).toBe(true)
    instance.eventsText = 'page.*'
    expect(instance.isWebhookValid).toBe(false)
  })
})
