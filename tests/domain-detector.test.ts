import { describe, expect, test } from "vitest"
import { detectDomains, detectAgentMismatch } from "../src/domain-detector.js"
import { resolveConfig } from "../src/config.js"
import type { AgentMonitorConfig } from "../src/types.js"

/**
 * Helper: create a minimal valid config for tests.
 */
function testConfig(
  overrides: Partial<AgentMonitorConfig> = {}
): AgentMonitorConfig {
  return resolveConfig(overrides, "/tmp/test-project")
}

describe("detectDomains", () => {
  test("detects frontend domain from UI-related text using defaults", () => {
    const config = testConfig()
    const result = detectDomains(
      "Create a responsive React component with proper accessibility and CSS styling",
      config
    )
    expect(result.domains).toContain("frontend")
    expect(result.matchedKeywords.length).toBeGreaterThan(0)
  })

  test("detects backend domain from API-related text using defaults", () => {
    const config = testConfig()
    const result = detectDomains(
      "Build a REST API with Express, add database routes and webhook handlers",
      config
    )
    expect(result.domains).toContain("backend")
    expect(result.matchedKeywords.length).toBeGreaterThan(0)
  })

  test("detects cloud domain from infrastructure text using defaults", () => {
    const config = testConfig()
    const result = detectDomains(
      "Deploy to AWS using CDK, set up Docker containers and Kubernetes pods",
      config
    )
    expect(result.domains).toContain("cloud")
    expect(result.matchedKeywords.length).toBeGreaterThan(0)
  })

  test("detects security domain from security-related text using defaults", () => {
    const config = testConfig()
    const result = detectDomains(
      "Review IAM permissions, check for credential leaks and vulnerability scanning",
      config
    )
    expect(result.domains).toContain("security")
    expect(result.matchedKeywords.length).toBeGreaterThan(0)
  })

  test("detects qa domain from testing text using defaults", () => {
    const config = testConfig()
    const result = detectDomains(
      "Write unit tests with Jest, add integration tests and check edge cases for regression",
      config
    )
    expect(result.domains).toContain("qa")
    expect(result.matchedKeywords.length).toBeGreaterThan(0)
  })

  test("detects multiple domains from mixed text", () => {
    const config = testConfig()
    const result = detectDomains(
      "Build a React frontend with a Node.js backend API and deploy to AWS",
      config
    )
    expect(result.domains).toContain("frontend")
    expect(result.domains).toContain("backend")
    expect(result.domains).toContain("cloud")
  })

  test("returns empty domains for unrelated text", () => {
    const config = testConfig()
    const result = detectDomains("The weather is nice today", config)
    expect(result.domains.length).toBe(0)
  })

  test("handles empty input gracefully", () => {
    const config = testConfig()
    const result = detectDomains("", config)
    expect(result.domains.length).toBe(0)
    expect(result.confidence).toBe(0)
  })

  test("supports custom domain definitions that replace defaults", () => {
    const config = testConfig({
      mergeDomainDefinitions: false,
      domains: [
        {
          name: "data-science",
          patterns: ["pandas", "numpy", "matplotlib", "jupyter", "sklearn"],
        },
        {
          name: "mobile",
          patterns: ["react native", "flutter", "swift", "kotlin", "apk"],
        },
      ],
    })

    const result = detectDomains(
      "Build a pandas data pipeline with numpy and matplotlib charts",
      config
    )
    expect(result.domains).toContain("data-science")
    expect(result.domains).not.toContain("frontend")
  })

  test("supports custom domain definitions merged with defaults", () => {
    const config = testConfig({
      mergeDomainDefinitions: true,
      domains: [
        {
          name: "data-science",
          patterns: ["pandas", "numpy", "matplotlib", "jupyter", "sklearn"],
        },
      ],
    })

    const result = detectDomains(
      "Build a pandas data pipeline with React components",
      config
    )
    expect(result.domains).toContain("data-science")
    expect(result.domains).toContain("frontend")
  })

  test("custom domain definition overrides a default with the same name", () => {
    const config = testConfig({
      mergeDomainDefinitions: true,
      domains: [
        {
          name: "frontend",
          patterns: ["^only-this-specific-pattern$"],
        },
      ],
    })

    // "react" should NOT match frontend anymore since we replaced the patterns
    const result = detectDomains("Build a React app", config)
    expect(result.domains).not.toContain("frontend")
  })

  test("confidence is between 0 and 1", () => {
    const config = testConfig()
    const result = detectDomains(
      "Build a responsive React component with CSS and accessibility features",
      config
    )
    expect(result.confidence).toBeGreaterThanOrEqual(0)
    expect(result.confidence).toBeLessThanOrEqual(1)
  })

  test("deduplicates matched keywords", () => {
    const config = testConfig()
    const result = detectDomains(
      "react react react component component",
      config
    )
    const uniqueKeywords = new Set(result.matchedKeywords)
    expect(result.matchedKeywords.length).toBe(uniqueKeywords.size)
  })

  test("works with any domain name (open type)", () => {
    const config = testConfig({
      mergeDomainDefinitions: false,
      domains: [
        {
          name: "my-custom-domain-xyz",
          patterns: ["custom-keyword-abc"],
        },
      ],
    })

    const result = detectDomains("Use custom-keyword-abc here", config)
    expect(result.domains).toContain("my-custom-domain-xyz")
  })
})

