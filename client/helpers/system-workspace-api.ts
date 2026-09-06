import { SystemWorkspaceSchema } from '../../shared/system-workspace.ts'
import { sameOriginJsonFetch } from './json-transport.ts'
export const fetchSystemWorkspace = async (signal: AbortSignal) => {
  const response = await sameOriginJsonFetch(window.fetch.bind(window), '/_api/system/workspace', {
    signal,
    credentials: 'same-origin',
    headers: { Accept: 'application/json' }
  })
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok)
    throw new Error(
      payload && typeof payload === 'object' && typeof Reflect.get(payload, 'error') === 'string'
        ? Reflect.get(payload, 'error')
        : 'System observations could not be collected. Try again.'
    )
  const parsed = SystemWorkspaceSchema.safeParse(payload)
  if (!parsed.success) throw new Error('The system observation was incomplete. Reload to collect a new snapshot.')
  return parsed.data
}
