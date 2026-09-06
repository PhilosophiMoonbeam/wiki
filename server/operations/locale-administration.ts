import { createHmac, randomUUID } from 'node:crypto'
import type { Knex } from 'knex'
import {
  LocalePolicySchema,
  LocaleCatalogSchema,
  LocaleCodeSchema,
  localePolicyFromConfiguration,
  localeChangedFields,
  type LocaleCatalogEntry,
  type LocaleWorkspace,
  type LocaleEvent,
  type LocaleOperation,
  type LocaleWriteResult
} from '../../shared/locale-policy.ts'
import { mergeLocaleCatalog, type LocaleStrings } from '../helpers/locale-package.ts'
import { accountSessionIsCurrent } from '../helpers/account-session.ts'
import { principalId, type PagePrincipal } from '../helpers/page-access.ts'
import { DurableJobStore, type DurableJob } from '../core/durable-jobs.ts'
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
const settingKeys = ['lang', 'localeAdministration', 'localeCatalog', 'graphEndpoint', 'offline']
interface Setting {
  key: string
  value: unknown
}
interface Group {
  id: number
  permissions: string[]
  adminRevision: string
}
interface Account {
  id: number
  isActive: boolean
  authVersion: number
}
interface InstalledLocale extends LocaleCatalogEntry {
  createdAt: string
  updatedAt: string
}
interface Dependencies {
  db: Knex
  reviewKey: string
  fallback(): Record<string, unknown>
  cachedCatalog?(): Promise<unknown>
  runtime(): { locale: unknown; revision: unknown; configuration: unknown }
  onCommitted?(): Promise<boolean>
}
export const createLocaleAdministrationStore = (deps: Dependencies) => {
  const fingerprint = (value: unknown) => createHmac('sha256', deps.reviewKey).update(stable(value)).digest('hex')
  const state = async (tx: Knex.Transaction, requester: PagePrincipal, lock = false) => {
    const groupQuery = tx<Group>('groups').select('id', 'permissions', 'adminRevision').orderBy('id'),
      groups = await (lock ? groupQuery.forUpdate() : groupQuery)
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
    if (!groups.some(group => ids.includes(group.id) && group.permissions.includes('manage:system'))) return fail('System administration is required.', 403)
    const query = tx<Setting>('settings').whereIn('key', settingKeys).orderBy('key'),
      rows = await (lock ? query.forUpdate() : query)
    const configuration = {
      ...deps.fallback(),
      ...Object.fromEntries(
        rows.map(row => [row.key, ['offline', 'graphEndpoint'].includes(row.key) && Object.hasOwn(record(row.value), 'v') ? record(row.value).v : row.value])
      )
    }
    const localeQuery = tx<InstalledLocale>('locales').select('code', 'name', 'nativeName', 'isRTL', 'availability', 'createdAt', 'updatedAt').orderBy('code'),
      locales = await (lock ? localeQuery.forShare() : localeQuery)
    const catalogData = record(configuration.localeCatalog),
      parsed = LocaleCatalogSchema.safeParse(catalogData.locales ?? (await deps.cachedCatalog?.()))
    const catalog = parsed.success ? parsed.data : []
    const policy = localePolicyFromConfiguration(configuration),
      metadata = record(configuration.localeAdministration)
    return {
      configuration,
      locales,
      policy,
      metadata,
      catalog,
      catalogData,
      actorId,
      fingerprint: fingerprint([rows, policy, locales, catalog, groups, actorId, ids])
    }
  }
  type State = Awaited<ReturnType<typeof state>>
  const put = async (tx: Knex.Transaction, key: string, value: unknown, now: string) => {
    await tx('settings')
      .insert({ key, value: JSON.stringify(value), updatedAt: now })
      .onConflict('key')
      .merge(['value', 'updatedAt'])
  }
  const events = (saved: State): LocaleEvent[] => (Array.isArray(saved.metadata.history) ? (saved.metadata.history as LocaleEvent[]) : [])
  const addEvent = (tx: Knex.Transaction, saved: State, event: LocaleEvent) =>
    put(tx, 'localeAdministration', { ...saved.metadata, revision: event.id, history: [event, ...events(saved)].slice(0, 50) }, event.createdAt)
  const assertReview = (saved: State, value: unknown) => {
    if (typeof value !== 'string' || value !== saved.fingerprint) return fail('Locale settings changed. Reload saved settings before reviewing again.', 409)
  }
  const reason = (value: unknown): string => {
    if (typeof value !== 'string' || value.trim().length < 3 || value.length > 1000) return fail('Provide an administrative reason of 3–1000 characters.')
    return value.trim()
  }
  const applied = (saved: State): boolean => {
    const runtime = deps.runtime(),
      lang = record(saved.configuration.lang)
    return runtime.locale === saved.policy.locale && (runtime.revision ?? '') === (lang.revision ?? '') && stable(runtime.configuration) === stable(lang)
  }
  const activate = async (): Promise<LocaleWriteResult> => {
    try {
      return { activation: (await deps.onCommitted?.()) === true ? 'applied' : 'needs-attention' }
    } catch {
      return { activation: 'needs-attention' }
    }
  }
  const inspect = async (requester: PagePrincipal): Promise<LocaleWorkspace> => {
    const tx = await deps.db.transaction({ isolationLevel: 'repeatable read', readOnly: true })
    try {
      const saved = await state(tx, requester)
      const counts = await tx('pages')
        .select('localeCode')
        .count('* as pages')
        .select(tx.raw('count(*) FILTER (WHERE ?? = true) as ??', ['isPublished', 'publishedPages']))
        .select(tx.raw('count(*) FILTER (WHERE ?? IS NOT NULL) as ??', ['localeGroupId', 'linkedTranslations']))
        .where('visibility', 'public')
        .groupBy('localeCode')
      const navigation = await tx('navigation').where('key', 'site').first('config'),
        trees = Array.isArray(navigation?.config) ? navigation.config : []
      const jobs = await tx('durableJobs').where({ type: 'locale-package', version: 1 }).orderBy('createdAt', 'desc').limit(25)
      const operations: LocaleOperation[] = jobs.map(job => {
        let payload: Record<string, unknown> = {}
        try {
          payload = record(JSON.parse(job.payload))
        } catch {
          /* malformed historical jobs do not expose payloads */
        }
        return {
          id: job.id,
          kind: payload.kind === 'catalog' ? 'catalog' : 'install',
          code: typeof payload.code === 'string' ? payload.code : null,
          state: job.state,
          attempts: job.attempts,
          createdAt: new Date(job.createdAt).toISOString(),
          updatedAt: new Date(job.updatedAt).toISOString(),
          completedAt: job.completedAt ? new Date(job.completedAt).toISOString() : null,
          message:
            job.state === 'failed'
              ? 'The operation did not complete. Reload the catalog and retry; the installed package remains intact unless Activity records publication.'
              : job.state === 'pending' && job.attempts > 0
                ? 'The worker will retry this operation.'
                : null
        }
      })
      let source: string | null = null
      try {
        source = new URL(String(saved.configuration.graphEndpoint)).host
      } catch {
        /* unavailable source is explicit */
      }
      await tx.commit()
      return {
        policy: saved.policy,
        fingerprint: saved.fingerprint,
        history: events(saved).slice(0, 50),
        operations,
        locales: mergeLocaleCatalog(saved.catalog, saved.locales).map(locale => {
          const installed = saved.locales.find(row => row.code === locale.code),
            count = counts.find(row => row.localeCode === locale.code)
          return {
            ...locale,
            isInstalled: Boolean(installed),
            installDate: installed?.updatedAt ?? null,
            pages: Number(count?.pages ?? 0),
            publishedPages: Number(count?.publishedPages ?? 0),
            linkedTranslations: Number(count?.linkedTranslations ?? 0),
            menuItems: trees.find((tree: { locale?: string }) => tree.locale === locale.code)?.items?.length ?? 0
          }
        }),
        catalog: {
          source,
          observedAt: typeof saved.catalogData.observedAt === 'string' ? saved.catalogData.observedAt : null,
          offline: saved.configuration.offline === true
        },
        runtime: { state: applied(saved) ? 'applied' : 'needs-attention', observedAt: new Date().toISOString() }
      }
    } catch (error) {
      await tx.rollback()
      throw error
    }
  }
  return {
    inspect,
    async save(requester: PagePrincipal, input: { policy: unknown; fingerprint: unknown; reason: unknown }) {
      const parsed = LocalePolicySchema.safeParse(input.policy)
      if (!parsed.success) return fail(parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(' '))
      const why = reason(input.reason)
      await deps.db.transaction(async tx => {
        const saved = await state(tx, requester, true)
        assertReview(saved, input.fingerprint)
        for (const code of new Set([parsed.data.locale, ...parsed.data.namespaces]))
          if (!saved.locales.some(locale => locale.code === code)) return fail(`Install ${code} before selecting it as a reading language.`)
        const fields = localeChangedFields(saved.policy, parsed.data)
        if (!fields.length) return fail('There are no locale changes to save.')
        const event: LocaleEvent = { id: randomUUID(), actorId: saved.actorId, kind: 'settings', fields, reason: why, createdAt: new Date().toISOString() }
        await put(
          tx,
          'lang',
          {
            ...record(saved.configuration.lang),
            code: parsed.data.locale,
            autoUpdate: parsed.data.autoUpdate,
            namespacing: parsed.data.namespacing,
            namespaces: parsed.data.namespaces,
            rtl: saved.locales.find(locale => locale.code === parsed.data.locale)!.isRTL,
            revision: event.id
          },
          event.createdAt
        )
        await addEvent(tx, saved, event)
      })
      return activate()
    },
    async initialize(requester: PagePrincipal, review: unknown) {
      const saved = await inspect(requester)
      if (saved.fingerprint !== review) return fail('Locale settings changed. Reload before activation.', 409)
      return activate()
    },
    async enqueue(requester: PagePrincipal, input: { kind: unknown; code?: unknown; fingerprint: unknown; reason: unknown }) {
      if (input.kind !== 'install' && input.kind !== 'catalog') return fail('Choose a package installation or catalog refresh.')
      const kind = input.kind,
        why = reason(input.reason),
        parsedCode = LocaleCodeSchema.safeParse(input.code)
      if (kind === 'install' && !parsedCode.success) return fail('Choose a valid language code.')
      const code = kind === 'install' && parsedCode.success ? parsedCode.data : null
      return deps.db.transaction(async tx => {
        const saved = await state(tx, requester, true)
        assertReview(saved, input.fingerprint)
        if (saved.configuration.offline === true) return fail('Remote language operations are unavailable in offline mode.')
        if (code && !saved.catalog.some(locale => locale.code === code))
          return fail('This language is absent from the current catalog. Refresh the catalog first.')
        const active = await tx('durableJobs').where({ type: 'locale-package', version: 1 }).whereIn('state', ['pending', 'running']).first('id')
        if (active) return fail('A language operation is already queued or running. Wait for its result before starting another.', 409)
        const id = randomUUID(),
          now = new Date().toISOString()
        const principal =
          saved.actorId === null ? { id: 1, ownershipUserId: null, groups: requester!.groups } : { id: saved.actorId, authVersion: requester!.authVersion }
        const job = await new DurableJobStore(tx).enqueue({
          type: 'locale-package',
          version: 1,
          maxAttempts: 3,
          payload: { eventId: id, kind, code, requester: principal, sourceFingerprint: fingerprint(saved.configuration.graphEndpoint) }
        })
        await addEvent(tx, saved, {
          id,
          actorId: saved.actorId,
          reason: why,
          fields: [kind === 'catalog' ? 'catalog' : `package:${code}`],
          createdAt: now,
          kind,
          jobId: job.id,
          ...(code ? { code } : {})
        })
        return { jobId: job.id }
      })
    },
    async jobContext(job: DurableJob) {
      const requester = record(job.payload.requester) as PagePrincipal
      const tx = await deps.db.transaction({ isolationLevel: 'repeatable read', readOnly: true })
      try {
        const saved = await state(tx, requester)
        if (saved.configuration.offline === true) return fail('Language downloads are disabled in offline mode.')
        if (fingerprint(saved.configuration.graphEndpoint) !== job.payload.sourceFingerprint)
          return fail('The language source changed after this operation was queued.')
        const event = events(saved).find(event => event.id === job.payload.eventId && event.jobId === job.id)
        if (!event) return fail('This language operation no longer has an administrative receipt.')
        await tx.commit()
        return { endpoint: String(saved.configuration.graphEndpoint), alreadyApplied: Boolean(event.appliedAt) }
      } catch (error) {
        await tx.rollback()
        throw error
      }
    },
    async publishJob(job: DurableJob, catalog: LocaleCatalogEntry[], strings?: LocaleStrings) {
      await deps.db.transaction(async tx => {
        // Authority/settings locks precede the job lease lock, consistently with enqueue.
        const saved = await state(tx, record(job.payload.requester) as PagePrincipal, true)
        const lease = await tx('durableJobs').where({ id: job.id, type: 'locale-package', version: 1 }).forUpdate().first()
        if (
          !lease ||
          lease.state !== 'running' ||
          !job.leaseToken ||
          lease.leaseToken !== job.leaseToken ||
          new Date(lease.leaseExpiresAt).valueOf() <= Date.now()
        )
          return fail('This language worker no longer owns its lease.', 409)
        if (saved.configuration.offline === true || fingerprint(saved.configuration.graphEndpoint) !== job.payload.sourceFingerprint)
          return fail('The language source or offline policy changed during this operation.', 409)
        const event = events(saved).find(event => event.id === job.payload.eventId && event.jobId === job.id)
        if (!event) return fail('This language operation no longer has an administrative receipt.')
        if (event.appliedAt) return
        const now = new Date().toISOString()
        if (event.kind === 'install') {
          const locale = catalog.find(row => row.code === event.code)
          if (!locale || !strings) return fail('The language package is absent from the current source.')
          const data = {
            code: locale.code,
            name: locale.name,
            nativeName: locale.nativeName,
            isRTL: locale.isRTL,
            availability: locale.availability,
            strings: JSON.stringify(strings),
            createdAt: now,
            updatedAt: now
          }
          await tx('locales').insert(data).onConflict('code').merge(['name', 'nativeName', 'isRTL', 'availability', 'strings', 'updatedAt'])
          const lang = record(saved.configuration.lang)
          await put(tx, 'lang', { ...lang, ...(lang.code === locale.code ? { rtl: locale.isRTL } : {}), revision: event.id }, now)
        }
        await put(tx, 'localeCatalog', { locales: catalog, observedAt: now }, now)
        await put(
          tx,
          'localeAdministration',
          { ...saved.metadata, history: events(saved).map(row => (row.id === event.id ? { ...row, appliedAt: now } : row)) },
          now
        )
      })
      return activate()
    }
  }
}
let runtimeStore: ReturnType<typeof createLocaleAdministrationStore> | undefined, runtimeDatabase: Knex | undefined
export const getLocaleAdministrationStore = () => {
  const wiki = WIKI as unknown as {
    models: { knex: Knex }
    config: Record<string, unknown>
    cache: { get(key: string): Promise<unknown> }
    configSvc: { loadFromDb(): Promise<void> }
    lang: { appliedRevision: string | null; appliedLocale: string | null; refreshNamespaces(): Promise<void> }
    events: { outbound: { emit(event: string): void } }
    logger: { warn(message: string): void }
  }
  if (!runtimeStore || runtimeDatabase !== wiki.models.knex) {
    runtimeDatabase = wiki.models.knex
    let queue = Promise.resolve()
    runtimeStore = createLocaleAdministrationStore({
      db: wiki.models.knex,
      reviewKey: String(wiki.config.sessionSecret),
      fallback: () => wiki.config,
      cachedCatalog: () => wiki.cache.get('locales'),
      runtime: () => ({ locale: wiki.lang.appliedLocale, revision: wiki.lang.appliedRevision, configuration: wiki.config.lang }),
      onCommitted: () => {
        const next = queue.then(async () => {
          await wiki.configSvc.loadFromDb()
          await wiki.lang.refreshNamespaces()
          let notified = true
          try {
            wiki.events.outbound.emit('reloadConfig')
          } catch {
            notified = false
            wiki.logger.warn('Locale settings saved; peer reload notification failed.')
          }
          const row = await wiki.models.knex<Setting>('settings').where('key', 'lang').first()
          return (
            notified &&
            stable(row?.value ?? wiki.config.lang) === stable(wiki.config.lang) &&
            (record(wiki.config.lang).revision ?? null) === wiki.lang.appliedRevision
          )
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
