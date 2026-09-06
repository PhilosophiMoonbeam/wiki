import { patchLegacyGeneralConfiguration } from './general-administration.ts'
import { legacySecurityKeys, patchLegacySecurityConfiguration } from './security-administration.ts'
import type { PagePrincipal } from '../helpers/page-access.ts'
import { patchSiteFeatures } from './discussion-settings.ts'
import type { Knex } from 'knex'
import _ from 'lodash'
import { siteBannerOrDefault } from '../../shared/site-banner.ts'
import { normalizeAvailableEditors, validateAvailableEditors } from '../../shared/page-editors.ts'

import { updateEditorAvailability } from './editors.ts'
import errors from './errors.ts'

const { ApplicationError } = errors


interface SiteConfig extends Record<string, unknown> {
  banner?: unknown
  host: string
  title: string
  company: string
  contentLicense: unknown
  footerOverride: unknown
  logoUrl: string
  pageExtensions: string[]
  editors?: { available?: unknown }
  seo: Record<string, unknown>
  editShortcuts: Record<string, unknown>
  features: Record<string, unknown>
  security: Record<string, unknown>
  auth: Record<string, unknown>
  uploads: Record<string, unknown>
}

const config = WIKI.config as SiteConfig
const rejectManagedLogoWrite = async (args: Record<string, unknown>): Promise<void> => {
  if (!Object.hasOwn(args, 'logoUrl')) return
  const runtime = WIKI as unknown as { models?: { knex?: Knex } }
  const knex = runtime.models?.knex
  if (!knex) return
  const state = await knex<{ id: number; desiredRevisionId: string | null; activeRevisionId: string | null }>('siteLogoState')
    .where({ id: 1 })
    .first('desiredRevisionId', 'activeRevisionId')
  if (state && (state.desiredRevisionId !== null || state.activeRevisionId !== null)) {
    throw new ApplicationError('Managed logos can only be replaced through the dedicated logo API.', {
      code: 'MANAGED_LOGO_CONFLICT',
      status: 409
    })
  }
}

const getConfig = () => ({
  host: config.host,
  title: config.title,
  company: config.company,
  contentLicense: config.contentLicense,
  footerOverride: config.footerOverride,
  banner: siteBannerOrDefault(config.banner),
  logoUrl: config.logoUrl,
  pageExtensions: config.pageExtensions.join(', '),
  availableEditors: normalizeAvailableEditors(config.editors?.available),
  ...config.seo,
  ...config.editShortcuts,
  ...config.features,
  ...config.security,
  authAutoLogin: config.auth.autoLogin,
  authEnforce2FA: config.auth.enforce2FA,
  authHideLocal: config.auth.hideLocal,
  authLoginBgUrl: config.auth.loginBgUrl,
  authJwtAudience: config.auth.audience,
  authJwtExpiration: config.auth.tokenExpiration,
  authJwtRenewablePeriod: config.auth.tokenRenewal,
  uploadMaxFileSize: config.uploads.maxFileSize,
  uploadMaxFiles: config.uploads.maxFiles,
  uploadScanSVG: config.uploads.scanSVG,
  uploadForceDownload: config.uploads.forceDownload
})

const updateConfig = async (input: unknown, requester?: PagePrincipal): Promise<void> => {
  if (!_.isPlainObject(input)) {
    throw new ApplicationError('Site configuration payload must be an object.', { code: 'INVALID_SITE_CONFIGURATION' })
  }
  const args = input as Record<string, unknown>
  if (Object.keys(args).some(key => legacySecurityKeys.includes(key))) {
    await patchLegacySecurityConfiguration(requester, args)
    return
  }
  await rejectManagedLogoWrite(args)
  if (Object.hasOwn(args, 'logoUrl')) throw new ApplicationError('Use the dedicated logo API to publish a workspace logo.', { status: 400 })
  if (Object.hasOwn(args, 'availableEditors')) {
    if (Object.keys(args).length !== 1) throw new ApplicationError('Save editor availability separately from other workspace settings.', { status: 400 })
    const validation = validateAvailableEditors(args.availableEditors)
    if (!validation.ok) throw new ApplicationError(validation.message, { status: 400 })
    await updateEditorAvailability(validation.value)
    return
  }
  if (Object.hasOwn(args, 'featurePageComments')) {
    if (Object.keys(args).length !== 1 || typeof args.featurePageComments !== 'boolean') throw new ApplicationError('Save discussion availability separately with a boolean value.', { status: 400 })
    await patchSiteFeatures({ featurePageComments: args.featurePageComments })
    return
  }
  await patchLegacyGeneralConfiguration(requester, args)
}

export default { getConfig, updateConfig }
