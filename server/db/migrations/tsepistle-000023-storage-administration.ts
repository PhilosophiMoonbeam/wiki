import type { Knex } from 'knex'
export const up = async (db: Knex): Promise<void> => {
  await db.schema.createTable('storageOperations', table => {
    table.uuid('id').primary()
    table.uuid('jobId').notNullable().unique()
    table.string('targetKey', 255).nullable()
    table.string('handler', 100).notNullable()
    table.string('state', 24).notNullable()
    table.integer('actorId').nullable()
    table.text('reason').notNullable()
    table.jsonb('requester').notNullable()
    table.string('reviewFingerprint', 64).notNullable()
    table.text('configurationRevision').notNullable()
    table.uuid('runtimeGeneration').nullable()
    table.text('title').notNullable()
    table.text('effect').notNullable()
    table.jsonb('result').nullable()
    table.jsonb('resolution').nullable()
    table.timestamp('createdAt', { useTz: true }).notNullable()
    table.timestamp('startedAt', { useTz: true }).nullable()
    table.timestamp('completedAt', { useTz: true }).nullable()
    table.index(['createdAt', 'id'], 'storage_operations_history')
    table.check("state IN ('queued','running','succeeded','partial','failed','interrupted','cancelled','resolved')", [], 'storage_operations_state')
  })
  await db.raw("CREATE UNIQUE INDEX storage_operations_single_active ON \"storageOperations\" ((true)) WHERE state IN ('queued','running','interrupted')")
  await db('settings').insert({ key: 'storageAdministration', value: '{}', updatedAt: new Date().toISOString() }).onConflict('key').ignore()
}
export const down = async (db: Knex): Promise<void> => {
  await db.transaction(async tx => {
    await tx.raw('LOCK TABLE "storageOperations" IN ACCESS EXCLUSIVE MODE')
    const metadata = await tx('settings').where('key', 'storageAdministration').first()
    if ((await tx('storageOperations').first('id')) || (metadata && Object.keys(metadata.value ?? {}).length))
      throw new Error('Cannot discard recorded storage operations or configuration history. Restore a backup or apply a forward fix.')
    await tx.schema.dropTable('storageOperations')
    await tx('settings').where('key', 'storageAdministration').delete()
  })
}
