import type { GeneralPolicy, GeneralWorkspace, GeneralWriteResult } from '../../shared/general-policy.ts'
import { sameOriginJsonFetch } from './json-transport.ts'
const request = async (method: string, suffix = '', body?: unknown) => {
  const response = await sameOriginJsonFetch(window.fetch.bind(window), '/_api/site/general' + suffix, {
    method, credentials: 'same-origin', headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  })
  const payload: unknown = await response.json()
  if (!response.ok) throw Object.assign(new Error(payload && typeof payload === 'object' && typeof Reflect.get(payload, 'error') === 'string' ? Reflect.get(payload, 'error') : 'General administration is unavailable.'), { status: response.status })
  if (!payload || typeof payload !== 'object') throw new Error('The workspace response could not be read.')
  return payload
}
export const fetchGeneralWorkspace = async (): Promise<GeneralWorkspace> => {
  const payload = await request('GET')
  if (typeof Reflect.get(payload, 'fingerprint') !== 'string' || !Reflect.get(payload, 'policy') || !Reflect.get(payload, 'runtime') || !Array.isArray(Reflect.get(payload, 'history'))) throw new Error('The General workspace could not be read.')
  return payload as GeneralWorkspace
}
const write = async (method: string, suffix: string, body: unknown): Promise<GeneralWriteResult> => {
  const payload = await request(method, suffix, body)
  if (!['applied', 'needs-attention'].includes(Reflect.get(payload, 'activation'))) throw new Error('The save outcome is unconfirmed. Reload before repeating this action.')
  return payload as GeneralWriteResult
}
export const saveGeneralWorkspace = (policy: GeneralPolicy, fingerprint: string, reason: string) => write('PUT', '', { policy, fingerprint, reason })
export const retryGeneralRuntime = (fingerprint: string) => write('POST', '/activate', { fingerprint })
