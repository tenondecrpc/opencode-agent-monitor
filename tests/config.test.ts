import { describe, expect, test } from "vitest"
import path from "node:path"
import { resolveConfig, getAgentDomains } from "../src/config.js"
import { DEFAULT_DOMAIN_DEFINITIONS } from "../src/types.js"

describe("resolveConfig", () => {
  test("returns default config when no user config provided", () => {
    const config = resolveConfig({}, "/tmp/project")
    expect(config.enabled).toBe(true)
    expect(config.enableDomainDetection).toBe(true)
    expect(config.redactSensitiveData).toBe(true)
    expect(config.logLevel).toBe("info")
  })

  test("resolves relative log paths against project directory", () => {
    const config = resolveConfig({ logPath: "custom.log" }, "/tmp/project")
    expect(config.logPath).toBe(path.resolve("/tmp/project", "custom.log"))
  })

  test("accepts absolute log paths outside project directory", () => {
    // Absolute paths are now accepted — user explicitly chose that location.
    const config = resolveConfig(
      { logPath: "/var/log/opencode/monitor.log" },
      "/tmp/project"
    )
    expect(config.logPath).toBe("/var/log/opencode/monitor.log")
  })

  test("expands tilde (~) to home directory", () => {
    const home = process.env.HOME || ""
    const config = resolveConfig(
      { logPath: "~/.config/opencode/agent-monitor.log" },
      "/tmp/project"
    )
    expect(config.logPath).toBe(
      path.join(home, ".config", "opencode", "agent-monitor.log")
    )
  })

  test("accepts absolute log paths within project directory", () => {
    // Absolute paths within the project directory should be accepted
    const config = resolveConfig(
      { logPath: "/tmp/project/custom/monitor.log" },
      "/tmp/project"
    )
    expect(config.logPath).toBe("/tmp/project/custom/monitor.log")
  })

  test("uses default log path when not specified", () => {
    const config = resolveConfig({}, "/tmp/project")
    expect(config.logPath).toBe(
      path.join("/tmp/project", ".opencode", "agent-monitor.log")
    )
  })

  test("overrides defaults with user config", () => {
    const config = resolveConfig(
      {
        enabled: false,
        enableDomainDetection: false,
        logLevel: "debug",
      },
      "/tmp/project"
    )
    expect(config.enabled).toBe(false)
    expect(config.enableDomainDetection).toBe(false)
    expect(config.logLevel).toBe("debug")
  })

  test("validates negative maxLogSize", () => {
    const config = resolveConfig({ maxLogSize: -1 }, "/tmp/project")
    expect(config.maxLogSize).toBe(10_485_760)
  })

  test("validates negative maxRotatedFiles", () => {
    const config = resolveConfig({ maxRotatedFiles: -1 }, "/tmp/project")
    expect(config.maxRotatedFiles).toBe(5)
  })

  test("accepts zero maxLogSize to disable rotation", () => {
    const config = resolveConfig({ maxLogSize: 0 }, "/tmp/project")
    expect(config.maxLogSize).toBe(0)
  })

  test("uses process.cwd() as default directory", () => {
    const config = resolveConfig({})
    expect(config.logPath).toBe(
      path.join(process.cwd(), ".opencode", "agent-monitor.log")
    )
  })

  test("uses default domain definitions when none provided", () => {
    const config = resolveConfig({}, "/tmp/project")
    expect(config.domains).toBeDefined()
    expect(config.domains?.length).toBe(DEFAULT_DOMAIN_DEFINITIONS.length)
  })

  test("uses only custom domains when mergeDomainDefinitions is false", () => {
    const config = resolveConfig({
      mergeDomainDefinitions: false,
      domains: [{ name: "custom-domain", patterns: ["custom-pattern"] }],
    })
    expect(config.domains?.length).toBe(1)
    expect(config.domains?.[0]?.name).toBe("custom-domain")
  })

  test("merges custom domains with defaults when mergeDomainDefinitions is true", () => {
    const config = resolveConfig({
      mergeDomainDefinitions: true,
      domains: [{ name: "data-science", patterns: ["pandas", "numpy"] }],
    })
    expect(config.domains?.length).toBeGreaterThan(1)
    expect(config.domains?.some((d) => d.name === "data-science")).toBe(true)
    expect(config.domains?.some((d) => d.name === "frontend")).toBe(true)
  })

  test("custom domain overrides default with same name", () => {
    const config = resolveConfig({
      mergeDomainDefinitions: true,
      domains: [{ name: "frontend", patterns: ["^only-this$"] }],
    })
    const frontendDef = config.domains?.find((d) => d.name === "frontend")
    expect(frontendDef?.patterns).toEqual(["^only-this$"])
  })

  test("normalizes agent mappings to lowercase", () => {
    const config = resolveConfig({
      agentMappings: [
        { agentName: "My-Frontend-Agent", domains: ["frontend"] },
        { agentName: "BACKEND", domains: ["backend"] },
      ],
    })
    expect(config.agentMappings?.[0]?.agentName).toBe("my-frontend-agent")
    expect(config.agentMappings?.[1]?.agentName).toBe("backend")
  })
})

describe("getAgentDomains", () => {
  test("returns null when no agent mappings configured", () => {
    const config = resolveConfig({})
    const result = getAgentDomains("frontend", config)
    expect(result).toBeNull()
  })

  test("returns null when agent not found in mappings", () => {
    const config = resolveConfig({
      agentMappings: [{ agentName: "frontend", domains: ["frontend"] }],
    })
    const result = getAgentDomains("unknown-agent", config)
    expect(result).toBeNull()
  })

  test("returns domains for mapped agent", () => {
    const config = resolveConfig({
      agentMappings: [
        { agentName: "my-ui-agent", domains: ["frontend", "vision"] },
      ],
    })
    const result = getAgentDomains("my-ui-agent", config)
    expect(result).toEqual(["frontend", "vision"])
  })

  test("agent lookup is case-insensitive", () => {
    const config = resolveConfig({
      agentMappings: [{ agentName: "My-UI-Agent", domains: ["frontend"] }],
    })
    const result = getAgentDomains("my-ui-agent", config)
    expect(result).toEqual(["frontend"])
  })

  test("agent lookup works with uppercase input", () => {
    const config = resolveConfig({
      agentMappings: [{ agentName: "frontend", domains: ["frontend"] }],
    })
    const result = getAgentDomains("FRONTEND", config)
    expect(result).toEqual(["frontend"])
  })
})

describe("display config", () => {
  test("uses default display settings", () => {
    const config = resolveConfig({})
    expect(config.display.toasts).toBe(true)
    expect(config.display.structuredLogging).toBe(true)
  })

  test("allows enabling toasts", () => {
    const config = resolveConfig({
      display: { toasts: true, structuredLogging: true },
    })
    expect(config.display.toasts).toBe(true)
  })

  test("allows disabling structured logging", () => {
    const config = resolveConfig({
      display: { toasts: false, structuredLogging: false },
    })
    expect(config.display.structuredLogging).toBe(false)
  })
})
