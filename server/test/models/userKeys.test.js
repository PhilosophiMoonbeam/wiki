describe('account-bound recovery and continuation keys', () => {
  let user, key, order, insert, remove, transaction, UserKey
  beforeEach(async () => {
    vi.resetModules()
    user = { id: 7, isActive: true, authVersion: 0 }
    key = { id: 11, userId: 7, authVersion: 0, validUntil: '2999-01-01T00:00:00.000Z' }
    order = []; insert = vi.fn(); remove = vi.fn(async () => { order.push('consume'); return 1 })
    const trx = { name: 'account-key-transaction' }
    transaction = vi.fn(async callback => callback(trx))
    global.WIKI = { Error: { AuthValidationTokenInvalid: class extends Error {} }, models: {
      knex: { transaction },
      userKeys: { query: vi.fn(() => ({ findOne: () => ({ then: resolve => Promise.resolve(key).then(resolve), forUpdate: async () => { order.push('lock-key'); return key } }), deleteById: remove, insert })) },
      users: { query: vi.fn(() => ({ findById: () => ({ forUpdate: async () => { order.push('lock-account'); return user }, forShare: async () => user }) })) }
    } }
    UserKey = (await vi.importFresh('../../models/userKeys.ts', import.meta.url)).default
  })
  it('validates a landing-page token without consuming it, under account authority', async () => {
    await expect(UserKey.validateToken({ kind: 'verify', token: 'mail-link', skipDelete: true })).resolves.toBe(user)
    expect(order).toEqual(['lock-account', 'lock-key']); expect(remove).not.toHaveBeenCalled(); expect(transaction).toHaveBeenCalledOnce()
  })
  it('locks the account before consuming a key and reuses a supplied transaction', async () => {
    const trx = { name: 'existing-transaction' }
    await expect(UserKey.validateToken({ kind: 'resetPwd', token: 'one-use-token' }, trx)).resolves.toBe(user)
    expect(order).toEqual(['lock-account', 'lock-key', 'consume']); expect(remove).toHaveBeenCalledWith(11); expect(transaction).not.toHaveBeenCalled()
    expect(global.WIKI.models.users.query).toHaveBeenCalledWith(trx); expect(global.WIKI.models.userKeys.query).toHaveBeenCalledWith(trx)
  })
  it.each([false, true])('rejects a superseded account generation with skipDelete=%s', async skipDelete => {
    user.authVersion = 1
    await expect(UserKey.validateToken({ kind: 'resetPwd', token: 'old-link', skipDelete })).rejects.toThrow()
    expect(remove).not.toHaveBeenCalled()
  })
  it.each(['inactive', 'expired', 'missing', 'mismatched'])('rejects an %s key/account boundary', async state => {
    if (state === 'inactive') user.isActive = false
    if (state === 'expired') key.validUntil = '2000-01-01T00:00:00Z'
    if (state === 'missing') key = undefined
    if (state === 'mismatched') key.userId = 8
    await expect(UserKey.validateToken({ kind: 'tfa', token: 'continuation' })).rejects.toThrow()
    expect(remove).not.toHaveBeenCalled()
  })
  it('stores the current generation and rejects issuance from superseded authentication proof', async () => {
    user.authVersion = 3
    const token = await UserKey.generateToken({ kind: 'tfa', userId: 7, expectedAuthVersion: 3 })
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ token, kind: 'tfa', userId: 7, authVersion: 3 }))
    insert.mockClear()
    await expect(UserKey.generateToken({ kind: 'tfa', userId: 7, expectedAuthVersion: 2 })).rejects.toThrow()
    expect(insert).not.toHaveBeenCalled()
  })
})
