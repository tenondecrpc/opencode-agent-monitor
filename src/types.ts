import type { Plugin } from "@opencode-ai/plugin"

/**
 * Domain is an open string type.
 * Any domain name can be used — the built-in defaults are just a starting point.
 * Users define their own domains via configuration.
 */
export type Domain = string

/**
 * Maps an agent name (as it appears in OpenCode) to the domain(s) it handles.
 * This is how the plugin knows which agent is responsible for which domain,
 * regardless of what names the user chooses for their agents.
 */
export interface AgentDomainMapping {
  /** The agent name as configured in OpenCode (e.g., "frontend", "my-ui-agent") */
  agentName: string
  /** The domain(s) this agent is responsible for */
  domains: Domain[]
}

/**
 * A domain definition with its keyword patterns for text-based detection.
 */
export interface DomainDefinition {
  /** Display name for the domain (e.g., "frontend", "infra") */
  name: Domain
  /** Regex patterns (as strings) that indicate this domain in task text */
  patterns: string[]
}

/**
 * Result of domain detection from text analysis.
 */
export interface DomainDetection {
  /** Detected domain categories */
  domains: Domain[]
  /** Confidence score (0-1) based on keyword match density */
  confidence: number
  /** Keywords that triggered the detection */
  matchedKeywords: string[]
}

/**
 * Configuration for the AgentMonitor plugin.
 */
export interface AgentMonitorConfig {
  /**
   * Enable or disable the monitor.
   * @default true
   */
  enabled: boolean

  /**
   * Path to the log file. Supports absolute and relative paths.
   * Relative paths are resolved from the project root.
   * @default ".config/opencode/agent-monitor.log" (or ".opencode/agent-monitor.log" as fallback)
   */
  logPath: string

  /**
   * Maximum log file size in bytes before rotation.
   * Set to 0 to disable rotation.
   * @default 10485760 (10 MB)
   */
  maxLogSize: number

  /**
   * Number of rotated log files to keep.
   * @default 5
   */
  maxRotatedFiles: number

  /**
   * Enable domain detection and routing analysis.
   * @default true
   */
  enableDomainDetection: boolean

  /**
   * Enable tool usage tracking.
   * @default true
   */
  enableToolTracking: boolean

  /**
   * Enable permission request tracking.
   * @default true
   */
  enablePermissionTracking: boolean

  /**
   * Enable session lifecycle tracking.
   * @default true
   */
  enableSessionTracking: boolean

  /**
   * Redact sensitive patterns from logs.
   * When enabled, potential secrets, keys, and tokens are replaced with "[REDACTED]".
   * @default true
   */
  redactSensitiveData: boolean

  /**
   * Log level for structured logging via client.app.log().
   * @default "info"
   */
  logLevel: "debug" | "info" | "warn" | "error"

  /**
   * Domain definitions used for text-based detection.
   * Each domain has a name and an array of regex patterns.
   * If not provided, built-in defaults are used.
   * If provided, these definitions replace the defaults entirely
   * (merge with `mergeDomainDefinitions: true`).
   */
  domains?: DomainDefinition[]

  /**
   * Whether to merge custom domain definitions with built-in defaults.
   * When true (default), custom definitions are added on top of defaults.
   * When false, only custom definitions are used.
   * @default true
   */
  mergeDomainDefinitions: boolean

  /**
   * Maps agent names to the domains they handle.
   * This is required for routing mismatch detection.
   *
   * Example:
   * ```ts
   * [
   *   { agentName: "frontend", domains: ["frontend"] },
   *   { agentName: "my-custom-ui-agent", domains: ["frontend", "vision"] },
   *   { agentName: "backend", domains: ["backend", "cloud"] },
   * ]
   * ```
   *
   * If not provided, mismatch detection falls back to checking if the
   * agent name contains the domain name as a substring.
   */
  agentMappings?: AgentDomainMapping[]

  /**
   * Tools to exclude from tracking.
   * @default []
   */
  excludedTools?: string[]

  /**
   * Emit warnings to the OpenCode log when routing mismatches are detected.
   * @default true
   */
  emitRoutingWarnings: boolean

  /**
   * Display options for showing monitoring information to the user.
   * File logging is always active; these control additional visibility.
   */
  display: {
    /**
     * Show toast notifications in the TUI for important events.
     * Toasts are brief, non-intrusive messages that auto-dismiss.
     *
     * Events that trigger toasts:
     * - Routing mismatches (warn)
     * - Session errors (error)
     * - Permission denials (warn)
     *
     * @default false
     */
    toasts: boolean

    /**
     * Write structured logs via client.app.log().
     * These appear in OpenCode's internal log viewer and
     * can be filtered by service name "agent-monitor".
     *
     * @default true
     */
    structuredLogging: boolean
  }
}

/**
 * Built-in default domain definitions.
 * These are provided as a starting point but are not enforced as types.
 * Users can override, extend, or replace them entirely.
 */
