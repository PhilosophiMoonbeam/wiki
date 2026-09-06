import { describe, expect, it } from '../bun-test.mts'
import { accountSessionIsCurrent, sessionVersion } from '../../helpers/account-session.ts'
describe('persisted account session authority', () => {
  it('accepts existing sessions only while the account remains in generation zero', () => {
    expect(accountSessionIsCurrent({ id: 7 }, { id: 7, isActive: true, authVersion: 0 })).toBe(true)
    expect(accountSessionIsCurrent({ id: 7 }, { id: 7, isActive: true, authVersion: 1 })).toBe(false)
    expect(accountSessionIsCurrent({ id: 7, authVersion: 1 }, { id: 7, isActive: true, authVersion: 1 })).toBe(true)
  })
  it('rejects inactive, missing, mismatched and guest principals', () => {
    expect(accountSessionIsCurrent({ id: 7 }, { id: 7, isActive: false })).toBe(false)
    expect(accountSessionIsCurrent({ id: 7 }, undefined)).toBe(false)
    expect(accountSessionIsCurrent({ id: 7 }, { id: 8, isActive: true })).toBe(false)
    expect(accountSessionIsCurrent({ id: 2 }, { id: 2, isActive: true })).toBe(false)
  })
  it('does not coerce malformed generations into a valid current session', () => {
    for (const value of [null, '0', -1, 0.5, NaN, Infinity, 2147483648]) { expect(sessionVersion(value)).toBeNull(); expect(accountSessionIsCurrent({ id: 7, authVersion: value }, { id: 7, isActive: true, authVersion: 0 })).toBe(false) }
  })
})
