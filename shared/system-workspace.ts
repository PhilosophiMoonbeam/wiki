import { z } from 'zod'
import { ProductMetadataSchema } from './product.ts'

const count = z.number().int().nonnegative()
const date = z.iso.datetime().nullable()
export const ScheduledObservationSchema = z.object({
  id: z.string(),
  name: z.string(),
  state: z.enum(['waiting', 'running', 'finished', 'stopped', 'skipped']),
  repeat: z.boolean(),
  worker: z.boolean(),
  intervalMs: count,
  nextRunAt: date,
  lastStartedAt: date,
  lastFinishedAt: date,
  lastDurationMs: count.nullable(),
  lastOutcome: z.enum(['succeeded', 'failed', 'stopped']).nullable(),
  runs: count,
  failures: count
})
export type ScheduledObservation = z.infer<typeof ScheduledObservationSchema>
export const SystemWorkspaceSchema = z.object({
  observedAt: z.iso.datetime(),
  product: ProductMetadataSchema,
  runtime: z.object({
    instanceId: z.string(),
    hostname: z.string(),
    platform: z.string(),
    architecture: z.string(),
    kernel: z.string(),
    container: z.boolean(),
    bunVersion: z.string(),
    uptimeSeconds: z.number().nonnegative(),
    processRssBytes: count,
    heapUsedBytes: count,
    heapTotalBytes: count,
    systemMemoryBytes: count,
    logicalCpuCount: count,
    availableParallelism: count.nullable(),
    workingDirectory: z.string(),
    configFile: z.string(),
    publicOrigin: z.string().nullable(),
    offline: z.boolean(),
    httpPort: count.nullable(),
    httpsPort: count.nullable()
  }),
  database: z.object({
    version: z.string(),
    latencyMs: z.number().nonnegative(),
    host: z.string(),
    migrations: z.object({ applied: z.array(z.string()), pending: z.array(z.string()), unknown: z.array(z.string()) })
  }),
  scheduler: z.object({ started: z.boolean(), jobs: z.array(ScheduledObservationSchema) }),
  queue: z.object({
    counts: z.object({ pending: count, running: count, succeeded: count, failed: count, cancelled: count }),
    due: count,
    expiredLeases: count,
    unsupported: count,
    totalAttention: count,
    attention: z.array(
      z.object({
        id: z.string(),
        type: z.string(),
        version: count,
        state: z.string(),
        attempts: count,
        maxAttempts: count,
        updatedAt: z.iso.datetime(),
        nextRunAt: z.iso.datetime(),
        leaseExpiresAt: date,
        reason: z.enum(['failed', 'expired-lease', 'unsupported'])
      })
    )
  })
})
export type SystemWorkspace = z.infer<typeof SystemWorkspaceSchema>

export const systemJobDestination = (type: string): { title: string; path: string } | null => {
  if (type === 'deliver-webhook') return { title: 'Webhooks', path: '/a/webhooks' }
  if (type === 'locale-package') return { title: 'Locale', path: '/a/locale' }
  if (type === 'process-site-logo') return { title: 'General', path: '/a/general' }
  if (type === 'rerender-content-extension') return { title: 'Rendering', path: '/a/rendering' }
  if (type === 'notify-page-watcher') return { title: 'Mail', path: '/a/mail' }
  return null
}

/** Explicit allowlist: never export raw job data, credentials or unreviewed host identifiers. */
export const systemSupportReport = (workspace: SystemWorkspace, includeDeployment = false) => ({
  format: 'tsepistle-system-report-v1',
  observedAt: workspace.observedAt,
  product: workspace.product,
  runtime: {
    platform: workspace.runtime.platform,
    architecture: workspace.runtime.architecture,
    kernel: workspace.runtime.kernel,
    container: workspace.runtime.container,
    bunVersion: workspace.runtime.bunVersion,
    uptimeSeconds: workspace.runtime.uptimeSeconds,
    processRssBytes: workspace.runtime.processRssBytes,
    heapUsedBytes: workspace.runtime.heapUsedBytes,
    heapTotalBytes: workspace.runtime.heapTotalBytes,
    systemMemoryBytes: workspace.runtime.systemMemoryBytes,
    logicalCpuCount: workspace.runtime.logicalCpuCount,
    availableParallelism: workspace.runtime.availableParallelism,
    offline: workspace.runtime.offline,
    httpPort: workspace.runtime.httpPort,
    httpsPort: workspace.runtime.httpsPort
  },
  database: { version: workspace.database.version, latencyMs: workspace.database.latencyMs, migrations: workspace.database.migrations },
  scheduler: { started: workspace.scheduler.started, jobs: workspace.scheduler.jobs },
  queue: {
    counts: workspace.queue.counts,
    due: workspace.queue.due,
    expiredLeases: workspace.queue.expiredLeases,
    unsupported: workspace.queue.unsupported,
    totalAttention: workspace.queue.totalAttention
  },
  limitations: [
    'One application process at the observation time; no worker census or historical uptime.',
    'OS-visible resources are not container CPU or memory limits.',
    'No external ingress, provider connectivity or delivery verification.',
    'Job payloads, raw failures and durable job identifiers are omitted.'
  ],
  ...(includeDeployment
    ? {
        deployment: {
          instanceId: workspace.runtime.instanceId,
          hostname: workspace.runtime.hostname,
          workingDirectory: workspace.runtime.workingDirectory,
          configFile: workspace.runtime.configFile,
          publicOrigin: workspace.runtime.publicOrigin,
          databaseHost: workspace.database.host
        }
      }
    : {})
})
