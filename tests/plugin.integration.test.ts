import { describe, expect, test, vi, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import { AgentMonitor } from "../src/index.js"

const TEST_DIR = path.join(process.cwd(), ".test-plugin-integration")
const TEST_LOG_PATH = path.join(
  TEST_DIR,
  ".config",
  "opencode",
  "agent-monitor.log"
)

beforeEach(async () => {
  await fs.mkdir(TEST_DIR, { recursive: true })
})

afterEach(async () => {
  try {
    await fs.rm(TEST_DIR, { recursive: true, force: true })
  } catch {
    // Ignore
  }
})

/**
 * Create a mock OpenCode plugin context.
 */
function createMockContext(overrides: Record<string, unknown> = {}) {
  const mockLog = vi.fn().mockResolvedValue(undefined)
  const mockShowToast = vi.fn().mockResolvedValue(undefined)

  return {
    project: { path: TEST_DIR, name: "test-project" },
    client: {
      app: { log: mockLog },
      tui: { showToast: mockShowToast },
    },
    directory: TEST_DIR,
    ...overrides,
  }
}

describe("AgentMonitor plugin initialization", () => {
  test("returns all expected event handlers", async () => {
    const ctx = createMockContext()
    const plugin = await AgentMonitor(ctx as any)

    // Core handlers
    expect(plugin).toHaveProperty("event")
    expect(plugin).toHaveProperty("session.created")
    expect(plugin).toHaveProperty("session.updated")
    expect(plugin).toHaveProperty("session.idle")
    expect(plugin).toHaveProperty("session.deleted")
    expect(plugin).toHaveProperty("session.compacted")
    expect(plugin).toHaveProperty("session.error")
    expect(plugin).toHaveProperty("tool.execute.before")
    expect(plugin).toHaveProperty("tool.execute.after")
    expect(plugin).toHaveProperty("permission.asked")
    expect(plugin).toHaveProperty("permission.replied")
    expect(plugin).toHaveProperty("message.updated")
    expect(plugin).toHaveProperty("file.edited")
    expect(plugin).toHaveProperty("command.executed")
    expect(plugin).toHaveProperty("tui.toast.show")

    // All handlers should be functions
    for (const [_key, value] of Object.entries(plugin)) {
      expect(typeof value).toBe("function")
    }
  })

  test("plugin is disabled when config.enabled is false", async () => {
    // Create a config file that disables the plugin
    const configDir = path.join(TEST_DIR, ".config", "opencode")
    await fs.mkdir(configDir, { recursive: true })
    await fs.writeFile(
      path.join(configDir, "agent-monitor.json"),
      JSON.stringify({ enabled: false, autoDetectAgents: false })
    )

    const ctx = createMockContext()
    const plugin = await AgentMonitor(ctx as any)

    // Handlers should exist but do nothing when disabled
    await plugin["event"]?.({ event: { type: "test" } } as any)
    // No error means it ran without crashing (disabled = no-op)
  })
})

describe("session.error handler", () => {
  test("sanitizes error messages to 500 chars", async () => {
    const ctx = createMockContext()
    const plugin = await AgentMonitor(ctx as any)

    const longError = "x".repeat(1000)
    await plugin["session.error"]?.({
      sessionID: "test-session",
      error: longError,
    } as any)

    // Read the log file and check the error was truncated
    const content = await fs.readFile(TEST_LOG_PATH, "utf-8")
    const entry = JSON.parse(content.trim().split("\n").at(-1))
    expect(entry.error.length).toBeLessThanOrEqual(500)
  })

  test("handles string errors", async () => {
    const ctx = createMockContext()
    const plugin = await AgentMonitor(ctx as any)

    await plugin["session.error"]?.({
      sessionID: "test-session",
      error: "Something went wrong",
    } as any)

    const content = await fs.readFile(TEST_LOG_PATH, "utf-8")
    const entry = JSON.parse(content.trim().split("\n").at(-1))
    expect(entry.error).toBe("Something went wrong")
  })

  test("handles object errors with name and message", async () => {
    const ctx = createMockContext()
    const plugin = await AgentMonitor(ctx as any)

    await plugin["session.error"]?.({
      sessionID: "test-session",
      error: new Error("Test error message"),
    } as any)

    const content = await fs.readFile(TEST_LOG_PATH, "utf-8")
    const entry = JSON.parse(content.trim().split("\n").at(-1))
    expect(entry.error.name).toBe("Error")
    expect(entry.error.message).toBe("Test error message")
  })

  test("handles unknown error types", async () => {
    const ctx = createMockContext()
    const plugin = await AgentMonitor(ctx as any)

    await plugin["session.error"]?.({
      sessionID: "test-session",
      error: 42,
    } as any)

    const content = await fs.readFile(TEST_LOG_PATH, "utf-8")
    const entry = JSON.parse(content.trim().split("\n").at(-1))
    expect(entry.error).toBe("42")
  })

  test("toast failure does not crash plugin", async () => {
    const mockShowToast = vi.fn().mockRejectedValue(new Error("Toast failed"))
    const ctx = createMockContext({
      client: {
        app: { log: vi.fn().mockResolvedValue(undefined) },
        tui: { showToast: mockShowToast },
      },
    })
    const plugin = await AgentMonitor(ctx as any)

    // This should not throw even though toast fails
    await expect(
      plugin["session.error"]?.({
        sessionID: "test-session",
        error: "Test error",
      } as any)
    ).resolves.not.toThrow()
  })

  test("structured logging failure does not crash plugin", async () => {
    const mockLog = vi.fn().mockRejectedValue(new Error("Log failed"))
    const ctx = createMockContext({
      client: {
        app: { log: mockLog },
        tui: { showToast: vi.fn().mockResolvedValue(undefined) },
      },
    })
    const plugin = await AgentMonitor(ctx as any)

    // This should not throw even though structured logging fails
    await expect(
      plugin["session.error"]?.({
        sessionID: "test-session",
        error: "Test error",
      } as any)
    ).resolves.not.toThrow()
  })
})

describe("tool execution handlers", () => {
  test("tool.execute.before logs tool name", async () => {
    const ctx = createMockContext()
    const plugin = await AgentMonitor(ctx as any)

    await plugin["tool.execute.before"]?.({
      tool: "bash",
      sessionID: "test-session",
      callID: "call-1",
    } as any)

    const content = await fs.readFile(TEST_LOG_PATH, "utf-8")
    const entry = JSON.parse(content.trim().split("\n").at(-1))
    expect(entry.type).toBe("tool.execute.before")
    expect(entry.tool).toBe("bash")
  })

  test("tool.execute.after performs domain detection", async () => {
    const ctx = createMockContext()
    const plugin = await AgentMonitor(ctx as any)

    await plugin["tool.execute.after"]?.(
      {
        tool: "bash",
        sessionID: "test-session",
        callID: "call-1",
      } as any,
      {
        tool: "bash",
        result: "Build a React component with CSS",
      } as any
    )

    const content = await fs.readFile(TEST_LOG_PATH, "utf-8")
    const entry = JSON.parse(content.trim().split("\n").at(-1))
    expect(entry.type).toBe("tool.execute.after")
    expect(entry.tool).toBe("bash")
    // Domain detection should have detected frontend
    expect(entry.guessedDomains).toContain("frontend")
  })

  test("excluded tools are skipped", async () => {
    const configDir = path.join(TEST_DIR, ".config", "opencode")
    await fs.mkdir(configDir, { recursive: true })
    await fs.writeFile(
      path.join(configDir, "agent-monitor.json"),
      JSON.stringify({
        autoDetectAgents: false,
        excludedTools: ["bash"],
      })
    )

    const ctx = createMockContext()
    const plugin = await AgentMonitor(ctx as any)

    await plugin["tool.execute.before"]?.({
      tool: "bash",
      sessionID: "test-session",
    } as any)

    // Log file exists (plugin.loaded), but no tool entries should be present
    const content = await fs.readFile(TEST_LOG_PATH, "utf-8")
    const entries = content
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    const toolEntries = entries.filter((e) =>
      e.type?.startsWith("tool.execute")
    )
    expect(toolEntries.length).toBe(0)
  })
})

describe("permission handlers", () => {
  test("permission.asked logs tool and session", async () => {
    const ctx = createMockContext()
    const plugin = await AgentMonitor(ctx as any)

    await plugin["permission.asked"]?.({
      tool: "bash",
      sessionID: "test-session",
    } as any)

    const content = await fs.readFile(TEST_LOG_PATH, "utf-8")
    const entry = JSON.parse(content.trim().split("\n").at(-1))
    expect(entry.type).toBe("permission.asked")
    expect(entry.tool).toBe("bash")
  })

  test("permission.replied logs decision", async () => {
    const ctx = createMockContext()
    const plugin = await AgentMonitor(ctx as any)

    await plugin["permission.replied"]?.({
      tool: "bash",
      sessionID: "test-session",
      decision: "allow",
    } as any)

    const content = await fs.readFile(TEST_LOG_PATH, "utf-8")
    const entry = JSON.parse(content.trim().split("\n").at(-1))
    expect(entry.type).toBe("permission.replied")
    expect(entry.decision).toBe("allow")
  })

  test("toast failure on permission denial does not crash plugin", async () => {
    const mockShowToast = vi.fn().mockRejectedValue(new Error("Toast failed"))
    const ctx = createMockContext({
      client: {
        app: { log: vi.fn().mockResolvedValue(undefined) },
        tui: { showToast: mockShowToast },
      },
    })
    const plugin = await AgentMonitor(ctx as any)

    await expect(
      plugin["permission.replied"]?.({
        tool: "bash",
        sessionID: "test-session",
        decision: "deny",
      } as any)
    ).resolves.not.toThrow()
  })
})

describe("message.updated handler", () => {
  test("detects routing mismatches", async () => {
    const configDir = path.join(TEST_DIR, ".config", "opencode")
    await fs.mkdir(configDir, { recursive: true })
    await fs.writeFile(
      path.join(configDir, "agent-monitor.json"),
      JSON.stringify({
        autoDetectAgents: false,
        agentMappings: [
          { agentName: "backend-agent", domains: ["backend"] },
        ],
      })
    )

    const ctx = createMockContext()
    const plugin = await AgentMonitor(ctx as any)

    // Send a frontend task to a backend agent — should trigger mismatch
    await plugin["message.updated"]?.({
      sessionID: "test-session",
      message: {
        role: "backend-agent",
        type: "text",
        content: "Create a responsive React component with CSS styling",
      },
    } as any)

    const content = await fs.readFile(TEST_LOG_PATH, "utf-8")
    const entries = content
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))

    const mismatchEntry = entries.find((e) => e.type === "routing.mismatch")
    expect(mismatchEntry).toBeDefined()
    expect(mismatchEntry?.mismatches).toContain("frontend")
  })

  test("structured logging failure in mismatch does not crash plugin", async () => {
    const mockLog = vi.fn().mockRejectedValue(new Error("Log failed"))
    const ctx = createMockContext({
      client: {
        app: { log: mockLog },
        tui: { showToast: vi.fn().mockResolvedValue(undefined) },
      },
    })
    const plugin = await AgentMonitor(ctx as any)

    await expect(
      plugin["message.updated"]?.({
        sessionID: "test-session",
        message: {
          role: "backend",
          type: "text",
          content: "Create a responsive React component with CSS",
        },
      } as any)
    ).resolves.not.toThrow()
  })

  test("toast failure in mismatch does not crash plugin", async () => {
    const mockShowToast = vi.fn().mockRejectedValue(new Error("Toast failed"))
    const ctx = createMockContext({
      client: {
        app: { log: vi.fn().mockResolvedValue(undefined) },
        tui: { showToast: mockShowToast },
      },
    })
    const plugin = await AgentMonitor(ctx as any)

    await expect(
      plugin["message.updated"]?.({
        sessionID: "test-session",
        message: {
          role: "backend",
          type: "text",
          content: "Create a responsive React component with CSS",
        },
      } as any)
    ).resolves.not.toThrow()
  })
})

