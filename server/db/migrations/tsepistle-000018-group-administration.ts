import type { Knex } from 'knex'
export const up = async (knex: Knex): Promise<void> => {
  await knex.schema.alterTable('groups', table => {
    table.text('description').notNullable().defaultTo('')
    table.string('adminRevision', 36).notNullable().defaultTo('')
  })
  await knex.schema.createTable('groupAdministrationEvents', table => {
    table.increments('id').primary()
    table.integer('groupId').notNullable()
    table.integer('actorId').nullable()
    table.string('action', 40).notNullable()
    table.text('reason').notNullable()
    table.jsonb('details').notNullable().defaultTo('{}')
    table.timestamp('createdAt', { useTz: true }).notNullable()
    table.index(['groupId', 'id'])
  })
}
export const down = async (knex: Knex): Promise<void> => {
  if ((await knex('groupAdministrationEvents').first('id')) || (await knex('groups').whereNot('description', '').orWhereNot('adminRevision', '').first('id')))
    throw new Error('Cannot discard recorded group administration or group descriptions. Restore a pre-migration backup or apply a forward fix.')
  await knex.schema.dropTable('groupAdministrationEvents')
  await knex.schema.alterTable('groups', table => {
    table.dropColumn('description')
    table.dropColumn('adminRevision')
  })
}
