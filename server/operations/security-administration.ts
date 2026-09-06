import { createHmac, randomUUID } from 'node:crypto'
import type { Knex } from 'knex'
import ms from 'ms'
import {
  securityPolicyDefaults,
  validateSecurityPolicy,
  securityChangedFields,
  securityEndsSessions,
  type SecurityPolicy,
  type SecurityWorkspace,
  type SecurityWriteResult,
  type SecurityPolicyEvent
} from '../../shared/security-policy.ts'
import { accountSessionIsCurrent } from '../helpers/account-session.ts'
import { principalId, type PagePrincipal } from '../helpers/page-access.ts'
import errors from './errors.ts'
type Database = Knex | Knex.Transaction
interface Group {
  id: number
  permissions: string[]
  adminRevision: string
}
interface Provider {
  key: string
  strategyKey: string
  displayName: string
  isEnabled: boolean
  adminRevision: string
}
interface Account {
  id: number
  providerKey: string
  isActive: boolean
  authVersion: number
  adminRevision: string
  tfaIsActive: boolean
  enrolled: boolean
}
interface Setting {
  key: string
  value: unknown
}
interface Dependencies {
  db: Knex
  reviewKey: string
  fallback(): Record<string, unknown>
  host(): string
  definitions(): Array<{ key: string; useForm?: boolean }>
  runtime(): SecurityPolicy
  runtimeReady?(): boolean
  onCommitted?(ended: number[]): Promise<boolean>
}
const fail = (message: string, status = 400): never => {
  throw new errors.ApplicationError(message, { status })
}
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item
  )
