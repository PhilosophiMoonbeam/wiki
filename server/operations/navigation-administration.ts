import { createHmac, randomUUID } from 'node:crypto'
import type { Knex } from 'knex'
import {
  NavigationPolicySchema, navigationPolicyFromConfiguration, navigationChangedFields,
  type NavigationPolicy, type NavigationWorkspace, type NavigationEvent, type NavigationWriteResult
} from '../../shared/navigation-policy.ts'
import { accountSessionIsCurrent } from '../helpers/account-session.ts'
import { principalId, type PagePrincipal } from '../helpers/page-access.ts'
import errors from './errors.ts'
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item
  )
const fail = (message: string, status = 400): never => {
  throw new errors.ApplicationError(message, { status })
}
const settingKeys = ['nav', 'navigationAdministration', 'lang']
interface NavigationRow { key: string; config: unknown }
interface LocaleRow { code: string; name: string; nativeName: string }
interface Group {
  id: number
  name: string
  permissions: string[]
  adminRevision: string
}
interface Account {
  id: number
  isActive: boolean
  authVersion: number
}
interface Setting {
  key: string
  value: unknown
}
interface Dependencies {
  db: Knex
  reviewKey: string
  fallback(): Record<string, unknown>
  runtime(): { mode: unknown; expandParent: unknown; revision: unknown }
  runtimeReady?(): boolean
  onCommitted?(): Promise<boolean>
}
export const createNavigationAdministrationStore = (deps: Dependencies) => {
  const state = async (tx: Knex.Transaction, requester: PagePrincipal, lock = false) => {
    const g = tx<Group>('groups').select('id', 'name', 'permissions', 'adminRevision').orderBy('id'),
      groups = await (lock ? g.forUpdate() : g)
    if (!requester) return fail('An administrator sign-in is required.', 403)
    const actorId = principalId(requester)
    let ids: number[]
    if (actorId !== null) {
      const query = tx<Account>('users').where('id', actorId).select('id', 'isActive', 'authVersion').first(),
        account = await (lock ? query.forUpdate() : query)
      if (!accountSessionIsCurrent({ id: actorId, authVersion: Reflect.get(requester, 'authVersion') }, account))
        return fail('Your account session changed. Sign in again.', 403)
      ids = (await tx<{ groupId: number }>('userGroups').where('userId', actorId).select('groupId')).map(row => row.groupId).sort((a, b) => a - b)
    } else {
      if (
        requester.ownershipUserId !== null ||
        requester.id !== 1 ||
        !Array.isArray(requester.groups) ||
        requester.groups.length !== 1 ||
        typeof requester.groups[0] !== 'number'
      )
        return fail('An administrator principal is required.', 403)
      ids = requester.groups as number[]
    }
    if (!groups.some(group => ids.includes(group.id) && group.permissions.some(permission => ['manage:system', 'manage:navigation'].includes(permission))))
      return fail('Navigation administration is required.', 403)
    const query = tx<Setting>('settings').whereIn('key', settingKeys).orderBy('key'),
      rows = await (lock ? query.forUpdate() : query)
    const configuration = {
      ...deps.fallback(),
      ...Object.fromEntries(rows.map(row => [row.key, row.value]))
    }
    const navQuery = tx<NavigationRow>('navigation').where('key', 'site').first(),
      navigation = await (lock ? navQuery.forUpdate() : navQuery)
    const localeQuery = tx<LocaleRow>('locales').select('code', 'name', 'nativeName').orderBy('code'),
      locales = await (lock ? localeQuery.forShare() : localeQuery)
    const guestGroups = (await tx<{ groupId: number }>('userGroups').where('userId', 2).select('groupId')).map(row => row.groupId).sort((a, b) => a - b)
    const policy = navigationPolicyFromConfiguration(configuration, navigation?.config), metadata = record(configuration.navigationAdministration)
    const fingerprint = createHmac('sha256', deps.reviewKey).update(stable([rows, navigation, policy, groups, locales, guestGroups, actorId, ids])).digest('hex')
    return { policy, configuration, metadata, fingerprint, actorId, groups, locales, guestGroups }
  }
  const runtimeMatches = (saved: Awaited<ReturnType<typeof state>>) => {
    const runtime = deps.runtime()
    return runtime.mode === saved.policy.mode && runtime.expandParent === saved.policy.expandParent && (runtime.revision ?? '') === (record(saved.configuration.nav).revision ?? '') && deps.runtimeReady?.() !== false
  }
  const inspect = async (requester: PagePrincipal): Promise<NavigationWorkspace> => {
    const tx = await deps.db.transaction({ isolationLevel: 'repeatable read', readOnly: true })
    try {
      const saved = await state(tx, requester)
      await tx.commit()
      return {
        policy: saved.policy,
        fingerprint: saved.fingerprint,
        groups: saved.groups.map(group => ({ id: group.id, name: group.name })),
        guestGroups: saved.guestGroups,
        defaultLocale: String(record(saved.configuration.lang).code || 'en'),
        locales: saved.locales.map(locale => ({ ...locale, enabled: locale.code === String(record(saved.configuration.lang).code || 'en') || (record(saved.configuration.lang).namespacing === true && Array.isArray(record(saved.configuration.lang).namespaces) && (record(saved.configuration.lang).namespaces as string[]).includes(locale.code)) })),
        history: Array.isArray(saved.metadata.history) ? (saved.metadata.history.slice(0, 50) as NavigationEvent[]) : [],
        runtime: { state: runtimeMatches(saved) ? 'applied' : 'needs-attention', observedAt: new Date().toISOString() }
      }
    } catch (error) {
      await tx.rollback()
      throw error
    }
  }
  const activate = async (): Promise<NavigationWriteResult> => {
    try {
      return { activation: (await deps.onCommitted?.()) === true ? 'applied' : 'needs-attention' }
    } catch {
      return { activation: 'needs-attention' }
    }
  }
  return {
    inspect,
    async save(requester: PagePrincipal, input: { policy: unknown; fingerprint: unknown; reason: unknown }): Promise<NavigationWriteResult> {
      const validation = NavigationPolicySchema.safeParse(input.policy)
      if (!validation.success) return fail(validation.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(' '))
      if (typeof input.reason !== 'string' || input.reason.trim().length < 3 || input.reason.length > 1000)
        return fail('Provide an administrative reason of 3–1000 characters.')
      const reason = input.reason.trim()
      await deps.db.transaction(async tx => {
        const current = await state(tx, requester, true)
        if (typeof input.fingerprint !== 'string' || current.fingerprint !== input.fingerprint)
          return fail('Workspace settings changed. Reload the saved settings before reviewing again.', 409)
        const knownLocales = new Set([...current.locales.map(locale => locale.code), ...current.policy.tree.map(tree => tree.locale)])
        for (const tree of validation.data.tree) {
          if (!knownLocales.has(tree.locale)) return fail(`Install locale ${tree.locale} before adding its navigation.`)
          for (const item of tree.items) if (item.visibilityGroups.some(id => !current.groups.some(group => group.id === id))) return fail(`An audience group for ${item.label || 'a divider'} no longer exists. Update this item's audience.`)
        }
        const fields = navigationChangedFields(current.policy, validation.data)
        if (!fields.length) return fail('There are no workspace changes to save.')
        const event: NavigationEvent = { id: randomUUID(), actorId: current.actorId, reason, fields, createdAt: new Date().toISOString() }
        const patch: Record<string, unknown> = { nav: { ...record(current.configuration.nav), mode: validation.data.mode, expandParent: validation.data.expandParent, revision: event.id } }
        patch.navigationAdministration = {
          ...current.metadata,
          revision: event.id,
          history: [event, ...(Array.isArray(current.metadata.history) ? current.metadata.history : [])].slice(0, 50)
        }
        await tx('navigation').insert({ key: 'site', config: JSON.stringify(validation.data.tree) }).onConflict('key').merge(['config'])
        for (const [key, value] of Object.entries(patch))
          await tx('settings')
            .insert({ key, value: JSON.stringify(value), updatedAt: event.createdAt })
            .onConflict('key')
            .merge(['value', 'updatedAt'])
      })
      return activate()
    },
    async initialize(requester: PagePrincipal, fingerprint: unknown): Promise<NavigationWriteResult> {
      const saved = await inspect(requester)
      if (typeof fingerprint !== 'string' || fingerprint !== saved.fingerprint) return fail('Workspace settings changed. Reload before activation.', 409)
      return activate()
    }
  }
}
let runtimeStore: ReturnType<typeof createNavigationAdministrationStore> | undefined
let runtimeDatabase: Knex | undefined
export const getNavigationAdministrationStore = () => {
  const wiki = WIKI as unknown as {
    models: { knex: Knex }
    config: Record<string, unknown>
    configSvc: { loadFromDb(): Promise<void> }
    events: { outbound: { emit(event: string): void } }
    logger: { warn(message: string): void }
  }
  if (!runtimeStore || runtimeDatabase !== wiki.models.knex) {
    runtimeDatabase = wiki.models.knex
    let queue = Promise.resolve()
    runtimeStore = createNavigationAdministrationStore({
      db: wiki.models.knex,
      reviewKey: String(wiki.config.sessionSecret),
      fallback: () => wiki.config,
      runtime: () => { const nav = record(wiki.config.nav); return { mode: nav.mode, expandParent: nav.expandParent !== false, revision: nav.revision } },
      onCommitted: () => {
        const next = queue.then(async () => {
          await wiki.configSvc.loadFromDb()
          let notified = true
          try {
            wiki.events.outbound.emit('reloadConfig')
          } catch {
            wiki.logger.warn('Workspace settings saved; peer reload notification failed.')
            notified = false
          }
          const rows = await wiki.models.knex<Setting>('settings').whereIn('key', settingKeys).orderBy('key')
          const saved = { ...wiki.config, ...Object.fromEntries(rows.map(row => [row.key, row.value])) }
          return notified && stable(record(saved.nav)) === stable(record(wiki.config.nav))
        })
        queue = next.then(
          () => {},
          () => {}
        )
        return next
      }
    })
  }
  return runtimeStore
}