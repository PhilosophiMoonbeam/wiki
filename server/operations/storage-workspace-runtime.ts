import type { Knex } from 'knex'
import type Storage from '../models/storage.ts'
import { executingStorageOperations } from '../helpers/storage-active-operations.ts'
import { storageModuleDefinition } from '../repositories/storage-configuration.ts'
import { createStorageConfigurationStore } from './storage-configuration.ts'
import { createStorageActionStore } from './storage-actions.ts'
interface Runtime {
  models: { knex: Knex; storage: typeof Storage }
  config: { sessionSecret: string; offline?: boolean }
  data: { storage: unknown[] }
}
let database: Knex | undefined, store: ReturnType<typeof createStore> | undefined
const createStore = (wiki: Runtime) => {
  const configuration = createStorageConfigurationStore({
    db: wiki.models.knex,
    reviewKey: wiki.config.sessionSecret,
    definitions: () => wiki.data.storage.map(storageModuleDefinition),
    offline: () => wiki.config.offline === true
  })
  const actions = createStorageActionStore({
    db: wiki.models.knex,
    configuration,
    runtime: () => wiki.models.storage.runtimeTargets(),
    offline: () => wiki.config.offline === true,
    isExecuting: id => executingStorageOperations.has(id)
  })
  return { configuration, actions, runtime: wiki.models.storage }
}
export const getStorageWorkspaceStore = () => {
  const wiki = WIKI as unknown as Runtime
  if (!store || database !== wiki.models.knex) {
    database = wiki.models.knex
    store = createStore(wiki)
  }
  return store
}