const settingsKeys = ['auth', 'security', 'uploads', 'securityPolicyRevision']
const duration = (value: unknown, fallback: number): number => {
  if (value === undefined) return fallback
  if (typeof value !== 'string' || !value) return 0
  try {
    return Math.floor(Number(ms(value)) / 1000) || 0
  } catch {
    return 0
  }
}
export const securityPolicyFromConfiguration = (configuration: Record<string, unknown>): SecurityPolicy => {
  const auth = object(configuration.auth),
    security = object(configuration.security),
    uploads = object(configuration.uploads),
    d = securityPolicyDefaults
  const bool = (v: unknown, initial: boolean) => (typeof v === 'boolean' ? v : initial)
  const number = (v: unknown, initial: number) => (typeof v === 'number' ? v : initial)
  const text = (v: unknown, initial: string) => (typeof v === 'string' ? v : initial)
  return {
    authPasswordMinLength: number(auth.passwordMinLength, d.authPasswordMinLength),
    authEnforce2FA: bool(auth.enforce2FA, d.authEnforce2FA),
    authJwtAudience: text(auth.audience, d.authJwtAudience),
    authJwtExpirationSeconds: duration(auth.tokenExpiration, d.authJwtExpirationSeconds),
    authJwtRenewalSeconds: duration(auth.tokenRenewal, d.authJwtRenewalSeconds),
    authAutoLogin: bool(auth.autoLogin, d.authAutoLogin),
    authHideLocal: bool(auth.hideLocal, d.authHideLocal),
    authLoginBgUrl: text(auth.loginBgUrl, d.authLoginBgUrl),
    securityIframe: bool(security.securityIframe, d.securityIframe),
    securityReferrerPolicy: bool(security.securityReferrerPolicy, d.securityReferrerPolicy),
    securityOpenRedirect: bool(security.securityOpenRedirect, d.securityOpenRedirect),
    securityTrustProxy: bool(security.securityTrustProxy, d.securityTrustProxy),
    securityHSTS: bool(security.securityHSTS, d.securityHSTS),
    securityHSTSDuration: number(security.securityHSTSDuration, d.securityHSTSDuration),
    securityHSTSIncludeSubDomains: bool(security.securityHSTSIncludeSubDomains, d.securityHSTSIncludeSubDomains),
    securityCSPMode: security.securityCSP === true ? 'enforce' : security.securityCSPReportOnly === true ? 'report-only' : 'off',
    securityCSPDirectives: text(security.securityCSPDirectives, ''),
    uploadMaxFileSize: number(uploads.maxFileSize, d.uploadMaxFileSize),
    uploadScanSVG: bool(uploads.scanSVG, d.uploadScanSVG),
    uploadForceDownload: bool(uploads.forceDownload, d.uploadForceDownload)
  }
}
export const securityConfigurationPatch = (policy: SecurityPolicy, configuration: Record<string, unknown>) => ({
  auth: {
    ...object(configuration.auth),
    passwordMinLength: policy.authPasswordMinLength,
    enforce2FA: policy.authEnforce2FA,
    audience: policy.authJwtAudience,
    tokenExpiration: `${policy.authJwtExpirationSeconds}s`,
    tokenRenewal: `${policy.authJwtRenewalSeconds}s`,
    autoLogin: policy.authAutoLogin,
    hideLocal: policy.authHideLocal,
    loginBgUrl: policy.authLoginBgUrl
  },
  security: {
    ...object(configuration.security),
    securityIframe: policy.securityIframe,
    securityReferrerPolicy: policy.securityReferrerPolicy,
    securityOpenRedirect: policy.securityOpenRedirect,
    securityTrustProxy: policy.securityTrustProxy,
    securityHSTS: policy.securityHSTS,
    securityHSTSDuration: policy.securityHSTSDuration,
    securityHSTSIncludeSubDomains: policy.securityHSTSIncludeSubDomains,
    securityCSP: policy.securityCSPMode === 'enforce',
    securityCSPReportOnly: policy.securityCSPMode === 'report-only',
    securityCSPDirectives: policy.securityCSPDirectives
  },
  uploads: { ...object(configuration.uploads), maxFileSize: policy.uploadMaxFileSize, scanSVG: policy.uploadScanSVG, forceDownload: policy.uploadForceDownload }
})
export const createSecurityAdministrationStore = (deps: Dependencies) => {
  const { db } = deps
  const state = async (tx: Database, lock = false) => {
    const groupQuery = tx<Group>('groups').select('id', 'permissions', 'adminRevision').orderBy('id'),
      providerQuery = tx<Provider>('authentication').select('key', 'strategyKey', 'displayName', 'isEnabled', 'adminRevision').orderBy('key'),
      accountQuery = tx<Account>('users')
        .select<Account[]>(
          'id',
          'providerKey',
          'isActive',
          'authVersion',
          'adminRevision',
          'tfaIsActive',
          tx.raw(`("tfaSecret" IS NOT NULL AND "tfaSecret" <> '') AS enrolled`)
        )
        .orderBy('id'),
      settingsQuery = tx<Setting>('settings').whereIn('key', settingsKeys).orderBy('key')
    // Match the group/provider/account lock order used by identity administration.
    const groups = await (lock ? groupQuery.forUpdate() : groupQuery),
      providers = await (lock ? providerQuery.forUpdate() : providerQuery),
      accounts = await (lock ? accountQuery.forUpdate() : accountQuery),
      settings = await (lock ? settingsQuery.forUpdate() : settingsQuery)
    const configuration = {
        ...deps.fallback(),
        ...Object.fromEntries(settings.filter(row => row.key !== 'securityPolicyRevision').map(row => [row.key, row.value]))
      },
      policy = securityPolicyFromConfiguration(configuration),
      revision = settings.find(row => row.key === 'securityPolicyRevision')?.value ?? null
    return {
      groups,
      providers,
      accounts,
      configuration,
      policy,
      revision,
      fingerprint: createHmac('sha256', deps.reviewKey)
        .update(stable([settings, policy, groups, providers, accounts]))
        .digest('hex')
    }
  }
  type State = Awaited<ReturnType<typeof state>>
  const authority = async (tx: Database, requester: PagePrincipal, s: State): Promise<number | null> => {
    if (!requester) return fail('An administrator sign-in is required.', 403)
    const id = principalId(requester)
    let ids: number[]
    if (id !== null) {
      if (
        !accountSessionIsCurrent(
          { id, authVersion: Reflect.get(requester, 'authVersion') },
          s.accounts.find(a => a.id === id)
        )
      )
        return fail('Your account session changed. Sign in again.', 403)
      ids = (await tx<{ groupId: number }>('userGroups').where('userId', id).select('groupId')).map(row => row.groupId)
    } else {
      const values = requester.groups
      if (requester.ownershipUserId !== null || requester.id !== 1 || !Array.isArray(values) || values.length !== 1 || typeof values[0] !== 'number')
        return fail('An administrator principal is required.', 403)
      ids = values as number[]
    }
    if (!s.groups.some(group => ids.includes(group.id) && group.permissions.includes('manage:system')))
      return fail('Full system administration is required.', 403)
    return id
  }
  const read = async <T>(work: (tx: Knex.Transaction) => Promise<T>): Promise<T> => {
    const tx = await db.transaction({ isolationLevel: 'repeatable read', readOnly: true })
    try {
      const result = await work(tx)
      await tx.commit()
      return result
    } catch (error) {
      await tx.rollback()
      throw error
    }
  }
  const inspect = async (tx: Knex.Transaction, requester: PagePrincipal): Promise<SecurityWorkspace> => {
    const s = await state(tx)
    await authority(tx, requester, s)
    const definitions = deps.definitions(),
      providers = s.providers.map(p => ({
        key: p.key,
        name: p.displayName,
        enabled: p.isEnabled,
        useForm: definitions.find(d => d.key === p.strategyKey)?.useForm === true,
        available: definitions.some(d => d.key === p.strategyKey)
      })),
      active = s.accounts.filter(a => a.id !== 2 && a.isActive),
      form = active.filter(a => providers.some(p => p.key === a.providerKey && p.useForm)),
      runtime = deps.runtime()
    const events = await tx('securityAdministrationEvents').orderBy('id', 'desc').limit(50)
    return {
      policy: s.policy,
      fingerprint: s.fingerprint,
      host: deps.host(),
      providers,
      coverage: {
        activeAccounts: active.length,
        formAccounts: form.length,
        twoFactorEnrolled: form.filter(a => a.tfaIsActive && a.enrolled).length,
        providerManagedAccounts: active.filter(a => providers.some(p => p.key === a.providerKey && p.available && !p.useForm)).length,
        unavailableProviderAccounts: active.filter(a => !providers.some(p => p.key === a.providerKey && p.available)).length,
        localAccounts: active.filter(a => a.providerKey === 'local').length
      },
      runtime: {
        state: stable(s.policy) === stable(runtime) && deps.runtimeReady?.() !== false ? 'applied' : 'pending',
        observedAt: new Date().toISOString(),
        policy: runtime
      },
      history: events.map(event => ({
        id: event.id,
        actorId: event.actorId,
        reason: event.reason,
        fields: event.fields as SecurityPolicyEvent['fields'],
        sessionsEnded: event.sessionsEnded,
        createdAt: new Date(event.createdAt).toISOString()
      }))
    }
  }
  const activate = async (ended: number[]): Promise<SecurityWriteResult['activation']> => {
    try {
      return (await deps.onCommitted?.(ended)) === false ? 'needs-attention' : 'applied'
    } catch {
      return 'needs-attention'
    }
  }
  return {
    inspect: (requester: PagePrincipal) => read(tx => inspect(tx, requester)),
    async initialize(requester: PagePrincipal, fingerprint: unknown): Promise<SecurityWriteResult> {
      const saved = await read(tx => inspect(tx, requester))
      if (fingerprint !== saved.fingerprint) return fail('Security policy or account coverage changed. Reload before applying runtime settings.', 409)
      return { sessionsEnded: 0, currentSessionEnded: false, activation: await activate([]) }
    },
    async save(
      requester: PagePrincipal,
      input: { policy?: unknown; fingerprint?: unknown; reason?: unknown; endSessions?: unknown }
    ): Promise<SecurityWriteResult> {
      const validation = validateSecurityPolicy(input.policy)
      if (!validation.ok) return fail(validation.issues.map(issue => issue.message).join(' '))
      if (typeof input.reason !== 'string' || input.reason.trim().length < 3 || input.reason.trim().length > 1000)
        return fail('Add an administrative reason of 3–1,000 characters.')
      if (input.endSessions !== undefined && typeof input.endSessions !== 'boolean') return fail('Choose whether existing sessions should end.')
      const policy = validation.value,
        reason = input.reason.trim()
      const committed = await db.transaction(async tx => {
        const s = await state(tx, true),
          actorId = await authority(tx, requester, s)
        if (input.fingerprint !== s.fingerprint)
          return fail('Security policy, account coverage or administrative authority changed. Reload and review again.', 409)
        if (policy.authHideLocal && !s.providers.some(p => p.key !== 'local' && p.isEnabled && deps.definitions().some(d => d.key === p.strategyKey)))
          return fail('Keep Local visible until another available sign-in provider is enabled.')
        if (policy.securityHSTS && !deps.host().startsWith('https://'))
          return fail('Configure an HTTPS workspace address before enabling HTTPS browser memory.')
        if (policy.securityCSPMode === 'enforce' && (s.policy.securityCSPMode === 'off' || s.policy.securityCSPDirectives !== policy.securityCSPDirectives))
          return fail('Save these CSP directives in report-only mode and verify the workspace before enforcing them.')
        const fields = securityChangedFields(s.policy, policy),
          ended = input.endSessions === true || securityEndsSessions(s.policy, policy) ? s.accounts.filter(a => a.id !== 2).map(a => a.id) : []
        if (!fields.length && !ended.length) return fail('There are no security policy changes to save.')
        const now = new Date(),
          revision = randomUUID(),
          patch = securityConfigurationPatch(policy, s.configuration)
        for (const [key, value] of Object.entries({ ...patch, securityPolicyRevision: { revision } }))
          await tx('settings')
            .insert({ key, value: JSON.stringify(value), updatedAt: now })
            .onConflict('key')
            .merge({ value: JSON.stringify(value), updatedAt: now })
        if (ended.length) {
          await tx('users')
            .whereIn('id', ended)
            .update({ authVersion: tx.raw('?? + 1', ['authVersion']), adminRevision: revision, sessionsRevokedAt: now })
          await tx('userAdministrationEvents').insert(
            ended.map(userId => ({
              userId,
              actorId,
              action: 'workspace-security-updated',
              reason,
              details: JSON.stringify({ fields, sessionsEnded: true }),
              createdAt: now
            }))
          )
        }
        await tx('securityAdministrationEvents').insert({ actorId, reason, fields: JSON.stringify(fields), sessionsEnded: ended.length, createdAt: now })
        return { ended, currentSessionEnded: actorId !== null && ended.includes(actorId) }
      })
      return { sessionsEnded: committed.ended.length, currentSessionEnded: committed.currentSessionEnded, activation: await activate(committed.ended) }
    }
  }
}

