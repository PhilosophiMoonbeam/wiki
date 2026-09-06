import { sameOriginJsonFetch } from './json-transport.ts'
import type { TaxonomyChange, TaxonomyInspection, TaxonomyPreview, TaxonomyResult, TaxonomyTag } from '../../shared/taxonomy.ts'
import { isRecord } from './type-guards.ts'
const request = async (path: string, body?: unknown): Promise<unknown> => {
  const response = await sameOriginJsonFetch(window.fetch.bind(window), `/_api/taxonomy${path}`, {
    credentials: 'same-origin', headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) })
  })
  const value: unknown = await response.json()
  if (!response.ok) throw new Error(isRecord(value) && typeof value.error === 'string' ? value.error : 'Taxonomy request failed. Try again.')
  return value
}
const tag = (value: unknown): value is TaxonomyTag => isRecord(value) && ['id', 'pageCount', 'historyCount', 'ruleCount'].every(key => typeof value[key] === 'number') && ['tag', 'title', 'createdAt', 'updatedAt'].every(key => typeof value[key] === 'string') && typeof value.isArchived === 'boolean' && (value.redirectToId === null || typeof value.redirectToId === 'number')
const pages = (value: unknown): boolean => Array.isArray(value) && value.every(page => isRecord(page) && typeof page.id === 'number' && ['title', 'path', 'locale', 'sourceRevision'].every(key => typeof page[key] === 'string') && ['public', 'private'].includes(String(page.visibility)))
const strings = (value: unknown): boolean => Array.isArray(value) && value.every(item => typeof item === 'string')
const rules = (value: unknown): boolean => Array.isArray(value) && value.every(rule => isRecord(rule) && ['groupId', 'before', 'after', 'added', 'removed'].every(key => typeof rule[key] === 'number') && typeof rule.groupName === 'string' && typeof rule.path === 'string' && typeof rule.deny === 'boolean' && strings(rule.roles) && strings(rule.locales))
const invalid = (): never => { throw new Error('The server returned an invalid taxonomy response. Reload or try again.') }
export const fetchTaxonomy = async (): Promise<TaxonomyTag[]> => {
  const value = await request('')
  return Array.isArray(value) && value.every(tag) ? value : invalid()
}
export const inspectTaxonomy = async (id: number): Promise<TaxonomyInspection> => {
  const value = await request(`/${id}`)
  if (!isRecord(value) || !tag(value.tag) || !Array.isArray(value.aliases) || !value.aliases.every(tag) || !pages(value.pages) || !rules(value.rules)) return invalid()
  return value as unknown as TaxonomyInspection
}
export const createTaxonomyTag = async (definition: { tag: string; title: string }): Promise<{ id: number }> => {
  const value = await request('', definition)
  return isRecord(value) && typeof value.id === 'number' && value.id > 0 ? { id: value.id } : invalid()
}
export const previewTaxonomy = async (change: TaxonomyChange): Promise<TaxonomyPreview> => {
  const value = await request('/preview', change)
  if (!isRecord(value) || typeof value.fingerprint !== 'string' || !tag(value.source) || (value.destination !== null && !tag(value.destination)) || !Array.isArray(value.aliases) || !value.aliases.every(tag) || !pages(value.pages) || !rules(value.rules) || typeof value.accessChanges !== 'boolean' || typeof value.pageCount !== 'number' || !isRecord(value.change) || value.change.action !== change.action || value.change.tagId !== change.tagId) return invalid()
  return value as unknown as TaxonomyPreview
}
export const applyTaxonomy = async (preview: TaxonomyPreview, acknowledgeAccess: boolean): Promise<TaxonomyResult> => {
  const value = await request('/apply', { change: preview.change, fingerprint: preview.fingerprint, acknowledgeAccess })
  if (!isRecord(value) || typeof value.tagId !== 'number' || typeof value.pageCount !== 'number' || !strings(value.refreshWarnings)) return invalid()
  return value as unknown as TaxonomyResult
}
