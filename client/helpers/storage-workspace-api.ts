import type { StorageWorkspace } from '../../shared/storage-workspace.ts'
import { sameOriginJsonFetch } from './json-transport.ts'
const request = async (method: string, suffix: string, body?: unknown) => {
  const response = await sameOriginJsonFetch(window.fetch.bind(window), '/_api/storage' + suffix, {
    method,
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  })
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok)
    throw Object.assign(
      new Error(
        payload && typeof payload === 'object' && typeof Reflect.get(payload, 'error') === 'string'
          ? Reflect.get(payload, 'error')
          : 'Storage administration is unavailable.'
      ),
      { status: response.status }
    )
  if (!payload || typeof payload !== 'object') throw new Error('The Storage response could not be read. Reload before repeating an action.')
  return payload
}
export const fetchStorageWorkspace = async (): Promise<StorageWorkspace> => {
  const value = await request('GET', '/workspace')
  if (
    typeof Reflect.get(value, 'fingerprint') !== 'string' ||
    typeof Reflect.get(value, 'revision') !== 'string' ||
    !Array.isArray(Reflect.get(value, 'targets')) ||
    !Array.isArray(Reflect.get(value, 'runtime')) ||
    !Array.isArray(Reflect.get(value, 'operations')) ||
    !Array.isArray(Reflect.get(value, 'history'))
  )
    throw new Error('The Storage workspace response is invalid. Reload to confirm saved settings.')
  return value as StorageWorkspace
}
export const saveStorageConfiguration = async (input: unknown) => {
  const value = await request('PUT', '/workspace', input)
  if (typeof Reflect.get(value, 'revision') !== 'string') throw new Error('The save outcome is unconfirmed. Reload before repeating it.')
  const operation = Reflect.get(value, 'operation'),
    applying = input && typeof input === 'object' && Reflect.get(input, 'apply') === true
  if (applying && (!operation || typeof operation.id !== 'string' || typeof operation.jobId !== 'string'))
    throw new Error('The activation request is unconfirmed. Reload before repeating it.')
  return value as { revision: string; changedTargets: string[]; operation: { id: string; jobId: string } | null }
}
export const submitStorageOperation = async (input: unknown) => {
  const value = await request('POST', '/operations', input)
  if (typeof Reflect.get(value, 'id') !== 'string' || typeof Reflect.get(value, 'jobId') !== 'string')
    throw new Error('The operation outcome is unconfirmed. Reload before repeating it.')
  return value as { id: string; jobId: string }
}
export const decideStorageOperation = async (id: string, kind: 'cancel' | 'resolve', input: unknown) => {
  const value = await request('POST', `/operations/${encodeURIComponent(id)}/${kind}`, input)
  if (Reflect.get(value, 'id') !== id || Reflect.get(value, 'state') !== (kind === 'cancel' ? 'cancelled' : 'resolved'))
    throw new Error('The operation decision is unconfirmed. Reload before repeating it.')
}
