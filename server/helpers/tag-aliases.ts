export interface TagIdentity {
  id: number
  tag: string
  redirectToId?: number | null
  isArchived?: boolean | number
}

/** Resolve historical names without changing stored group rules or history labels. */
export const tagAliasMap = (tags: readonly TagIdentity[]): Record<string, string | null> => {
  const byId = new Map(tags.map(tag => [tag.id, tag]))
  const result: Record<string, string | null> = Object.create(null)
  for (const tag of tags) {
    if (tag.isArchived) {
      result[tag.tag] = null
      continue
    }
    let current = tag
    const visited = new Set<number>()
    while (current.redirectToId != null) {
      if (visited.has(current.id)) throw new Error('Taxonomy contains a redirect cycle')
      visited.add(current.id)
      const next = byId.get(current.redirectToId)
      if (!next || next.isArchived) throw new Error('Taxonomy alias has no active destination')
      current = next
    }
    result[tag.tag] = current.tag
  }
  return result
}

export const resolveTagName = (aliases: Record<string, string | null>, name: string): string | null =>
  Object.hasOwn(aliases, name) ? aliases[name] ?? null : name
