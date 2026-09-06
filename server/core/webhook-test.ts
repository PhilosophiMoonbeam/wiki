import { randomUUID } from 'node:crypto'
import type { Knex } from 'knex'
import { DurableJobStore } from './durable-jobs.ts'

/** Targeted synthetic event: already published, so the outbox cannot fan it out. */
export const queueWebhookTest = async (knex: Knex, webhookId: string): Promise<string> => knex.transaction(async transaction => {
  const hookQuery = transaction('webhooks').where('id', webhookId)
  if (transaction.client.config.client === 'pg') hookQuery.forUpdate()
  const hook = await hookQuery.first()
  if (!hook) throw Object.assign(new Error('Webhook not found'), { status: 404 })
  if (!hook.isEnabled) throw Object.assign(new Error('Enable and save this endpoint before sending a test.'), { status: 409 })
  const activeTest = await transaction('webhookDeliveries as delivery')
    .join('durableJobs as job', 'job.id', 'delivery.jobId')
    .join('outboxEvents as event', 'event.id', 'delivery.eventId')
    .where('delivery.webhookId', webhookId).where('event.type', 'webhook.test')
    .whereIn('job.state', ['pending', 'running']).first()
  if (activeTest) throw Object.assign(new Error('A test delivery is already queued or running. Refresh deliveries to inspect it.'), { status: 409 })
  const eventId = randomUUID()
  const deliveryId = randomUUID()
  const now = new Date()
  await transaction('outboxEvents').insert({
    id: eventId, type: 'webhook.test', version: 1, aggregateType: 'webhook', aggregateId: webhookId,
    payload: JSON.stringify({ test: true, message: 'Test delivery from tsEpistle.' }), createdAt: now, publishedAt: now
  })
  const job = await new DurableJobStore(transaction).enqueue({
    type: 'deliver-webhook', version: 1, payload: { deliveryId, eventId, webhookId },
    maxAttempts: 1, deduplicationKey: `webhook:${webhookId}:${eventId}`
  })
  await transaction('webhookDeliveries').insert({
    id: deliveryId, webhookId, eventId, jobId: job.id, createdAt: now, deliveredAt: null, statusCode: null, responseSnippet: null
  })
  return deliveryId
})
