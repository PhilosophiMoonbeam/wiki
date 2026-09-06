import { describe, expect, it } from '../bun-test.mts'
import { searchExcerpt } from '../../helpers/search-excerpt.ts'
describe('source preview excerpts', () => {
  it('returns bounded plain text around a query and excludes invisible executable content', () => {
    const render = `<script>credential</script><style>private</style><p hidden>hidden</p><p>${'Opening words. '.repeat(300)}</p><p>Orbital calibration &amp; testing.</p><p>${'Later words. '.repeat(300)}</p>`
    const result = searchExcerpt(render, 'orbital calibration')
    expect(result.excerpt).toContain('Orbital calibration & testing.')
    expect(result.excerpt).not.toMatch(/credential|private|hidden|<p>/)
    expect(result.excerpt.length).toBeLessThanOrEqual(2400)
    expect(result.excerptTruncated).toBe(true)
  })
  it('keeps paragraphs readable and reports complete short content', () => {
    expect(searchExcerpt('<h1><a class="toc-anchor" href="#title">¶</a>Title</h1><p>First</p><p>Second</p>', '')).toEqual({ excerpt: 'Title\n\nFirst\n\nSecond', excerptTruncated: false })
  })
})
