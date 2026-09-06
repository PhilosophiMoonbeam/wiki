import { describe, it, expect } from '../bun-test.mts'
import { storageTargetObservation } from '../../repositories/storage-observations.ts'
import { storageConfigurationKey } from '../../helpers/storage-configuration-key.ts'
import type { StorageConfigurationRow } from '../../repositories/storage-configuration.ts'

const row: StorageConfigurationRow = {
  key: 'sftp',
  isEnabled: true,
  mode: 'push',
  syncInterval: 'P0D',
  config: { password: 'never-publish-this' },
  state: { status: 'operational', lastAttempt: '2026-09-06T12:00:00Z', message: 'private provider response', generation: 'internal' }
}
const runtime = { key: row.key, active: true, paused: false, configurationKey: storageConfigurationKey(row), generation: 'internal-generation' }

describe('Storage runtime observations', () => {
  it('exposes only bounded evidence and never configuration identities or raw provider state', () => {
    expect(storageTargetObservation(row, runtime)).toEqual({
      key: 'sftp',
      state: 'active',
      active: true,
      matchesSaved: true,
      lastAttempt: '2026-09-06T12:00:00.000Z',
      lastOutcome: 'operational'
    })
    expect(storageTargetObservation({ ...row, state: { status: 'private-error', lastAttempt: 'not a date' } }, runtime)).toMatchObject({
      lastAttempt: null,
      lastOutcome: null
    })
  })
  it('distinguishes uninitialized, failed, paused and obsolete enabled runtimes', () => {
    expect(storageTargetObservation(row, undefined).state).toBe('pending')
    expect(storageTargetObservation(row, { ...runtime, active: false }).state).toBe('failed')
    expect(storageTargetObservation(row, { ...runtime, paused: true }).state).toBe('paused')
    expect(storageTargetObservation({ ...row, config: { password: 'changed' } }, runtime)).toMatchObject({ state: 'outdated', matchesSaved: false })
    expect(storageTargetObservation({ ...row, state: { status: 'paused' } }, { ...runtime, active: false }).state).toBe('pending')
  })
  it('keeps a disabled target visibly unapplied while its old runtime is still active', () => {
    const disabled = { ...row, isEnabled: false }
    expect(storageTargetObservation(disabled, runtime)).toMatchObject({ state: 'outdated', active: true, matchesSaved: false })
    expect(storageTargetObservation(disabled, undefined)).toMatchObject({ state: 'disabled', active: false, matchesSaved: true })
    expect(storageTargetObservation(disabled, { ...runtime, active: false })).toMatchObject({ state: 'disabled', matchesSaved: true })
  })
})
