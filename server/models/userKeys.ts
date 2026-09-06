import { Model } from 'objection'
import type { QueryContext } from 'objection'
import type { Knex } from 'knex'
import { DateTime } from 'luxon'
import { nanoid } from 'nanoid'
import User from './users.ts'
import { accountSessionIsCurrent, sessionVersion } from '../helpers/account-session.ts'

interface GenerateTokenOptions {
  userId: number
  kind: string
  expectedAuthVersion?: number
}

interface ValidateTokenOptions {
  kind: string
  token: string
  skipDelete?: boolean
}

export default class UserKey extends Model {
  declare id: number
  declare kind: string
  declare token: string
  declare userId: number
  declare authVersion: number
  declare createdAt: string
  declare validUntil: string
  declare user: User

  static override get tableName() {
    return 'userKeys'
  }

  static override get jsonSchema() {
    return {
      type: 'object',
      required: ['kind', 'token', 'validUntil'],
      properties: {
        id: { type: 'integer' },
        kind: { type: 'string' },
        token: { type: 'string' },
        createdAt: { type: 'string' },
        validUntil: { type: 'string' }
      }
    }
  }

  static override get relationMappings() {
    return {
      user: {
        relation: Model.BelongsToOneRelation,
        modelClass: User,
        join: { from: 'userKeys.userId', to: 'users.id' }
      }
    }
  }

  override async $beforeInsert(context: QueryContext): Promise<void> {
    await super.$beforeInsert(context)
    this.createdAt = DateTime.utc().toISO()
  }

  static async generateToken({ userId, kind, expectedAuthVersion }: GenerateTokenOptions, transaction?: Knex.Transaction): Promise<string> {
    const token = nanoid()
    const generate = async (trx: Knex.Transaction) => {
      const user = await wiki.models.users.query(trx).findById(userId).forShare()
      const authVersion = user ? sessionVersion(user.authVersion) : null
      if (authVersion === null || (expectedAuthVersion !== undefined && expectedAuthVersion !== authVersion)) throw new wiki.Error.AuthValidationTokenInvalid()
      await wiki.models.userKeys.query(trx).insert({ kind, token, validUntil: DateTime.utc().plus({ days: 1 }).toISO(), userId, authVersion })
    }
    if (transaction) await generate(transaction)
    else await wiki.models.knex.transaction(generate)
    return token
  }

  static async validateToken({ kind, token, skipDelete }: ValidateTokenOptions, transaction?: Knex.Transaction): Promise<User> {
    const validate = async (trx: Knex.Transaction): Promise<User> => {
      const candidate = await wiki.models.userKeys.query(trx).findOne({ kind, token })
      if (!candidate) throw new wiki.Error.AuthValidationTokenInvalid()
      // Match account administration's account → recovery-key lock order. Read
      // the candidate again after locking the account to detect consumption.
      const user = await wiki.models.users.query(trx).findById(candidate.userId).forUpdate()
      const result = await wiki.models.userKeys.query(trx).findOne({ kind, token }).forUpdate()
      if (!result || DateTime.utc() > DateTime.fromISO(result.validUntil) || !accountSessionIsCurrent({ id: result.userId, authVersion: result.authVersion }, user)) {
        throw new wiki.Error.AuthValidationTokenInvalid()
      }
      if (!user) throw new wiki.Error.AuthValidationTokenInvalid()
      if (skipDelete === true) return user
      const deleted = await wiki.models.userKeys.query(trx).deleteById(result.id)
      if (deleted !== 1) {
        throw new wiki.Error.AuthValidationTokenInvalid()
      }
      return user
    }

    return transaction ? validate(transaction) : wiki.models.knex.transaction(validate)
  }

  static async destroyToken({ token }: { token: string }): Promise<number> {
    return wiki.models.userKeys.query().findOne({ token }).delete()
  }
}

const wiki = WIKI as unknown as {
  Error: { AuthValidationTokenInvalid: new () => Error }
  models: { knex: Knex; userKeys: typeof UserKey; users: typeof User }
}
