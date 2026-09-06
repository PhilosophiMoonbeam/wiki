import type { Knex } from 'knex'
export const up = async (db: Knex): Promise<void> => {
  await db.schema.createTable('securityAdministrationEvents', table => {
    table.increments('id').primary()
    table.integer('actorId').nullable()
    table.text('reason').notNullable()
    table.jsonb('fields').notNullable()
    table.integer('sessionsEnded').notNullable().defaultTo(0)
    table.timestamp('createdAt', { useTz: true }).notNullable()
  })
  await db('settings')
    .insert({ key: 'securityPolicyRevision', value: JSON.stringify({ revision: '' }), updatedAt: new Date() })
    .onConflict('key')
    .ignore()
}
export const down = async (db: Knex): Promise<void> => {
  const revision = await db('settings').where('key', 'securityPolicyRevision').first('value')
  if ((await db('securityAdministrationEvents').first('id')) || revision?.value?.revision)
    throw new Error('Cannot discard recorded workspace security policy. Restore a pre-migration backup or apply a forward fix.')
  await db.schema.dropTable('securityAdministrationEvents')
  await db('settings').where('key', 'securityPolicyRevision').delete()
}
