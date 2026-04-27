import fs from "node:fs/promises"
import path from "node:path"
import type {
  AgentMonitorConfig,
  DomainDefinition,
  AgentDomainMapping,
} from "./types.js"
import { DEFAULT_CONFIG, DEFAULT_DOMAIN_DEFINITIONS } from "./types.js"
import type { AgentMonitorJsonConfig } from "./json-config.js"
import { discoverAgents, generateAgentMappings } from "./agent-discovery.js"

/**
 * Load the JSON config file from .opencode/agent-monitor.json.
 * Returns null if the file doesn't exist or is invalid.
 */
async function loadJsonConfig(
  projectDir: string
): Promise<AgentMonitorJsonConfig | null> {
  const configPath = path.join(projectDir, ".opencode", "agent-monitor.json")
  try {
    const content = await fs.readFile(configPath, "utf-8")
    return JSON.parse(content) as AgentMonitorJsonConfig
  } catch {
    return null
  }
}

/**
 * Convert JSON config format to internal AgentMonitorConfig.
 */
function jsonToInternalConfig(
  json: AgentMonitorJsonConfig,
  _projectDir: string
): Partial<AgentMonitorConfig> {
  const config: Partial<AgentMonitorConfig> = {}

  if (json.enabled !== undefined) config.enabled = json.enabled
  if (json.logPath !== undefined) config.logPath = json.logPath
  if (json.maxLogSize !== undefined) config.maxLogSize = json.maxLogSize
  if (json.maxRotatedFiles !== undefined)
    config.maxRotatedFiles = json.maxRotatedFiles
  if (json.enableDomainDetection !== undefined)
    config.enableDomainDetection = json.enableDomainDetection
  if (json.enableToolTracking !== undefined)
    config.enableToolTracking = json.enableToolTracking
  if (json.enablePermissionTracking !== undefined)
    config.enablePermissionTracking = json.enablePermissionTracking
  if (json.enableSessionTracking !== undefined)
    config.enableSessionTracking = json.enableSessionTracking
  if (json.redactSensitiveData !== undefined)
    config.redactSensitiveData = json.redactSensitiveData
  if (json.logLevel !== undefined) config.logLevel = json.logLevel
  if (json.emitRoutingWarnings !== undefined)
    config.emitRoutingWarnings = json.emitRoutingWarnings
  if (json.excludedTools !== undefined)
    config.excludedTools = json.excludedTools

  // Convert domains format
  if (json.domains && json.domains.length > 0) {
    config.domains = json.domains as DomainDefinition[]
  }
  config.mergeDomainDefinitions = json.mergeDomains ?? true

  // Convert agentMappings format
  if (json.agentMappings && json.agentMappings.length > 0) {
    config.agentMappings = json.agentMappings as AgentDomainMapping[]
  }

  // Convert display options
  if (json.display) {
    config.display = {
      toasts: json.display.toasts ?? false,
      structuredLogging: json.display.structuredLogging ?? true,
    }
  }

  return config
}

/**
 * Resolve and validate the plugin configuration.
 *
 * Configuration is loaded from multiple sources in this order:
 * 1. .opencode/agent-monitor.json (file-based config)
 * 2. userConfig parameter (programmatic config)
 * 3. Auto-discovery from OpenCode's agent configuration
 * 4. Built-in defaults
 *
 * Later sources override earlier ones.
 */
