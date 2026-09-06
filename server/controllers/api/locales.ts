import { getLocaleAdministrationStore } from '../../operations/locale-administration.ts'
import express from 'express'
import { errorStatus, objectValue, type Request, type Response, getWikiAuth } from '../_types.ts'
import localizationOperations from '../../operations/localization.ts'

const router = express.Router()


const requireSystemAccess = (req: Request, res: Response): boolean => { res.set('Cache-Control', 'no-store'); if (!getWikiAuth().checkAccess(req.user, ['manage:system'])) {
  res.status(403).json({ error: 'manage:system is required' })
  return false
}

return true }

const localeError = (res: Response, error: unknown) => {
  const status = errorStatus(error), expected = status && [400, 403, 409].includes(status)
  return res.status(expected ? status : 500).json({ error: expected && error instanceof Error ? error.message : 'Locale administration is temporarily unavailable. Reload to confirm the saved state.' })
}
router.get('/workspace', async (req, res) => {
  if (!requireSystemAccess(req, res)) return
  try { res.json(await getLocaleAdministrationStore().inspect(req.user)) } catch (error) { localeError(res, error) }
})
router.put('/workspace', async (req, res) => {
  if (!requireSystemAccess(req, res)) return
  try { res.json(await getLocaleAdministrationStore().save(req.user, { policy: objectValue(req.body, 'policy'), fingerprint: objectValue(req.body, 'fingerprint'), reason: objectValue(req.body, 'reason') })) } catch (error) { localeError(res, error) }
})
router.post('/workspace/activate', async (req, res) => {
  if (!requireSystemAccess(req, res)) return
  try { res.json(await getLocaleAdministrationStore().initialize(req.user, objectValue(req.body, 'fingerprint'))) } catch (error) { localeError(res, error) }
})
router.post('/workspace/operations', async (req, res) => {
  if (!requireSystemAccess(req, res)) return
  try { res.status(202).json(await getLocaleAdministrationStore().enqueue(req.user, { kind: objectValue(req.body, 'kind'), code: objectValue(req.body, 'code'), fingerprint: objectValue(req.body, 'fingerprint'), reason: objectValue(req.body, 'reason') })) } catch (error) { localeError(res, error) }
})

router.get('/', async (req, res, next) => {
  try {
    res.json(await localizationOperations.listLocales())
  } catch (err) {
    next(err)
  }
})

router.get('/config', async (req, res) => {
  if (!requireSystemAccess(req, res)) {
    return
  }

  try { return res.json((await getLocaleAdministrationStore().inspect(req.user)).policy) } catch (error) { return localeError(res, error) }
})

router.post('/config', async (req, res) => {
  if (!requireSystemAccess(req, res)) {
    return
  }

  try {
    await localizationOperations.updateConfig(req.body, req.user)
    return res.json({ message: 'Locale config updated' })
  } catch (err) {
    return localeError(res, err)
  }
})

router.post('/:code/download', async (req, res) => {
  if (!requireSystemAccess(req, res)) {
    return
  }

  try {
    const result = await localizationOperations.download(req.params && req.params.code, req.user)
    return res.status(202).json({ ...result, message: 'Language package installation queued. Inspect the Locale workspace for its result.' })
  } catch (err) {
    return localeError(res, err)
  }
})

router.get('/:code/strings', async (req, res) => {
  const namespace = req.query.namespace
  if (typeof namespace !== 'string' || namespace.length < 1) {
    return res.status(400).json({ error: 'namespace query parameter is required' })
  }

  try {
    return res.json(await localizationOperations.getTranslations({
      locale: req.params.code,
      namespace
    }))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return res.status(404).json({ error: message })
  }
})

export default router
