import { describe, expect, test, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import { resolveConfigAsync, resolveConfig } from "../src/config.js"
import {
  discoverAgents,
  generateAgentMappings,
} from "../src/agent-discovery.js"

const TEST_DIR = path.join(process.cwd(), ".test-agent-discovery")

beforeEach(async () => {
  await fs.mkdir(TEST_DIR, { recursive: true })
  await fs.mkdir(path.join(TEST_DIR, ".opencode", "agents"), {
    recursive: true,
  })
})

afterEach(async () => {
  try {
    await fs.rm(TEST_DIR, { recursive: true, force: true })
  } catch {
    // Ignore
  }
})

describe("discoverAgents", () => {
  test("discovers agents from opencode.json", async () => {
    const opencodeJson = {
      agent: {
        "code-reviewer": {
          description: "Reviews code for best practices and security issues",
          mode: "subagent",
          prompt: "You are a code reviewer focused on security.",
        },
        "docs-writer": {
          description: "Writes and maintains project documentation",
          mode: "subagent",
        },
      },
    }

    await fs.writeFile(
      path.join(TEST_DIR, "opencode.json"),
      JSON.stringify(opencodeJson, null, 2)
    )

    const agents = await discoverAgents(TEST_DIR, {
      includeGlobalConfig: false,
    })
    expect(agents.length).toBe(2)
    expect(agents.some((a) => a.name === "code-reviewer")).toBe(true)
    expect(agents.some((a) => a.name === "docs-writer")).toBe(true)
  })

  test("discovers agents from markdown files", async () => {
    const mdContent = `---
description: Performs security audits and identifies vulnerabilities
mode: subagent
---
You are a security expert. Focus on identifying potential security issues.
Look for vulnerabilities, XSS, CSRF, and injection attacks.
`

    await fs.writeFile(
      path.join(TEST_DIR, ".opencode", "agents", "security-auditor.md"),
      mdContent
    )

    const agents = await discoverAgents(TEST_DIR, {
      includeGlobalConfig: false,
    })
    expect(agents.length).toBe(1)
    expect(agents[0]?.name).toBe("security-auditor")
    expect(agents[0]?.description).toBe(
      "Performs security audits and identifies vulnerabilities"
    )
    expect(agents[0]?.source).toBe("markdown")
  })

  test("excludes system agents", async () => {
    const opencodeJson = {
      agent: {
        compaction: {
          description: "Compacts context",
          mode: "primary",
        },
        title: {
          description: "Generates titles",
          mode: "primary",
        },
        "my-agent": {
          description: "My custom agent",
          mode: "subagent",
        },
      },
    }

    await fs.writeFile(
      path.join(TEST_DIR, "opencode.json"),
      JSON.stringify(opencodeJson, null, 2)
    )

    const agents = await discoverAgents(TEST_DIR, {
      includeGlobalConfig: false,
    })
    expect(agents.length).toBe(1)
    expect(agents[0]?.name).toBe("my-agent")
  })

  test("excludes disabled agents", async () => {
    const opencodeJson = {
      agent: {
        "disabled-agent": {
          description: "This is disabled",
          disable: true,
        },
        "active-agent": {
          description: "This is active",
        },
      },
    }

    await fs.writeFile(
      path.join(TEST_DIR, "opencode.json"),
      JSON.stringify(opencodeJson, null, 2)
    )

    const agents = await discoverAgents(TEST_DIR, {
      includeGlobalConfig: false,
    })
    expect(agents.length).toBe(1)
    expect(agents[0]?.name).toBe("active-agent")
  })

  test("deduplicates agents (JSON takes precedence)", async () => {
    const opencodeJson = {
      agent: {
        "my-agent": {
          description: "From JSON config",
          mode: "subagent",
        },
      },
    }

    await fs.writeFile(
      path.join(TEST_DIR, "opencode.json"),
      JSON.stringify(opencodeJson, null, 2)
    )

    const mdContent = `---
description: From markdown file
mode: subagent
---
Body text.
`

    await fs.writeFile(
      path.join(TEST_DIR, ".opencode", "agents", "my-agent.md"),
      mdContent
    )

    const agents = await discoverAgents(TEST_DIR, {
      includeGlobalConfig: false,
    })
    expect(agents.length).toBe(1)
    expect(agents[0]?.description).toBe("From JSON config")
    expect(agents[0]?.source).toBe("json")
  })

  test("returns empty array when no agents configured", async () => {
    const agents = await discoverAgents(TEST_DIR, {
      includeGlobalConfig: false,
    })
    expect(agents.length).toBe(0)
  })
})

describe("generateAgentMappings", () => {
  test("generates mappings from agent descriptions", () => {
    const config = resolveConfig({}, TEST_DIR)
    const agents = [
      {
        name: "frontend-dev",
        description: "Builds React components with CSS and responsive layouts",
        prompt: "You are a frontend developer.",
        mode: "subagent",
        source: "json" as const,
      },
      {
        name: "api-builder",
        description:
          "Creates REST APIs with database routes and webhook handlers",
        prompt: "You build backend services.",
        mode: "subagent",
        source: "json" as const,
      },
    ]

    const mappings = generateAgentMappings(agents, config)
    expect(mappings.length).toBe(2)

    const frontendMapping = mappings.find((m) => m.agentName === "frontend-dev")
    expect(frontendMapping?.domains).toContain("frontend")

    const apiMapping = mappings.find((m) => m.agentName === "api-builder")
    expect(apiMapping?.domains).toContain("backend")
  })

  test("uses hardcoded knowledge for built-in agents", () => {
    const config = resolveConfig({}, TEST_DIR)
    const agents = [
      {
        name: "explore",
        description: "Explores codebases",
        prompt: "",
        mode: "subagent",
        source: "json" as const,
      },
      {
        name: "general",
        description: "General purpose",
        prompt: "",
        mode: "subagent",
        source: "json" as const,
      },
    ]

    const mappings = generateAgentMappings(agents, config)
    expect(mappings.length).toBe(2)

    const exploreMapping = mappings.find((m) => m.agentName === "explore")
    expect(exploreMapping?.domains).toContain("explore")

    const generalMapping = mappings.find((m) => m.agentName === "general")
    expect(generalMapping?.domains).toContain("general")
  })

  test("skips agents with no description or prompt", () => {
    const config = resolveConfig({}, TEST_DIR)
    const agents = [
      {
        name: "empty-agent",
        description: "",
        prompt: "",
        mode: "subagent",
        source: "json" as const,
      },
    ]

    const mappings = generateAgentMappings(agents, config)
    expect(mappings.length).toBe(0)
  })

  test("detects multiple domains from rich descriptions", () => {
    const config = resolveConfig({}, TEST_DIR)
    const agents = [
      {
        name: "fullstack",
        description:
          "Builds React frontends with Node.js backend APIs and deploys to AWS with Docker",
        prompt: "Full stack development.",
        mode: "subagent",
        source: "json" as const,
      },
    ]

    const mappings = generateAgentMappings(agents, config)
    expect(mappings.length).toBe(1)
    expect(mappings[0]?.domains).toContain("frontend")
    expect(mappings[0]?.domains).toContain("backend")
    expect(mappings[0]?.domains).toContain("cloud")
  })
})

describe("resolveConfigAsync", () => {
  test("loads config from .opencode/agent-monitor.json", async () => {
    const jsonConfig = {
      enabled: true,
      logPath: ".opencode/custom-monitor.log",
      maxLogSize: 5_242_880,
      enableDomainDetection: true,
      autoDetectAgents: false,
      domains: [{ name: "custom-domain", patterns: ["custom-pattern"] }],
      mergeDomains: false,
      agentMappings: [{ agentName: "my-agent", domains: ["custom-domain"] }],
    }

    await fs.mkdir(path.join(TEST_DIR, ".opencode"), { recursive: true })
    await fs.writeFile(
      path.join(TEST_DIR, ".opencode", "agent-monitor.json"),
      JSON.stringify(jsonConfig, null, 2)
    )

    const config = await resolveConfigAsync({}, TEST_DIR)
    expect(config.enabled).toBe(true)
    expect(config.maxLogSize).toBe(5_242_880)
    expect(config.domains?.length).toBe(1)
    expect(config.domains?.[0]?.name).toBe("custom-domain")
    expect(config.agentMappings?.length).toBe(1)
    expect(config.agentMappings?.[0]?.agentName).toBe("my-agent")
  })

  test("auto-detects agents from opencode.json when enabled", async () => {
    const opencodeJson = {
      agent: {
        "security-reviewer": {
          description:
            "Reviews code for security vulnerabilities, OWASP compliance, and encryption issues",
          mode: "subagent",
        },
      },
    }

    await fs.writeFile(
      path.join(TEST_DIR, "opencode.json"),
      JSON.stringify(opencodeJson, null, 2)
    )

    const config = await resolveConfigAsync({}, TEST_DIR)
    expect(config.agentMappings?.length).toBeGreaterThanOrEqual(1)

    const securityMapping = config.agentMappings?.find(
      (m) => m.agentName === "security-reviewer"
    )
    expect(securityMapping?.domains).toContain("security")
  })

  test("manual agentMappings take precedence over auto-detected", async () => {
    const opencodeJson = {
      agent: {
        "my-agent": {
          description: "Builds React components",
          mode: "subagent",
        },
      },
    }

    await fs.writeFile(
      path.join(TEST_DIR, "opencode.json"),
      JSON.stringify(opencodeJson, null, 2)
    )

    const jsonConfig = {
      autoDetectAgents: true,
      agentMappings: [{ agentName: "my-agent", domains: ["custom-domain"] }],
    }

    await fs.mkdir(path.join(TEST_DIR, ".opencode"), { recursive: true })
    await fs.writeFile(
      path.join(TEST_DIR, ".opencode", "agent-monitor.json"),
      JSON.stringify(jsonConfig, null, 2)
    )

    const config = await resolveConfigAsync({}, TEST_DIR)
    const mapping = config.agentMappings?.find(
      (m) => m.agentName === "my-agent"
    )
    // Manual mapping should take precedence
    expect(mapping?.domains).toContain("custom-domain")
    expect(mapping?.domains).not.toContain("frontend")
  })

  test("autoDetectAgents can be disabled", async () => {
    const opencodeJson = {
      agent: {
        "security-reviewer": {
          description:
            "Reviews code for security vulnerabilities and OWASP compliance",
          mode: "subagent",
        },
      },
    }

    await fs.writeFile(
      path.join(TEST_DIR, "opencode.json"),
      JSON.stringify(opencodeJson, null, 2)
    )

    const jsonConfig = {
      autoDetectAgents: false,
    }

    await fs.mkdir(path.join(TEST_DIR, ".opencode"), { recursive: true })
    await fs.writeFile(
      path.join(TEST_DIR, ".opencode", "agent-monitor.json"),
      JSON.stringify(jsonConfig, null, 2)
    )

    const config = await resolveConfigAsync({}, TEST_DIR)
    // No auto-detected mappings (disabled) and no manual mappings
    expect(
      config.agentMappings === undefined || config.agentMappings?.length === 0
    ).toBe(true)
  })

  test("userConfig overrides jsonConfig", async () => {
    const jsonConfig = {
      enabled: true,
      maxLogSize: 5_242_880,
      autoDetectAgents: false,
    }

    await fs.mkdir(path.join(TEST_DIR, ".opencode"), { recursive: true })
    await fs.writeFile(
      path.join(TEST_DIR, ".opencode", "agent-monitor.json"),
      JSON.stringify(jsonConfig, null, 2)
    )

    const config = await resolveConfigAsync(
      { enabled: false, maxLogSize: 1_048_576 },
      TEST_DIR
    )
    expect(config.enabled).toBe(false)
    expect(config.maxLogSize).toBe(1_048_576)
  })

  test("display options are loaded from JSON config", async () => {
    const jsonConfig = {
      autoDetectAgents: false,
      display: {
        toasts: true,
        structuredLogging: false,
      },
    }

    await fs.mkdir(path.join(TEST_DIR, ".opencode"), { recursive: true })
    await fs.writeFile(
      path.join(TEST_DIR, ".opencode", "agent-monitor.json"),
      JSON.stringify(jsonConfig, null, 2)
    )

    const config = await resolveConfigAsync({}, TEST_DIR)
    expect(config.display.toasts).toBe(true)
    expect(config.display.structuredLogging).toBe(false)
  })

  test("display options use defaults when not specified", async () => {
    const jsonConfig = {
      autoDetectAgents: false,
    }

    await fs.mkdir(path.join(TEST_DIR, ".opencode"), { recursive: true })
    await fs.writeFile(
      path.join(TEST_DIR, ".opencode", "agent-monitor.json"),
      JSON.stringify(jsonConfig, null, 2)
    )

    const config = await resolveConfigAsync({}, TEST_DIR)
    expect(config.display.toasts).toBe(true)
    expect(config.display.structuredLogging).toBe(true)
  })
})
