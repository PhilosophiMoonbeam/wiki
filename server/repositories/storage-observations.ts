import type { StorageTargetObservation } from '../../shared/storage-workspace.ts'
import { storageConfigurationKey } from '../helpers/storage-configuration-key.ts'
import type { StorageRuntimeTarget } from '../operations/storage-actions.ts'
import { storageRecord, type StorageConfigurationRow } from './storage-configuration.ts'
export const storageTargetObservation = (row: StorageConfigurationRow, runtime: StorageRuntimeTarget | undefined): StorageTargetObservation => {
  const active = runtime?.active ?? false,
    matchesSaved = row.isEnabled ? runtime?.configurationKey === storageConfigurationKey(row) : !active
  const state = storageRecord(row.state),
    attempt = typeof state.lastAttempt === 'string' ? new Date(state.lastAttempt) : null
  const lastOutcome = ['operational', 'pending', 'warning', 'error', 'paused'].includes(String(state.status))
    ? (state.status as StorageTargetObservation['lastOutcome'])
    : null
  return {
    key: row.key,
    active,
    matchesSaved,
    lastAttempt: attempt && Number.isFinite(attempt.valueOf()) ? attempt.toISOString() : null,
    lastOutcome,
    state: !row.isEnabled
      ? active
        ? 'outdated'
        : 'disabled'
      : !runtime
        ? 'pending'
        : !matchesSaved
          ? 'outdated'
          : runtime.paused
            ? 'paused'
            : active
              ? 'active'
              : lastOutcome === 'paused'
                ? 'pending'
                : 'failed'
  }
}
