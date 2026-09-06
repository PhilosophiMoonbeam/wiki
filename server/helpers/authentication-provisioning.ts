import { randomUUID } from 'node:crypto'
import type { Knex } from 'knex'
export const enrollmentValues = <T>(value: unknown, valid: (value: unknown) => value is T): T[] => {
  const list = Array.isArray(value) ? value : value && typeof value === 'object' ? Reflect.get(value, 'v') : undefined
  if (!Array.isArray(list) || !list.every(valid)) throw new Error('The sign-in enrollment policy is invalid.')
  return [...new Set(list)]
}
const number = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const string = (value: unknown): value is string => typeof value === 'string'
/** Lock in the same order as administration before creating a provisioned account. */
export const loadEnrollmentPolicy = async (tx: Knex.Transaction, key: string) => {
  const groups = await tx('groups').select('id').orderBy('id').forShare()
  const provider = await tx('authentication').where('key', key).forShare().first()
  if (!provider) throw new Error('The sign-in provider is unavailable.')
  const autoEnrollGroups = enrollmentValues(provider.autoEnrollGroups, number),
    domainWhitelist = enrollmentValues(provider.domainWhitelist, string).map(domain => domain.toLowerCase())
  if (autoEnrollGroups.some(id => !groups.some(group => group.id === id))) throw new Error('The sign-in enrollment policy references an unavailable group.')
  return { isEnabled: provider.isEnabled === true, selfRegistration: provider.selfRegistration === true, autoEnrollGroups, domainWhitelist }
}
export const createProviderGroupSynchronizer =
  (db: Knex, onCommitted?: (id: number) => Promise<void>) => async (input: { userId: number; providerKey: string; groupNames: string[] }) => {
    if (
      !number(input.userId) ||
      input.userId <= 2 ||
      !Array.isArray(input.groupNames) ||
      input.groupNames.length > 2000 ||
      input.groupNames.some(name => typeof name !== 'string' || name.length > 255)
    )
      throw new Error('Directory group mapping input is invalid.')
    const result = await db.transaction(async tx => {
      const groups = await tx('groups').select('id', 'name').orderBy('id').forShare(),
        provider = await tx('authentication').where('key', input.providerKey).forShare().first(),
        user = await tx('users').where('id', input.userId).forUpdate().first()
      if (!provider?.isEnabled || !user?.isActive || user.isSystem || user.providerKey !== input.providerKey)
        throw new Error('The sign-in account or provider is unavailable.')
      if (provider.config.mapGroups !== true) return { authVersion: user.authVersion, adminRevision: user.adminRevision, changed: false }
      const current = (await tx('userGroups').where('userId', user.id).orderBy('groupId').select('groupId')).map(row => Number(row.groupId)),
        expected = groups.filter(group => input.groupNames.includes(group.name) && group.id !== 2).map(group => Number(group.id))
      const added = expected.filter(id => !current.includes(id)),
        removed = current.filter(id => !expected.includes(id))
      if (!added.length && !removed.length) return { authVersion: user.authVersion, adminRevision: user.adminRevision, changed: false }
      if (removed.length) await tx('userGroups').where('userId', user.id).whereIn('groupId', removed).delete()
      if (added.length) await tx('userGroups').insert(added.map(groupId => ({ userId: user.id, groupId })))
      const revision = randomUUID(),
        now = new Date(),
        authVersion = Number(user.authVersion) + 1
      await tx('users').where('id', user.id).update({ authVersion, adminRevision: revision, sessionsRevokedAt: now })
      await tx('userAdministrationEvents').insert({
        userId: user.id,
        actorId: null,
        action: 'directory-groups-synchronized',
        reason: 'Group membership synchronized from the configured sign-in provider.',
        details: JSON.stringify({ providerKey: input.providerKey, groupsAdded: added, groupsRemoved: removed, sessionsEnded: true }),
        createdAt: now
      })
      await tx('groupAdministrationEvents').insert([
        ...added.map(groupId => ({
          groupId,
          actorId: null,
          action: 'members-added',
          reason: 'Membership synchronized from the configured identity provider.',
          details: JSON.stringify({ userIds: [user.id], providerKey: input.providerKey, sessionsEnded: 1 }),
          createdAt: now
        })),
        ...removed.map(groupId => ({
          groupId,
          actorId: null,
          action: 'members-removed',
          reason: 'Membership synchronized from the configured identity provider.',
          details: JSON.stringify({ userIds: [user.id], providerKey: input.providerKey, sessionsEnded: 1 }),
          createdAt: now
        }))
      ])
      return { authVersion, adminRevision: revision, changed: true }
    })
    if (result.changed) await onCommitted?.(input.userId)
    return result
  }
export const synchronizeProviderGroups = async (input: { userId: number; providerKey: string; groupNames: string[] }) => {
  const wiki = WIKI as unknown as {
    models: { knex: Knex }
    auth: { revokeUserTokens(input: { id: number; kind: 'u' }): void }
    events: { outbound: { emit(event: string, input: unknown): void } }
    logger: { warn(message: string): void }
  }
  return createProviderGroupSynchronizer(wiki.models.knex, async id => {
    try {
      wiki.auth.revokeUserTokens({ id, kind: 'u' })
    } catch {
      wiki.logger.warn('Directory membership committed; local token notification failed.')
    }
    try {
      wiki.events.outbound.emit('addAuthRevoke', { id, kind: 'u' })
    } catch {
      wiki.logger.warn('Directory membership committed; peer token notification failed.')
    }
  })(input)
}
