import { AnalyticsPolicySchema, type AnalyticsPolicy, type AnalyticsProviderDraft, type AnalyticsWorkspace } from '../../shared/analytics-policy.ts'
import { sameOriginJsonFetch } from './json-transport.ts'
const request = async (method: string, suffix = '', body?: unknown) => {
  const response = await sameOriginJsonFetch(window.fetch.bind(window), '/_api/analytics/workspace' + suffix, {
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
          : 'Analytics administration is unavailable.'
      ),
      { status: response.status }
    )
  if (!payload || typeof payload !== 'object') throw new Error('The Analytics response could not be read. Reload before repeating an action.')
  return payload
}
export const fetchAnalyticsWorkspace = async (days = 0): Promise<AnalyticsWorkspace> => {
  const payload = await request('GET', days ? '?days=' + days : ''),
    policy = AnalyticsPolicySchema.safeParse(Reflect.get(payload, 'policy'))
  if (
    !policy.success ||
    typeof Reflect.get(payload, 'fingerprint') !== 'string' ||
    typeof Reflect.get(payload, 'revision') !== 'string' ||
    !Array.isArray(Reflect.get(payload, 'providers')) ||
    !Array.isArray(Reflect.get(payload, 'history')) ||
    !Reflect.get(payload, 'insights') ||
    !Array.isArray(Reflect.get(payload, 'insights').daily) ||
    !Array.isArray(Reflect.get(payload, 'insights').topPages)
  )
    throw new Error('The Analytics workspace response is invalid. Reload to confirm saved settings.')
  return { ...payload, policy: policy.data } as AnalyticsWorkspace
}
const write = async (method: string, suffix: string, body: unknown) => {
  const payload = await request(method, suffix, body)
  if (typeof Reflect.get(payload, 'revision') !== 'string') throw new Error('The outcome is unconfirmed. Reload before repeating this action.')
  return payload as { revision: string; erasedRows?: number }
}
export const saveAnalyticsWorkspace = (policy: AnalyticsPolicy, providers: AnalyticsProviderDraft[], fingerprint: string, reason: string) =>
  write('PUT', '', { policy, providers, fingerprint, reason })
export const eraseAnalyticsInsights = (fingerprint: string, reason: string, confirmation: string) =>
  write('POST', '/erase', { fingerprint, reason, confirmation })
