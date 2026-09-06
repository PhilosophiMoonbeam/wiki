import express from 'express'
import { errorStatus, getTransportRuntime, getWikiAuth, objectValue } from '../_types.ts'
import webhookOperations from '../../operations/webhooks.ts'

const router = express.Router()

const requireSystemAccess = (req: express.Request, res: express.Response): boolean => {
  res.set('Cache-Control', 'private, no-store')
  if (getWikiAuth().checkAccess(req.user, ['manage:system'])) return true
  res.status(403).json({ error: 'manage:system is required' })
  return false
}

const body = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

const message = (error: unknown): string => error instanceof Error ? error.message : String(error)
const sendError = (res: express.Response, error: unknown): express.Response => {
  const status = errorStatus(error) ?? (error instanceof TypeError ? 400 : 500)
  if (status >= 500) getTransportRuntime<{ logger?: { warn(error: unknown): void } }>().logger?.warn(error)
  return res.status(status).json({ error: status >= 500 ? 'The webhook operation could not be completed. Retry or check server logs.' : message(error) })
}

router.get('/', async (req, res) => {
  if (!requireSystemAccess(req, res)) return
  try {
    res.json(await webhookOperations.list())
  } catch (error) {
    sendError(res, error)
  }
})

router.post('/', async (req, res) => {
  if (!requireSystemAccess(req, res)) return
  try {
    res.status(201).json(await webhookOperations.create(body(req.body)))
  } catch (error) {
    sendError(res, error)
  }
})

router.put('/:id', async (req, res) => {
  if (!requireSystemAccess(req, res)) return
  try {
    await webhookOperations.update(String(objectValue(req.params, 'id') ?? ''), body(req.body))
    res.sendStatus(204)
  } catch (error) {
    sendError(res, error)
  }
})

router.delete('/:id', async (req, res) => {
  if (!requireSystemAccess(req, res)) return
  try {
    await webhookOperations.remove(String(objectValue(req.params, 'id') ?? ''))
    res.sendStatus(204)
  } catch (error) {
    sendError(res, error)
  }
})

router.post('/:id/rotate-secret', async (req, res) => {
  if (!requireSystemAccess(req, res)) return
  try {
    const secret = await webhookOperations.rotateSecret(String(objectValue(req.params, 'id') ?? ''))
    res.json({ secret })
  } catch (error) {
    sendError(res, error)
  }
})

router.post('/:id/test', async (req, res) => {
  if (!requireSystemAccess(req, res)) return
  try {
    const deliveryId = await webhookOperations.sendTest(String(objectValue(req.params, 'id') ?? ''))
    res.status(202).json({ deliveryId })
  } catch (error) {
    sendError(res, error)
  }
})

router.get('/:id/deliveries', async (req, res) => {
  if (!requireSystemAccess(req, res)) return
  try {
    res.json(await webhookOperations.listDeliveries(String(objectValue(req.params, 'id') ?? '')))
  } catch (error) {
    sendError(res, error)
  }
})

router.post('/deliveries/:id/retry', async (req, res) => {
  if (!requireSystemAccess(req, res)) return
  try {
    await webhookOperations.changeDelivery(String(objectValue(req.params, 'id') ?? ''), 'retry')
    res.sendStatus(204)
  } catch (error) {
    sendError(res, error)
  }
})

router.post('/deliveries/:id/cancel', async (req, res) => {
  if (!requireSystemAccess(req, res)) return
  try {
    await webhookOperations.changeDelivery(String(objectValue(req.params, 'id') ?? ''), 'cancel')
    res.sendStatus(204)
  } catch (error) {
    sendError(res, error)
  }
})

export default router