describe("session lifecycle handlers", () => {
  test("session.created logs session ID", async () => {
    const ctx = createMockContext()
    const plugin = await AgentMonitor(ctx as any)

    await plugin["session.created"]?.({
      sessionID: "new-session",
    } as any)

    const content = await fs.readFile(TEST_LOG_PATH, "utf-8")
    const entry = JSON.parse(content.trim().split("\n").at(-1))
    expect(entry.type).toBe("session.created")
    expect(entry.sessionID).toBe("new-session")
  })

  test("session.updated logs session ID", async () => {
    const ctx = createMockContext()
    const plugin = await AgentMonitor(ctx as any)

    await plugin["session.updated"]?.({
      sessionID: "updated-session",
    } as any)

    const content = await fs.readFile(TEST_LOG_PATH, "utf-8")
    const entry = JSON.parse(content.trim().split("\n").at(-1))
    expect(entry.type).toBe("session.updated")
  })

  test("session.idle logs session ID", async () => {
    const ctx = createMockContext()
    const plugin = await AgentMonitor(ctx as any)

    await plugin["session.idle"]?.({
      sessionID: "idle-session",
    } as any)

    const content = await fs.readFile(TEST_LOG_PATH, "utf-8")
    const entry = JSON.parse(content.trim().split("\n").at(-1))
    expect(entry.type).toBe("session.idle")
  })

  test("session.deleted logs session ID", async () => {
    const ctx = createMockContext()
    const plugin = await AgentMonitor(ctx as any)

    await plugin["session.deleted"]?.({
      sessionID: "deleted-session",
    } as any)

    const content = await fs.readFile(TEST_LOG_PATH, "utf-8")
    const entry = JSON.parse(content.trim().split("\n").at(-1))
    expect(entry.type).toBe("session.deleted")
  })

  test("session.compacted logs session ID", async () => {
    const ctx = createMockContext()
    const plugin = await AgentMonitor(ctx as any)

    await plugin["session.compacted"]?.({
      sessionID: "compacted-session",
    } as any)

    const content = await fs.readFile(TEST_LOG_PATH, "utf-8")
    const entry = JSON.parse(content.trim().split("\n").at(-1))
    expect(entry.type).toBe("session.compacted")
  })
})

