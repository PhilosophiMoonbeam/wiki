import { createHash, randomUUID } from 'node:crypto'
import type { Knex } from 'knex'
import { load } from 'cheerio'
import { renderingIssues, type RenderingOutput, type RenderingSetting, type RenderingWorkspace } from '../../shared/rendering-policy.ts'
import { managesSystem, type PagePrincipal } from '../helpers/page-access.ts'
import { projectRenderingModules, type RenderingDefinition as Definition } from '../helpers/rendering-policy.ts'
import errors from './errors.ts'
const { ApplicationError } = errors
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable) : isObject(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
export const createRenderingStore = (deps: { db: Knex; definitions(): Definition[] }) => {
  const read = async (db: Knex | Knex.Transaction = deps.db) => {
    const rows = await db<RenderingSetting>('renderers').select('key', 'isEnabled', 'config').orderBy('key')
    const revision = await db('settings').where('key', 'renderingRevision').first('value')
    const definitions = deps.definitions()
    return { modules: projectRenderingModules(rows, definitions), fingerprint: createHash('sha256').update(JSON.stringify(stable({ rows, definitions, revision: revision?.value ?? null }))).digest('hex') }
  }
  return {
    read,
    async write(input: unknown, expected?: unknown) {
      if (!Array.isArray(input) || !input.length || input.length > 200 || input.some(row => !isObject(row) || typeof row.key !== 'string' || typeof row.isEnabled !== 'boolean' || !isObject(row.config)) || new Set(input.map(row => row.key)).size !== input.length) throw new ApplicationError('Choose unique installed rendering modules with valid configuration.', { status: 400 })
      if (expected !== undefined && (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected))) throw new ApplicationError('Reload the saved rendering configuration before saving.', { status: 400 })
      return deps.db.transaction(async tx => {
        await tx.raw('SELECT pg_advisory_xact_lock(?)', [72401601])
        await tx('renderers').orderBy('key').forUpdate().select('key')
        const current = await read(tx)
        if (expected !== undefined && current.fingerprint !== expected) throw new ApplicationError('Rendering settings changed after you loaded them. Reload the saved configuration and review your draft.', { status: 409 })
        const modules = current.modules.map(module => ({ ...module, config: { ...module.config } }))
        for (const row of input as RenderingSetting[]) {
          const module = modules.find(module => module.key === row.key)
          if (!module) throw new ApplicationError(`Unknown rendering module: ${row.key}`, { status: 400 })
          if (Object.keys(row.config).some(key => !Object.hasOwn(module.props, key))) throw new ApplicationError(`Unknown configuration option for ${module.title}.`, { status: 400 })
          module.isEnabled = row.isEnabled
          Object.assign(module.config, row.config)
        }
        const problem = renderingIssues(modules, modules.filter(module => !module.dependsOn).map(module => module.input ?? '')).find(issue => issue.severity === 'error')
        if (problem) throw new ApplicationError(problem.message, { status: 400 })
        for (const row of input as RenderingSetting[]) {
          const module = modules.find(module => module.key === row.key)!
          await tx('renderers').where('key', row.key).update({ isEnabled: module.isEnabled, config: JSON.stringify(module.config) })
        }
        const revision = JSON.stringify({ revision: randomUUID() }), updatedAt = new Date().toISOString()
        await tx('settings').insert({ key: 'renderingRevision', value: revision, updatedAt }).onConflict('key').merge({ value: revision, updatedAt })
        return read(tx)
      })
    }
  }
}
interface Runtime { data: { renderers: Definition[] }; models: { knex: Knex } }
const runtime = (): Runtime => WIKI as unknown as Runtime
const store = () => createRenderingStore({ db: runtime().models.knex, definitions: () => runtime().data.renderers })
const requireAdmin = (requester: PagePrincipal) => { if (!managesSystem(requester)) throw new ApplicationError('manage:system is required.', { status: 403 }) }
export const readRenderingWorkspace = async (requester: PagePrincipal): Promise<RenderingWorkspace> => {
  requireAdmin(requester)
  const [snapshot, rows] = await Promise.all([store().read(), runtime().models.knex('pages').select('contentType', 'visibility').count('* as count').groupBy('contentType', 'visibility')])
  const usage = new Map<string, RenderingWorkspace['usage'][number]>()
  for (const row of rows) { const key = String(row.contentType), count = usage.get(key) ?? { contentType: key, pages: 0, privatePages: 0 }; count.pages += Number(row.count); if (row.visibility === 'private') count.privatePages += Number(row.count); usage.set(key, count) }
  return { ...snapshot, usage: [...usage.values()] }
}
export const writeRenderingWorkspace = async (requester: PagePrincipal, input: unknown, fingerprint: unknown) => {
  requireAdmin(requester)
  if (fingerprint === undefined) throw new ApplicationError('Load the saved rendering configuration before saving.', { status: 400 })
  return store().write(input, fingerprint)
}
export const writeLegacyRenderingSettings = (input: RenderingSetting[]) => store().write(input)
export const inspectRenderingOutput = async (requester: Express.User | undefined, id: unknown): Promise<RenderingOutput> => {
  requireAdmin(requester)
  const { default: pages } = await import('./pages.ts')
  const page = await pages.get({ ...(requester ? { requester } : {}), id })
  const html = String(Reflect.get(page, 'render') ?? ''), bytes = Buffer.byteLength(html)
  if (bytes > 2 * 1024 * 1024) throw new ApplicationError('This stored output exceeds the 2 MiB inspection limit. Open the page or use its API for a larger export.', { status: 413 })
  const $ = load(html)
  return { page: { id: page.id, title: page.title, path: page.path, locale: page.localeCode, visibility: page.visibility, contentType: String(Reflect.get(page, 'contentType') ?? ''), sourceRevision: String(Reflect.get(page, 'sourceRevision')), updatedAt: String(page.updatedAt) }, html, bytes,
    headings: $('h1,h2,h3,h4,h5,h6').toArray().map(element => { const heading = $(element).clone(); heading.find('.toc-anchor').remove(); return { level: Number(element.tagName.slice(1)), text: heading.text().trim(), id: $(element).attr('id') ?? '' } }),
    links: { internal: $('a.is-internal-link').length, unresolved: $('a.is-invalid-page').length, external: $('a.is-external-link').length }, images: $('img').length, frames: $('iframe').length }
}
