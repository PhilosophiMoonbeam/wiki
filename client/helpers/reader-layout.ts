import { normalizeReaderLayout } from '../../shared/theme-policy.ts'
export const applyReaderLayout = (input: unknown): void => {
  const layout = normalizeReaderLayout(input), style = document.documentElement.style
  style.setProperty('--wiki-reader-text-size', `${layout.textSize / 16}rem`)
  style.setProperty('--wiki-reader-line-height', String(layout.lineHeight))
  style.setProperty('--wiki-reader-copy-width', `${layout.copyWidth}ch`)
}
