/** The editable policy is deliberately separate from unrelated site configuration. */
export interface SecurityPolicy {
  authPasswordMinLength: number
  authEnforce2FA: boolean
  authJwtAudience: string
  authJwtExpirationSeconds: number
  authJwtRenewalSeconds: number
  authAutoLogin: boolean
  authHideLocal: boolean
  authLoginBgUrl: string
  securityIframe: boolean
  securityReferrerPolicy: boolean
  securityOpenRedirect: boolean
  securityTrustProxy: boolean
  securityHSTS: boolean
  securityHSTSDuration: number
  securityHSTSIncludeSubDomains: boolean
  securityCSPMode: 'off' | 'report-only' | 'enforce'
  securityCSPDirectives: string
  uploadMaxFileSize: number
  uploadScanSVG: boolean
  uploadForceDownload: boolean
}
export const securityPolicyDefaults: SecurityPolicy = {
  authPasswordMinLength: 12,
  authEnforce2FA: false,
  authJwtAudience: 'urn:wiki.js',
  authJwtExpirationSeconds: 1800,
  authJwtRenewalSeconds: 1209600,
  authAutoLogin: false,
  authHideLocal: false,
  authLoginBgUrl: '',
  securityIframe: true,
  securityReferrerPolicy: true,
  securityOpenRedirect: true,
  securityTrustProxy: false,
  securityHSTS: false,
  securityHSTSDuration: 300,
  securityHSTSIncludeSubDomains: true,
  securityCSPMode: 'off',
  securityCSPDirectives: '',
  uploadMaxFileSize: 5242880,
  uploadScanSVG: true,
  uploadForceDownload: true
}
export const securityPolicyLabels: Record<keyof SecurityPolicy, string> = {
  authPasswordMinLength: 'Minimum password length',
  authEnforce2FA: 'Require workspace two-factor authentication',
  authJwtAudience: 'Token audience',
  authJwtExpirationSeconds: 'Token lifetime',
  authJwtRenewalSeconds: 'Expired-token renewal window',
  authAutoLogin: 'Automatic provider routing',
  authHideLocal: 'Local sign-in visibility',
  authLoginBgUrl: 'Sign-in background',
  securityIframe: 'Block page embedding',
  securityReferrerPolicy: 'Same-origin referrer policy',
  securityOpenRedirect: 'Normalize repeated request slashes',
  securityTrustProxy: 'Trust one proxy hop',
  securityHSTS: 'HTTPS browser memory',
  securityHSTSDuration: 'HTTPS memory duration',
  securityHSTSIncludeSubDomains: 'Include subdomains in HTTPS memory',
  securityCSPMode: 'Content Security Policy mode',
  securityCSPDirectives: 'Content Security Policy directives',
  uploadMaxFileSize: 'Maximum file size',
  uploadScanSVG: 'Sanitize SVG uploads',
  uploadForceDownload: 'Download non-image attachments'
}
export interface SecurityPolicyIssue {
  field: keyof SecurityPolicy | 'policy'
  message: string
}
export interface SecurityPolicyEvent {
  id: number
  actorId: number | null
  reason: string
  fields: Array<keyof SecurityPolicy>
  sessionsEnded: number
  createdAt: string
}
export interface SecurityWorkspace {
  policy: SecurityPolicy
  fingerprint: string
  host: string
  coverage: {
    activeAccounts: number
    formAccounts: number
    twoFactorEnrolled: number
    providerManagedAccounts: number
    unavailableProviderAccounts: number
    localAccounts: number
  }
  providers: Array<{ key: string; name: string; enabled: boolean; useForm: boolean; available: boolean }>
  runtime: { state: 'applied' | 'pending'; observedAt: string; policy: SecurityPolicy }
  history: SecurityPolicyEvent[]
}
export interface SecurityWriteResult {
  sessionsEnded: number
  currentSessionEnded: boolean
  activation: 'applied' | 'needs-attention'
}
const record = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v))
/** Textareas may use one directive per line; headers always receive a single canonical line. */
export const normalizeCspDirectives = (value: string): string =>
  value
    .replace(/\r\n/g, '\n')
    .split(/[;\n]+/)
    .map(v => v.trim().replace(/[\t ]+/g, ' '))
    .filter(Boolean)
    .join('; ')
