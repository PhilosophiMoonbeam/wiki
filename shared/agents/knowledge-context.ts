import { z } from 'zod'

export const AgentSearchScopeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('all') }),
  z.strictObject({ kind: z.literal('locale'), locale: z.string().min(1).max(35) }),
  z.strictObject({ kind: z.literal('section'), locale: z.string().min(1).max(35), path: z.string().min(1).max(1024) }),
  z.strictObject({ kind: z.literal('selected') })
])
export const AgentKnowledgeContextSchema = z.strictObject({
  scope: AgentSearchScopeSchema,
  sources: z.array(z.strictObject({
    id: z.number().int().positive(), locale: z.string().min(1).max(35), path: z.string().min(1).max(1024),
    title: z.string().max(500), visibility: z.enum(['public', 'private']), sourceRevision: z.string().regex(/^[1-9]\d*$/).max(64)
  })).max(8)
}).refine(value => new TextEncoder().encode(JSON.stringify(value)).length <= 24000, { message: 'Source context is too large' }).refine(value => value.scope.kind !== 'selected' || value.sources.length > 0, { message: 'Select at least one source for selected-page search' })
export type AgentKnowledgeContext = z.infer<typeof AgentKnowledgeContextSchema>
export type AgentSearchScope = z.infer<typeof AgentSearchScopeSchema>
