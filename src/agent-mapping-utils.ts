import type { AgentMonitorConfig } from "./types.js"

/**
 * Get the domains that an agent is responsible for based on configured mappings.
 * Returns null if no mapping exists for the agent.
 *
 * Extracted to a separate module to break the circular dependency:
 * config.ts → agent-discovery.ts → domain-detector.ts → config.ts
 *
 * This function is pure and has no dependency on config resolution,
 * so it can safely live in its own module.
 */
export function getAgentDomains(
  agentName: string,
  config: AgentMonitorConfig
): string[] | null {
  if (!config.agentMappings || config.agentMappings.length === 0) return null

  const normalized = agentName.toLowerCase()
  const mapping = config.agentMappings.find((m) => m.agentName === normalized)

  return mapping ? mapping.domains : null
}
