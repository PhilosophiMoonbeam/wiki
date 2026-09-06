import { getAnalyticsAdministrationStore } from './analytics-administration.ts'
import type { PagePrincipal } from '../helpers/page-access.ts'
import errors from './errors.ts'
const listProviders = async (isEnabled?: boolean, requester?: PagePrincipal): Promise<Array<Record<string, unknown>>> => {
  const current = await getAnalyticsAdministrationStore().inspect(requester)
  return current.providers
    .filter(row => isEnabled === undefined || row.isEnabled === isEnabled)
    .map(row => ({
      key: row.key,
      isEnabled: row.isEnabled,
      title: row.title,
      description: row.description,
      isAvailable: row.isAvailable,
      website: row.website,
      logo: '',
      config: row.fields.map((field, index) => ({
        key: field.key,
        value: JSON.stringify({ type: 'string', title: field.title, hint: field.hint, order: index, value: row.config[field.key] ?? '' })
      }))
    }))
}
const updateProviders = async (providers: unknown, requester?: PagePrincipal): Promise<void> => {
  const fail = (): never => {
    throw new errors.ApplicationError('Invalid analytics providers payload', { status: 400 })
  }
  if (!Array.isArray(providers) || providers.length > 100) return fail()
  const store = getAnalyticsAdministrationStore(),
    current = await store.inspect(requester),
    seen = new Set<string>()
  const next = current.providers.map(({ key, isEnabled, config }) => ({ key, isEnabled, config: { ...config } }))
  for (const value of providers) {
    if (
      !value ||
      typeof value !== 'object' ||
      typeof value.key !== 'string' ||
      typeof value.isEnabled !== 'boolean' ||
      !Array.isArray(value.config) ||
      seen.has(value.key)
    )
      return fail()
    const row = next.find(row => row.key === value.key)
    if (!row) return fail()
    seen.add(value.key)
    row.isEnabled = value.isEnabled
    const keys = new Set<string>()
    for (const entry of value.config) {
      if (!entry || typeof entry.key !== 'string' || !Object.hasOwn(row.config, entry.key) || typeof entry.value !== 'string' || keys.has(entry.key))
        return fail()
      keys.add(entry.key)
      let parsed: unknown
      try {
        parsed = JSON.parse(entry.value)?.v
      } catch {
        return fail()
      }
      if (typeof parsed !== 'string' && typeof parsed !== 'number') return fail()
      row.config[entry.key] = String(parsed).trim()
    }
  }
  await store.save(requester, {
    policy: current.policy,
    providers: next,
    fingerprint: current.fingerprint,
    reason: 'Provider configuration updated through the compatibility API.'
  })
}
export default { listProviders, updateProviders }
