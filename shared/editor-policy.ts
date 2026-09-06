import { isPageEditorKey, normalizeAvailableEditors, validateAvailableEditors, type PageEditorKey } from './page-editors.ts'
export interface EditorPolicy { available: PageEditorKey[]; recommended: PageEditorKey | null }
export interface EditorPolicySnapshot extends EditorPolicy { fingerprint: string }
export interface EditorUsage { key: string; pages: number; privatePages: number }
export interface EditorWorkspace { policy: EditorPolicySnapshot; registered: string[]; usage: EditorUsage[] }
export const normalizeEditorPolicy = (value: unknown): EditorPolicy => {
  const candidate = value && typeof value === 'object' ? value : {}
  const available = normalizeAvailableEditors(Reflect.get(candidate, 'available'))
  const recommendation = Reflect.get(candidate, 'recommended')
  return { available, recommended: isPageEditorKey(recommendation) && available.includes(recommendation) ? recommendation : null }
}
export const validateEditorPolicy = (value: unknown): { ok: true; value: EditorPolicy } | { ok: false; message: string } => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, message: 'An editor policy is required.' }
  const availability = validateAvailableEditors(Reflect.get(value, 'available'))
  if (!availability.ok) return availability
  const recommended = Reflect.get(value, 'recommended')
  if (recommended !== null && (!isPageEditorKey(recommended) || !availability.value.includes(recommended))) return { ok: false, message: 'The recommended editor must be available for new pages, or choose no recommendation.' }
  return { ok: true, value: { available: availability.value, recommended } }
}
