import { z } from 'zod'

export const NAVIGATION_MODES = ['TREE', 'STATIC', 'MIXED', 'NONE'] as const
export const MAX_NAVIGATION_ITEMS = 200
const hasUnsafeCharacters = (text: string) => /[\\\s]/.test(text) || [...text].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
export const navigationDestination = (kind: unknown, target: unknown): string => {
  if (typeof target !== 'string' || !target || target.length > 2048 || hasUnsafeCharacters(target)) return ''
  try {
    if (kind === 'page') {
      if (!target.startsWith('/') || target.startsWith('//')) return ''
      const url = new URL(target, 'https://navigation.invalid')
      return url.origin === 'https://navigation.invalid' ? target : ''
    }
    if (kind !== 'external' && kind !== 'externalblank') return ''
    const url = new URL(target)
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) && !url.username && !url.password ? target : ''
  } catch { return '' }
}
export const NavigationItemSchema = z.object({
  id: z.string().min(1).max(100),
  kind: z.enum(['link', 'header', 'divider']),
  label: z.string().trim().max(255).default(''),
  icon: z.string().trim().max(100).default(''),
  targetType: z.enum(['page', 'external', 'externalblank']).default('page'),
  target: z.string().trim().max(2048).default(''),
  visibilityMode: z.enum(['all', 'restricted']).default('all'),
  visibilityGroups: z.array(z.number().int().positive()).max(128).default([])
}).strict().superRefine((item, ctx) => {
  if (item.kind !== 'divider' && !item.label) ctx.addIssue({ code: 'custom', path: ['label'], message: 'Give this item a label.' })
  if (item.kind === 'link' && !navigationDestination(item.targetType, item.target))
    ctx.addIssue({ code: 'custom', path: ['target'], message: 'Use a workspace path beginning with /, or an HTTP(S), mailto: or tel: address for an external link.' })
  if (item.icon && !/^(?:mdi-[a-z0-9-]+|fa[brsld]? fa-[a-z0-9-]+)$/.test(item.icon))
    ctx.addIssue({ code: 'custom', path: ['icon'], message: 'Use an mdi- icon name or a supported Font Awesome class.' })
}).transform(item => ({ ...item, visibilityGroups: item.visibilityMode === 'all' ? [] : [...new Set(item.visibilityGroups)].sort((a, b) => a - b) }))
export type NavigationItem = z.output<typeof NavigationItemSchema>
const NavigationTreeSchema = z.object({ locale: z.string().min(2).max(35).regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/), items: z.array(NavigationItemSchema).max(MAX_NAVIGATION_ITEMS) }).strict().superRefine((tree, ctx) => {
  if (new Set(tree.items.map(item => item.id)).size !== tree.items.length) ctx.addIssue({ code: 'custom', path: ['items'], message: 'Item identifiers must be unique within a locale.' })
})
export const NavigationPolicySchema = z.object({
  mode: z.enum(NAVIGATION_MODES), expandParent: z.boolean(), tree: z.array(NavigationTreeSchema).max(100)
}).strict().superRefine((value, ctx) => {
  if (new Set(value.tree.map(tree => tree.locale)).size !== value.tree.length) ctx.addIssue({ code: 'custom', path: ['tree'], message: 'Each locale can have one navigation structure.' })
}).transform(value => ({ ...value, tree: [...value.tree].sort((a, b) => a.locale.localeCompare(b.locale)) }))
export type NavigationPolicy = z.output<typeof NavigationPolicySchema>
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
export const normalizeNavigationTree = (input: unknown): NavigationPolicy['tree'] => {
  const rows = Array.isArray(input) ? input : []
  const trees = rows[0]?.kind ? [{ locale: 'en', items: rows }] : rows
  return trees.map(raw => {
    const tree = record(raw), locale = String(tree.locale || 'en')
    return { locale, items: (Array.isArray(tree.items) ? tree.items : []).filter(item => !(item?.kind === 'link' && item?.targetType === 'home')).map((raw, index) => {
      const item = record(raw)
      return { id: String(item.id || `legacy-${locale}-${index}`), kind: item.kind, label: item.label ?? '', icon: item.icon ?? '', targetType: item.targetType ?? 'page', target: item.target ?? '', visibilityMode: item.visibilityMode ?? 'all', visibilityGroups: item.visibilityGroups ?? [] } as NavigationItem
    }) }
  }).sort((a, b) => a.locale.localeCompare(b.locale))
}
export const navigationPolicyFromConfiguration = (configuration: Record<string, unknown>, tree: unknown): NavigationPolicy => {
  const nav = record(configuration.nav)
  const policy = { mode: (nav.mode ?? 'MIXED') as NavigationPolicy['mode'], expandParent: nav.expandParent !== false, tree: normalizeNavigationTree(tree) }
  const parsed = NavigationPolicySchema.safeParse(policy)
  return parsed.success ? parsed.data : policy
}
export const navigationVisibleItems = <T extends { visibilityMode?: unknown; visibilityGroups?: unknown }>(items: T[], groups: number[]): T[] =>
  items.filter(item => item.visibilityMode === 'all' || (item.visibilityMode === 'restricted' && Array.isArray(item.visibilityGroups) && item.visibilityGroups.some(id => groups.includes(id))))
export const navigationMenuItems = <T extends { kind?: unknown; targetType?: unknown; target?: unknown; visibilityMode?: unknown; visibilityGroups?: unknown }>(items: T[], groups: number[]): T[] => {
  const visible = navigationVisibleItems(items, groups).filter(item => item.kind === 'header' || item.kind === 'divider' || (item.kind === 'link' && navigationDestination(item.targetType, item.target)))
  const menu: T[] = []
  for (const [index, item] of visible.entries()) {
    if (item.kind === 'header') {
      let hasLink = false
      for (let next = index + 1; next < visible.length && visible[next]?.kind !== 'header'; next++) if (visible[next]?.kind === 'link') hasLink = true
      if (!hasLink) continue
    }
    if (item.kind === 'divider' && (!menu.length || ['divider', 'header'].includes(String(menu.at(-1)?.kind)))) continue
    menu.push(item)
  }
  while (menu.at(-1)?.kind === 'divider') menu.pop()
  return menu
}
export const navigationCacheKey = (locale: string, revision?: unknown): string => `nav:sidebar:${locale}${typeof revision === 'string' && revision ? ':' + revision : ''}`
export const navigationChangedFields = (before: NavigationPolicy, after: NavigationPolicy): string[] => {
  const fields = (['mode', 'expandParent'] as const).filter(key => before[key] !== after[key]) as string[]
  for (const locale of new Set([...before.tree, ...after.tree].map(tree => tree.locale)))
    if (JSON.stringify(before.tree.find(tree => tree.locale === locale)?.items ?? null) !== JSON.stringify(after.tree.find(tree => tree.locale === locale)?.items ?? null)) fields.push('locale:' + locale)
  return fields
}
export interface NavigationEvent { id: string; actorId: number | null; reason: string; fields: string[]; createdAt: string }
export interface NavigationWorkspace {
  policy: NavigationPolicy
  fingerprint: string
  history: NavigationEvent[]
  groups: { id: number; name: string }[]
  guestGroups: number[]
  locales: { code: string; name: string; nativeName: string; enabled: boolean }[]
  defaultLocale: string
  runtime: { state: 'applied' | 'needs-attention'; observedAt: string }
}
export interface NavigationWriteResult { activation: 'applied' | 'needs-attention' }
