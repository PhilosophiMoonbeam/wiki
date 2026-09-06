import type { AuthenticationWorkspace, AuthenticationProviderDraft, AuthenticationWriteResult } from '../../shared/authentication-policy.ts'
import { sameOriginJsonFetch } from './json-transport.ts'
import { isRecord } from './type-guards.ts'
const request = async <T>(method: string, suffix = '', body?: unknown): Promise<T> => {
  const response = await sameOriginJsonFetch(window.fetch.bind(window), '/_api/auth/admin/workspace' + suffix, {
    method,
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  })
  const payload: unknown = await response.json()
  if (!response.ok)
    throw Object.assign(new Error(isRecord(payload) && typeof payload.error === 'string' ? payload.error : 'Authentication administration is unavailable.'), {
      status: response.status
    })
  if (!isRecord(payload)) throw new Error('The authentication response could not be read.')
  if (
    method === 'GET' &&
    !(
      typeof payload.fingerprint === 'string' &&
      typeof payload.host === 'string' &&
      Array.isArray(payload.providers) &&
      Array.isArray(payload.definitions) &&
      Array.isArray(payload.groups) &&
      Array.isArray(payload.history)
    )
  )
    throw new Error('The authentication workspace could not be read.')
  if (
    method !== 'GET' &&
    !(
      typeof payload.sessionsEnded === 'number' &&
      typeof payload.currentSessionEnded === 'boolean' &&
      ['applied', 'needs-attention'].includes(String(payload.activation))
    )
  )
    throw new Error('The save result could not be read. Reload before repeating the change.')
  return payload as T
}
export const fetchAuthenticationWorkspace = () => request<AuthenticationWorkspace>('GET')
export const saveAuthenticationWorkspace = (providers: AuthenticationProviderDraft[], reason: string, fingerprint: string) =>
  request<AuthenticationWriteResult>('PUT', '', { providers, reason, fingerprint })
export const retryAuthenticationInitialization = (fingerprint: string) => request<AuthenticationWriteResult>('POST', '/activate', { fingerprint })
export const authenticationDraft = (value: AuthenticationProviderDraft): AuthenticationProviderDraft =>
  structuredClone(
    JSON.parse(
      JSON.stringify({
        key: value.key,
        strategyKey: value.strategyKey,
        displayName: value.displayName,
        description: value.description,
        isEnabled: value.isEnabled,
        selfRegistration: value.selfRegistration,
        domainWhitelist: value.domainWhitelist,
        autoEnrollGroups: value.autoEnrollGroups,
        config: value.config,
        secrets: value.secrets
      })
    )
  )
export const authenticationSignature = (providers: AuthenticationProviderDraft[]): string =>
  JSON.stringify(
    providers.map(provider => ({
      ...authenticationDraft(provider),
      displayName: provider.displayName.trim(),
      description: provider.description.trim(),
      domainWhitelist: [...provider.domainWhitelist].map(domain => domain.trim().toLowerCase()).sort(),
      autoEnrollGroups: [...provider.autoEnrollGroups].sort((a, b) => a - b)
    })),
    (_key, value) =>
      value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value
  )
