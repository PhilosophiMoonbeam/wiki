import express from 'express'
import { errorStatus, objectValue, type Request, type Response, getWikiAuth } from '../_types.ts'
import analyticsOperations from '../../operations/analytics.ts'
import { getAnalyticsAdministrationStore } from '../../operations/analytics-administration.ts'
const router = express.Router()
const requireSystemAccess = (req: Request, res: Response): boolean => {
  res.set('Cache-Control', 'no-store')
  if (!getWikiAuth().checkAccess(req.user, ['manage:system'])) {
    res.status(403).json({ error: 'manage:system is required' })
    return false
  }
  return true
}
const respondError = (res: Response, error: unknown) => {
  const status = errorStatus(error),
    expected = status && [400, 403, 409].includes(status)
  return res.status(expected ? status : 500).json({
    error: expected && error instanceof Error ? error.message : 'Analytics administration is temporarily unavailable. Reload to confirm saved settings.'
  })
}
router.get('/workspace', async (req, res) => {
  if (!requireSystemAccess(req, res)) return
  try {
    res.json(await getAnalyticsAdministrationStore().inspect(req.user, req.query?.days === undefined ? undefined : Number(req.query.days)))
  } catch (error) {
    respondError(res, error)
  }
})
router.put('/workspace', async (req, res) => {
  if (!requireSystemAccess(req, res)) return
  try {
    res.json(await getAnalyticsAdministrationStore().save(req.user, req.body))
  } catch (error) {
    respondError(res, error)
  }
})
router.post('/workspace/erase', async (req, res) => {
  if (!requireSystemAccess(req, res)) return
  try {
    res.json(await getAnalyticsAdministrationStore().erase(req.user, req.body))
  } catch (error) {
    respondError(res, error)
  }
})
router.get('/providers', async (req, res) => {
  if (!requireSystemAccess(req, res)) return
  try {
    res.json(await analyticsOperations.listProviders(req.query.isEnabled === 'true' ? true : req.query.isEnabled === 'false' ? false : undefined, req.user))
  } catch (error) {
    respondError(res, error)
  }
})
router.post('/providers', async (req, res) => {
  if (!requireSystemAccess(req, res)) return
  try {
    await analyticsOperations.updateProviders(objectValue(req.body, 'providers'), req.user)
    res.json({ message: 'Providers updated successfully' })
  } catch (error) {
    respondError(res, error)
  }
})
export default router
