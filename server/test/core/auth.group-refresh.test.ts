import { DateTime } from 'luxon'
import { afterAll, describe, expect, it, vi } from '../bun-test.mts'
import auth from '../../core/auth.ts'
const originalWiki = globalThis.WIKI
const original = { groups: auth.groups, tagAliases: auth.tagAliases, guest: auth.guest }
afterAll(() => {
  globalThis.WIKI = originalWiki
  Object.assign(auth, original)
})
describe('group authorization cache refresh', () => {
  it('removes stale policy and expires the Guest cache when a refresh fails, then recovers', async () => {
    const group = { id: 3, permissions: ['read:pages'], pageRules: [{ match: 'START', path: '', roles: ['read:pages'], deny: false, locales: [] }] }
    const query = vi.fn().mockRejectedValueOnce(new Error('Database unavailable')).mockResolvedValue([group])
    globalThis.WIKI = {
      config: {},
      configSvc: {},
      events: {},
      lang: {},
      logger: {},
      startedAt: {},
      models: { groups: { query }, tags: { query: async () => [] } }
    } as never
    auth.groups = { '3': group } as never
    auth.tagAliases = { old: 'new' }
    auth.guest = { cacheExpiration: DateTime.utc().plus({ minutes: 1 }) } as never
    const person = { id: 7, groups: [3], permissions: ['read:pages'] },
      page = { path: 'docs', locale: 'en', tags: [] }
    expect(auth.checkAccess(person, ['read:pages'], page)).toBe(true)
    await expect(auth.reloadGroups()).rejects.toThrow('Database unavailable')
    expect(auth.groups).toEqual({})
    expect(auth.tagAliases).toEqual({})
    expect(auth.guest.cacheExpiration < DateTime.utc()).toBe(true)
    expect(auth.checkAccess(person, ['read:pages'], page)).toBe(false)
    await auth.reloadGroups()
    expect(auth.checkAccess(person, ['read:pages'], page)).toBe(true)
  })
})