export const DEFAULT_DOMAIN_DEFINITIONS: DomainDefinition[] = [
  {
    name: "frontend",
    patterns: [
      "frontend",
      "ui",
      "responsive",
      "accessibility",
      "a11y",
      "react",
      "vite",
      "css",
      "component",
      "layout",
      "tailwind",
      "styled",
      "dom",
      "browser",
      "html",
      "jsx",
      "tsx",
      "svelte",
      "vue",
      "angular",
      "next\\.js",
      "remix",
      "astro",
    ],
  },
  {
    name: "backend",
    patterns: [
      "backend",
      "api",
      "fastapi",
      "route",
      "controller",
      "service",
      "database",
      "auth",
      "webhook",
      "worker",
      "queue",
      "business logic",
      "rest",
      "graphql",
      "grpc",
      "express",
      "django",
      "flask",
      "spring",
      "laravel",
      "rails",
      "gorm",
      "prisma",
      "sql",
      "nosql",
      "redis",
      "kafka",
      "rabbitmq",
    ],
  },
  {
    name: "cloud",
    patterns: [
      "cloud",
      "infra",
      "aws",
      "cdk",
      "terraform",
      "docker",
      "helm",
      "kubernetes",
      "k8s",
      "ci/cd",
      "deployment",
      "deploy",
      "observability",
      "gcp",
      "azure",
      "serverless",
      "lambda",
      "ec2",
      "s3",
      "rds",
      "cloudfront",
      "vpc",
      "load balancer",
      "autoscaling",
      "container",
      "pod",
      "service mesh",
      "istio",
      "prometheus",
      "grafana",
      "datadog",
    ],
  },
  {
    name: "security",
    patterns: [
      "security",
      "secret",
      "credential",
      "iam",
      "permission",
      "authorization",
      "encryption",
      "dependency",
      "supply.chain",
      "vulnerability",
      "pii",
      "phi",
      "owasp",
      "xss",
      "csrf",
      "sql injection",
      "rate limit",
      "cors",
      "csp",
      "oauth",
      "oidc",
      "jwt",
      "rbac",
      "abac",
      "least privilege",
      "audit",
      "compliance",
      "gdpr",
      "hipaa",
      "soc2",
    ],
  },
  {
    name: "architect",
    patterns: [
      "architecture",
      "architect",
      "maintainability",
      "module boundary",
      "data flow",
      "contract",
      "coupling",
      "scalability",
      "design pattern",
      "solid",
      "dry",
      "kiss",
      "yagni",
      "monolith",
      "microservice",
      "event.driven",
      "cqs",
      "cqrs",
      "ddd",
      "hexagonal",
      "clean architecture",
      "layered",
      "cohesion",
    ],
  },
  {
    name: "qa",
    patterns: [
      "qa",
      "test",
      "regression",
      "edge case",
      "coverage",
      "validation",
      "verify",
      "verification",
      "unit test",
      "integration test",
      "e2e",
      "end.to.end",
      "mock",
      "stub",
      "fixture",
      "assertion",
      "jest",
      "vitest",
      "cypress",
      "playwright",
      "selenium",
      "tdd",
      "bdd",
      "test driven",
    ],
  },
  {
    name: "documenter",
    patterns: [
      "document",
      "docs",
      "readme",
      "runbook",
      "setup",
      "changelog",
      "migration",
      "api reference",
      "tutorial",
      "guide",
      "faq",
      "contributing",
      "code of conduct",
      "license",
      "adr",
      "architecture decision",
      "diagram",
      "mermaid",
    ],
  },
  {
    name: "refiner",
    patterns: [
      "refactor",
      "cleanup",
      "naming",
      "formatting",
      "lint",
      "prettier",
      "code style",
      "dead code",
      "unused",
      "simplify",
      "extract",
      "inline",
      "rename",
      "reorder",
      "organize",
    ],
  },
  {
    name: "explore",
    patterns: [
      "explore",
      "discover",
      "search",
      "find",
      "dependency",
      "trace",
      "convention",
      "map",
      "scan",
      "analyze",
      "inspect",
      "investigate",
    ],
  },
  {
    name: "general",
    patterns: [
      "general",
      "summary",
      "rewrite",
      "synthesis",
      "medium.complexity",
      "side task",
      "utility",
      "helper",
      "script",
      "automation",
    ],
  },
  {
    name: "vision",
    patterns: [
      "screenshot",
      "image",
      "visual",
      "ui capture",
      "diagram",
      "visual comparison",
      "pixel",
      "mockup",
      "design",
      "figma",
      "sketch",
      "wireframe",
      "accessibility audit",
      "contrast",
      "color",
    ],
  },
]

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG: Omit<AgentMonitorConfig, "logPath"> = {
  enabled: true,
  maxLogSize: 10_485_760, // 10 MB
  maxRotatedFiles: 5,
  enableDomainDetection: true,
  enableToolTracking: true,
  enablePermissionTracking: true,
  enableSessionTracking: true,
  redactSensitiveData: true,
  logLevel: "info",
  mergeDomainDefinitions: true,
  emitRoutingWarnings: true,
  display: {
    toasts: true,
    structuredLogging: true,
  },
}

/**
 * Plugin context type for type-safe plugin development.
 */
export type AgentMonitorPlugin = Plugin
