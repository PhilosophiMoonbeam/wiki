import DOMPurify from 'dompurify'
export const buildStoredOutputPreview = (html: string, dark = false): string => {
  const body = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'object', 'embed', 'meta', 'link', 'base', 'audio', 'video', 'source'],
    FORBID_ATTR: ['style', 'href', 'src', 'srcset', 'poster', 'action', 'background'],
    ALLOW_DATA_ATTR: false
  })
  // Defense in depth: the caller also applies an empty iframe sandbox. No
  // authored URL or active content is needed to inspect document structure.
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;padding:28px;font:15px/1.8 system-ui,sans-serif;color:${dark ? '#e8e9e9' : '#25292b'};background:${dark ? '#202426' : '#fcfcfa'};overflow-wrap:anywhere}h1,h2,h3,h4,h5,h6{line-height:1.3;margin:1.5em 0 .6em}h1{font-size:1.8em}h2{font-size:1.45em}a{color:inherit;text-decoration:underline}pre{white-space:pre-wrap;background:${dark ? '#2b3033' : '#f0f1ee'};padding:16px;border-radius:6px}code{font-size:.85em}table{border-collapse:collapse;max-width:100%;display:block;overflow:auto}td,th{border:1px solid ${dark ? '#565b5d' : '#bbb'};padding:8px 12px}blockquote{border-left:3px solid #89908f;margin-left:0;padding-left:18px}.toc-anchor{display:none}img{display:none}hr{border:0;border-top:1px solid #89908f}</style></head><body>${body || '<p>No rendered HTML is stored for this page.</p>'}</body></html>`
}
