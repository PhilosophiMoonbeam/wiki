import express from 'express'
import taxonomy from '../../operations/taxonomy.ts'
import { errorStatus, getTransportRuntime, getWikiAuth } from '../_types.ts'

const router = express.Router()
router.use((req, res, next) => {
  res.set('Cache-Control', 'private, no-store')
  if (!getWikiAuth().checkAccess(req.user, ['manage:system'])) { res.status(403).json({ error: 'manage:system is required' }); return }
  next()
})
const actor = (req: express.Request) => ({ requester: req.user, sessionId: req.sessionID ?? '' })
const fail = (res: express.Response, error: unknown) => {
  const status = errorStatus(error) ?? 500
  if (status >= 500) getTransportRuntime<{ logger: { warn(error: unknown): void } }>().logger.warn(error)
  res.status(status).json({ error: status >= 500 ? 'The taxonomy operation could not be completed. Retry or check server logs.' : error instanceof Error ? error.message : String(error) })
}
router.get('/', async (req, res) => {
  try { res.json(await taxonomy().list(actor(req))) } catch (error) { fail(res, error) }
})
router.get('/:id', async (req, res) => {
  try { res.json(await taxonomy().inspect(actor(req), Number(req.params.id))) } catch (error) { fail(res, error) }
})
router.post('/', async (req, res) => {
  try { res.status(201).json(await taxonomy().create(actor(req), req.body)) } catch (error) { fail(res, error) }
})
router.post('/preview', async (req, res) => {
  try { res.json(await taxonomy().preview(actor(req), req.body)) } catch (error) { fail(res, error) }
})
router.post('/apply', async (req, res) => {
  try { res.json(await taxonomy().apply(actor(req), { change: req.body?.change, fingerprint: req.body?.fingerprint, acknowledgeAccess: req.body?.acknowledgeAccess })) } catch (error) { fail(res, error) }
})
export default router
