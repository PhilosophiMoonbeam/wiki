import { describe, expect, it } from '../server/test/bun-test.mts'
import { normalizeEditorPolicy, validateEditorPolicy } from './editor-policy.ts'
describe('editor creation policy', () => {
  it('defaults old installations to the existing choices without inventing a recommendation', () => {
    expect(normalizeEditorPolicy(undefined)).toEqual({ available: ['markdown', 'visual-markdown'], recommended: null })
    expect(normalizeEditorPolicy({ available: ['markdown'], recommended: 'code' })).toEqual({ available: ['markdown'], recommended: null })
  })
  it('keeps recommendations inside the enabled set and retains canonical ordering', () => {
    expect(validateEditorPolicy({ available: ['code', 'markdown'], recommended: 'markdown' })).toEqual({ ok: true, value: { available: ['markdown', 'code'], recommended: 'markdown' } })
    expect(validateEditorPolicy({ available: ['markdown'], recommended: 'code' }).ok).toBe(false)
    expect(validateEditorPolicy({ available: ['markdown'], recommended: undefined }).ok).toBe(false)
    expect(validateEditorPolicy({ available: [], recommended: null }).ok).toBe(false)
    expect(validateEditorPolicy({ available: ['markdown', 'markdown'], recommended: null }).ok).toBe(false)
    expect(validateEditorPolicy({ available: ['unknown'], recommended: null }).ok).toBe(false)
  })
})
