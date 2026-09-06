import type { AgentActionDescriptor, AgentFeatureFlagKey } from './contracts.ts'

/** Deployment eligibility, not authorization for a particular user or API key. */
export interface AgentAdminTool extends AgentActionDescriptor {
  toolName: string
  agentBlockers: AgentFeatureFlagKey[]
  mcpBlockers: AgentFeatureFlagKey[]
}
