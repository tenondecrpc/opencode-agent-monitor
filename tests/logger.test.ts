import { describe, expect, test, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import {
  redactSensitiveData,
  redactObject,
  StructuredLogger,
} from "../src/logger.js"
import type { AgentMonitorConfig } from "../src/types.js"

const TEST_LOG_DIR = path.join(process.cwd(), ".test-logs")
const TEST_LOG_PATH = path.join(TEST_LOG_DIR, "test.log")

beforeEach(async () => {
  await fs.mkdir(TEST_LOG_DIR, { recursive: true })
  // Clean up any existing test log files
  try {
    await fs.rm(TEST_LOG_DIR, { recursive: true, force: true })
  } catch {
    // Ignore
  }
  await fs.mkdir(TEST_LOG_DIR, { recursive: true })
})

afterEach(async () => {
  try {
    await fs.rm(TEST_LOG_DIR, { recursive: true, force: true })
  } catch {
    // Ignore
  }
})

describe("redactSensitiveData", () => {
  test("redacts API keys", () => {
    const input = 'api_key: "sk-1234567890abcdef1234567890abcdef"'
    const result = redactSensitiveData(input)
    expect(result).not.toContain("sk-1234567890abcdef1234567890abcdef")
    expect(result).toContain("[REDACTED]")
  })

  test("redacts secret keys", () => {
    const input = 'secret_key: "my-super-secret-key-value-here-12345"'
    const result = redactSensitiveData(input)
    expect(result).not.toContain("my-super-secret-key-value-here-12345")
    expect(result).toContain("[REDACTED]")
  })

  test("redacts bearer tokens", () => {
    const input = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test"
    const result = redactSensitiveData(input)
    expect(result).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test")
    expect(result).toContain("[REDACTED]")
  })

  test("redacts passwords", () => {
    const input = 'password: "SuperSecretPassword123!"'
    const result = redactSensitiveData(input)
    expect(result).not.toContain("SuperSecretPassword123!")
    expect(result).toContain("[REDACTED]")
  })

  test("redacts connection strings", () => {
    const input = "mongodb://user:password123@localhost:27017/db"
    const result = redactSensitiveData(input)
    expect(result).not.toContain("password123")
  })

  test("leaves non-sensitive text unchanged", () => {
    const input = "Hello world, this is a normal string"
    const result = redactSensitiveData(input)
    expect(result).toBe(input)
  })

  test("handles empty string", () => {
    expect(redactSensitiveData("")).toBe("")
  })
})

describe("redactObject", () => {
  test("redacts sensitive values in objects", () => {
    const obj = {
      api_key: "sk-1234567890abcdef1234567890abcdef",
      name: "test",
    }
    const result = redactObject(obj)
    expect(result.name).toBe("test")
    expect(JSON.stringify(result)).not.toContain(
      "sk-1234567890abcdef1234567890abcdef"
    )
  })

  test("handles nested objects", () => {
    const obj = {
      config: {
        secret_key: "my-secret-key-value-12345678",
        public: true,
      },
    }
    const result = redactObject(obj)
    expect(result.config.public).toBe(true)
    expect(JSON.stringify(result)).not.toContain("my-secret-key-value-12345678")
  })

  test("returns safe placeholder if JSON parsing fails (security)", () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const result = redactObject(circular)
    // Should NOT return the unredacted original object
    expect(result).not.toBe(circular)
    // Should return a safe placeholder
    expect(result).toEqual({ redactionError: true, message: "[REDACTED]" })
  })
})

describe("StructuredLogger", () => {
  function getConfig(overrides: Partial<AgentMonitorConfig> = {}): AgentMonitorConfig {
    return {
      enabled: true,
      logPath: TEST_LOG_PATH,
      maxLogSize: 0,
      maxRotatedFiles: 3,
      enableDomainDetection: true,
      enableToolTracking: true,
      enablePermissionTracking: true,
      enableSessionTracking: true,
      redactSensitiveData: true,
      logLevel: "info",
      emitRoutingWarnings: true,
      ...overrides,
    }
  }

  test("writes log entries as JSON lines", async () => {
    const logger = new StructuredLogger(getConfig())
    await logger.write({ type: "test", message: "hello" })

    const content = await fs.readFile(TEST_LOG_PATH, "utf-8")
    const lines = content.trim().split("\n")
    expect(lines.length).toBe(1)

    const entry = JSON.parse(lines[0])
    expect(entry.type).toBe("test")
    expect(entry.message).toBe("hello")
    expect(entry.ts).toBeDefined()
  })

  test("creates log directory if it does not exist", async () => {
    const nestedPath = path.join(TEST_LOG_DIR, "nested", "deep", "test.log")
    const logger = new StructuredLogger(getConfig({ logPath: nestedPath }))
    await logger.write({ type: "test" })

    const exists = await fs
      .stat(nestedPath)
      .then(() => true)
      .catch(() => false)
    expect(exists).toBe(true)
  })

  test("does not write when disabled", async () => {
    const logger = new StructuredLogger(getConfig({ enabled: false }))
    await logger.write({ type: "test" })

    const exists = await fs
      .stat(TEST_LOG_PATH)
      .then(() => true)
      .catch(() => false)
    expect(exists).toBe(false)
  })

  test("redacts sensitive data by default", async () => {
    const logger = new StructuredLogger(getConfig({ redactSensitiveData: true }))
    await logger.write({
      type: "test",
      api_key: "sk-1234567890abcdef1234567890abcdef",
    })

    const content = await fs.readFile(TEST_LOG_PATH, "utf-8")
    expect(content).not.toContain("sk-1234567890abcdef1234567890abcdef")
    expect(content).toContain("[REDACTED]")
  })

  test("does not redact when disabled", async () => {
    const logger = new StructuredLogger(
      getConfig({ redactSensitiveData: false })
    )
    const secret = "sk-1234567890abcdef1234567890abcdef"
    await logger.write({ type: "test", api_key: secret })

    const content = await fs.readFile(TEST_LOG_PATH, "utf-8")
    expect(content).toContain(secret)
  })

  test("rotates log file when size exceeds limit", async () => {
    // Use a very small max size to trigger rotation
    const logger = new StructuredLogger(
      getConfig({ maxLogSize: 50, maxRotatedFiles: 2 })
    )

    // Write enough data to trigger rotation
    for (let i = 0; i < 10; i++) {
      await logger.write({ type: "test", data: "x".repeat(20) })
    }

    const rotatedExists = await fs
      .stat(`${TEST_LOG_PATH}.1`)
      .then(() => true)
      .catch(() => false)
    expect(rotatedExists).toBe(true)
  })
})