export async function resolveConfigAsync(
  userConfig: Partial<AgentMonitorConfig> = {},
  projectDir: string = process.cwd()
): Promise<AgentMonitorConfig> {
  // Step 1: Load JSON config file
  const jsonConfig = await loadJsonConfig(projectDir)
  const jsonInternal = jsonConfig
    ? jsonToInternalConfig(jsonConfig, projectDir)
    : {}

  // Step 2: Merge configs (userConfig overrides jsonConfig)
  const mergedConfig: Partial<AgentMonitorConfig> = {
    ...jsonInternal,
    ...userConfig,
  }

  // Step 3: Build the full config with defaults
  const config: AgentMonitorConfig = {
    ...DEFAULT_CONFIG,
    logPath: path.join(projectDir, ".opencode", "agent-monitor.log"),
    ...mergedConfig,
  }

  // Resolve relative log paths against the project directory
  if (!path.isAbsolute(config.logPath)) {
    config.logPath = path.resolve(projectDir, config.logPath)
  }

  // Security: Validate that logPath is within the project directory
  // to prevent path traversal attacks via malicious config files
  const resolvedProjectDir = path.resolve(projectDir)
  if (
    !config.logPath.startsWith(resolvedProjectDir + path.sep) &&
    config.logPath !== resolvedProjectDir
  ) {
    // Reset to default path within project directory
    config.logPath = path.join(projectDir, ".opencode", "agent-monitor.log")
  }

  // Validate maxLogSize with safe bounds
  // 0 disables rotation, negative values are invalid
  if (config.maxLogSize < 0) {
    config.maxLogSize = DEFAULT_CONFIG.maxLogSize
  }
  // Cap maxLogSize at 100 MB to prevent excessive disk usage
  const MAX_LOG_SIZE = 100 * 1024 * 1024 // 100 MB
  if (config.maxLogSize > MAX_LOG_SIZE) {
    config.maxLogSize = MAX_LOG_SIZE
  }

  // Validate maxRotatedFiles with safe bounds
  if (config.maxRotatedFiles < 0) {
    config.maxRotatedFiles = DEFAULT_CONFIG.maxRotatedFiles
  }
  // Cap maxRotatedFiles at 50 to prevent excessive disk usage
  const MAX_ROTATED_FILES = 50
  if (config.maxRotatedFiles > MAX_ROTATED_FILES) {
    config.maxRotatedFiles = MAX_ROTATED_FILES
  }

  // Resolve domain definitions
  if (config.domains && config.domains.length > 0) {
    if (config.mergeDomainDefinitions) {
      const defaultMap = new Map<string, DomainDefinition>()
      for (const def of DEFAULT_DOMAIN_DEFINITIONS) {
        defaultMap.set(def.name, def)
      }
      for (const def of config.domains) {
        defaultMap.set(def.name, def)
      }
      config.domains = Array.from(defaultMap.values())
    }
  } else {
    config.domains = [...DEFAULT_DOMAIN_DEFINITIONS]
  }

  // Step 4: Auto-detect agents if enabled
  const autoDetect = jsonConfig?.autoDetectAgents ?? true
  if (autoDetect && config.enableDomainDetection) {
    try {
      const discoveredAgents = await discoverAgents(projectDir, {
        includeGlobalConfig: false,
      })
      const autoMappings = generateAgentMappings(discoveredAgents, config)

      if (autoMappings.length > 0) {
        // Merge auto-detected mappings with manually configured ones
        // Manual mappings take precedence (deduplicate by agentName)
        const manualMap = new Map<string, AgentDomainMapping>()
        if (config.agentMappings) {
          for (const m of config.agentMappings) {
            manualMap.set(m.agentName.toLowerCase(), m)
          }
        }

        for (const m of autoMappings) {
          const key = m.agentName.toLowerCase()
          if (!manualMap.has(key)) {
            manualMap.set(key, m)
          }
        }

        config.agentMappings = Array.from(manualMap.values())
      }
    } catch {
      // Auto-discovery failure should not break the plugin
    }
  }

  // Normalize agent mappings: ensure agentName is lowercase for matching
  if (config.agentMappings) {
    config.agentMappings = config.agentMappings.map((mapping) => ({
      ...mapping,
      agentName: mapping.agentName.toLowerCase(),
    }))
  }

  return config
}

/**
 * Synchronous config resolution (for when async is not available).
 * Does NOT support auto-discovery or JSON config file loading.
 * Use resolveConfigAsync for full functionality.
 */
export function resolveConfig(
  userConfig: Partial<AgentMonitorConfig> = {},
  projectDir: string = process.cwd()
): AgentMonitorConfig {
  const config: AgentMonitorConfig = {
    ...DEFAULT_CONFIG,
    logPath: path.join(projectDir, ".opencode", "agent-monitor.log"),
    ...userConfig,
  }

  // Resolve relative log paths against the project directory
  if (!path.isAbsolute(config.logPath)) {
    config.logPath = path.resolve(projectDir, config.logPath)
  }

  // Security: Validate that logPath is within the project directory
  // to prevent path traversal attacks via malicious config files
  const resolvedProjectDir = path.resolve(projectDir)
  if (
    !config.logPath.startsWith(resolvedProjectDir + path.sep) &&
    config.logPath !== resolvedProjectDir
  ) {
    // Reset to default path within project directory
    config.logPath = path.join(projectDir, ".opencode", "agent-monitor.log")
  }

  // Validate maxLogSize with safe bounds
  // 0 disables rotation, negative values are invalid
  if (config.maxLogSize < 0) {
    config.maxLogSize = DEFAULT_CONFIG.maxLogSize
  }
  // Cap maxLogSize at 100 MB to prevent excessive disk usage
  const MAX_LOG_SIZE = 100 * 1024 * 1024 // 100 MB
  if (config.maxLogSize > MAX_LOG_SIZE) {
    config.maxLogSize = MAX_LOG_SIZE
  }

  // Validate maxRotatedFiles with safe bounds
  if (config.maxRotatedFiles < 0) {
    config.maxRotatedFiles = DEFAULT_CONFIG.maxRotatedFiles
  }
  // Cap maxRotatedFiles at 50 to prevent excessive disk usage
  const MAX_ROTATED_FILES = 50
  if (config.maxRotatedFiles > MAX_ROTATED_FILES) {
    config.maxRotatedFiles = MAX_ROTATED_FILES
  }

  // Resolve domain definitions
  if (config.domains && config.domains.length > 0) {
    if (config.mergeDomainDefinitions) {
      const defaultMap = new Map<string, DomainDefinition>()
      for (const def of DEFAULT_DOMAIN_DEFINITIONS) {
        defaultMap.set(def.name, def)
      }
      for (const def of config.domains) {
        defaultMap.set(def.name, def)
      }
      config.domains = Array.from(defaultMap.values())
    }
  } else {
    config.domains = [...DEFAULT_DOMAIN_DEFINITIONS]
  }

  // Normalize agent mappings: ensure agentName is lowercase for matching
  if (config.agentMappings) {
    config.agentMappings = config.agentMappings.map((mapping) => ({
      ...mapping,
      agentName: mapping.agentName.toLowerCase(),
    }))
  }

  return config
}

/**
 * Get the domains that an agent is responsible for based on configured mappings.
 * Returns null if no mapping exists for the agent.
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
