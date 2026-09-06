import { createHash } from 'node:crypto'
export const storageStableValue = (value: unknown): string =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item
  )
/** Internal identity only. Never expose configuration digests as public credential observations. */
export const storageConfigurationKey = (target: { key: string; isEnabled: boolean; mode: string; syncInterval: string; config: unknown }): string =>
  createHash('sha256')
    .update(storageStableValue({ key: target.key, isEnabled: target.isEnabled, mode: target.mode, syncInterval: target.syncInterval, config: target.config }))
    .digest('hex')
