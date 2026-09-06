import type { RenderingModule, RenderingOutput, RenderingSetting, RenderingWorkspace } from '../../shared/rendering-policy.ts'
import { sameOriginJsonFetch } from './json-transport.ts'
import { isRecord } from './type-guards.ts'
const request = async (path: string, body?: unknown): Promise<unknown> => {
  const response = await sameOriginJsonFetch(window.fetch.bind(window), '/_api/rendering/' + path, {
    credentials: 'same-origin', headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { method: 'PUT', body: JSON.stringify(body) } : {})
  })
  const payload: unknown = await response.json()
  if (!response.ok) throw new Error(isRecord(payload) && typeof payload.error === 'string' ? payload.error : 'Rendering request failed. Try again.')
  return payload
}
const isModule = (value: unknown): value is RenderingModule => isRecord(value) && typeof value.key === 'string' && typeof value.isEnabled === 'boolean' && typeof value.title === 'string' && isRecord(value.config) && isRecord(value.props)
const isSnapshot = (value: unknown): value is Pick<RenderingWorkspace, 'modules' | 'fingerprint'> => isRecord(value) && typeof value.fingerprint === 'string' && Array.isArray(value.modules) && value.modules.every(isModule)
export const fetchRenderingWorkspace = async (): Promise<RenderingWorkspace> => {
  const value = await request('workspace')
  if (!isSnapshot(value) || !Array.isArray(Reflect.get(value, 'usage'))) throw new Error('Rendering configuration response is invalid.')
  return value as RenderingWorkspace
}
export const saveRenderingWorkspace = async (modules: RenderingSetting[], fingerprint: string) => {
  const value = await request('workspace', { modules, fingerprint })
  if (!isSnapshot(value)) throw new Error('Rendering save response is invalid. Reload the saved configuration before retrying.')
  return value
}
export const fetchRenderingOutput = async (id: number): Promise<RenderingOutput> => {
  const value = await request(`output/${id}`)
  if (!isRecord(value) || !isRecord(value.page) || typeof value.html !== 'string' || !Array.isArray(value.headings) || !isRecord(value.links)) throw new Error('Stored output response is invalid.')
  return value as unknown as RenderingOutput
}
