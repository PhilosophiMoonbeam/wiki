import { LocalePolicySchema, type LocalePolicy, type LocaleWorkspace, type LocaleWriteResult } from '../../shared/locale-policy.ts'
import { sameOriginJsonFetch } from './json-transport.ts'
const request = async (method: string, suffix = '', body?: unknown) => {
  const response = await sameOriginJsonFetch(window.fetch.bind(window), '/_api/locales/workspace' + suffix, {
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
          : 'Locale administration is unavailable.'
      ),
      { status: response.status }
    )
  if (!payload || typeof payload !== 'object') throw new Error('The Locale response could not be read.')
  return payload
}
export const fetchLocaleWorkspace = async (): Promise<LocaleWorkspace> => {
  const payload = await request('GET'),
    policy = LocalePolicySchema.safeParse(Reflect.get(payload, 'policy')),
    runtime = Reflect.get(payload, 'runtime')
  if (
    !policy.success ||
    typeof Reflect.get(payload, 'fingerprint') !== 'string' ||
    !runtime ||
    !['applied', 'needs-attention'].includes(runtime.state) ||
    !Array.isArray(Reflect.get(payload, 'locales')) ||
    !Array.isArray(Reflect.get(payload, 'history')) ||
    !Array.isArray(Reflect.get(payload, 'operations')) ||
    !Reflect.get(payload, 'catalog')
  )
    throw new Error('The Locale workspace contains an invalid response. Reload to confirm saved settings.')
  return { ...payload, policy: policy.data } as LocaleWorkspace
}
const write = async (method: string, suffix: string, body: unknown): Promise<LocaleWriteResult> => {
  const payload = await request(method, suffix, body)
  if (!['applied', 'needs-attention'].includes(Reflect.get(payload, 'activation')))
    throw new Error('The save outcome is unconfirmed. Reload before repeating this action.')
  return payload as LocaleWriteResult
}
export const saveLocaleWorkspace = (policy: LocalePolicy, fingerprint: string, reason: string) => write('PUT', '', { policy, fingerprint, reason })
export const retryLocaleRuntime = (fingerprint: string) => write('POST', '/activate', { fingerprint })
export const queueLocaleOperation = async (
  kind: 'install' | 'catalog',
  code: string | undefined,
  fingerprint: string,
  reason: string
): Promise<{ jobId: string }> => {
  const payload = await request('POST', '/operations', { kind, code, fingerprint, reason })
  if (typeof Reflect.get(payload, 'jobId') !== 'string') throw new Error('The operation outcome is unconfirmed. Reload before starting another operation.')
  return payload as { jobId: string }
}
