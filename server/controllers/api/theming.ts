import express from 'express'
import { type Request, type Response, getWikiAuth, errorStatus, objectValue } from '../_types.ts'
import themingOperations from '../../operations/theming.ts'
import { getThemeAdministrationStore } from '../../operations/theme-administration.ts'
const router = express.Router()
const canManageTheme = (req: Request): boolean => getWikiAuth().checkAccess(req.user, ['manage:theme', 'manage:system'])
const themeError = (res: Response, error: unknown) => {
  const status = errorStatus(error), expected = status && [400, 403, 409].includes(status)
  return res.status(expected ? status : 500).json({ error: expected && error instanceof Error ? error.message : 'Theme administration is temporarily unavailable. Reload to confirm saved settings.' })
}
router.get('/config', (req, res) => {
  if (!canManageTheme(req)) return res.sendStatus(403)
  res.set('Cache-Control', 'no-store')
  res.json(themingOperations.getConfig())
})
router.post('/config', async (req, res) => {
  if (!canManageTheme(req)) return res.status(403).json({ error: 'Forbidden' })
  res.set('Cache-Control', 'no-store')
  try {
    await themingOperations.updateConfig(req.body, req.user)
    res.json({ message: 'Theme config updated' })
  } catch (error) { themeError(res, error) }
})
router.get('/workspace', async (req, res) => {
  if (!canManageTheme(req)) return res.status(403).json({ error: 'Forbidden' })
  res.set('Cache-Control', 'no-store')
  try { res.json(await getThemeAdministrationStore().inspect(req.user)) } catch (error) { themeError(res, error) }
})
router.put('/workspace', async (req, res) => {
  if (!canManageTheme(req)) return res.status(403).json({ error: 'Forbidden' })
  res.set('Cache-Control', 'no-store')
  try {
    res.json(await getThemeAdministrationStore().save(req.user, {
      policy: objectValue(req.body, 'policy'), fingerprint: objectValue(req.body, 'fingerprint'), reason: objectValue(req.body, 'reason')
    }))
  } catch (error) { themeError(res, error) }
})
router.post('/workspace/activate', async (req, res) => {
  if (!canManageTheme(req)) return res.status(403).json({ error: 'Forbidden' })
  res.set('Cache-Control', 'no-store')
  try { res.json(await getThemeAdministrationStore().initialize(req.user, objectValue(req.body, 'fingerprint'))) } catch (error) { themeError(res, error) }
})
export default router
