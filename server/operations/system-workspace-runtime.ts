import os from 'node:os'
import path from 'node:path'
import { existsSync } from 'node:fs'
import type { Knex } from 'knex'
import type { ProductMetadata } from '../../shared/product.ts'
import migrationSource from '../db/migrator-source.ts'
import scheduler from '../core/scheduler.ts'
import { durableJobIdentities } from '../../shared/durable-job-catalog.ts'
import { createSystemWorkspaceStore } from './system-workspace.ts'

interface RuntimeContext {
  ROOTPATH: string
  INSTANCE_ID: string
  product: ProductMetadata
  models: { knex: Knex }
  config: { host: string; offline?: boolean; sessionSecret: string; db: { host: string } }
  servers: { servers: Record<string, { address(): { port: number } | string | null } | undefined> }
}
const port = (server: RuntimeContext['servers']['servers'][string]): number | null => {
  const address = server?.address()
  return address && typeof address === 'object' ? address.port : null
}
const publicOrigin = (host: string): string | null => {
  try {
    const url = new URL(host)
    return ['https:', 'http:'].includes(url.protocol) ? url.origin : null
  } catch {
    return null
  }
}
export const getSystemWorkspaceStore = () => {
  const wiki = WIKI as unknown as RuntimeContext
  return createSystemWorkspaceStore({
    db: wiki.models.knex,
    product: () => wiki.product,
    databaseHost: () => wiki.config.db.host,
    migrationNames: async () => (await migrationSource.getMigrations([])).map((migration) => migrationSource.getMigrationName(migration)),
    scheduler: () => scheduler.snapshot(),
    supportedJobs: () => [...durableJobIdentities],
    runtime: () => {
      const memory = process.memoryUsage()
      return {
        instanceId: wiki.INSTANCE_ID,
        hostname: os.hostname(),
        platform: os.platform(),
        architecture: os.arch(),
        kernel: os.release(),
        container: existsSync('/.dockerenv'),
        bunVersion: process.versions.bun ?? 'Unavailable',
        uptimeSeconds: process.uptime(),
        processRssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        heapTotalBytes: memory.heapTotal,
        systemMemoryBytes: os.totalmem(),
        logicalCpuCount: os.cpus().length,
        availableParallelism: typeof os.availableParallelism === 'function' ? os.availableParallelism() : null,
        workingDirectory: process.cwd(),
        configFile: path.resolve(wiki.ROOTPATH, process.env.CONFIG_FILE || (process.env.dockerdev ? 'dev/containers/config.yml' : 'config.yml')),
        publicOrigin: publicOrigin(wiki.config.host),
        offline: wiki.config.offline === true,
        httpPort: port(wiki.servers.servers.http),
        httpsPort: port(wiki.servers.servers.https)
      }
    }
  })
}
