import type { AgentAdminTool } from '../../shared/agents/admin.ts'
import { AGENT_TOOL_NAMES, type AgentFeatureFlags, type AgentFeatureFlagKey } from '../../shared/agents/contracts.ts'
import { ACTION_CATALOG } from './actions/catalog.ts'

export function buildAgentAdminTools(flags: AgentFeatureFlags): AgentAdminTool[] {
  const blocked = (required: readonly AgentFeatureFlagKey[]): AgentFeatureFlagKey[] =>
    [...new Set(required)].filter(flag => !flags[flag])
  return Object.values(ACTION_CATALOG).map(({ descriptor, requiredFlags }) => ({
    ...descriptor,
    toolName: AGENT_TOOL_NAMES[descriptor.name],
    agentBlockers: blocked([...requiredFlags, 'agents.provider.enabled']),
    mcpBlockers: blocked([...requiredFlags, 'agents.mcp.enabled'])
  }))
}
