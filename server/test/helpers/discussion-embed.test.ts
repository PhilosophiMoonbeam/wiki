import { describe, expect, it } from '../bun-test.mts'
import { buildDiscussionEmbed } from '../../helpers/discussion-embed.ts'
describe('external discussion embed boundaries', () => {
  it('escapes executable context characters in site names and page URLs', () => {
    const dangerous = "'</script><script>alert(1)</script>\u2028"
    const artalk = buildDiscussionEmbed('artalk', { server: 'https://comments.example.invalid', siteName: dangerous }, 7, 'https://wiki.local/i/7')
    expect(artalk.body).not.toContain("'</script>"); expect(artalk.body).toContain('\\u003c/script>'); expect(artalk.body).toContain('\\u2028'); expect(artalk.body.match(/<script>/g)).toHaveLength(1)
    expect(buildDiscussionEmbed('disqus', { accountName: 'community' }, 7, dangerous).body.match(/<script>/g)).toHaveLength(1)
  })
  it('rejects credentials, executable schemes and invalid shortnames', () => {
    for (const server of ['javascript:alert(1)', 'https://user:pass@service.invalid', 'https://service.invalid/?secret=1', 'https://service.invalid/#fragment']) expect(() => buildDiscussionEmbed('artalk', { server }, 1, '')).toThrow()
    expect(() => buildDiscussionEmbed('disqus', { accountName: "a';alert(1)" }, 1, '')).toThrow()
  })
  it('normalizes a trailing slash without dropping a self-hosted base path', () => {
    const embed = buildDiscussionEmbed('commento', { instanceUrl: 'https://example.invalid/discussions/' }, 1, '')
    expect(embed.body).toContain('https://example.invalid/discussions/js/commento.js')
  })
})
