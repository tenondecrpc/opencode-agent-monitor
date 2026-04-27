import type { Domain } from "./types.js"

/**
 * Simple JSON config file format for agent-monitor.json.
 * Place in .config/opencode/ (preferred) or .opencode/ (legacy).
 * This is the user-friendly way to configure the plugin without writing TypeScript.
 */
export interface AgentMonitorJsonConfig {
  /**
   * Enable or disable the monitor.
   * @default true
   */
  enabled?: boolean

    /**
     * Path to the log file (relative to project root or absolute).
     * @default ".config/opencode/agent-monitor.log" (or ".opencode/agent-monitor.log" as fallback)
     */
  logPath?: string

  /**
   * Maximum log file size in bytes before rotation.
   * Set to 0 to disable rotation.
   * @default 10485760 (10 MB)
   */
  maxLogSize?: number

  /**
   * Number of rotated log files to keep.
   * @default 5
   */
  maxRotatedFiles?: number

  /**
   * Enable domain detection and routing analysis.
   * @default true
   */
  enableDomainDetection?: boolean

  /**
   * Enable tool usage tracking.
   * @default true
   */
  enableToolTracking?: boolean

  /**
   * Enable permission request tracking.
   * @default true
   */
  enablePermissionTracking?: boolean

  /**
   * Enable session lifecycle tracking.
   * @default true
   */
  enableSessionTracking?: boolean

  /**
   * Redact sensitive patterns from logs.
   * @default true
   */
  redactSensitiveData?: boolean

  /**
   * Log level for structured logging.
   * @default "info"
   */
  logLevel?: "debug" | "info" | "warn" | "error"

  /**
   * Emit warnings for routing mismatches.
   * @default true
   */
  emitRoutingWarnings?: boolean

  /**
   * Tools to exclude from tracking.
   */
  excludedTools?: string[]

  /**
   * Custom domain definitions.
   * Each entry has a name and an array of keyword patterns.
   * Patterns are matched case-insensitively against task text.
   *
   * @example
   * ```json
   * {
   *   "domains": [
   *     { "name": "data-science", "patterns": ["pandas", "numpy", "matplotlib"] },
   *     { "name": "mobile", "patterns": ["react native", "flutter", "swift"] }
   *   ]
   * }
   * ```
   */
  domains?: {
    name: Domain
    patterns: string[]
  }[]

  /**
   * Whether to merge custom domains with built-in defaults.
   * When true (default), custom domains are added to defaults.
   * When false, only custom domains are used.
   * @default true
   */
  mergeDomains?: boolean

  /**
   * Maps agent names to the domains they handle.
   * This is how the plugin knows which agent is responsible for which domain.
   *
   * @example
   * ```json
   * {
   *   "agentMappings": [
   *     { "agentName": "frontend", "domains": ["frontend", "vision"] },
   *     { "agentName": "backend", "domains": ["backend", "cloud"] },
   *     { "agentName": "my-custom-agent", "domains": ["security"] }
   *   ]
   * }
   * ```
   */
  agentMappings?: {
    agentName: string
    domains: Domain[]
  }[]

  /**
   * Automatically detect agents from opencode.json and agent markdown files.
   * When enabled, the plugin will:
   * 1. Read opencode.json "agent" section
   * 2. Read .config/opencode/agents/*.md (preferred) or .opencode/agents/*.md (legacy)
   * 3. Analyze descriptions and prompts to detect domains
   * 4. Generate agentMappings automatically
   *
   * Auto-detected mappings are merged with manually configured mappings.
   * Manual mappings take precedence.
   *
   * @default true
   */
  autoDetectAgents?: boolean

  /**
   * Display options for showing monitoring information to the user.
   * File logging is always active; these control additional visibility.
   */
  display?: {
    /**
     * Show toast notifications in the TUI for important events.
     * @default false
     */
    toasts?: boolean
    /**
     * Write structured logs via client.app.log().
     * @default true
     */
    structuredLogging?: boolean
  }
}

/**
 * Represents an agent discovered from OpenCode's configuration.
 */
export interface DiscoveredAgent {
  /** Agent name/identifier */
  name: string
  /** Agent description */
  description: string
  /** Agent system prompt (may be a file reference or inline text) */
  prompt: string
  /** Agent mode: primary, subagent, or all */
  mode: string
  /** Source of the agent config: "json" or "markdown" */
  source: "json" | "markdown"
}
