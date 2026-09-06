import type { Knex } from 'knex'

// Keep language identity consistent through content, history, links, readers and notifications.
// The original five-character columns cannot represent installed script codes such as sr-latn.
const columns = [
  ['locales', 'code', 5],
  ['pages', 'localeCode', 5],
  ['pageHistory', 'localeCode', 5],
  ['pageLinks', 'localeCode', 5],
  ['pageTree', 'localeCode', 5],
  ['users', 'localeCode', 5],
  ['pageWatchNotifications', 'localeCode', 32]
] as const

export const up = async (db: Knex): Promise<void> => {
  await db.transaction(async trx => {
    for (const [table, column] of columns) {
      // Changing only the type preserves defaults, nullability, foreign keys and indexes.
      await trx.raw('ALTER TABLE ?? ALTER COLUMN ?? TYPE varchar(35)', [table, column])
    }
  })
}

export const down = async (db: Knex): Promise<void> => {
  await db.transaction(async trx => {
    for (const [table] of columns) await trx.raw('LOCK TABLE ?? IN ACCESS EXCLUSIVE MODE', [table])
    for (const [table, column, width] of columns) {
      if (await trx(table).whereRaw('length(??) > ?', [column, width]).first(column)) {
        throw new Error('Cannot shorten language codes in use. Restore a pre-migration backup or apply a forward fix.')
      }
    }
    for (const [table, column, width] of columns) {
      await trx.raw(`ALTER TABLE ?? ALTER COLUMN ?? TYPE varchar(${width})`, [table, column])
    }
  })
}