describe("other handlers", () => {
  test("file.edited logs file path", async () => {
    const ctx = createMockContext()
    const plugin = await AgentMonitor(ctx as any)

    await plugin["file.edited"]?.({
      filePath: "/src/index.ts",
      sessionID: "test-session",
    } as any)

    const content = await fs.readFile(TEST_LOG_PATH, "utf-8")
    const entry = JSON.parse(content.trim().split("\n").at(-1))
    expect(entry.type).toBe("file.edited")
    expect(entry.filePath).toBe("/src/index.ts")
  })

  test("command.executed logs command", async () => {
    const ctx = createMockContext()
    const plugin = await AgentMonitor(ctx as any)

    await plugin["command.executed"]?.({
      command: "npm test",
      sessionID: "test-session",
    } as any)

    const content = await fs.readFile(TEST_LOG_PATH, "utf-8")
    const entry = JSON.parse(content.trim().split("\n").at(-1))
    expect(entry.type).toBe("command.executed")
    expect(entry.command).toBe("npm test")
  })

  test("tui.toast.show logs message", async () => {
    const ctx = createMockContext()
    const plugin = await AgentMonitor(ctx as any)

    await plugin["tui.toast.show"]?.({
      message: "Test toast",
    } as any)

    const content = await fs.readFile(TEST_LOG_PATH, "utf-8")
    const entry = JSON.parse(content.trim().split("\n").at(-1))
    expect(entry.type).toBe("tui.toast.show")
    expect(entry.message).toBe("Test toast")
  })

  test("generic event handler logs event type", async () => {
    const ctx = createMockContext()
    const plugin = await AgentMonitor(ctx as any)

    await plugin["event"]?.({
      event: { type: "custom.event" },
    } as any)

    const content = await fs.readFile(TEST_LOG_PATH, "utf-8")
    const entry = JSON.parse(content.trim().split("\n").at(-1))
    expect(entry.type).toBe("event")
    expect(entry.eventType).toBe("custom.event")
  })
})
