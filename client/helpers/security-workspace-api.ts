import type { SecurityPolicy, SecurityWorkspace, SecurityWriteResult } from '../../shared/security-policy.ts'
import { sameOriginJsonFetch } from './json-transport.ts'
export type SecurityInspection = SecurityWorkspace & { headers: Record<string, string> }
const request = async (method: string, suffix = '', body?: unknown) => {
  const response = await sameOriginJsonFetch(window.fetch.bind(window), '/_api/site/security' + suffix, {
    method,
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  })
  const payload: unknown = await response.json()
  if (!response.ok)
    throw Object.assign(
      new Error(
        payload && typeof payload === 'object' && typeof Reflect.get(payload, 'error') === 'string'
          ? Reflect.get(payload, 'error')
          : 'Security administration is unavailable.'
      ),
      { status: response.status }
    )
  if (!payload || typeof payload !== 'object') throw new Error('The security response could not be read.')
  return { payload, response }
}
export const fetchSecurityWorkspace = async (): Promise<SecurityInspection> => {
  const { payload, response } = await request('GET')
  if (
    typeof Reflect.get(payload, 'fingerprint') !== 'string' ||
    !Reflect.get(payload, 'policy') ||
    !Array.isArray(Reflect.get(payload, 'providers')) ||
    !Array.isArray(Reflect.get(payload, 'history')) ||
    !Reflect.get(payload, 'coverage') ||
    !Reflect.get(payload, 'runtime')
  )
    throw new Error('The security workspace could not be read.')
  return {
    ...(payload as SecurityWorkspace),
    headers: Object.fromEntries(
      [
        'x-frame-options',
        'x-content-type-options',
        'referrer-policy',
        'strict-transport-security',
        'content-security-policy',
        'content-security-policy-report-only'
      ].map(key => [key, response.headers.get(key) ?? ''])
    )
  }
}
const result = async (method: string, suffix: string, body: unknown): Promise<SecurityWriteResult> => {
  const { payload } = await request(method, suffix, body)
  if (
    typeof Reflect.get(payload, 'sessionsEnded') !== 'number' ||
    typeof Reflect.get(payload, 'currentSessionEnded') !== 'boolean' ||
    !['applied', 'needs-attention'].includes(Reflect.get(payload, 'activation'))
  )
    throw new Error('The save outcome is unconfirmed. Reload before repeating this action.')
  return payload as SecurityWriteResult
}
export const saveSecurityWorkspace = (policy: SecurityPolicy, fingerprint: string, reason: string, endSessions: boolean) =>
  result('PUT', '', { policy, fingerprint, reason, endSessions })
export const retrySecurityRuntime = (fingerprint: string) => result('POST', '/activate', { fingerprint })
