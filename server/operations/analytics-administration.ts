import { createHmac, randomUUID } from 'node:crypto'
import type { Knex } from 'knex'
import { z } from 'zod'
import {
  AnalyticsPolicySchema,
  analyticsPolicyFromConfiguration,
  analyticsChangedFields,
  type AnalyticsEvent,
  type AnalyticsProviderDraft,
  type AnalyticsWorkspace
} from '../../shared/analytics-policy.ts'
import { accountSessionIsCurrent } from '../helpers/account-session.ts'
import { principalId, type PagePrincipal } from '../helpers/page-access.ts'
import { analyticsDefinition, analyticsProviderIssues } from '../../shared/analytics-providers.ts'
import {
  analyticsConfiguration,
  analyticsDraftFromRow,
  analyticsRecord,
  analyticsSettingKeys,
  inspectAnalyticsProvider,
  type AnalyticsRow,
  type AnalyticsSetting
} from '../repositories/analytics-runtime.ts'
import { readAnalyticsInsights } from '../repositories/analytics-insights.ts'
import errors from './errors.ts'
const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item
  )
const fail = (message: string, status = 400): never => {
  throw new errors.ApplicationError(message, { status })
}
const ProviderDraftSchema = z
  .object({ key: z.string().min(1).max(255), isEnabled: z.boolean(), config: z.record(z.string().max(100), z.string().max(2048)) })
  .strict()
const WriteSchema = z
  .object({
    policy: AnalyticsPolicySchema,
    providers: z.array(ProviderDraftSchema).max(100),
    fingerprint: z.string().length(64),
    reason: z.string().trim().min(3).max(1000)
  })
  .strict()
