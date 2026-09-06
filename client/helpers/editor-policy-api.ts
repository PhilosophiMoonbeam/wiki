import { sameOriginJsonFetch } from './json-transport.ts'
import { isRecord } from './type-guards.ts'
import { validateEditorPolicy, type EditorPolicy, type EditorPolicySnapshot, type EditorWorkspace } from '../../shared/editor-policy.ts'
const request = async (body?: EditorPolicySnapshot): Promise<unknown> => {
  const response = await sameOriginJsonFetch(window.fetch.bind(window), '/_api/editors', {
    credentials: 'same-origin', headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { method: 'PUT', body: JSON.stringify(body) } : {})
  })
  const payload: unknown = await response.json()
  if (!response.ok) throw new Error(isRecord(payload) && typeof payload.error === 'string' ? payload.error : 'Editor settings request failed. Try again.')
  return payload
}
const policy = (value: unknown): value is EditorPolicySnapshot => isRecord(value) && typeof value.fingerprint === 'string' && validateEditorPolicy(value).ok
export const fetchEditorWorkspace = async (): Promise<EditorWorkspace> => {
  const payload = await request()
  if (!isRecord(payload) || !policy(payload.policy) || !Array.isArray(payload.registered) || !payload.registered.every(key => typeof key === 'string') || !Array.isArray(payload.usage) || !payload.usage.every(row => isRecord(row) && typeof row.key === 'string' && typeof row.pages === 'number' && typeof row.privatePages === 'number')) throw new Error('Editor configuration response is invalid. Reload or try again.')
  return payload as unknown as EditorWorkspace
}
export const saveEditorWorkspace = async (draft: EditorPolicy, fingerprint: string): Promise<{ policy: EditorPolicySnapshot; warnings: string[] }> => {
  const payload = await request({ ...draft, fingerprint })
  if (!isRecord(payload) || !policy(payload.policy) || !Array.isArray(payload.warnings) || !payload.warnings.every(warning => typeof warning === 'string')) throw new Error('Editor save response is invalid. Reload the saved policy before retrying.')
  return payload as unknown as { policy: EditorPolicySnapshot; warnings: string[] }
}
