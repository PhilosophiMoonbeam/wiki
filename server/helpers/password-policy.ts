import type { Knex } from 'knex'
import { newPasswordIssue } from '../../shared/security-policy.ts'
import errors from '../operations/errors.ts'
export const passwordMinimum = (value: unknown): number => (typeof value === 'number' && Number.isSafeInteger(value) && value >= 12 && value <= 64 ? value : 12)
export const readPasswordMinimum = async (db: Knex | Knex.Transaction): Promise<number> => {
  const query = db('settings').where('key', 'auth').select('value')
  const row = await (db.isTransaction ? query.forShare() : query).first()
  return passwordMinimum(row?.value?.passwordMinLength)
}
export const assertSavedPassword = async (tx: Knex.Transaction, value: unknown): Promise<void> => {
  const issue = newPasswordIssue(value, await readPasswordMinimum(tx))
  if (issue) throw new errors.ApplicationError(issue, { status: 400 })
}
