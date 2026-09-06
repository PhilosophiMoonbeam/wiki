export interface RelevanceCase {
  name: string
  query: string
  expected: readonly number[]
  options?: { locale?: string; path?: string; pageIds?: number[]; limit?: number }
}
export const SEARCH_RELEVANCE_CASES: readonly RelevanceCase[] = [
  { name: 'exact title', query: 'Amber Falcon Runbook', expected: [42] },
  { name: 'content terms', query: 'ultraviolet marmot checksum', expected: [42] },
  { name: 'typo', query: 'celestal harbor handbook', expected: [314] },
  { name: 'path', query: 'knowledge/topic-42/page-42', expected: [42] },
  { name: 'description', query: 'deterministic actuator calibration', expected: [2718] },
  { name: 'related concepts', query: 'checksum recovery', expected: [42] },
  { name: 'abbreviation gap', query: 'AFR', expected: [42] },
  { name: 'paraphrase gap', query: 'restore the ultraviolet verification code', expected: [42] },
  { name: 'selected page and tag', query: 'common-platform', expected: [19000], options: { pageIds: [19000] } },
  { name: 'locale and section', query: 'common-platform', expected: [19000], options: { locale: 'fr', path: 'knowledge/topic-0/page-19000' } },
  { name: 'authorized tail beyond ordinary cap', query: 'common-platform', expected: [19000], options: { pageIds: [19000], limit: 5 } }
]
export const relevanceMetrics = (resultIds: readonly number[], expected: readonly number[], k = 5) => {
  const expectedIds = new Set(expected)
  const top = [...new Set(resultIds)].slice(0, k)
  const hits = top.filter(id => expectedIds.has(id)).length
  const first = top.findIndex(id => expectedIds.has(id))
  const dcg = top.reduce((sum, id, index) => sum + (expectedIds.has(id) ? 1 / Math.log2(index + 2) : 0), 0)
  const ideal = Array.from({ length: Math.min(expectedIds.size, k) }, (_, index) => 1 / Math.log2(index + 2)).reduce((sum, value) => sum + value, 0)
  return { recallAt5: expectedIds.size ? hits / expectedIds.size : 1, reciprocalRankAt5: first < 0 ? 0 : 1 / (first + 1), ndcgAt5: ideal ? dcg / ideal : 1, zeroResults: resultIds.length === 0 }
}
export const evaluateSearchRelevance = async (search: (query: string, options: NonNullable<RelevanceCase['options']>) => Promise<{ results: { id: number }[] }>) => {
  const cases: Array<{ name: string; query: string; expected: readonly number[]; top5: number[]; p95Milliseconds: number; scopeViolations: number[] } & ReturnType<typeof relevanceMetrics>> = []
  for (const fixture of SEARCH_RELEVANCE_CASES) {
    const durations = []
    let ids: number[] = []
    for (let sample = 0; sample < 5; sample++) {
      const start = performance.now()
      ids = (await search(fixture.query, fixture.options ?? {})).results.map(row => row.id)
      durations.push(performance.now() - start)
    }
    const scopeViolations = fixture.options?.pageIds ? ids.filter(id => !fixture.options?.pageIds?.includes(id)) : []
    if (scopeViolations.length) throw new Error(`Search scope violation in ${fixture.name}`)
    cases.push({ name: fixture.name, query: fixture.query, expected: fixture.expected, top5: ids.slice(0, 5), ...relevanceMetrics(ids, fixture.expected), p95Milliseconds: Math.max(...durations), scopeViolations })
  }
  const mean = (field: 'recallAt5' | 'reciprocalRankAt5' | 'ndcgAt5') => cases.reduce((sum, row) => sum + row[field], 0) / cases.length
  return { corpus: 'Seeded 20,000-page PostgreSQL benchmark; explicit allowed IDs model the result of permission evaluation.', cases, recallAt5: mean('recallAt5'), meanReciprocalRankAt5: mean('reciprocalRankAt5'), meanNdcgAt5: mean('ndcgAt5'), zeroResultRate: cases.filter(row => row.zeroResults).length / cases.length }
}
