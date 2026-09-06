import { WikiSourceSchema, type WikiSource, type WikiSourceSelector } from '../../shared/wiki-source.ts'

export const fetchWikiSource = async (selector: WikiSourceSelector, query: string, signal?: AbortSignal): Promise<WikiSource> => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(selector)) params.set(key, String(value))
  if (query.trim()) params.set('query', query.slice(0, 256))
  const response = await window.fetch(`/_api/pages/preview?${params}`, { credentials: 'same-origin', cache: 'no-store', signal })
  if (!response.ok) throw new Error(response.status === 403 ? 'Open this page to unlock it before previewing.' : response.status === 404 ? 'This source is no longer available to you.' : 'The source could not be loaded. Try again.')
  return WikiSourceSchema.parse(await response.json())
}