describe("detectAgentMismatch", () => {
  test("returns null when domain detection is disabled", () => {
    const config = testConfig({ enableDomainDetection: false })
    const result = detectAgentMismatch(
      "Build a React component",
      "backend",
      config
    )
    expect(result).toBeNull()
  })

  test("detects mismatch when frontend task assigned to backend agent (fallback)", () => {
    const config = testConfig()
    const result = detectAgentMismatch(
      "Create a responsive React component with CSS styling",
      "backend",
      config
    )
    expect(result).not.toBeNull()
    expect(result?.mismatches).toContain("frontend")
    expect(result?.actualAgent).toBe("backend")
  })

  test("returns null when agent name contains the domain (fallback)", () => {
    const config = testConfig()
    const result = detectAgentMismatch(
      "Create a responsive React component with CSS styling",
      "frontend",
      config
    )
    expect(result).toBeNull()
  })

  test("returns null for empty task text", () => {
    const config = testConfig()
    const result = detectAgentMismatch("", "frontend", config)
    expect(result).toBeNull()
  })

  test("returns null for empty agent name", () => {
    const config = testConfig()
    const result = detectAgentMismatch(
      "Create a responsive React component",
      "",
      config
    )
    expect(result).toBeNull()
  })

  test("includes confidence in mismatch result", () => {
    const config = testConfig()
    const result = detectAgentMismatch(
      "Build a React frontend with Node.js backend and deploy to AWS",
      "general",
      config
    )
    expect(result).not.toBeNull()
    expect(result?.confidence).toBeGreaterThanOrEqual(0)
    expect(result?.confidence).toBeLessThanOrEqual(1)
  })

  test("uses explicit agent mappings when configured", () => {
    const config = testConfig({
      agentMappings: [
        { agentName: "my-ui-agent", domains: ["frontend", "vision"] },
        { agentName: "api-worker", domains: ["backend"] },
      ],
    })

    // "my-ui-agent" handles frontend, so no mismatch
    const resultMatch = detectAgentMismatch(
      "Create a responsive React component",
      "my-ui-agent",
      config
    )
    expect(resultMatch).toBeNull()

    // "api-worker" does NOT handle frontend, so mismatch
    const resultMismatch = detectAgentMismatch(
      "Create a responsive React component",
      "api-worker",
      config
    )
    expect(resultMismatch).not.toBeNull()
    expect(resultMismatch?.mismatches).toContain("frontend")
  })

  test("agent mappings are case-insensitive", () => {
    const config = testConfig({
      agentMappings: [{ agentName: "My-UI-Agent", domains: ["frontend"] }],
    })

    const result = detectAgentMismatch(
      "Build a React component",
      "my-ui-agent",
      config
    )
    expect(result).toBeNull() // matched because mapping is case-insensitive
  })

  test("falls back to substring matching when no agent mappings configured", () => {
    const config = testConfig({
      agentMappings: [], // empty = no mappings
    })

    // "frontend-agent" contains "frontend" so no mismatch
    const resultMatch = detectAgentMismatch(
      "Build a React component",
      "frontend-agent",
      config
    )
    expect(resultMatch).toBeNull()

    // "backend" does NOT contain "frontend" so mismatch
    const resultMismatch = detectAgentMismatch(
      "Build a React component",
      "backend",
      config
    )
    expect(resultMismatch).not.toBeNull()
  })

  test("agent can handle multiple domains via mappings", () => {
    const config = testConfig({
      agentMappings: [
        { agentName: "fullstack", domains: ["frontend", "backend", "cloud"] },
      ],
    })

    const result = detectAgentMismatch(
      "Build a React frontend with Node.js backend and deploy to AWS",
      "fullstack",
      config
    )
    expect(result).toBeNull() // fullstack handles all three domains
  })

  test("partial domain coverage produces mismatch", () => {
    const config = testConfig({
      agentMappings: [{ agentName: "frontend-only", domains: ["frontend"] }],
    })

    const result = detectAgentMismatch(
      "Build a React frontend with Node.js backend and deploy to AWS",
      "frontend-only",
      config
    )
    expect(result).not.toBeNull()
    expect(result?.mismatches).toContain("backend")
    expect(result?.mismatches).toContain("cloud")
    expect(result?.mismatches).not.toContain("frontend")
  })
})
