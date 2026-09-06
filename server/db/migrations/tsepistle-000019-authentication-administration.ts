import type { Knex } from 'knex'
export const up = async (db: Knex): Promise<void> => {
  await db.schema.alterTable('authentication', table => {
    table.text('description').notNullable().defaultTo('')
    table.string('adminRevision', 36).notNullable().defaultTo('')
  })
  await db.schema.createTable('authenticationAdministrationEvents', table => {
    table.increments('id').primary()
    table.integer('actorId').nullable()
    table.text('reason').notNullable()
    table.jsonb('changes').notNullable()
    table.timestamp('createdAt', { useTz: true }).notNullable()
  })
}
export const down = async (db: Knex): Promise<void> => {
  if (
    (await db('authenticationAdministrationEvents').first('id')) ||
    (await db('authentication').whereNot('description', '').orWhereNot('adminRevision', '').first('key'))
  )
    throw new Error('Cannot discard recorded authentication administration. Restore a pre-migration backup or apply a forward fix.')
  await db.schema.dropTable('authenticationAdministrationEvents')
  await db.schema.alterTable('authentication', table => {
    table.dropColumn('description')
    table.dropColumn('adminRevision')
  })
}
