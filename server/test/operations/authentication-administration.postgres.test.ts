import knexModule, { type Knex } from 'knex'
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from '../bun-test.mts'
import { createAuthenticationAdministrationStore, normalizeAuthenticationDomains } from '../../operations/authentication-administration.ts'
import { up, down } from '../../db/migrations/tsepistle-000019-authentication-administration.ts'
import type { AuthenticationDefinition, AuthenticationProviderDraft } from '../../../shared/authentication-policy.ts'
const database = process.env.WIKI_TEST_POSTGRES_DATABASE ?? '',
  password = process.env.WIKI_TEST_POSTGRES_PASSWORD
const connection =
  database.endsWith('_auth_test') && password
    ? { host: '127.0.0.1', port: Number(process.env.WIKI_TEST_POSTGRES_PORT ?? 5432), user: 'wiki', database, password }
    : null
const suite = connection ? describe : describe.skip,
  admin = { id: 1, authVersion: 0 } as never
const definitions: AuthenticationDefinition[] = [
  { key: 'local', title: 'Local', description: 'Built in', available: true, useForm: true, website: '', fields: [] },
  {
    key: 'oidc',
    title: 'OpenID Connect',
    description: 'External identity',
    available: true,
    useForm: false,
    website: '',
    fields: [
      { key: 'issuer', title: 'Issuer', type: 'string', hint: '', default: '', sensitive: false, multiline: false, choices: [], order: 1 },
      { key: 'clientSecret', title: 'Client secret', type: 'string', hint: '', default: '', sensitive: true, multiline: false, choices: [], order: 2 },
      { key: 'mapGroups', title: 'Map groups', type: 'boolean', hint: '', default: false, sensitive: false, multiline: false, choices: [], order: 3 }
    ]
  }
]
const draft = (key = 'local'): AuthenticationProviderDraft => ({
  key,
  strategyKey: key === 'local' ? 'local' : 'oidc',
  displayName: key === 'local' ? 'Local' : 'Organization',
  description: '',
  isEnabled: key === 'local',
  selfRegistration: false,
  domainWhitelist: [],
  autoEnrollGroups: [],
  config: key === 'local' ? {} : { issuer: 'https://identity.example.invalid', mapGroups: false },
  secrets: key === 'local' ? {} : { clientSecret: { action: 'keep' } }
})
suite('PostgreSQL reviewed authentication administration', () => {
  let db: Knex, store: ReturnType<typeof createAuthenticationAdministrationStore>
  const read = () => store.inspect(admin)
  const write = async (providers: AuthenticationProviderDraft[], reason = 'Review the authentication policy') =>
    store.save(admin, { providers, reason, fingerprint: (await read()).fingerprint })
  beforeAll(async () => {
    db = knexModule({ client: 'pg', connection: connection ?? undefined, pool: { min: 0, max: 8 } })
    await db.schema.createTable('authentication', t => {
      t.string('key').primary()
      t.string('strategyKey')
      t.string('displayName')
      t.integer('order')
      t.boolean('isEnabled')
      t.boolean('selfRegistration')
      t.json('domainWhitelist')
      t.json('autoEnrollGroups')
      t.json('config')
    })
    await db.schema.createTable('groups', t => {
      t.integer('id').primary()
      t.string('name')
      t.json('permissions')
      t.string('adminRevision').defaultTo('')
      t.boolean('isSystem').defaultTo(false)
    })
    await db.schema.createTable('users', t => {
      t.integer('id').primary()
      t.string('providerKey').references('authentication.key')
      t.boolean('isActive').defaultTo(true)
      t.integer('authVersion').defaultTo(0)
      t.string('adminRevision').defaultTo('')
      t.timestamp('sessionsRevokedAt')
    })
    await db.schema.createTable('userGroups', t => {
      t.integer('userId').references('users.id')
      t.integer('groupId').references('groups.id')
      t.primary(['userId', 'groupId'])
    })
    await db.schema.createTable('userAdministrationEvents', t => {
      t.increments('id')
      t.integer('userId')
      t.integer('actorId')
      t.string('action')
      t.text('reason')
      t.jsonb('details')
      t.timestamp('createdAt')
    })
    await up(db)
    store = createAuthenticationAdministrationStore({
      db,
      reviewKey: 'fixture-review-key',
      definitions: () => definitions,
      host: () => 'https://wiki.example.invalid'
    })
  })
  afterAll(async () => {
    if (!db) return
    for (const table of ['authenticationAdministrationEvents', 'userAdministrationEvents', 'userGroups', 'users', 'groups', 'authentication'])
      await db.schema.dropTableIfExists(table)
    await db.destroy()
  })
  beforeEach(async () => {
    for (const table of ['authenticationAdministrationEvents', 'userAdministrationEvents', 'userGroups', 'users', 'groups', 'authentication'])
      await db(table).delete()
    await db('authentication').insert(
      [draft(), draft('org')].map((p, order) => ({
        key: p.key,
        strategyKey: p.strategyKey,
        displayName: p.displayName,
        description: p.description,
        order,
        isEnabled: true,
        selfRegistration: false,
        domainWhitelist: JSON.stringify({ v: [] }),
        autoEnrollGroups: JSON.stringify({ v: [] }),
        config: JSON.stringify(
          p.key === 'local'
            ? {}
            : { issuer: 'https://identity.example.invalid', clientSecret: 'stored-secret-value', mapGroups: false, legacyPrivateKey: 'unknown-private-value' }
        )
      }))
    )
    await db('groups').insert([
      { id: 1, name: 'Administrators', permissions: '["manage:system"]', isSystem: true },
      { id: 2, name: 'Guests', permissions: '[]', isSystem: true },
      { id: 3, name: 'Readers', permissions: '["read:pages"]' },
      { id: 4, name: 'People managers', permissions: '["manage:users"]' }
    ])
    await db('users').insert([
      { id: 1, providerKey: 'local' },
      { id: 2, providerKey: 'local' },
      { id: 3, providerKey: 'org' },
      { id: 4, providerKey: 'local' }
    ])
    await db('userGroups').insert([
      { userId: 1, groupId: 1 },
      { userId: 2, groupId: 2 },
      { userId: 3, groupId: 3 },
      { userId: 4, groupId: 4 }
    ])
  })
  it('redacts secrets and unknown config while reporting observed versus pending initialization', async () => {
    const result = await read()
    expect(JSON.stringify(result)).not.toContain('stored-secret-value')
    expect(JSON.stringify(result)).not.toContain('unknown-private-value')
    expect(result.providers[1]?.configuredSecrets).toEqual(['clientSecret'])
    expect(result.providers[1]?.runtime.state).toBe('pending')
    expect(result.providers[1]?.accountCount).toBe(1)
    expect(result.groups.some(g => g.id === 2)).toBe(false)
  })
  it('requires current persisted system authority, independent of claimed permissions', async () => {
    await expect(store.inspect({ id: 4, authVersion: 0, permissions: ['manage:system'] } as never)).rejects.toMatchObject({ status: 403 })
    await db('users').where('id', 1).update({ authVersion: 1 })
    await expect(read()).rejects.toMatchObject({ status: 403 })
  })
  it('creates disabled providers, preserves unknown and kept secret values, and records only changed field names', async () => {
    const w = await read(),
      rows = w.providers.map(p => ({ ...p }))
    rows[1]!.description = 'A clear purpose'
    const made = draft('research')
    made.secrets.clientSecret = { action: 'replace', value: 'new-secret-value' }
    const result = await write([...rows, made])
    expect(result.sessionsEnded).toBe(0)
    expect((await db('authentication').where('key', 'org').first()).config.legacyPrivateKey).toBe('unknown-private-value')
    expect((await db('authentication').where('key', 'org').first()).config.clientSecret).toBe('stored-secret-value')
    expect((await db('authentication').where('key', 'research').first()).isEnabled).toBe(false)
    const history = await db('authenticationAdministrationEvents')
    expect(history).toHaveLength(1)
    expect(JSON.stringify(history)).not.toContain('new-secret-value')
    expect(history[0].changes[1].fields).toContain('config.clientSecret')
  })
  it('clears an explicitly selected secret atomically and invalidates affected account sessions', async () => {
    const rows = (await read()).providers
    rows[1]!.secrets.clientSecret = { action: 'clear' }
    const result = await write(rows)
    expect(result).toMatchObject({ sessionsEnded: 1, currentSessionEnded: false })
    expect((await db('authentication').where('key', 'org').first()).config.clientSecret).toBe('')
    expect((await db('users').where('id', 3).first()).authVersion).toBe(1)
    expect((await db('userAdministrationEvents').first()).action).toBe('sign-in-policy-updated')
  })
  it('normalizes admission domains and initial groups without ending existing sessions', async () => {
    const rows = (await read()).providers
    rows[1]!.selfRegistration = true
    rows[1]!.domainWhitelist = [' EXAMPLE.COM ', 'example.com']
    rows[1]!.autoEnrollGroups = [3, 3]
    expect((await write(rows)).sessionsEnded).toBe(0)
    const row = await db('authentication').where('key', 'org').first()
    expect(row.domainWhitelist).toEqual({ v: ['example.com'] })
    expect(row.autoEnrollGroups).toEqual({ v: [3] })
  })
  it('protects Local recovery and rejects system enrollment, missing groups, duplicate IDs and type changes', async () => {
    for (const change of [
      (rows: AuthenticationProviderDraft[]) => {
        rows[0]!.isEnabled = false
      },
      (rows: AuthenticationProviderDraft[]) => {
        rows.shift()
      },
      (rows: AuthenticationProviderDraft[]) => {
        rows[1]!.autoEnrollGroups = [1]
      },
      (rows: AuthenticationProviderDraft[]) => {
        rows[1]!.autoEnrollGroups = [999]
      },
      (rows: AuthenticationProviderDraft[]) => {
        rows[1]!.key = 'local'
      },
      (rows: AuthenticationProviderDraft[]) => {
        rows[1]!.strategyKey = 'local'
      }
    ]) {
      const rows = structuredClone((await read()).providers)
      change(rows)
      await expect(write(rows)).rejects.toBeInstanceOf(Error)
    }
    expect(await db('authenticationAdministrationEvents')).toHaveLength(0)
    expect((await db('authentication').where('key', 'local').first()).isEnabled).toBe(true)
  })
  it('rejects invalid configuration fields/types and invalid secret replacement actions without leaking inputs', async () => {
    for (const change of [
      (p: AuthenticationProviderDraft) => {
        p.config.mapGroups = 'true'
      },
      (p: AuthenticationProviderDraft) => {
        p.config.unknown = 'private-test-value'
      },
      (p: AuthenticationProviderDraft) => {
        p.secrets.clientSecret = { action: 'replace', value: '' }
      }
    ]) {
      const rows = (await read()).providers
      change(rows[1]!)
      await expect(write(rows)).rejects.toBeInstanceOf(Error)
    }
    expect(await db('authenticationAdministrationEvents')).toHaveLength(0)
  })
  it('checks all deletion dependencies before changing another provider', async () => {
    const rows = (await read()).providers
    rows[0]!.displayName = 'Should roll back'
    await expect(write(rows.slice(0, 1))).rejects.toMatchObject({ status: 409 })
    expect((await db('authentication').where('key', 'local').first()).displayName).toBe('Local')
    expect(await db('authenticationAdministrationEvents')).toHaveLength(0)
  })
  it('deletes unused providers and retains the reviewed deletion history', async () => {
    await write([...(await read()).providers, draft('temporary')])
    const rows = (await read()).providers.filter(p => p.key !== 'temporary')
    await write(rows)
    expect(await db('authentication').where('key', 'temporary')).toHaveLength(0)
    expect((await read()).history[0]?.changes[0]).toMatchObject({ key: 'temporary', action: 'deleted' })
  })
  it('allows one concurrent reviewed update and rejects stale account/group reviews', async () => {
    let w = await read()
    w.providers[1]!.description = 'Concurrent purpose'
    const input = { providers: w.providers, fingerprint: w.fingerprint, reason: 'Review a concurrent policy change' }
    const outcomes = await Promise.allSettled([store.save(admin, input), store.save(admin, input)])
    expect(outcomes.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter(r => r.status === 'rejected')).toHaveLength(1)
    w = await read()
    await db('groups').where('id', 3).update({ adminRevision: 'new-group-review' })
    await expect(store.save(admin, { ...input, providers: w.providers, fingerprint: w.fingerprint })).rejects.toMatchObject({ status: 409 })
    w = await read()
    await db('users').where('id', 3).update({ authVersion: 1 })
    await expect(store.save(admin, { ...input, providers: w.providers, fingerprint: w.fingerprint })).rejects.toMatchObject({ status: 409 })
  })
  it('rejects enrollment after a concurrent group deletion and keys reviews independently of exposed settings', async () => {
    await db('groups').insert({ id: 9, name: 'Temporary group', permissions: '[]' })
    const w = await read()
    w.providers[1]!.autoEnrollGroups = [9]
    const otherKey = createAuthenticationAdministrationStore({ db, reviewKey: 'different-review-key', definitions: () => definitions, host: () => '' })
    expect((await otherKey.inspect(admin)).fingerprint).not.toBe(w.fingerprint)
    const deletion = await db.transaction()
    await deletion('groups').orderBy('id').forUpdate().select('id')
    const pending = store.save(admin, { providers: w.providers, fingerprint: w.fingerprint, reason: 'Verify concurrent enrollment references' })
    await deletion('groups').where('id', 9).delete()
    await deletion.commit()
    await expect(pending).rejects.toMatchObject({ status: 409 })
    expect((await db('authentication').where('key', 'org').first()).autoEnrollGroups).toEqual({ v: [] })
  })
  it('rolls back provider, account and event writes together when history insertion fails', async () => {
    await db.raw(`CREATE FUNCTION reject_auth_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'history unavailable'; END $$`)
    await db.raw('CREATE TRIGGER reject_auth_history BEFORE INSERT ON "authenticationAdministrationEvents" FOR EACH ROW EXECUTE FUNCTION reject_auth_history()')
    try {
      const rows = (await read()).providers
      rows[1]!.isEnabled = false
      await expect(write(rows)).rejects.toThrow('history unavailable')
      expect((await db('authentication').where('key', 'org').first()).isEnabled).toBe(true)
      expect((await db('users').where('id', 3).first()).authVersion).toBe(0)
      expect(await db('userAdministrationEvents')).toHaveLength(0)
    } finally {
      await db.raw('DROP TRIGGER reject_auth_history ON "authenticationAdministrationEvents"')
      await db.raw('DROP FUNCTION reject_auth_history()')
    }
  })
  it('reports saved state with activation attention when post-commit initialization fails', async () => {
    const onCommitted = vi.fn().mockRejectedValue(new Error('Initialization failed')),
      runtime = createAuthenticationAdministrationStore({ db, reviewKey: 'fixture-review-key', definitions: () => definitions, host: () => '', onCommitted }),
      w = await runtime.inspect(admin)
    w.providers[1]!.isEnabled = false
    const result = await runtime.save(admin, { providers: w.providers, fingerprint: w.fingerprint, reason: 'Disable the external identity provider' })
    expect(result.activation).toBe('needs-attention')
    expect(onCommitted).toHaveBeenCalledWith([3])
    expect((await db('authentication').where('key', 'org').first()).isEnabled).toBe(false)
  })
  it('guards migration rollback after recorded changes', async () => {
    await down(db)
    await up(db)
    const rows = (await read()).providers
    rows[0]!.description = 'Recovery access'
    await write(rows)
    await expect(down(db)).rejects.toThrow('Cannot discard')
  })
})
describe('Authentication admission domain boundaries', () => {
  it('normalizes exact domains and rejects wildcard, URL and malformed values', () => {
    expect(normalizeAuthenticationDomains([' EXAMPLE.COM ', 'example.com', 'bücher.example'])).toEqual(['example.com', 'xn--bcher-kva.example'])
    for (const value of [['*.example.com'], ['https://example.com'], ['@example.com'], ['localhost'], ['a..com']])
      expect(() => normalizeAuthenticationDomains(value)).toThrow()
  })
})
