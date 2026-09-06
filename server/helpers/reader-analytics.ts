import type { Knex } from 'knex'
import type { Request, Response } from 'express'
import type { AnalyticsRequestContext } from '../../shared/analytics-policy.ts'
import { emptyAnalyticsCode } from '../../shared/analytics-providers.ts'
import { readAnalyticsSnapshot, compileAnalyticsSnapshot } from '../repositories/analytics-runtime.ts'
import { recordAnalyticsResponse } from '../repositories/analytics-insights.ts'
export interface ReaderAnalyticsPage {
  id: number
  path: string
  visibility: 'public' | 'private'
}
interface Dependencies {
  db: Knex
  serverPath: string
  available(): ReadonlySet<string>
  fallback(): Record<string, unknown>
  isAdministrator(request: Request): boolean
  warn(message: string): void
  record?: typeof recordAnalyticsResponse
}
export const createReaderAnalytics =
  (deps: Dependencies) =>
  async (req: Request, res: Response, page: ReaderAnalyticsPage, published: boolean, protectedPage: boolean, spaEligible: boolean): Promise<boolean> => {
    res.locals.analyticsCode = emptyAnalyticsCode()
    if (req.method !== 'GET' || !published || page.visibility !== 'public' || protectedPage) return spaEligible
    try {
      const context: AnalyticsRequestContext = {
        method: req.method,
        reader: true,
        published,
        visibility: page.visibility,
        protected: protectedPage,
        path: page.path,
        signedIn: Boolean(req.user && req.user.id !== 2),
        administrator: deps.isAdministrator(req),
        privacySignal: req.get('DNT') === '1' || req.get('Sec-GPC') === '1',
        prefetch: /prefetch|prerender/i.test([req.get('Purpose'), req.get('Sec-Purpose'), req.get('X-Purpose')].join(' ')),
        offline: false
      }
      const snapshot = await readAnalyticsSnapshot(deps.db, deps.fallback())
      const compiled = await compileAnalyticsSnapshot(snapshot, context, deps.serverPath, deps.available())
      res.locals.analyticsCode = compiled.code
      // External scripts must be destroyed before entering another page, especially an excluded one.
      const spaNavigation = spaEligible && !compiled.hasExternalCode
      // A navigation probe that will trigger a full load is not a second reader response.
      if (compiled.decision.local && !(req.get('X-Wiki-Navigation') === '1' && !spaNavigation)) {
        res.once('finish', () => {
          if (res.statusCode !== 200 || !res.writableFinished) return
          void (deps.record ?? recordAnalyticsResponse)(deps.db, page.id, context).catch(() => deps.warn('A reader analytics counter could not be recorded.'))
        })
      }
      return spaNavigation
    } catch {
      deps.warn('Reader analytics is unavailable; the page was served without collection.')
      res.locals.analyticsCode = emptyAnalyticsCode()
      return spaEligible
    }
  }
export const prepareReaderAnalytics = async (
  req: Request,
  res: Response,
  page: ReaderAnalyticsPage,
  published: boolean,
  protectedPage: boolean,
  spaEligible: boolean
): Promise<boolean> => {
  const wiki = WIKI as unknown as {
    models: { knex: Knex }
    SERVERPATH: string
    config: Record<string, unknown>
    data: { analytics: Array<{ key: string; isAvailable?: boolean }> }
    auth: { checkAccess(user: Request['user'], permissions: string[]): boolean }
    logger: { warn(message: string): void }
  }
  return createReaderAnalytics({
    db: wiki.models.knex,
    serverPath: wiki.SERVERPATH,
    fallback: () => wiki.config,
    available: () => new Set(wiki.data.analytics.filter(row => row.isAvailable).map(row => row.key)),
    isAdministrator: request => wiki.auth.checkAccess(request.user, ['manage:system']),
    warn: message => wiki.logger?.warn(message)
  })(req, res, page, published, protectedPage, spaEligible)
}