let activationQueue: Promise<unknown> = Promise.resolve()
export const getSecurityAdministrationStore = () => {
  const wiki = WIKI as unknown as {
    models: { knex: Knex }
    config: Record<string, unknown> & { host: string; sessionSecret: string }
    data: { authentication: Array<{ key: string; useForm?: boolean }> }
    configSvc: { loadFromDb(): Promise<void> }
    auth: { jwtAudience: string | null; activateStrategies(): Promise<void>; revokeUserTokens(input: { id: number; kind: 'u' }): void }
    app: { set(key: string, value: number | false): void }
    events: { outbound: { emit(event: string, input?: unknown): void } }
  }
  return createSecurityAdministrationStore({
    db: wiki.models.knex,
    reviewKey: wiki.config.sessionSecret,
    fallback: () => wiki.config,
    host: () => wiki.config.host,
    definitions: () => wiki.data.authentication,
    runtime: () => securityPolicyFromConfiguration(wiki.config),
    runtimeReady: () => wiki.auth.jwtAudience === object(wiki.config.auth).audience,
    onCommitted: ended => {
      const activation = activationQueue.then(async () => {
        let applied = true
        for (const id of ended) {
          try {
            wiki.auth.revokeUserTokens({ id, kind: 'u' })
          } catch {
            applied = false
          }
          try {
            wiki.events.outbound.emit('addAuthRevoke', { id, kind: 'u' })
          } catch {
            applied = false
          }
        }
        await wiki.configSvc.loadFromDb()
        wiki.app.set('trust proxy', object(wiki.config.security).securityTrustProxy === true ? 1 : false)
        // Re-register JWT validation as well as provider audience defaults after policy reload.
        if (wiki.auth.jwtAudience !== object(wiki.config.auth).audience) await wiki.auth.activateStrategies()
        try {
          wiki.events.outbound.emit('reloadConfig')
        } catch {
          applied = false
        }
        const rows = await wiki.models.knex<Setting>('settings').whereIn('key', ['auth', 'security', 'uploads']).select('key', 'value')
        const saved = securityPolicyFromConfiguration({ ...wiki.config, ...Object.fromEntries(rows.map(row => [row.key, row.value])) })
        return applied && wiki.auth.jwtAudience === object(wiki.config.auth).audience && stable(saved) === stable(securityPolicyFromConfiguration(wiki.config))
      })
      activationQueue = activation.catch(() => {})
      return activation
    }
  })
}

