import { describe, expect, it } from '../../server/test/bun-test.mts'
import { renderFooterMarkdown } from './footer-markdown.ts'
describe('shared footer preview', () => {
  it('keeps inline formatting and images consistent with the reader footer', () => {
    const html = renderFooterMarkdown('**Knowledge** · [Home](/home) ![Mark](/mark.png)')
    expect(html).toContain('<strong>Knowledge</strong>'); expect(html).toContain('<a href="/home">Home</a>'); expect(html).toContain('<img src="/mark.png" alt="Mark">'); expect(renderFooterMarkdown('# Heading')).toBe('# Heading')
  })
  it('escapes raw HTML and rejects unsafe link and image protocols', () => {
    const html = renderFooterMarkdown('<script>alert(1)</script> [Run](javascript:alert(1)) ![Image](javascript:alert(1))')
    expect(html).not.toContain('<script>'); expect(html).not.toContain('href="javascript:'); expect(html).not.toContain('src="javascript:')
  })
})
