export type TaxonomyState = 'active' | 'alias' | 'archived'
export interface TaxonomyTag {
  id: number
  tag: string
  title: string
  createdAt: string
  updatedAt: string
  redirectToId: number | null
  isArchived: boolean
  pageCount: number
  historyCount: number
  ruleCount: number
}
export interface TaxonomyPage {
  id: number
  title: string
  path: string
  locale: string
  visibility: 'public' | 'private'
  sourceRevision: string
}
export interface TaxonomyRuleImpact {
  groupId: number
  groupName: string
  path: string
  deny: boolean
  roles: string[]
  locales: string[]
  before: number
  after: number
  added: number
  removed: number
}
export interface TaxonomyInspection {
  tag: TaxonomyTag
  aliases: TaxonomyTag[]
  pages: TaxonomyPage[]
  rules: TaxonomyRuleImpact[]
}
export type TaxonomyChange =
  | { action: 'edit'; tagId: number; tag: string; title: string }
  | { action: 'merge'; tagId: number; targetId: number }
  | { action: 'archive' | 'restore'; tagId: number }
export interface TaxonomyPreview {
  fingerprint: string
  change: TaxonomyChange
  source: TaxonomyTag
  destination: TaxonomyTag | null
  pages: TaxonomyPage[]
  aliases: TaxonomyTag[]
  rules: TaxonomyRuleImpact[]
  accessChanges: boolean
  pageCount: number
}
export interface TaxonomyResult {
  tagId: number
  pageCount: number
  refreshWarnings: string[]
}
export const taxonomyState = (tag: Pick<TaxonomyTag, 'isArchived' | 'redirectToId'>): TaxonomyState => tag.isArchived ? 'archived' : tag.redirectToId === null ? 'active' : 'alias'
