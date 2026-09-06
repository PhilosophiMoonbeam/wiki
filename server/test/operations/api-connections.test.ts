import { afterEach, beforeEach, describe, expect, it, vi } from '../bun-test.mts'
import createKnex, { type Knex } from 'knex'
import { describeApiConnections, describeApiKeyGrant } from '../../operations/api-connections.ts'
import { apiKeyState } from '../../../shared/api-admin.ts'
let knex: Knex
beforeEach(async () => {
  knex = createKnex({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true })
  await knex.schema.createTable('groups', table => { table.integer('id'); table.string('name'); table.text('permissions'); table.text('pageRules') })
  await knex('groups').insert([{ id: 3, name: 'Integrations', permissions: '["read:pages","use:mcp"]', pageRules: '[{"path":"team","match":"START"}]' }, { id: 2, name: 'Guests', permissions: '[]', pageRules: '[]' }])
  Reflect.set(globalThis, 'WIKI', { config: { host: 'https://wiki.example.test', agents: { mcp: { enabled: true } } }, models: { knex } })
})
afterEach(async () => { await knex.destroy(); Reflect.deleteProperty(globalThis, 'WIKI'); vi.resetModules() })
describe('API connection inspection', () => {
  it('projects configured MCP resource and usable group metadata without keys or members', async () => {
    expect(await describeApiConnections()).toEqual({ mcpEnabled: true, mcpResource: 'https://wiki.example.test/mcp', mcpConfigurationError: false, groups: [{ id: 3, name: 'Integrations', permissions: ['read:pages', 'use:mcp'], pageRuleCount: 1, pageRules: [{ path: 'team', match: 'START', deny: false, roles: [], locales: [] }] }] })
  })
  it('marks an invalid canonical origin unavailable rather than inventing a resource', async () => {
    Reflect.set(globalThis, 'WIKI', { config: { host: 'https://wiki.example.test/subpath' }, models: { knex } })
    expect(await describeApiConnections()).toMatchObject({ mcpEnabled: false, mcpResource: null, mcpConfigurationError: true })
  })
  it('limits decoded token metadata to the issued grant and preserves unknown legacy data', () => {
    const claims = { grp: 3, mcpResource: 'https://wiki.example.test/mcp', mcpResourceVersion: 1, sensitive: 'not returned' }
    const token = `${Buffer.from('{"alg":"RS256"}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`
    expect(describeApiKeyGrant(token)).toEqual({ groupId: 3, mcpResource: claims.mcpResource, mcpResourceVersion: 1 })
    for (const invalid of ['malformed', null, '', 3]) expect(describeApiKeyGrant(invalid)).toEqual({ groupId: null, mcpResource: null, mcpResourceVersion: null })
  })
  it('classifies expiry exactly at the boundary without treating invalid dates as active', () => {
    const now = Date.parse('2026-09-06T12:00:00Z')
    expect(apiKeyState({ isRevoked: false, expiration: new Date(now).toISOString() }, now)).toBe('expired')
    expect(apiKeyState({ isRevoked: false, expiration: new Date(now + 1000).toISOString() }, now)).toBe('active')
    expect(apiKeyState({ isRevoked: true, expiration: 'bad' }, now)).toBe('revoked')
    expect(apiKeyState({ isRevoked: false, expiration: 'bad' }, now)).toBe('unknown')
  })
})
