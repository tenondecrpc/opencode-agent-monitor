import type { Plugin } from "@opencode-ai/plugin"
import { resolveConfigAsync } from "./config.js"
import { StructuredLogger } from "./logger.js"
import { detectDomains, detectAgentMismatch } from "./domain-detector.js"

const PLUGIN_VERSION = "1.0.0"
const PLUGIN_NAME = "agent-monitor"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UnknownRecord = Record<string, any>

/**
 * AgentMonitor Plugin for OpenCode.
 *
 * Monitors, audits, and analyzes agent/subagent routing and tool usage
 * in OpenCode sessions. Provides domain detection, routing mismatch
 * warnings, and structured JSON-line logging.
 *
 * Configuration is loaded from:
 * 1. .config/opencode/agent-monitor.json (preferred) or
 *    .opencode/agent-monitor.json (legacy fallback)
 * 2. Auto-discovery from opencode.json and .config/opencode/agents/*.md
 *    (or .opencode/agents/*.md as fallback)
 * 3. Built-in defaults
 *
 * @example
 * ```json
 * // opencode.json
 * {
 *   "plugin": ["opencode-agent-monitor"]
 * }
 * ```
 *
 * @example
 * ```json
 * // .config/opencode/agent-monitor.json (preferred)
 * // or .opencode/agent-monitor.json (legacy)
 * {
 *   "autoDetectAgents": true,
 *   "domains": [
 *     { "name": "data-science", "patterns": ["pandas", "numpy"] }
 *   ],
 *   "agentMappings": [
 *     { "agentName": "my-ui-agent", "domains": ["frontend", "vision"] }
 *   ]
 * }
 * ```
 *
 * @example
 * ```ts
 * // .config/opencode/plugins/agent-monitor.ts (preferred)
 * // or .opencode/plugins/agent-monitor.ts (legacy)
 * export const AgentMonitor = async (ctx) => {
 *   return {
 *     // ... hooks
 *   }
 * }
 * ```
 */
