import type { Knex } from 'knex'
import { pruneAnalyticsInsights } from '../repositories/analytics-insights.ts'
export default async function pruneAnalytics(): Promise<void> {
  const wiki = WIKI as unknown as { models: { knex: Knex }; logger: { info(message: string): void } }
  const removed = await pruneAnalyticsInsights(wiki.models.knex)
  if (removed) wiki.logger.info(`Analytics retention removed ${removed} expired daily counters.`)
}
