import type { Knex } from 'knex'
export const up = async (db: Knex): Promise<void> => {
  await db.schema.createTable('analyticsDaily', table => {
    table.date('day').notNullable()
    table.integer('pageId').notNullable().references('id').inTable('pages').onDelete('CASCADE')
    table.bigInteger('responses').notNullable().defaultTo(0)
    table.primary(['day', 'pageId'])
    table.index(['pageId', 'day'], 'analytics_daily_page_day')
    table.check('responses >= 0', [], 'analytics_daily_nonnegative')
  })
  for (const key of ['analyticsPolicy', 'analyticsAdministration']) {
    await db('settings').insert({ key, value: '{}', updatedAt: new Date().toISOString() }).onConflict('key').ignore()
  }
}
export const down = async (db: Knex): Promise<void> => {
  await db.transaction(async tx => {
    const settings = await tx('settings').whereIn('key', ['analyticsPolicy', 'analyticsAdministration']).orderBy('key').forUpdate()
    await tx.raw('LOCK TABLE "analyticsDaily" IN ACCESS EXCLUSIVE MODE')
    if ((await tx('analyticsDaily').first('pageId')) || settings.some(row => row.value && Object.keys(row.value).length > 0))
      throw new Error('Cannot discard recorded analytics or administration history. Restore a backup or apply a forward fix.')
    await tx.schema.dropTable('analyticsDaily')
    await tx('settings').whereIn('key', ['analyticsPolicy', 'analyticsAdministration']).delete()
  })
}
