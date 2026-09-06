import express from 'express'
import { editorWorkspace, saveEditorPolicy } from '../../operations/editors.ts'
import { errorStatus, getTransportRuntime, getWikiAuth } from '../_types.ts'
const router = express.Router()
router.use((req, res, next) => {
  res.set('Cache-Control', 'private, no-store')
  if (!getWikiAuth().checkAccess(req.user, ['manage:system'])) { res.status(403).json({ error: 'manage:system is required' }); return }
  next()
})
const fail = (res: express.Response, error: unknown) => {
  const status = errorStatus(error) ?? 500
  if (status >= 500) getTransportRuntime<{ logger: { warn(error: unknown): void } }>().logger.warn(error)
  res.status(status).json({ error: status >= 500 ? 'Editor settings could not be saved or loaded. Try again or check server logs.' : error instanceof Error ? error.message : String(error) })
}
router.get('/', async (req, res) => { try { res.json(await editorWorkspace(req.user)) } catch (error) { fail(res, error) } })
router.put('/', async (req, res) => { try { res.json(await saveEditorPolicy(req.user, req.body, req.body?.fingerprint)) } catch (error) { fail(res, error) } })
export default router
