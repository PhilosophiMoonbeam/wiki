import { createHash, randomUUID } from 'node:crypto'
import type { Knex } from 'knex'
import { normalizeEditorPolicy, validateEditorPolicy, type EditorPolicy, type EditorPolicySnapshot, type EditorWorkspace } from '../../shared/editor-policy.ts'
import { managesSystem, type PagePrincipal } from '../helpers/page-access.ts'
import errors from './errors.ts'
const { ApplicationError } = errors
interface SettingRow { key: string; value: unknown; updatedAt: string | Date }
interface StoredPolicy { policy: EditorPolicySnapshot; raw: Record<string, unknown> }
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
export const createEditorPolicyStore = (deps: { db: Knex; fallback(): unknown; activate(policy: Record<string, unknown>): Promise<string[]> }) => {
  const read = async (db: Knex | Knex.Transaction = deps.db): Promise<StoredPolicy> => {
    const row = await db<SettingRow>('settings').where('key', 'editors').first()
    const raw = object(row ? row.value : deps.fallback())
    const policy = normalizeEditorPolicy(raw)
    const fingerprint = createHash('sha256').update(JSON.stringify({ raw, updatedAt: row?.updatedAt ?? null })).digest('hex')
    return { raw, policy: { ...policy, fingerprint } }
  }
  return {
    async read(): Promise<EditorPolicySnapshot> { return (await read()).policy },
    async write(input: unknown, expected: unknown): Promise<{ policy: EditorPolicySnapshot; warnings: string[] }> {
      const validated = validateEditorPolicy(input)
      if (!validated.ok) throw new ApplicationError(validated.message, { status: 400 })
      if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected)) throw new ApplicationError('Load the saved editor policy before saving changes.', { status: 400 })
      let raw: Record<string, unknown> = {}
      const saved = await deps.db.transaction(async tx => {
        // All editor-policy writers share this transaction lock, including the
        // compatibility entry point in general site configuration.
        await tx.raw('SELECT pg_advisory_xact_lock(?)', [72401591])
        await tx('settings').where('key', 'editors').forUpdate().first()
        const current = await read(tx)
        if (current.policy.fingerprint !== expected) throw new ApplicationError('Editor settings changed after you loaded them. Reload the saved policy and review your choices.', { status: 409 })
        raw = { ...current.raw, ...validated.value, revision: randomUUID() }
        const now = new Date().toISOString()
        await tx('settings').insert({ key: 'editors', value: JSON.stringify(raw), updatedAt: now }).onConflict('key').merge({ value: JSON.stringify(raw), updatedAt: now })
        return (await read(tx)).policy
      })
      let warnings: string[]
      try { warnings = await deps.activate(raw) } catch { warnings = ['Saved. Runtime configuration refresh could not finish; reload the workspace or check server logs.'] }
      return { policy: saved, warnings }
    }
  }
}
interface Runtime {
  config: { editors?: unknown }
  models: { knex: Knex }
  data: { editors: { key: string }[] }
  events: { outbound: { emit(event: string): void } }
  logger: { warn(error: unknown): void }
}
const runtime = (): Runtime => WIKI as unknown as Runtime
const store = () => createEditorPolicyStore({ db: runtime().models.knex, fallback: () => runtime().config.editors,
  async activate(policy) { const wiki = runtime(); wiki.config.editors = policy; try { wiki.events.outbound.emit('reloadConfig'); return [] } catch (error) { wiki.logger.warn(error); return ['Saved. Other server processes could not be notified; check server logs.'] } }
})
const requireAdmin = (requester: PagePrincipal) => { if (!managesSystem(requester)) throw new ApplicationError('manage:system is required.', { status: 403 }) }
export const editorWorkspace = async (requester: PagePrincipal): Promise<EditorWorkspace> => {
  requireAdmin(requester)
  const [policy, counts] = await Promise.all([store().read(), runtime().models.knex('pages').select('editorKey', 'visibility').count('* as count').groupBy('editorKey', 'visibility').orderBy('editorKey')])
  const usage = new Map<string, { key: string; pages: number; privatePages: number }>()
  for (const count of counts) { const key = String(count.editorKey); const row = usage.get(key) ?? { key, pages: 0, privatePages: 0 }; row.pages += Number(count.count); if (count.visibility === 'private') row.privatePages += Number(count.count); usage.set(key, row) }
  return { policy, registered: runtime().data.editors.map(editor => editor.key), usage: [...usage.values()] }
}
export const saveEditorPolicy = async (requester: PagePrincipal, input: unknown, expected: unknown) => {
  requireAdmin(requester)
  const checked = validateEditorPolicy(input)
  if (!checked.ok) throw new ApplicationError(checked.message, { status: 400 })
  const registered = new Set(runtime().data.editors.map(editor => editor.key))
  if (checked.value.available.some(key => !registered.has(key))) throw new ApplicationError('An enabled editor is missing from the server registry. Choose registered editors or repair the deployment.', { status: 400 })
  return store().write(checked.value, expected)
}
// Older site-config clients can still set availability. Unrelated site saves do
// not rewrite editor settings; recommendations survive unless explicitly hidden.
export const updateEditorAvailability = async (available: EditorPolicy['available']): Promise<void> => {
  const persistence = store(), current = await persistence.read()
  await persistence.write({ available, recommended: current.recommended && available.includes(current.recommended) ? current.recommended : null }, current.fingerprint)
}
