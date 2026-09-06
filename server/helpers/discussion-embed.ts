const js = (value: unknown): string => JSON.stringify(String(value)).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
const attr = (value: string): string => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const baseUrl = (value: unknown): string => {
  const url = new URL(String(value))
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Discussion provider requires an HTTP or HTTPS base URL without credentials, query or fragment.')
  return url.href.replace(/\/+$/, '')
}
export const buildDiscussionEmbed = (key: string, config: Record<string, unknown>, pageId: number, pageUrl: string) => {
  if (key === 'artalk') {
    const server = baseUrl(config.server)
    return { main: '<div id="artalk-container"></div>', head: `<link href="${attr(server)}/dist/Artalk.css" rel="stylesheet"><script src="${attr(server)}/dist/Artalk.js"></script>`, body: `<script>window.addEventListener('load', function () { Artalk.init({el:'#artalk-container',pageKey:${js(pageId)},pageTitle:'',server:${js(server)},site:${js(config.siteName ?? '')}}); });</script>` }
  }
  if (key === 'commento') {
    const server = baseUrl(config.instanceUrl)
    return { main: '<div id="commento"></div>', head: '', body: `<script>window.addEventListener('load', function () { var s=document.createElement('script'); s.src=${js(`${server}/js/commento.js`)}; s.defer=true; s.setAttribute('data-auto-init','true'); document.head.appendChild(s); });</script>` }
  }
  if (key === 'disqus') {
    if (typeof config.accountName !== 'string' || !/^[a-z0-9][a-z0-9-]{0,49}$/i.test(config.accountName)) throw new Error('Discussion provider requires a valid Disqus shortname.')
    return { main: '<div id="disqus_thread"></div>', head: '', body: `<script>var disqus_config=function(){this.page.url=${js(pageUrl)};this.page.identifier=${js(pageId)};};(function(){var s=document.createElement('script');s.src=${js(`https://${config.accountName}.disqus.com/embed.js`)};s.setAttribute('data-timestamp',+new Date());document.head.appendChild(s);})();</script>` }
  }
  throw new Error('Unsupported external discussion provider.')
}
