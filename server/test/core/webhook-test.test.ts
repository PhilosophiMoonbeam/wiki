import createKnex, { type Knex } from 'knex'
import { afterEach, beforeEach, describe, expect, it } from '../bun-test.mts'
import { queueWebhookTest } from '../../core/webhook-test.ts'
import { WEBHOOK_EVENTS, isWebhookEventName } from '../../../shared/webhook-events.ts'
import { up as upJobs } from '../../db/migrations/2.5.130.ts'
import { up as upLease } from '../../db/migrations/2.5.158.ts'
import { up as upOutbox } from '../../db/migrations/2.5.131.ts'
import { DurableJobStore } from '../../core/durable-jobs.ts'
let knex: Knex
beforeEach(async () => {
  knex = createKnex({ client: 'better-sqlite3', connection: { filename: ':memory:' }, pool: { min: 1, max: 1 }, useNullAsDefault: true })
  await upJobs(knex); await upLease(knex); await upOutbox(knex)
  await knex('webhooks').insert(['one', 'two'].map(id => ({ id, name: id, url: 'https://example.test/hook', events: '["*"]', secretCiphertext: 'fixture', isEnabled: true, createdAt: new Date(), updatedAt: new Date() })))
})
afterEach(async () => { await knex.destroy() })
describe('targeted webhook tests', () => {
  it('creates one durable signed delivery with synthetic data and prevents outbox fanout', async () => {
    const id = await queueWebhookTest(knex, 'one')
    const deliveries = await knex('webhookDeliveries')
    expect(deliveries).toHaveLength(1)
    expect(deliveries[0]).toMatchObject({ id, webhookId: 'one', deliveredAt: null })
    const event = await knex('outboxEvents').first()
    expect(event.type).toBe('webhook.test')
    expect(event.publishedAt).not.toBeNull()
    expect(JSON.parse(event.payload)).toEqual({ test: true, message: 'Test delivery from tsEpistle.' })
    const job = await new DurableJobStore(knex).get(deliveries[0].jobId)
    expect(job).toMatchObject({ type: 'deliver-webhook', maxAttempts: 1, state: 'pending', payload: { deliveryId: id, eventId: event.id, webhookId: 'one' } })
  })
  it('rejects duplicate active tests and allows a fresh test after cancellation', async () => {
    await queueWebhookTest(knex, 'one')
    await expect(queueWebhookTest(knex, 'one')).rejects.toMatchObject({ status: 409 })
    expect(await knex('outboxEvents')).toHaveLength(1)
    const delivery = await knex('webhookDeliveries').first()
    await new DurableJobStore(knex).cancel(delivery.jobId)
    await queueWebhookTest(knex, 'one')
    expect(await knex('webhookDeliveries')).toHaveLength(2)
  })
  it('does not enqueue for missing or disabled endpoints', async () => {
    await expect(queueWebhookTest(knex, 'missing')).rejects.toMatchObject({ status: 404 })
    await knex('webhooks').where('id', 'one').update({ isEnabled: false })
    await expect(queueWebhookTest(knex, 'one')).rejects.toMatchObject({ status: 409 })
    expect(await knex('outboxEvents')).toHaveLength(0)
    expect(await knex('durableJobs')).toHaveLength(0)
  })
  it('accepts all actual catalog events including hyphens and rejects malformed names', () => {
    expect(WEBHOOK_EVENTS.every(event => isWebhookEventName(event.name))).toBe(true)
    expect(isWebhookEventName('page.visibility-changed')).toBe(true)
    expect(isWebhookEventName('page.ownership-transferred')).toBe(true)
    expect(isWebhookEventName('*')).toBe(true)
    for (const name of ['page..created', 'Page.created', '.created', 'page.-created', 'page.*', 'a'.repeat(129)]) expect(isWebhookEventName(name)).toBe(false)
  })
})