interface Group {
  id: number
  permissions: string[]
  adminRevision: string
}
interface Account {
  id: number
  isActive: boolean
  authVersion: number
}
interface Dependencies {
  db: Knex
  reviewKey: string
  serverPath: string
  available(): ReadonlySet<string>
  fallback(): Record<string, unknown>
  now?(): Date
}
export const createAnalyticsAdministrationStore = (deps: Dependencies) => {
  const now = () => deps.now?.() ?? new Date()
  const state = async (tx: Knex.Transaction, requester: PagePrincipal, lock = false) => {
    const g = tx<Group>('groups').select('id', 'permissions', 'adminRevision').orderBy('id'),
      groups = await (lock ? g.forUpdate() : g)
    if (!requester) return fail('An administrator sign-in is required.', 403)
    const actorId = principalId(requester)
    let ids: number[]
    if (actorId !== null) {
      const query = tx<Account>('users').where('id', actorId).select('id', 'isActive', 'authVersion').first(),
        account = await (lock ? query.forUpdate() : query)
      if (!accountSessionIsCurrent({ id: actorId, authVersion: Reflect.get(requester, 'authVersion') }, account))
        return fail('Your account session changed. Sign in again.', 403)
      ids = (await tx<{ groupId: number }>('userGroups').where('userId', actorId).select('groupId')).map(row => row.groupId).sort((a, b) => a - b)
    } else {
      if (
        requester.ownershipUserId !== null ||
        requester.id !== 1 ||
        !Array.isArray(requester.groups) ||
        requester.groups.length !== 1 ||
        typeof requester.groups[0] !== 'number'
      )
        return fail('An administrator principal is required.', 403)
      ids = requester.groups as number[]
    }
    if (!groups.some(group => ids.includes(group.id) && group.permissions.includes('manage:system'))) return fail('System administration is required.', 403)
    const sq = tx<AnalyticsSetting>('settings').whereIn('key', analyticsSettingKeys).orderBy('key'),
      settings = await (lock ? sq.forUpdate() : sq)
    const pq = tx<AnalyticsRow>('analytics').orderBy('key'),
      rows = await (lock ? pq.forUpdate() : pq)
    const configuration = analyticsConfiguration(settings, deps.fallback()),
      policy = analyticsPolicyFromConfiguration(
        configuration,
        rows.some(row => row.isEnabled)
      ),
      metadata = analyticsRecord(configuration.analyticsAdministration)
    const available = deps.available(),
      fingerprint = createHmac('sha256', deps.reviewKey)
        .update(stable([settings, rows, policy, groups, actorId, ids, [...available].sort()]))
        .digest('hex')
    return { rows, settings, configuration, policy, metadata, available, fingerprint, actorId }
  }
  const put = async (tx: Knex.Transaction, key: string, value: unknown, createdAt: string) =>
    tx('settings')
      .insert({ key, value: JSON.stringify(value), updatedAt: createdAt })
      .onConflict('key')
      .merge(['value', 'updatedAt'])
  const history = (metadata: Record<string, unknown>): AnalyticsEvent[] => (Array.isArray(metadata.history) ? (metadata.history as AnalyticsEvent[]) : [])
  const receipt = async (tx: Knex.Transaction, current: Awaited<ReturnType<typeof state>>, event: AnalyticsEvent) =>
    put(
      tx,
      'analyticsAdministration',
      { ...current.metadata, revision: event.id, history: [event, ...history(current.metadata)].slice(0, 50) },
      event.createdAt
    )
  const inspect = async (requester: PagePrincipal, days?: number): Promise<AnalyticsWorkspace> => {
    if (days !== undefined && ![7, 30, 90, 365].includes(days)) return fail('Choose a supported reporting window.')
    const tx = await deps.db.transaction({ isolationLevel: 'repeatable read', readOnly: true })
    try {
      const saved = await state(tx, requester)
      const providers = await Promise.all(saved.rows.map(row => inspectAnalyticsProvider(row, deps.serverPath, saved.available)))
      const insights = await readAnalyticsInsights(tx, Math.min(days ?? saved.policy.retentionDays, saved.policy.retentionDays), now())
      await tx.commit()
      return {
        policy: saved.policy,
        fingerprint: saved.fingerprint,
        revision: typeof saved.metadata.revision === 'string' ? saved.metadata.revision : '',
        providers,
        history: history(saved.metadata).slice(0, 50),
        offline: saved.configuration.offline === true,
        observedAt: now().toISOString(),
        insights
      }
    } catch (error) {
      await tx.rollback()
      throw error
    }
  }
  return {
    inspect,
    async save(requester: PagePrincipal, input: unknown): Promise<{ revision: string }> {
      const parsed = WriteSchema.safeParse(input)
      if (!parsed.success) return fail('Analytics settings are invalid. Check the collection policy, provider fields and review reason.')
      const value = parsed.data
      return deps.db.transaction(async tx => {
        const current = await state(tx, requester, true)
        if (value.fingerprint !== current.fingerprint) return fail('Analytics settings or access changed. Reload and review again.', 409)
        if (
          new Set(value.providers.map(row => row.key)).size !== value.providers.length ||
          stable(value.providers.map(row => row.key).sort()) !== stable(current.rows.map(row => row.key).sort())
        )
          return fail('Review the complete current provider inventory.')
        const changedProviders: string[] = []
        for (const draft of value.providers) {
          const original = current.rows.find(row => row.key === draft.key)!,
            definition = analyticsDefinition(draft.key)
          if (!definition) {
            if (draft.isEnabled || Object.keys(draft.config).length) return fail('An unknown integration can only be disabled.')
          } else {
            if (Object.keys(draft.config).some(key => !definition.fields.some(field => field.key === key)))
              return fail(`${definition.title} has an unknown configuration field.`)
            if (draft.isEnabled) {
              const result = await inspectAnalyticsProvider({ ...draft }, deps.serverPath, current.available)
              const issues = analyticsProviderIssues(draft)
              if (!result.isAvailable || issues.length) return fail(`${definition.title}: ${issues[0] ?? result.issues[0] ?? 'Integration unavailable.'}`)
            }
          }
          if (stable(draft) !== stable(analyticsDraftFromRow(original))) changedProviders.push(draft.key)
        }
        const fields = analyticsChangedFields(current.policy, value.policy)
        if (!fields.length && !changedProviders.length) return { revision: typeof current.metadata.revision === 'string' ? current.metadata.revision : '' }
        const event: AnalyticsEvent = {
          id: randomUUID(),
          actorId: current.actorId,
          createdAt: now().toISOString(),
          reason: value.reason,
          fields,
          providers: changedProviders,
          kind: 'settings'
        }
        for (const draft of value.providers.filter(row => changedProviders.includes(row.key))) {
          // Preserve unowned configuration for known integrations; it is never passed to the compiler.
          const original = current.rows.find(row => row.key === draft.key)!
          await tx('analytics')
            .where('key', draft.key)
            .update({ isEnabled: draft.isEnabled, config: JSON.stringify({ ...analyticsRecord(original.config), ...draft.config }) })
        }
        await put(tx, 'analyticsPolicy', { ...analyticsRecord(current.configuration.analyticsPolicy), ...value.policy, revision: event.id }, event.createdAt)
        await receipt(tx, current, event)
        return { revision: event.id }
      })
    },
    async erase(requester: PagePrincipal, input: unknown): Promise<{ revision: string; erasedRows: number }> {
      const validation = z
        .object({ fingerprint: z.string().length(64), reason: z.string().trim().min(3).max(1000), confirmation: z.literal('ERASE LOCAL COUNTS') })
        .strict()
        .safeParse(input)
      if (!validation.success) return fail('Review the erasure reason and confirmation.')
      return deps.db.transaction(async tx => {
        const current = await state(tx, requester, true)
        if (current.fingerprint !== validation.data.fingerprint) return fail('Analytics settings changed. Reload and review again.', 409)
        const erasedRows = await tx('analyticsDaily').delete()
        const event: AnalyticsEvent = {
          id: randomUUID(),
          actorId: current.actorId,
          createdAt: now().toISOString(),
          reason: validation.data.reason,
          fields: [],
          providers: [],
          kind: 'erase',
          erasedRows
        }
        await receipt(tx, current, event)
        return { revision: event.id, erasedRows }
      })
    }
  }
}
let runtimeStore: ReturnType<typeof createAnalyticsAdministrationStore> | undefined, runtimeDatabase: Knex | undefined
export const getAnalyticsAdministrationStore = () => {
  const wiki = WIKI as unknown as {
    models: { knex: Knex }
    SERVERPATH: string
    config: Record<string, unknown>
    data: { analytics: Array<{ key: string; isAvailable?: boolean }> }
  }
  if (!runtimeStore || runtimeDatabase !== wiki.models.knex) {
    runtimeDatabase = wiki.models.knex
    runtimeStore = createAnalyticsAdministrationStore({
      db: wiki.models.knex,
      reviewKey: String(wiki.config.sessionSecret),
      serverPath: wiki.SERVERPATH,
      fallback: () => wiki.config,
      available: () => new Set(wiki.data.analytics.filter(row => row.isAvailable).map(row => row.key))
    })
  }
  return runtimeStore
}
