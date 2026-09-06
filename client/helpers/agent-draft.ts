import type { WikiSource } from '../../shared/wiki-source.ts'

import type { AgentSearchScope } from '../../shared/agents/knowledge-context.ts'
export type { AgentSearchScope } from '../../shared/agents/knowledge-context.ts'
export interface AgentDraft {
  text: string
  mode: 'message' | 'goal'
  skillVersionIds: string[]
  sources: WikiSource[]
  scope: AgentSearchScope
  includeCurrentPage: boolean
}
export const emptyAgentDraft = (): AgentDraft => ({ text: '', mode: 'message', skillVersionIds: [], sources: [], scope: { kind: 'all' }, includeCurrentPage: true })
