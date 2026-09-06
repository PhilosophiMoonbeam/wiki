import { StorageOperationResultSchema, type StorageOperationResult } from '../../shared/storage-workspace.ts'
import { storageRecord } from './storage-configuration.ts'
/** Provider errors are never copied into operation-level messages. Import detail is bounded and credentials are removed. */
export const storageOperationResult = (handler: string, input: unknown, credentials: readonly string[]): StorageOperationResult => {
  const clean = (value: unknown): string => {
    let result = typeof value === 'string' ? value : ''
    for (const secret of credentials.filter(value => value.length > 0).sort((a, b) => b.length - a.length))
      for (const encoded of new Set([secret, encodeURIComponent(secret), Buffer.from(secret).toString('base64')]))
        result = result.replaceAll(encoded, '[redacted]')
    return result
      .replaceAll(/\b(?:https?|ssh):\/\/[^\s/]*@/giu, '[redacted-url]/')
      .replaceAll(/[\r\n\t]+/gu, ' ')
      .slice(0, 512)
  }
  const failed: StorageOperationResult = {
    outcome: 'failed',
    message: 'The operation did not complete. Inspect target configuration and application logs before deciding whether to repeat it.',
    counts: null,
    items: [],
    targets: []
  }
  const value = storageRecord(input)
  if (!['succeeded', 'partial', 'failed'].includes(String(value.outcome)) || typeof value.total !== 'number' || !Array.isArray(value.items)) return failed
  const reportsItems = handler === 'importAll' && (value.outcome !== 'failed' || value.total > 0)
  const parsed = StorageOperationResultSchema.safeParse({
    outcome: value.outcome,
    message:
      value.outcome === 'succeeded'
        ? 'Operation completed.'
        : value.outcome === 'partial'
          ? 'Some items could not be imported. Review the item results.'
          : failed.message,
    counts: reportsItems ? { total: value.total, succeeded: value.succeeded, failed: value.failed, formats: value.formats } : null,
    items: reportsItems
      ? value.items.slice(0, 50).map(value => {
          const item = storageRecord(value)
          return {
            kind: item.kind,
            outcome: item.outcome,
            format: item.format,
            path: clean(item.path),
            message: item.message ? clean(item.message) : null,
            diagnostics: Array.isArray(item.diagnostics) ? item.diagnostics.slice(0, 8).map(clean) : []
          }
        })
      : [],
    targets: []
  })
  if (!parsed.success || (parsed.data.counts && parsed.data.counts.succeeded + parsed.data.counts.failed !== parsed.data.counts.total)) return failed
  return parsed.data
}
