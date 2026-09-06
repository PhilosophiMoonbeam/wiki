import express from 'express'
import { type Request, type Response, getWikiAuth, errorStatus } from '../_types.ts'
import { storageRecord } from '../../repositories/storage-configuration.ts'
import { getStorageWorkspaceStore } from '../../operations/storage-workspace-runtime.ts'
const router = express.Router()
const authorized = (req: Request, res: Response): boolean => {
  res.set('Cache-Control', 'no-store')
  if (getWikiAuth().checkAccess(req.user, ['manage:system'])) return true
  res.status(403).json({ error: 'System administration is required.' })
  return false
}
const failed = (res: Response, error: unknown) => {
  const status = errorStatus(error),
    expected = status && [400, 403, 404, 409].includes(status)
  return res.status(expected ? status : 503).json({
    error:
      expected && error instanceof Error ? error.message : 'Storage administration is unavailable. Reload to confirm saved settings and operation outcomes.'
  })
}
router.get('/workspace', async (req, res) => {
  if (!authorized(req, res)) return
  try {
    res.json(await getStorageWorkspaceStore().inspect(req.user))
  } catch (error) {
    failed(res, error)
  }
})
router.put('/workspace', async (req, res) => {
  if (!authorized(req, res)) return
  try {
    const { apply, ...draft } = storageRecord(req.body)
    if (typeof apply !== 'boolean') return res.status(400).json({ error: 'Choose whether to apply the saved settings.' })
    res.json(await getStorageWorkspaceStore().save(req.user, draft, apply))
  } catch (error) {
    failed(res, error)
  }
})
router.post('/operations', async (req, res) => {
  if (!authorized(req, res)) return
  try {
    res.status(202).json(await getStorageWorkspaceStore().actions.enqueue(req.user, req.body))
  } catch (error) {
    failed(res, error)
  }
})
for (const kind of ['cancel', 'resolve'] as const)
  router.post(`/operations/:id/${kind}`, async (req, res) => {
    if (!authorized(req, res)) return
    try {
      await getStorageWorkspaceStore().actions.decide(req.user, { ...storageRecord(req.body), id: req.params.id }, kind)
      res.json({ id: req.params.id, state: kind === 'cancel' ? 'cancelled' : 'resolved' })
    } catch (error) {
      failed(res, error)
    }
  })
// The previous private endpoints cannot bypass immutable review or execute synchronous effects.
const retired = async (req: Request, res: Response) => {
  if (!authorized(req, res)) return
  try {
    await getStorageWorkspaceStore().configuration.inspect(req.user)
    res.status(410).json({ error: 'Storage now uses reviewed workspace operations. Reload Administration or use /_api/storage/workspace.' })
  } catch (error) {
    failed(res, error)
  }
}
router.get('/targets', retired)
router.get('/status', retired)
router.put('/targets', retired)
router.post('/actions/execute', retired)
export default router
