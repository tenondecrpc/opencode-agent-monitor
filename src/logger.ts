import fs from "node:fs/promises"
import path from "node:path"
import type { AgentMonitorConfig } from "./types.js"

/**
 * Patterns that may indicate sensitive data (secrets, keys, tokens, credentials).
 * Used for redaction when redactSensitiveData is enabled.
 * Patterns handle both plain text and JSON formats.
 */
const SENSITIVE_PATTERNS = [
  // API keys and tokens (handles JSON: "api_key":"value" and plain: api_key: value)
  /["']?(api[_-]?key|apikey)["']?\s*[:=]\s*["']?[A-Za-z0-9\-_]{16,}/gi,
  /["']?(secret[_-]?key|secretkey)["']?\s*[:=]\s*["']?[A-Za-z0-9\-_]{16,}/gi,
  /["']?(access[_-]?token|accesstoken)["']?\s*[:=]\s*["']?[A-Za-z0-9\-_.]{16,}/gi,
  /["']?(auth[_-]?token|authtoken)["']?\s*[:=]\s*["']?[A-Za-z0-9\-_.]{16,}/gi,
  // AWS credentials
  /["']?(aws[_-]?access[_-]?key[_-]?id)["']?\s*[:=]\s*["']?[A-Z0-9]{16,}/gi,
  /["']?(aws[_-]?secret[_-]?access[_-]?key)["']?\s*[:=]\s*["']?[A-Za-z0-9/+=]{24,}/gi,
  // Generic secrets
  /["']?(password|passwd|pwd)["']?\s*[:=]\s*["']?[^\s"']{8,}/gi,
  /["']?(private[_-]?key)["']?\s*[:=]\s*["']?[^\s"']{16,}/gi,
  // Bearer tokens
  /bearer\s+[A-Za-z0-9\-_.]{20,}/gi,
  // Connection strings with passwords (expanded protocol coverage)
  /(mongodb|postgres|postgresql|mysql|redis|amqp|amqps|sqlite|mssql|oracle):\/\/[^\s"']+:[^\s"']+@/gi,
  // Base64 encoded secrets — only when preceded by a sensitive key name
  // This avoids false positives on legitimate long base64 strings
  /["']?(token|secret|key|password|credential|auth)["']?\s*[:=]\s*["'][A-Za-z0-9+/]{40,}={0,2}["']/gi,
  // Bearer tokens in Authorization headers (common in curl commands, etc.)
  /authorization["']?\s*[:=]\s*["']?bearer\s+[A-Za-z0-9\-_.+/]{20,}/gi,
  // API keys in URL query parameters
  /[?&](api[_-]?key|token|access[_-]?key|secret[_-]?key)=([A-Za-z0-9\-_]{16,})/gi,
]

/**
 * Redact potentially sensitive data from a string.
 * Replaces matched patterns with "[REDACTED]" while preserving valid JSON structure.
 */
export function redactSensitiveData(input: string): string {
  let result = input
  for (const pattern of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, (match) => {
      // Preserve the key name but redact the value
      const colonIndex = match.indexOf(":")
      const equalsIndex = match.indexOf("=")
      const separatorIndex =
        colonIndex !== -1 && equalsIndex !== -1
          ? Math.min(colonIndex, equalsIndex)
          : Math.max(colonIndex, equalsIndex)

      if (separatorIndex !== -1) {
        const keyPart = match.slice(0, separatorIndex + 1)
        const valuePart = match.slice(separatorIndex + 1)

        // Check if the value was quoted (JSON string)
        const isQuoted = valuePart.startsWith('"') || valuePart.startsWith("'")
        const quoteChar = isQuoted ? valuePart[0] : ""

        // Check if there's a trailing quote
        const hasTrailingQuote =
          isQuoted &&
          (valuePart.endsWith('"') || valuePart.endsWith("'")) &&
          valuePart.length > 1

        if (isQuoted && hasTrailingQuote) {
          // Replace the value while keeping quotes for valid JSON
          return keyPart + quoteChar + "[REDACTED]" + quoteChar
        } else if (isQuoted) {
          // Opening quote but no closing quote in match
          return keyPart + quoteChar + "[REDACTED]"
        } else {
          // Unquoted value
          return keyPart + "[REDACTED]"
        }
      }
      return "[REDACTED]"
    })
  }
  return result
}

/**
 * Redact sensitive data from an object by stringifying, redacting, and re-parsing.
 * On parse failure, returns a safe placeholder instead of the unredacted original
 * to prevent accidental data leakage.
 */
export function redactObject<T>(obj: T): T {
  try {
    const json = JSON.stringify(obj)
    const redacted = redactSensitiveData(json)
    return JSON.parse(redacted) as T
  } catch {
    // Return a safe placeholder instead of the unredacted original
    // to prevent sensitive data from leaking into logs
    return { redactionError: true, message: "[REDACTED]" } as unknown as T
  }
}

/**
 * Safe structured logger that writes JSON lines to a file.
 * Handles directory creation, log rotation, and optional redaction.
 */
export class StructuredLogger {
  private config: AgentMonitorConfig

  constructor(config: AgentMonitorConfig) {
    this.config = config
  }

  /**
   * Write a log entry as a JSON line.
   * Handles directory creation and log rotation.
   */
  async write(entry: Record<string, unknown>): Promise<void> {
    if (!this.config.enabled) return

    const logEntry = {
      ts: new Date().toISOString(),
      ...entry,
    }

    // Apply redaction if enabled
    const safeEntry = this.config.redactSensitiveData
      ? redactObject(logEntry)
      : logEntry

    const line = JSON.stringify(safeEntry) + "\n"

    try {
      // Ensure the log directory exists with restricted permissions
      const logDir = path.dirname(this.config.logPath)
      await fs.mkdir(logDir, { recursive: true, mode: 0o700 })

      // Check if rotation is needed
      await this.maybeRotate()

      // Append the log line
      await fs.appendFile(this.config.logPath, line, { encoding: "utf-8" })

      // Ensure log file has restricted permissions (owner read/write only)
      try {
        await fs.chmod(this.config.logPath, 0o600)
      } catch {
        // chmod failure should not prevent logging
      }
    } catch (error) {
      // Log errors should never crash the plugin
      // Use structured logging to report the error
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      // Attempt to write error to stderr as fallback
      process.stderr.write(
        `[agent-monitor] Failed to write log: ${errorMessage}\n`
      )
    }
  }

  /**
   * Check if the log file exceeds the max size and rotate if needed.
   */
  private async maybeRotate(): Promise<void> {
    if (this.config.maxLogSize <= 0) return

    try {
      const stat = await fs.stat(this.config.logPath)
      if (stat.size < this.config.maxLogSize) return
    } catch {
      // File doesn't exist yet, no rotation needed
      return
    }

    await this.rotate()
  }

  /**
   * Rotate the log file.
   * Shifts existing rotated files and creates a new log file.
   */
  private async rotate(): Promise<void> {
    const maxFiles = this.config.maxRotatedFiles

    // Remove the oldest file if it exceeds the limit
    const oldestPath = `${this.config.logPath}.${maxFiles}`
    try {
      await fs.unlink(oldestPath)
    } catch {
      // File may not exist, which is fine
    }

    // Shift existing rotated files
    for (let i = maxFiles - 1; i >= 1; i--) {
      const src = `${this.config.logPath}.${i}`
      const dest = `${this.config.logPath}.${i + 1}`
      try {
        await fs.rename(src, dest)
      } catch {
        // File may not exist, which is fine
      }
    }

    // Move current log to .1
    try {
      await fs.rename(this.config.logPath, `${this.config.logPath}.1`)
    } catch {
      // File may not exist, which is fine
    }
  }
}