export const legacySecurityKeys = [
  'authAutoLogin',
  'authEnforce2FA',
  'authHideLocal',
  'authLoginBgUrl',
  'authJwtAudience',
  'authJwtExpiration',
  'authJwtRenewablePeriod',
  'securityOpenRedirect',
  'securityIframe',
  'securityReferrerPolicy',
  'securityTrustProxy',
  'securitySRI',
  'securityHSTS',
  'securityHSTSDuration',
  'securityCSP',
  'securityCSPDirectives',
  'uploadMaxFileSize',
  'uploadMaxFiles',
  'uploadScanSVG',
  'uploadForceDownload'
]
export const patchLegacySecurityConfiguration = async (requester: PagePrincipal, input: Record<string, unknown>): Promise<void> => {
  if (Object.keys(input).some(key => !legacySecurityKeys.includes(key))) return fail('Save security settings separately from other workspace settings.')
  const service = getSecurityAdministrationStore(),
    saved = await service.inspect(requester),
    next: Record<string, unknown> = { ...saved.policy }
  const wiki = WIKI as unknown as { models: { knex: Knex } }
  const rows = await wiki.models.knex<Setting>('settings').whereIn('key', ['security', 'uploads']).select('key', 'value'),
    values = Object.fromEntries(rows.map(row => [row.key, object(row.value)]))
  if (Object.hasOwn(input, 'securitySRI') && input.securitySRI !== (values.security?.securitySRI ?? true))
    return fail('The legacy SRI switch has no runtime effect and cannot be changed through security administration.')
  if (Object.hasOwn(input, 'uploadMaxFiles') && input.uploadMaxFiles !== (values.uploads?.maxFiles ?? 10))
    return fail('Asset uploads accept one file per request. The obsolete multipart batch setting cannot be changed.')
  for (const [key, value] of Object.entries(input)) {
    if (key === 'authJwtExpiration' || key === 'authJwtRenewablePeriod') {
      if (typeof value !== 'string' || !value.trim()) return fail('Enter a valid token duration.')
      let milliseconds: number
      try {
        milliseconds = ms(value)
      } catch {
        return fail('Enter a valid token duration.')
      }
      if (!Number.isFinite(milliseconds) || milliseconds % 1000 !== 0) return fail('Use token durations in whole seconds.')
      next[key === 'authJwtExpiration' ? 'authJwtExpirationSeconds' : 'authJwtRenewalSeconds'] = milliseconds / 1000
    } else if (key === 'securityCSP') {
      if (typeof value !== 'boolean') return fail('Choose a valid Content Security Policy mode.')
      next.securityCSPMode = value ? 'enforce' : saved.policy.securityCSPMode === 'report-only' ? 'report-only' : 'off'
    } else if (Object.hasOwn(securityPolicyDefaults, key)) next[key] = value
  }
  const validation = validateSecurityPolicy(next)
  if (!validation.ok) return fail(validation.issues.map(issue => issue.message).join(' '))
  if (!securityChangedFields(saved.policy, validation.value).length) return
  await service.save(requester, {
    policy: validation.value,
    fingerprint: saved.fingerprint,
    reason: 'Updated through the legacy workspace security configuration API'
  })
}