export const AgentMonitor: Plugin = async ({ project, client, directory }) => {
  // Resolve configuration with auto-discovery
  const config = await resolveConfigAsync({}, directory || process.cwd())

  // Initialize the structured logger
  const logger = new StructuredLogger(config)

  // Safely get project identifier
  const projectInfo = project as UnknownRecord | undefined
  const projectIdentifier =
    typeof projectInfo?.path === "string"
      ? projectInfo.path
      : typeof projectInfo?.name === "string"
        ? projectInfo.name
        : "unknown"

  // Log plugin initialization
  await logger.write({
    type: "plugin.loaded",
    service: PLUGIN_NAME,
    version: PLUGIN_VERSION,
    project: projectIdentifier,
    directory: directory || process.cwd(),
  })

  // Use structured logging via OpenCode's client (if enabled)
  if (config.display.structuredLogging) {
    try {
      await client.app.log({
        body: {
          service: PLUGIN_NAME,
          level: config.logLevel,
          message: `AgentMonitor v${PLUGIN_VERSION} initialized`,
          extra: {
            project: projectIdentifier,
            directory,
            logPath: config.logPath,
            domainDetection: config.enableDomainDetection,
            toolTracking: config.enableToolTracking,
            redaction: config.redactSensitiveData,
            toasts: config.display.toasts,
          },
        },
      })
    } catch {
      // Structured logging failure should not prevent plugin operation
    }
  }

  return {
    // ============================================================
    // Generic event handler - catches all events
    // ============================================================
    event: async ({ event }: { event?: UnknownRecord }) => {
      if (!config.enabled) return

      await logger.write({
        type: "event",
        eventType: event?.type,
        eventSummary: event?.type || "unknown",
      })
    },

    // ============================================================
    // Session lifecycle tracking
    // ============================================================
    "session.created": async (input?: UnknownRecord) => {
      if (!config.enabled || !config.enableSessionTracking) return

      await logger.write({
        type: "session.created",
        sessionID: input?.sessionID,
      })
    },

    "session.updated": async (input?: UnknownRecord) => {
      if (!config.enabled || !config.enableSessionTracking) return

      await logger.write({
        type: "session.updated",
        sessionID: input?.sessionID,
      })
    },

    "session.idle": async (input?: UnknownRecord) => {
      if (!config.enabled || !config.enableSessionTracking) return

      await logger.write({
        type: "session.idle",
        sessionID: input?.sessionID,
      })
    },

    "session.deleted": async (input?: UnknownRecord) => {
      if (!config.enabled || !config.enableSessionTracking) return

      await logger.write({
        type: "session.deleted",
        sessionID: input?.sessionID,
      })
    },

    "session.compacted": async (input?: UnknownRecord) => {
      if (!config.enabled || !config.enableSessionTracking) return

      await logger.write({
        type: "session.compacted",
        sessionID: input?.sessionID,
      })
    },

    "session.error": async (input?: UnknownRecord) => {
      if (!config.enabled || !config.enableSessionTracking) return

      // Sanitize error object to prevent leaking sensitive data
      // (connection strings, stack traces, internal paths, etc.)
      const sanitizedError = input?.error
        ? typeof input.error === "string"
          ? input.error.slice(0, 500) // Limit error message length
          : typeof input.error === "object"
            ? {
                name: (input.error as Error).name || "UnknownError",
                message: String((input.error as Error).message || "").slice(
                  0,
                  500
                ),
              }
            : String(input.error).slice(0, 500)
        : "unknown"

      await logger.write({
        type: "session.error",
        sessionID: input?.sessionID,
        error: sanitizedError,
      })

      // Structured logging (if enabled)
      if (config.display.structuredLogging) {
        try {
          // Use sanitized error to prevent leaking sensitive data
          const safeErrorMessage =
            typeof sanitizedError === "string"
              ? sanitizedError
              : (sanitizedError as { message?: string }).message || "unknown"
          await client.app.log({
            body: {
              service: PLUGIN_NAME,
              level: "error",
              message: `Session error: ${safeErrorMessage}`,
              extra: { sessionID: input?.sessionID },
            },
          })
        } catch {
          // Structured logging failure should not break the plugin
        }
      }

      // Toast notification (if enabled)
      if (config.display.toasts) {
        try {
          // Use sanitized error to prevent leaking sensitive data
          const safeToastMessage =
            typeof sanitizedError === "string"
              ? sanitizedError
              : (sanitizedError as { message?: string }).message || "unknown"
          await client.tui.showToast({
            body: {
              message: `Session error: ${String(safeToastMessage).slice(0, 60)}`,
              variant: "error",
            },
          })
        } catch {
          // Toast failure should not break the plugin
        }
      }
    },

    // ============================================================
    // Tool execution tracking
    // ============================================================
    "tool.execute.before": async (
      input?: UnknownRecord,
      output?: UnknownRecord
    ) => {
      if (!config.enabled || !config.enableToolTracking) return

      const tool = input?.tool || output?.tool
      const sessionID = input?.sessionID || output?.sessionID

      // Skip excluded tools
      if (config.excludedTools?.includes(tool)) return

      await logger.write({
        type: "tool.execute.before",
        tool,
        sessionID,
        callID: input?.callID || output?.callID,
      })
    },

    "tool.execute.after": async (
      input?: UnknownRecord,
      output?: UnknownRecord
    ) => {
      if (!config.enabled || !config.enableToolTracking) return

      const tool = input?.tool || output?.tool
      const sessionID = input?.sessionID || output?.sessionID

      // Skip excluded tools
      if (config.excludedTools?.includes(tool)) return

      // Perform domain detection on tool input/output if enabled
      let domainDetection = null
      if (config.enableDomainDetection) {
        const text = JSON.stringify({
          toolInput: input,
          toolOutput: output,
        })
        domainDetection = detectDomains(text, config)
      }

      await logger.write({
        type: "tool.execute.after",
        tool,
        sessionID,
        callID: input?.callID || output?.callID,
        ...(domainDetection
          ? {
              guessedDomains: domainDetection.domains,
              domainConfidence: domainDetection.confidence,
            }
          : {}),
      })
    },

    // ============================================================
    // Permission tracking
    // ============================================================
    "permission.asked": async (input?: UnknownRecord) => {
      if (!config.enabled || !config.enablePermissionTracking) return

      await logger.write({
        type: "permission.asked",
        tool: input?.tool,
        sessionID: input?.sessionID,
      })
    },

    "permission.replied": async (input?: UnknownRecord) => {
      if (!config.enabled || !config.enablePermissionTracking) return

      const decision = input?.decision as string | undefined

      await logger.write({
        type: "permission.replied",
        tool: input?.tool,
        sessionID: input?.sessionID,
        decision,
      })

      // Toast notification for denied permissions (if enabled)
      if (config.display.toasts && decision === "deny") {
        try {
          await client.tui.showToast({
            body: {
              message: `🚫 Permission denied: ${input?.tool || "unknown"}`,
              variant: "warning",
            },
          })
        } catch {
          // Toast failure should not break the plugin
        }
      }
    },

    // ============================================================
    // Message tracking
    // ============================================================
    "message.updated": async (input?: UnknownRecord) => {
      if (!config.enabled) return

      const message = input?.message as UnknownRecord | undefined
      const text = message?.content
        ? typeof message.content === "string"
          ? message.content
          : JSON.stringify(message.content)
        : ""

      // Detect routing mismatches if domain detection is enabled
      if (config.enableDomainDetection && config.emitRoutingWarnings && text) {
        const agentName = (message?.role as string) || ""
        const mismatch = detectAgentMismatch(text, agentName, config)

        if (mismatch) {
          await logger.write({
            type: "routing.mismatch",
            expectedDomains: mismatch.expectedDomains,
            actualAgent: mismatch.actualAgent,
            mismatches: mismatch.mismatches,
            confidence: mismatch.confidence,
          })

          // Structured logging (if enabled)
          if (config.display.structuredLogging) {
            try {
              await client.app.log({
                body: {
                  service: PLUGIN_NAME,
                  level: "warn",
                  message: `Routing mismatch: task suggests [${mismatch.expectedDomains.join(", ")}] but agent is "${mismatch.actualAgent}"`,
                  extra: {
                    mismatches: mismatch.mismatches,
                    confidence: mismatch.confidence,
                  },
                },
              })
            } catch {
              // Structured logging failure should not break the plugin
            }
          }

          // Toast notification (if enabled)
          if (config.display.toasts) {
            try {
              await client.tui.showToast({
                body: {
                  message: `⚠ Routing mismatch: "${mismatch.actualAgent}" handling [${mismatch.mismatches.join(", ")}]`,
                  variant: "warning",
                },
              })
            } catch {
              // Toast failure should not break the plugin
            }
          }
        }
      }

      await logger.write({
        type: "message.updated",
        messageType: message?.type,
        messageRole: message?.role,
        sessionID: input?.sessionID,
      })
    },

    // ============================================================
    // File tracking
    // ============================================================
    "file.edited": async (input?: UnknownRecord) => {
      if (!config.enabled) return

      await logger.write({
        type: "file.edited",
        filePath: input?.filePath,
        sessionID: input?.sessionID,
      })
    },

    // ============================================================
    // Command tracking
    // ============================================================
    "command.executed": async (input?: UnknownRecord) => {
      if (!config.enabled) return

      await logger.write({
        type: "command.executed",
        command: input?.command,
        sessionID: input?.sessionID,
      })
    },

    // ============================================================
    // TUI tracking
    // ============================================================
    "tui.toast.show": async (input?: UnknownRecord) => {
      if (!config.enabled) return

      await logger.write({
        type: "tui.toast.show",
        message: input?.message,
      })
    },
  }
}

export default AgentMonitor
