import { afterAll, describe, expect, it, vi } from '../bun-test.mts'
import { configureTransportRuntime } from '../../controllers/_types.ts'
const router = { get: vi.fn(), put: vi.fn(), post: vi.fn(), use: vi.fn() },
  minimum = vi.fn()
vi.mockModule('express', import.meta.url, () => ({ default: { Router: () => router } }))
vi.mockModule('../../operations/api.ts', import.meta.url, () => ({ default: {} }))
vi.mockModule('../../helpers/password-policy.ts', import.meta.url, () => ({ readPasswordMinimum: minimum }))
await vi.importFresh('../../controllers/api/auth.ts', import.meta.url)
const handler = router.get.mock.calls.find(([path]) => path === '/password-policy')![1]!
const response = () => {
  const res = { set: vi.fn(), status: vi.fn(), json: vi.fn() }
  res.status.mockReturnValue(res)
  return res
}
afterAll(() => configureTransportRuntime({}))
describe('Public password requirements', () => {
  it('returns the current public minimum without requiring an authenticated account or exposing configuration', async () => {
    const knex = () => {}
    configureTransportRuntime({ models: { knex } })
    minimum.mockResolvedValue(24)
    const res = response()
    await handler({}, res)
    expect(minimum).toHaveBeenCalledWith(knex)
    expect(res.json).toHaveBeenCalledWith({ minimum: 24, maximumBytes: 72 })
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store')
  })
  it('reports an unavailable policy without exposing database errors', async () => {
    configureTransportRuntime({ models: { knex: {} } })
    minimum.mockRejectedValue(new Error('private database configuration'))
    const res = response()
    await handler({}, res)
    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.json).toHaveBeenCalledWith({ error: 'Password requirements are temporarily unavailable.' })
  })
})
