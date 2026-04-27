/**
 * Re-exported utilities for advanced plugin usage.
 *
 * Import from `opencode-agent-monitor/exports` instead of the main
 * entry point to avoid OpenCode's plugin loader treating these as
 * separate plugins (it iterates over all module exports and expects
 * each one to be a function).
 *
 * @example
 * ```typescript
 * import {
 *   resolveConfigAsync,
 *   StructuredLogger,
 *   detectDomains,
 *   detectAgentMismatch,
 * } from "opencode-agent-monitor/exports"
 * ```
 */

export { resolveConfig, resolveConfigAsync } from "./config.js"
export { getAgentDomains } from "./agent-mapping-utils.js"
export {
  StructuredLogger,
  redactSensitiveData,
  redactObject,
} from "./logger.js"
export { detectDomains, detectAgentMismatch } from "./domain-detector.js"
export { discoverAgents, generateAgentMappings } from "./agent-discovery.js"
export type {
  Domain,
  DomainDetection,
  AgentMonitorConfig,
  AgentMonitorPlugin,
  DomainDefinition,
  AgentDomainMapping,
} from "./types.js"
export type { AgentMonitorJsonConfig, DiscoveredAgent } from "./json-config.js"
