import { fetchWebhookDeliveries, sendWebhookTest } from './webhooks-api.ts'
const response = (payload, status = 200) => ({ status, ok: status < 400, headers: { get: () => 'application/json' }, json: async () => payload })
describe('webhook administration transport', () => {
  it('requests a targeted test and requires a returned delivery identity', async () => {
    const fetchImpl = vi.fn(async () => response({ deliveryId: 'test-one' }, 202))
    expect(await sendWebhookTest(fetchImpl, 'one/two')).toBe('test-one')
    expect(fetchImpl).toHaveBeenCalledWith('/_api/webhooks/one%2Ftwo/test', expect.objectContaining({ method: 'POST', credentials: 'same-origin' }))
    fetchImpl.mockResolvedValueOnce(response({ status: 'ok' }))
    await expect(sendWebhookTest(fetchImpl, 'one')).rejects.toThrow('Webhook test response is invalid')
  })
  it('preserves actionable test conflicts', async () => {
    await expect(sendWebhookTest(async () => response({ error: 'A test is already active' }, 409), 'one')).rejects.toThrow('A test is already active')
  })
  it('rejects malformed delivery data instead of displaying invented state', async () => {
    await expect(fetchWebhookDeliveries(async () => response([{ id: 'one' }]), 'hook')).rejects.toThrow('Webhook delivery response is invalid')
    const row = { id: 'one', eventId: 'event', eventType: 'webhook.test', jobId: 'job', state: 'pending', eventVersion: 1, attempts: 0, maxAttempts: 1, statusCode: null, responseSnippet: null, lastError: null, createdAt: new Date().toISOString(), deliveredAt: null, nextRunAt: new Date().toISOString() }
    expect(await fetchWebhookDeliveries(async () => response([row]), 'hook')).toEqual([row])
  })
})
