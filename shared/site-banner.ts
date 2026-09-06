export const SITE_BANNER_TITLE_LIMIT = 160
export const SITE_BANNER_CONTENT_LIMIT = 8000

export type SiteBannerConfig = {
  isEnabled: boolean
  title: string
  content: string
  tone?: 'info' | 'warning' | 'critical'
  startsAt?: string | null
  endsAt?: string | null
}

type SiteBannerValidation =
  | { ok: true; value: SiteBannerConfig }
  | { ok: false; message: string }

const supportedFields: Record<string, true> = {
  isEnabled: true,
  title: true,
  content: true,
  tone: true,
  startsAt: true,
  endsAt: true
}

export const disabledSiteBanner = (): SiteBannerConfig => ({
  isEnabled: false,
  title: '',
  content: ''
})

export const validateSiteBanner = (input: unknown): SiteBannerValidation => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, message: 'Site banner must be an object.' }
  }
  const banner = input as Record<string, unknown>
  if (Object.keys(banner).some(field => supportedFields[field] !== true)) {
    return { ok: false, message: 'Site banner contains unsupported fields.' }
  }
  if (typeof banner.isEnabled !== 'boolean') {
    return { ok: false, message: 'Site banner enabled flag must be a boolean.' }
  }
  if (typeof banner.title !== 'string') {
    return { ok: false, message: 'Site banner title must be a string.' }
  }
  if (typeof banner.content !== 'string') {
    return { ok: false, message: 'Site banner content must be a string.' }
  }

  const title = banner.title.trim()
  const content = banner.content.trim()
  if (/\r|\n/.test(title)) {
    return { ok: false, message: 'Site banner title must be a single line.' }
  }
  if (title.length > SITE_BANNER_TITLE_LIMIT) {
    return { ok: false, message: `Site banner title cannot exceed ${SITE_BANNER_TITLE_LIMIT} characters.` }
  }
  if (content.length > SITE_BANNER_CONTENT_LIMIT) {
    return { ok: false, message: `Site banner content cannot exceed ${SITE_BANNER_CONTENT_LIMIT} characters.` }
  }
  if (content.includes('\0')) {
    return { ok: false, message: 'Site banner content contains invalid control characters.' }
  }
  if (banner.isEnabled && title.length === 0 && content.length === 0) {
    return { ok: false, message: 'An enabled site banner must have a title or content.' }
  }

  if (banner.tone !== undefined && (typeof banner.tone !== 'string' || !['info', 'warning', 'critical'].includes(banner.tone))) {
    return { ok: false, message: 'Choose an announcement tone.' }
  }
  for (const key of ['startsAt', 'endsAt']) {
    const date = banner[key]
    if (date !== undefined && date !== null && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().replace('.000Z', 'Z') !== date.replace('.000Z', 'Z'))) {
      return { ok: false, message: 'Announcement schedule must use valid UTC dates.' }
    }
  }
  if (typeof banner.startsAt === 'string' && typeof banner.endsAt === 'string' && Date.parse(banner.endsAt) <= Date.parse(banner.startsAt)) {
    return { ok: false, message: 'Announcement end must be after its start.' }
  }

  return {
    ok: true,
    value: {
      isEnabled: banner.isEnabled,
      title,
      content,
      ...(banner.tone === undefined ? {} : { tone: banner.tone as 'info' | 'warning' | 'critical' }),
      ...(banner.startsAt === undefined ? {} : { startsAt: banner.startsAt as string | null }),
      ...(banner.endsAt === undefined ? {} : { endsAt: banner.endsAt as string | null })
    }
  }
}

export const siteBannerOrDefault = (input: unknown): SiteBannerConfig => {
  const result = validateSiteBanner(input)
  return result.ok ? result.value : disabledSiteBanner()
}


export const siteBannerState = (banner: SiteBannerConfig, now = Date.now()): 'disabled' | 'scheduled' | 'ended' | 'visible' => {
  if (!banner.isEnabled || !(banner.title || banner.content)) return 'disabled'
  if (banner.endsAt && Date.parse(banner.endsAt) <= now) return 'ended'
  if (banner.startsAt && Date.parse(banner.startsAt) > now) return 'scheduled'
  return 'visible'
}

// Scheduled drafts are not exposed in the reader bootstrap before publication.
export const publicSiteBanner = (input: unknown, now = Date.now()): SiteBannerConfig => {
  const banner = siteBannerOrDefault(input)
  return siteBannerState(banner, now) === 'visible' ? banner : disabledSiteBanner()
}
