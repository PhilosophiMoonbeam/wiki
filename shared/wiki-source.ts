import { z } from 'zod'

export const WikiSourceSchema = z.object({
  id: z.number().int().positive(),
  locale: z.string().min(1).max(35),
  path: z.string().min(1).max(1024),
  title: z.string(),
  description: z.string(),
  visibility: z.enum(['public', 'private']),
  updatedAt: z.string(),
  sourceRevision: z.string(),
  excerpt: z.string().max(2400),
  excerptTruncated: z.boolean()
})
export type WikiSource = z.infer<typeof WikiSourceSchema>
export type WikiSourceSelector = { id: number } | { locale: string; path: string; visibility: 'public' | 'private' }

export const wikiSourceHref = (source: Pick<WikiSource, 'locale' | 'path' | 'visibility'>): string =>
  `${source.visibility === 'private' ? '/_private' : ''}/${encodeURIComponent(source.locale)}/${source.path.split('/').map(encodeURIComponent).join('/')}`

export const wikiSourceSelectorFromHref = (href: string, origin: string): WikiSourceSelector | null => {
  try {
    const url = new URL(href, origin)
    if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol)) return null
    const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
    const visibility = segments[0] === '_private' ? 'private' : 'public'
    if (visibility === 'private') segments.shift()
    const locale = segments.shift()
    const path = segments.join('/')
    if (!locale || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(locale) || !path || path.length > 1024) return null
    return { locale, path, visibility }
  } catch { return null }
}
