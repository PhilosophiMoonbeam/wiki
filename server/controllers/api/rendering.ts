import express from 'express'
import { type Request, type Response, getWikiAuth, errorStatus, getTransportRuntime } from '../_types.ts'

import { readRenderingWorkspace, writeRenderingWorkspace, inspectRenderingOutput } from '../../operations/rendering-workspace.ts'
import renderingOperations from '../../operations/rendering.ts'

const router = express.Router()
router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next() })
const fail = (res: Response, error: unknown) => {
  const status = errorStatus(error) ?? 500
  if (status >= 500) getTransportRuntime<{ logger: { warn(error: unknown): void } }>().logger.warn(error)
  res.status(status).json({ error: status >= 500 ? 'Rendering request failed. Try again or check server logs.' : error instanceof Error ? error.message : String(error) })
}
router.get('/workspace', async (req, res) => { try { res.json(await readRenderingWorkspace(req.user)) } catch (error) { fail(res, error) } })
router.put('/workspace', async (req, res) => { try { res.json(await writeRenderingWorkspace(req.user, req.body?.modules, req.body?.fingerprint)) } catch (error) { fail(res, error) } })
router.get('/output/:id', async (req, res) => { try { res.json(await inspectRenderingOutput(req.user, Number(req.params.id))) } catch (error) { fail(res, error) } })


const requireSystemAccess = (req: Request, res: Response, json = false): boolean => { if (!getWikiAuth().checkAccess(req.user, ['manage:system'])) {
  if (json) res.status(403).json({ error: 'Forbidden' })
  else res.sendStatus(403)
  return false
}
return true }

router.get('/renderers', async (req, res, next) => {
  if (!requireSystemAccess(req, res)) return
  try {
    const renderers = await renderingOperations.listRenderers()
    res.json(renderers.map(renderer => ({
      isEnabled: renderer.isEnabled,
      key: renderer.key,
      title: renderer.title,
      description: typeof renderer.description === 'undefined' ? null : renderer.description,
      icon: typeof renderer.icon === 'undefined' ? null : renderer.icon,
      dependsOn: typeof renderer.dependsOn === 'undefined' ? null : renderer.dependsOn,
      input: typeof renderer.input === 'undefined' ? null : renderer.input,
      output: typeof renderer.output === 'undefined' ? null : renderer.output,
      config: renderer.config
    })))
  } catch (err) {
    next(err)
  }
})

router.post('/renderers', async (req, res) => {
  if (!requireSystemAccess(req, res, true)) return
  try {
    const body: unknown = req.body
    const renderers = typeof body === 'object' && body !== null && 'renderers' in body ? body.renderers : undefined
    await renderingOperations.updateRenderers(renderers)
    res.json({ message: 'Renderers updated successfully' })
  } catch (err) {
    fail(res, err)
  }
})

export default router
