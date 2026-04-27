import { describe, expect, test, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import { resolveOpenCodeDir } from "../src/utils.js"

const TEST_DIR = path.join(process.cwd(), ".test-utils")

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

describe("resolveOpenCodeDir", () => {
  test("returns config-opencode when .config/opencode exists", async () => {
    const configDir = path.join(TEST_DIR, ".config", "opencode")
    await fs.mkdir(configDir, { recursive: true })

    const result = await resolveOpenCodeDir(TEST_DIR)
    expect(result.dir).toBe(configDir)
    expect(result.source).toBe("config-opencode")
    expect(result.warned).toBe(false)
  })

  test("falls back to .opencode when .config/opencode does not exist", async () => {
    const legacyDir = path.join(TEST_DIR, ".opencode")
    await fs.mkdir(legacyDir, { recursive: true })

    const result = await resolveOpenCodeDir(TEST_DIR)
    expect(result.dir).toBe(legacyDir)
    expect(result.source).toBe("opencode")
    expect(result.warned).toBe(false)
  })

  test("prefers .config/opencode over .opencode when both exist", async () => {
    const configDir = path.join(TEST_DIR, ".config", "opencode")
    const legacyDir = path.join(TEST_DIR, ".opencode")
    await fs.mkdir(configDir, { recursive: true })
    await fs.mkdir(legacyDir, { recursive: true })

    const result = await resolveOpenCodeDir(TEST_DIR)
    expect(result.dir).toBe(configDir)
    expect(result.source).toBe("config-opencode")
    expect(result.warned).toBe(false)
  })

  test("returns fallback with warning when neither directory exists", async () => {
    // Use a subdirectory that doesn't have either dir
    const emptyDir = path.join(TEST_DIR, "empty-project")
    await fs.mkdir(emptyDir, { recursive: true })

    const result = await resolveOpenCodeDir(emptyDir)
    const expectedDir = path.join(emptyDir, ".config", "opencode")
    expect(result.dir).toBe(expectedDir)
    expect(result.source).toBe("fallback")
    expect(result.warned).toBe(true)
  })

  test("writes warning to stderr when neither directory exists", async () => {
    const emptyDir = path.join(TEST_DIR, "empty-project-2")
    await fs.mkdir(emptyDir, { recursive: true })

    // Capture stderr
    const originalStderrWrite = process.stderr.write
    let stderrOutput = ""
    process.stderr.write = (chunk: string | Uint8Array) => {
      stderrOutput += typeof chunk === "string" ? chunk : ""
      return true
    }

    try {
      await resolveOpenCodeDir(emptyDir)
      expect(stderrOutput).toContain("[agent-monitor]")
      expect(stderrOutput).toContain("Neither")
      expect(stderrOutput).toContain("found")
    } finally {
      process.stderr.write = originalStderrWrite
    }
  })
})