export const validateSecurityPolicy = (value: unknown): { ok: true; value: SecurityPolicy } | { ok: false; issues: SecurityPolicyIssue[] } => {
  if (!record(value)) return { ok: false, issues: [{ field: 'policy', message: 'Enter a complete security policy.' }] }
  const issues: SecurityPolicyIssue[] = []
  const add = (field: keyof SecurityPolicy | 'policy', message: string) => issues.push({ field, message })
  if (Object.keys(value).some(key => !Object.hasOwn(securityPolicyDefaults, key))) add('policy', 'The security policy contains an unknown setting.')
  for (const [key, initial] of Object.entries(securityPolicyDefaults)) {
    if (typeof value[key] !== typeof initial)
      add(key as keyof SecurityPolicy, `Enter a valid ${securityPolicyLabels[key as keyof SecurityPolicy].toLowerCase()}.`)
  }
  const ranges: Array<[keyof SecurityPolicy, number, number]> = [
    ['authPasswordMinLength', 12, 64],
    ['authJwtExpirationSeconds', 60, 2592000],
    ['authJwtRenewalSeconds', 0, 31536000],
    ['securityHSTSDuration', 0, 63072000],
    ['uploadMaxFileSize', 0, 1073741824]
  ]
  for (const [key, min, max] of ranges)
    if (typeof value[key] === 'number' && (!Number.isSafeInteger(value[key]) || value[key] < min || value[key] > max))
      add(key, `${securityPolicyLabels[key]} must be a whole number from ${min.toLocaleString('en-US')} to ${max.toLocaleString('en-US')}.`)
  if (
    typeof value.authJwtAudience === 'string' &&
    (!value.authJwtAudience.trim() ||
      value.authJwtAudience.trim().length > 255 ||
      [...value.authJwtAudience].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))
  )
    add('authJwtAudience', 'Use a nonempty token audience of at most 255 characters without control characters.')
  if (typeof value.authLoginBgUrl === 'string') {
    const url = value.authLoginBgUrl.trim()
    if (
      url.length > 2048 ||
      [...url].some(char => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127 || char === '\\') ||
      (url && !/^\/(?!\/)/.test(url) && !/^https?:\/\//i.test(url))
    )
      add('authLoginBgUrl', 'Use an HTTP(S) URL or a workspace path without spaces, or leave the background empty.')
    else if (/^https?:/i.test(url)) {
      try {
        const parsed = new URL(url)
        if (parsed.username || parsed.password) add('authLoginBgUrl', 'Background URLs cannot include credentials.')
      } catch {
        add('authLoginBgUrl', 'Enter a valid background URL.')
      }
    }
  }
  if (!['off', 'report-only', 'enforce'].includes(String(value.securityCSPMode)))
    add('securityCSPMode', 'Choose Off, Report only or Enforce for Content Security Policy.')
  if (typeof value.securityCSPDirectives === 'string') {
    const raw = value.securityCSPDirectives.replace(/\r\n/g, '\n'),
      normalized = normalizeCspDirectives(raw)
    if (
      raw.length > 16384 ||
      [...raw].some(char => {
        const code = char.charCodeAt(0)
        return code !== 9 && code !== 10 && (code < 32 || code > 126)
      })
    )
      add('securityCSPDirectives', 'Use at most 16,384 ASCII characters without HTTP header control characters.')
    const names = normalized
      .split('; ')
      .filter(Boolean)
      .map(directive => directive.split(' ')[0]!)
    if (names.some(name => !/^[a-z][a-z0-9-]*$/.test(name)) || new Set(names).size !== names.length)
      add('securityCSPDirectives', 'Use each lowercase CSP directive once, separated by semicolons or newlines.')
    if (value.securityCSPMode !== 'off' && !normalized) add('securityCSPDirectives', 'Add directives before activating Content Security Policy.')
  }
  if (issues.length) return { ok: false, issues }
  return {
    ok: true,
    value: {
      ...(value as unknown as SecurityPolicy),
      authJwtAudience: String(value.authJwtAudience).trim(),
      authLoginBgUrl: String(value.authLoginBgUrl).trim(),
      securityCSPDirectives: normalizeCspDirectives(String(value.securityCSPDirectives))
    }
  }
}
export const securityChangedFields = (before: SecurityPolicy, after: SecurityPolicy): Array<keyof SecurityPolicy> =>
  (Object.keys(securityPolicyDefaults) as Array<keyof SecurityPolicy>).filter(key => before[key] !== after[key])
export const securityEndsSessions = (before: SecurityPolicy, after: SecurityPolicy): boolean =>
  ['authJwtAudience', 'authJwtExpirationSeconds', 'authJwtRenewalSeconds'].some(
    key => before[key as keyof SecurityPolicy] !== after[key as keyof SecurityPolicy]
  ) ||
  (!before.authEnforce2FA && after.authEnforce2FA)
/** Apply to new passwords only. Bcrypt's input boundary is measured in UTF-8 bytes. */
export const newPasswordIssue = (value: unknown, minimum = 12): string | null => {
  const min = Number.isSafeInteger(minimum) && minimum >= 12 && minimum <= 64 ? minimum : 12
  return typeof value !== 'string' || [...value].length < min || new TextEncoder().encode(value).length > 72
    ? `Use at least ${min} characters and at most 72 UTF-8 bytes for the password.`
    : null
}
