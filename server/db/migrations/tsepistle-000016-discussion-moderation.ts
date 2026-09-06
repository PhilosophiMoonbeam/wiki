import type { Knex } from 'knex'
export const up = async (knex: Knex): Promise<void> => {
  await knex.schema.alterTable('comments', table => {
    table.boolean('isHidden').notNullable().defaultTo(false)
    table.string('moderationRevision', 36).notNullable().defaultTo('')
    table.integer('moderatedBy').nullable()
    table.timestamp('moderatedAt', { useTz: true }).nullable()
    table.text('moderationReason').notNullable().defaultTo('')
    table.index(['isHidden', 'createdAt', 'id'], 'comments_moderation_order')
    table.index(['createdAt', 'id'], 'comments_recent_order')
  })
  await knex.schema.createTable('pageDiscussionPolicy', table => {
    table.integer('pageId').primary().references('id').inTable('pages').onDelete('CASCADE')
    table.boolean('closed').notNullable().defaultTo(false)
    table.text('reason').notNullable().defaultTo('')
    table.integer('updatedBy').nullable()
    table.timestamp('updatedAt', { useTz: true }).notNullable()
    table.string('revision', 36).notNullable()
  })
  await knex.schema.createTable('discussionModerationHistory', table => {
    table.increments('id').primary()
    // Retain action metadata when a comment/page/account is later deleted.
    // This table deliberately contains no comment content, email or IP address.
    table.integer('commentId').nullable()
    table.integer('pageId').notNullable()
    table.string('action', 16).notNullable()
    table.text('reason').notNullable()
    table.integer('actorId').nullable()
    table.timestamp('createdAt', { useTz: true }).notNullable()
    table.index(['commentId', 'id'])
    table.index(['pageId', 'id'])
  })
}
export const down = async (knex: Knex): Promise<void> => {
  const [hidden, closed, history] = await Promise.all([
    knex('comments').where('isHidden', true).first(), knex('pageDiscussionPolicy').where('closed', true).first(), knex('discussionModerationHistory').first()
  ])
  if (hidden || closed || history) throw new Error('Cannot roll down discussion moderation while lifecycle data exists. Restore a pre-migration backup or apply a forward fix.')
  await knex.schema.dropTable('discussionModerationHistory')
  await knex.schema.dropTable('pageDiscussionPolicy')
  await knex.schema.alterTable('comments', table => {
    table.dropIndex([], 'comments_moderation_order'); table.dropIndex([], 'comments_recent_order')
    for (const column of ['isHidden', 'moderationRevision', 'moderatedBy', 'moderatedAt', 'moderationReason']) table.dropColumn(column)
  })
}
