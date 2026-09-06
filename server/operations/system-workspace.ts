import type { Knex } from 'knex'
import { SystemWorkspaceSchema, type SystemWorkspace } from '../../shared/system-workspace.ts'
import type { ProductMetadata } from '../../shared/product.ts'
import { accountSessionIsCurrent } from '../helpers/account-session.ts'
import { principalId, type PagePrincipal } from '../helpers/page-access.ts'
import errors from './errors.ts'

interface Dependencies {
  db: Knex
  product(): ProductMetadata
  runtime(): SystemWorkspace['runtime']
  scheduler(): SystemWorkspace['scheduler']
  migrationNames(): Promise<string[]>
  supportedJobs(): string[]
  databaseHost(): string
  now?(): Date
}
const deny = (): never => {
  throw new errors.ApplicationError('Current system administration access is required.', { status: 403 })
}
const authorize = async (tx: Knex.Transaction, requester: PagePrincipal) => {
  if (!requester) return deny()
  const actorId = principalId(requester)
  let ids: number[]
  if (actorId !== null) {
    const account = await tx<{ id: number; isActive: boolean; authVersion: number }>('users')
      .where('id', actorId)
      .select('id', 'isActive', 'authVersion')
      .first()
    if (!accountSessionIsCurrent({ id: actorId, authVersion: Reflect.get(requester, 'authVersion') }, account)) return deny()
    ids = (await tx<{ groupId: number }>('userGroups').where('userId', actorId).select('groupId')).map((row) => row.groupId)
  } else {
    if (
      requester.ownershipUserId !== null ||
      requester.id !== 1 ||
      !Array.isArray(requester.groups) ||
      requester.groups.length !== 1 ||
      typeof requester.groups[0] !== 'number'
    )
      return deny()
    ids = requester.groups as number[]
  }
  const groups = await tx<{ permissions: string[] }>('groups').whereIn('id', ids).select('permissions')
  if (!groups.some((group) => group.permissions.includes('manage:system'))) return deny()
}
interface QueueRow {
  id: string
  type: string
  version: number
  state: string
  attempts: number
  maxAttempts: number
  updatedAt: Date
  nextRunAt: Date
  leaseExpiresAt: Date | null
}
export const createSystemWorkspaceStore = (deps: Dependencies) => ({
  async inspect(requester: PagePrincipal): Promise<SystemWorkspace> {
    const tx = await deps.db.transaction({ isolationLevel: 'repeatable read', readOnly: true })
    try {
      await tx.raw("SET LOCAL statement_timeout = '3000ms'")
      await authorize(tx, requester)
      const now = deps.now?.() ?? new Date(),
        started = performance.now()
      const version = await tx.raw<{ rows: Array<{ version: string }> }>("SELECT current_setting('server_version') AS version")
      const latencyMs = Math.max(0, Math.round((performance.now() - started) * 10) / 10)
      const available = await deps.migrationNames(),
        applied = (await tx<{ name: string }>('migrations').select('name').orderBy('id')).map((row) => row.name)
      const supported = deps.supportedJobs()
      const unsupported = (query: Knex.QueryBuilder) =>
        query.whereIn('state', ['pending', 'running']).whereRaw("(type || '@' || version::text) <> ALL (?::text[])", [supported])
      const attention = (query: Knex.QueryBuilder) =>
        query
          .where('state', 'failed')
          .orWhere((q) => q.where('state', 'running').where('leaseExpiresAt', '<=', now))
          .orWhere(unsupported)
      const grouped = (await tx('durableJobs').select('state').count('* as count').groupBy('state')) as Array<{ state: string; count: string }>
      const counts: SystemWorkspace['queue']['counts'] = { pending: 0, running: 0, succeeded: 0, failed: 0, cancelled: 0 }
      for (const row of grouped) if (Object.hasOwn(counts, row.state)) counts[row.state as keyof typeof counts] = Number(row.count)
      const countQuery = async (filter: (query: Knex.QueryBuilder) => void) =>
        Number((await tx('durableJobs').where(filter).count('* as count').first())?.count ?? 0)
      const due = await countQuery((q) => q.where('state', 'pending').where('nextRunAt', '<=', now))
      const expiredLeases = await countQuery((q) => q.where('state', 'running').where('leaseExpiresAt', '<=', now))
      const unsupportedCount = await countQuery(unsupported),
        totalAttention = await countQuery(attention)
      const rows = await tx<QueueRow>('durableJobs')
        .where(attention)
        .select('id', 'type', 'version', 'state', 'attempts', 'maxAttempts', 'updatedAt', 'nextRunAt', 'leaseExpiresAt')
        .orderBy('updatedAt', 'desc')
        .orderBy('id')
        .limit(50)
      const queue: SystemWorkspace['queue'] = {
        counts,
        due,
        expiredLeases,
        unsupported: unsupportedCount,
        totalAttention,
        attention: rows.map((row) => ({
          ...row,
          updatedAt: new Date(row.updatedAt).toISOString(),
          nextRunAt: new Date(row.nextRunAt).toISOString(),
          leaseExpiresAt: row.leaseExpiresAt ? new Date(row.leaseExpiresAt).toISOString() : null,
          reason:
            row.state === 'failed'
              ? 'failed'
              : row.state === 'running' && row.leaseExpiresAt && new Date(row.leaseExpiresAt) <= now
                ? 'expired-lease'
                : 'unsupported'
        }))
      }
      const result = SystemWorkspaceSchema.parse({
        observedAt: now.toISOString(),
        product: deps.product(),
        runtime: deps.runtime(),
        scheduler: deps.scheduler(),
        database: {
          version: version.rows[0]?.version ?? 'Unknown',
          latencyMs,
          host: deps.databaseHost(),
          migrations: {
            applied,
            pending: available.filter((name) => !applied.includes(name)),
            unknown: applied.filter((name) => !available.includes(name))
          }
        },
        queue
      })
      await tx.commit()
      return result
    } catch (error) {
      await tx.rollback()
      throw error
    }
  }
})
