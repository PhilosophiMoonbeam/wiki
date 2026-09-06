interface WikiContext {
  logger: { info(message: string): void }
  models: { storage: { syncTarget(targetKey: string, generation: string): Promise<boolean> } }
}
const wiki = WIKI as unknown as WikiContext
export default async function syncStorage(input: unknown): Promise<void> {
  if (
    !input ||
    typeof input !== 'object' ||
    !('targetKey' in input) ||
    typeof input.targetKey !== 'string' ||
    !('generation' in input) ||
    typeof input.generation !== 'string'
  )
    throw new TypeError('Storage synchronization requires a target and runtime generation.')
  const completed = await wiki.models.storage.syncTarget(input.targetKey, input.generation)
  wiki.logger.info(`Storage synchronization ${input.targetKey}: ${completed ? 'completed' : 'skipped because its runtime was replaced or is unavailable'}.`)
}
