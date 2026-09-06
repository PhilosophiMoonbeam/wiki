export function dateTime(value: string | null | undefined) {
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Not recorded'
}

export function actor(id: number | null) {
  return id === null ? 'API principal' : `Account ${id}`
}

export function operationLabel(value: string) {
  return (
    (
      {
        queued: 'Queued',
        running: 'Running',
        succeeded: 'Completed',
        partial: 'Completed with issues',
        failed: 'Failed',
        interrupted: 'Needs recovery review',
        cancelled: 'Cancelled',
        resolved: 'Recovery acknowledged'
      } as Record<string, string>
    )[value] || value
  )
}

export function formatLabel(key: string) {
  return (
    ({ okf: 'OKF', legacyV1: 'Legacy v1', legacyWiki: 'Legacy Wiki', plain: 'Plain Markdown', invalid: 'Invalid documents' } as Record<string, string>)[key] ||
    key
  )
}
