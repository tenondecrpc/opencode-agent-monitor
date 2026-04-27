import fs from "node:fs"
import fsAsync from "node:fs/promises"
import path from "node:path"
import type {
  AgentMonitorConfig,
  DomainDefinition,
  AgentDomainMapping,
} from "./types.js"
import { DEFAULT_CONFIG, DEFAULT_DOMAIN_DEFINITIONS } from "./types.js"
import type { AgentMonitorJsonConfig } from "./json-config.js"
import { discoverAgents, generateAgentMappings } from "./agent-discovery.js"
import { resolveOpenCodeDir } from "./utils.js"
import { isSafeRegexPattern } from "./domain-detector.js"
// Re-exported from separate module to break circular dependency
export { getAgentDomains } from "./agent-mapping-utils.js"

/**
 * Load the JSON config file from .config/opencode/agent-monitor.json
 * (preferred) or .opencode/agent-monitor.json (legacy fallback).
 * Returns null if the file doesn't exist or is invalid.
 */
async function loadJsonConfig(
  projectDir: string
): Promise<AgentMonitorJsonConfig | null> {
  const resolved = await resolveOpenCodeDir(projectDir)

  // Try preferred location first
  const preferredPath = path.join(resolved.dir, "agent-monitor.json")
  try {
    const content = await fsAsync.readFile(preferredPath, "utf-8")
    return JSON.parse(content) as AgentMonitorJsonConfig
  } catch {
    // File not found in preferred location, try legacy
  }

  // Try legacy .opencode/ location
  const legacyPath = path.join(projectDir, ".opencode", "agent-monitor.json")
  if (legacyPath !== preferredPath) {
    try {
      const content = await fsAsync.readFile(legacyPath, "utf-8")
      return JSON.parse(content) as AgentMonitorJsonConfig
    } catch {
      return null
    }
  }

  return null
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
      toasts: json.display.toasts ?? true,
      structuredLogging: json.display.structuredLogging ?? true,
    }
  }

  return config
}

/**
 * Pre-compile regex patterns for all domain definitions.
 * This avoids recompiling the same patterns on every tool execution,
 * which can be a significant performance bottleneck.
 *
 * Unsafe or invalid patterns are silently skipped.
 */
function compileDomainPatterns(domains: DomainDefinition[]): void {
  for (const def of domains) {
    def.compiledPatterns = def.patterns
      .filter(isSafeRegexPattern)
      .map((pattern) => {
        try {
          return new RegExp(pattern, "i")
        } catch {
          return null
        }
      })
      .filter((regex): regex is RegExp => regex !== null)
  }
}

/**
 * Resolve and validate the plugin configuration.
 *
 * Configuration is loaded from multiple sources in this order:
 * 1. .config/opencode/agent-monitor.json (preferred) or
 *    .opencode/agent-monitor.json (legacy fallback)
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

  // Step 3: Resolve the OpenCode directory for default paths
  const openCodeDir = await resolveOpenCodeDir(projectDir)
  const defaultLogPath = path.join(openCodeDir.dir, "agent-monitor.log")

  // Step 4: Build the full config with defaults
  const config: AgentMonitorConfig = {
    ...DEFAULT_CONFIG,
    logPath: defaultLogPath,
    ...mergedConfig,
  }

  // Resolve relative log paths against the project directory
  if (!path.isAbsolute(config.logPath)) {
    config.logPath = path.resolve(projectDir, config.logPath)
  }

  // Security: Validate that logPath is within the project directory
  // to prevent path traversal attacks via malicious config files.
  // Uses fs.realpath to resolve symlinks before comparison.
  let resolvedProjectDir = path.resolve(projectDir)
  try {
    resolvedProjectDir = await fsAsync.realpath(resolvedProjectDir)
  } catch {
    // If realpath fails (e.g., directory doesn't exist yet), fall back to path.resolve
  }
  if (
    !config.logPath.startsWith(resolvedProjectDir + path.sep) &&
    config.logPath !== resolvedProjectDir
  ) {
    // Reset to default path within project directory
    config.logPath = defaultLogPath
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

  // Pre-compile regex patterns for performance (avoids recompilation on every tool call)
  compileDomainPatterns(config.domains)

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
  // Sync version of resolveOpenCodeDir
  let openCodeDir: string
  const configOpencode = path.join(projectDir, ".config", "opencode")
  const legacyOpencode = path.join(projectDir, ".opencode")
  try {
    fs.accessSync(configOpencode)
    openCodeDir = configOpencode
  } catch {
    try {
      fs.accessSync(legacyOpencode)
      openCodeDir = legacyOpencode
    } catch {
      // Neither exists — log warning and fallback
      process.stderr.write(
        `[agent-monitor] Neither "${configOpencode}" nor "${legacyOpencode}" found. ` +
          `Using "${configOpencode}" as default. ` +
          `Create one of these directories so the plugin can store its config and logs.\n`
      )
      openCodeDir = configOpencode
    }
  }

  const defaultLogPath = path.join(openCodeDir, "agent-monitor.log")

  const config: AgentMonitorConfig = {
    ...DEFAULT_CONFIG,
    logPath: defaultLogPath,
    ...userConfig,
  }

  // Resolve relative log paths against the project directory
  if (!path.isAbsolute(config.logPath)) {
    config.logPath = path.resolve(projectDir, config.logPath)
  }

  // Security: Validate that logPath is within the project directory
  // to prevent path traversal attacks via malicious config files.
  // Uses fs.realpathSync to resolve symlinks before comparison.
  let resolvedProjectDir = path.resolve(projectDir)
  try {
    resolvedProjectDir = fs.realpathSync(resolvedProjectDir)
  } catch {
    // If realpathSync fails (e.g., directory doesn't exist yet), fall back to path.resolve
  }
  if (
    !config.logPath.startsWith(resolvedProjectDir + path.sep) &&
    config.logPath !== resolvedProjectDir
  ) {
    // Reset to default path within project directory
    config.logPath = defaultLogPath
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

  // Pre-compile regex patterns for performance (avoids recompilation on every tool call)
  compileDomainPatterns(config.domains)

  // Normalize agent mappings: ensure agentName is lowercase for matching
  if (config.agentMappings) {
    config.agentMappings = config.agentMappings.map((mapping) => ({
      ...mapping,
      agentName: mapping.agentName.toLowerCase(),
    }))
  }

  return config
}


