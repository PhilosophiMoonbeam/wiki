import { NavigationPolicySchema, normalizeNavigationTree, navigationChangedFields } from '../../shared/navigation-policy.ts'
import { getNavigationAdministrationStore } from './navigation-administration.ts'
import type { PagePrincipal } from '../helpers/page-access.ts'
import errors from './errors.ts'
const fail = (message: string, status = 400): never => { throw new errors.ApplicationError(message, { status }) }
const get = async (requester?: PagePrincipal) => {
  const saved = await getNavigationAdministrationStore().inspect(requester)
  return { config: { mode: saved.policy.mode, expandParent: saved.policy.expandParent }, tree: saved.policy.tree }
}
const update = async (input: unknown, requester?: PagePrincipal): Promise<void> => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('Navigation configuration must be an object.')
  const data = input as Record<string, unknown>
  if (Object.keys(data).some(key => !['mode', 'expandParent', 'tree'].includes(key)) || !Array.isArray(data.tree)) return fail('Navigation configuration contains unsupported fields or an invalid tree.')
  if (data.tree.some(row => !row || typeof row !== 'object' || typeof row.locale !== 'string' || !row.locale || !Array.isArray(row.items))) return fail('Each locale needs an explicit navigation item list.')
  const validation = NavigationPolicySchema.safeParse({ ...data, tree: normalizeNavigationTree(data.tree) })
  if (!validation.success) return fail('Navigation configuration is invalid. Check item labels, destinations, audiences and locale structures.')
  const store = getNavigationAdministrationStore(), saved = await store.inspect(requester)
  if (!navigationChangedFields(saved.policy, validation.data).length) return
  const result = await store.save(requester, { policy: validation.data, fingerprint: saved.fingerprint, reason: 'Updated through the compatibility navigation API' })
  if (result.activation === 'needs-attention') return fail('Navigation was saved; runtime activation needs attention. Reload Navigation before continuing.', 500)
}
export default { get, update }
