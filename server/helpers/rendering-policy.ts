import type { RenderingModule, RenderingProperty, RenderingSetting } from '../../shared/rendering-policy.ts'
import errors from '../operations/errors.ts'
const { ApplicationError } = errors
export interface RenderingDefinition extends Record<string, unknown> { key: string; props: Record<string, RenderingProperty> }
export const projectRenderingModules = (rows: RenderingSetting[], definitions: RenderingDefinition[]): RenderingModule[] => rows.map(row => {
  const definition = definitions.find(definition => definition.key === row.key)
  if (!definition) throw new ApplicationError(`Renderer ${row.key} is missing its installed definition. Restart or repair the deployment.`, { status: 409 })
  return { key: row.key, isEnabled: Boolean(row.isEnabled), config: { ...row.config }, props: definition.props,
    title: String(definition.title ?? row.key), description: String(definition.description ?? ''), icon: String(definition.icon ?? 'mdi-cog-outline'),
    dependsOn: typeof definition.dependsOn === 'string' ? definition.dependsOn : null, input: typeof definition.input === 'string' ? definition.input : null,
    output: typeof definition.output === 'string' ? definition.output : null, step: typeof definition.step === 'string' ? definition.step : null, order: Number(definition.order ?? Number.MAX_SAFE_INTEGER) }
})
