import type { Knex } from 'knex'

export const up = async (knex: Knex): Promise<void> => {
  await knex.schema.alterTable('tags', table => {
    table.integer('redirectToId').unsigned().nullable().references('id').inTable('tags').onDelete('RESTRICT')
    table.boolean('isArchived').notNullable().defaultTo(false)
    table.index(['redirectToId'])
  })
}

export const down = async (knex: Knex): Promise<void> => {
  const lifecycleData = await knex('tags').whereNotNull('redirectToId').orWhere('isArchived', true).first()
  if (lifecycleData) throw new Error('Cannot roll down taxonomy migration while lifecycle data exists. Restore a pre-migration backup or apply a forward fix.')
  await knex.schema.alterTable('tags', table => {
    table.dropColumn('redirectToId')
    table.dropColumn('isArchived')
  })
}
