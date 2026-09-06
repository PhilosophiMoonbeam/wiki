import type { PageEditorKey } from '../../shared/page-editors.ts'
import { PAGE_EDITOR_DEFINITIONS } from './page-editors.ts'
export const templateEditorPath = (input: { locale: string; path: string; visibility: 'public' | 'private'; templateId: number }): string => {
  if (!Number.isSafeInteger(input.templateId) || input.templateId < 1) throw new Error('Choose a valid template page.')
  return `/e${input.visibility === 'private' ? '/_private' : ''}/${encodeURIComponent(input.locale)}/${input.path.split('/').map(encodeURIComponent).join('/')}?from=${input.templateId}`
}

export const resolveTemplateEditorPath = async (
  input: Parameters<typeof templateEditorPath>[0],
  available: readonly PageEditorKey[],
  readTemplate: (id: number) => Promise<{ editor: string }>
): Promise<string> => {
  const location = templateEditorPath(input)
  const template = await readTemplate(input.templateId)
  if (!available.some(key => key === template.editor)) {
    const title = PAGE_EDITOR_DEFINITIONS.find(editor => editor.key === template.editor)?.title || template.editor
    throw new Error(`This template uses ${title}, which is not available for new pages. Choose a template in an available editor, or ask an administrator to enable it.`)
  }
  return location
}
