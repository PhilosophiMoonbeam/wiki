import type { Knex } from 'knex'
export const up = async (knex: Knex): Promise<void> => {
  await knex.schema.alterTable('users', table => {
    // Existing signed sessions belong to version zero. Revoking sessions advances
    // the version so an older credential cannot be silently renewed.
    table.integer('authVersion').notNullable().defaultTo(0)
    table.string('adminRevision', 36).notNullable().defaultTo('')
    table.timestamp('sessionsRevokedAt', { useTz: true }).nullable()
  })
  await knex.schema.alterTable('userKeys', table => {
    table.integer('authVersion').notNullable().defaultTo(0)
  })
  await knex.schema.createTable('userAdministrationEvents', table => {
    table.increments('id').primary()
    // Keep administrative action metadata after an account is deleted. Never
    // store passwords, authenticator secrets, bearer tokens or email bodies.
    table.integer('userId').notNullable()
    table.integer('actorId').nullable()
    table.string('action', 40).notNullable()
    table.text('reason').notNullable().defaultTo('')
    table.jsonb('details').notNullable().defaultTo('{}')
    table.timestamp('createdAt', { useTz: true }).notNullable()
    table.index(['userId', 'id'])
  })
}
export const down = async (knex: Knex): Promise<void> => {
  const revoked = await knex('users').where('authVersion', '>', 0).first('id')
  const history = await knex('userAdministrationEvents').first('id')
  const newerKey = await knex('userKeys').where('authVersion', '>', 0).first('id')
  if (revoked || history || newerKey) throw new Error('Cannot roll down account administration after session revocation or administrative history. Restore a pre-migration backup or apply a forward fix.')
  await knex.schema.dropTable('userAdministrationEvents')
  await knex.schema.alterTable('userKeys', table => { table.dropColumn('authVersion') })
  await knex.schema.alterTable('users', table => { table.dropColumn('authVersion'); table.dropColumn('adminRevision'); table.dropColumn('sessionsRevokedAt') })
}
