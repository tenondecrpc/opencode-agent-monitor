import fs from "node:fs/promises"
import path from "node:path"
import type { DiscoveredAgent } from "./json-config.js"
import { detectDomains } from "./domain-detector.js"
import type { AgentMonitorConfig, Domain, AgentDomainMapping } from "./types.js"

/**
 * Built-in OpenCode agent names that are system agents and should be
 * excluded from auto-detection.
 */
const SYSTEM_AGENTS = new Set(["compaction", "title", "summary"])

/**
 * Built-in OpenCode agent names and their known domains.
 * These are hardcoded because we know exactly what they do.
 */
const KNOWN_AGENT_DOMAINS: Record<string, Domain[]> = {
  build: ["general"],
  plan: ["architect"],
  general: ["general"],
  explore: ["explore"],
}

/**
 * Read and parse a JSON file safely.
 * Returns null if the file doesn't exist or is invalid.
 */
async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8")
    return JSON.parse(content) as T
  } catch {
    return null
  }
}

/**
 * Parse markdown frontmatter from an agent file.
 * Returns the frontmatter as an object and the body text.
 */
function parseAgentMarkdown(content: string): {
  frontmatter: Record<string, unknown>
  body: string
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) {
    return { frontmatter: {}, body: content }
  }

  const frontmatterText = match[1] || ""
  const body = match[2] || ""

  // Simple YAML-like parsing for frontmatter (handles basic key: value)
  const frontmatter: Record<string, unknown> = {}
  for (const line of frontmatterText.split("\n")) {
    const colonIndex = line.indexOf(":")
    if (colonIndex === -1) continue
    const key = line.slice(0, colonIndex).trim()
    let value = line.slice(colonIndex + 1).trim()

    // Remove quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    frontmatter[key] = value
  }

  return { frontmatter, body }
}

/**
 * Options for agent discovery.
 */
export interface DiscoverAgentsOptions {
  /**
   * Whether to also read global agent config from ~/.config/opencode/.
   * @default true
   */
  includeGlobalConfig: boolean
}

/**
 * Discover agents from opencode.json.
 */
async function discoverAgentsFromJson(
  projectDir: string,
  options: DiscoverAgentsOptions
): Promise<DiscoveredAgent[]> {
  const agents: DiscoveredAgent[] = []

  // Check project-level opencode.json
  const projectConfigPath = path.join(projectDir, "opencode.json")
  const projectConfig =
    await readJsonFile<Record<string, unknown>>(projectConfigPath)

  if (projectConfig?.agent && typeof projectConfig.agent === "object") {
    const agentSection = projectConfig.agent as Record<
      string,
      Record<string, unknown>
    >
    for (const [name, config] of Object.entries(agentSection)) {
      if (SYSTEM_AGENTS.has(name)) continue
      if (config.disable === true) continue

      agents.push({
        name,
        description: (config.description as string) || "",
        prompt: (config.prompt as string) || "",
        mode: (config.mode as string) || "all",
        source: "json",
      })
    }
  }

  // Check global opencode.json
  if (options.includeGlobalConfig) {
    const homeDir = process.env.HOME || process.env.USERPROFILE || ""
    if (homeDir) {
      const globalConfigPath = path.join(
        homeDir,
        ".config",
        "opencode",
        "opencode.json"
      )
      const globalConfig =
        await readJsonFile<Record<string, unknown>>(globalConfigPath)

      if (globalConfig?.agent && typeof globalConfig.agent === "object") {
        const agentSection = globalConfig.agent as Record<
          string,
          Record<string, unknown>
        >
        for (const [name, config] of Object.entries(agentSection)) {
          // Skip if already found in project config
          if (agents.some((a) => a.name === name)) continue
          if (SYSTEM_AGENTS.has(name)) continue
          if (config.disable === true) continue

          agents.push({
            name,
            description: (config.description as string) || "",
            prompt: (config.prompt as string) || "",
            mode: (config.mode as string) || "all",
            source: "json",
          })
        }
      }
    }
  }

  return agents
}

/**
 * Discover agents from markdown files in .opencode/agents/ and ~/.config/opencode/agents/.
 */
async function discoverAgentsFromMarkdown(
  projectDir: string,
  options: DiscoverAgentsOptions
): Promise<DiscoveredAgent[]> {
  const agents: DiscoveredAgent[] = []
  const agentDirs = [path.join(projectDir, ".opencode", "agents")]

  if (options.includeGlobalConfig) {
    agentDirs.push(
      path.join(
        process.env.HOME || process.env.USERPROFILE || "",
        ".config",
        "opencode",
        "agents"
      )
    )
  }

  for (const dir of agentDirs) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".md")) continue

        const filePath = path.join(dir, entry.name)
        const content = await fs.readFile(filePath, "utf-8")
        const { frontmatter, body } = parseAgentMarkdown(content)

        const name = entry.name.replace(/\.md$/, "")
        if (SYSTEM_AGENTS.has(name)) continue
        if (frontmatter.disable === true) continue

        agents.push({
          name,
          description: (frontmatter.description as string) || "",
          prompt: body,
          mode: (frontmatter.mode as string) || "all",
          source: "markdown",
        })
      }
    } catch {
      // Directory may not exist, which is fine
    }
  }

  return agents
}

/**
 * Discover all agents from OpenCode's configuration.
 * Combines JSON and markdown sources, deduplicating by name.
 */
export async function discoverAgents(
  projectDir: string,
  options: Partial<DiscoverAgentsOptions> = {}
): Promise<DiscoveredAgent[]> {
  const opts: DiscoverAgentsOptions = {
    includeGlobalConfig: true,
    ...options,
  }

  const jsonAgents = await discoverAgentsFromJson(projectDir, opts)
  const mdAgents = await discoverAgentsFromMarkdown(projectDir, opts)

  // Deduplicate by name (JSON config takes precedence)
  const seen = new Set<string>()
  const allAgents: DiscoveredAgent[] = []

  for (const agent of [...jsonAgents, ...mdAgents]) {
    if (!seen.has(agent.name)) {
      seen.add(agent.name)
      allAgents.push(agent)
    }
  }

  return allAgents
}

/**
 * Auto-generate agent-to-domain mappings by analyzing agent descriptions
 * and prompts using the domain detection engine.
 */
export function generateAgentMappings(
  agents: DiscoveredAgent[],
  config: AgentMonitorConfig
): AgentDomainMapping[] {
  const mappings: AgentDomainMapping[] = []

  for (const agent of agents) {
    // Check if we have hardcoded knowledge about this agent
    const knownDomains = KNOWN_AGENT_DOMAINS[agent.name.toLowerCase()]
    if (knownDomains) {
      mappings.push({
        agentName: agent.name,
        domains: knownDomains,
      })
      continue
    }

    // Analyze description and prompt to detect domains
    const textToAnalyze = [agent.description, agent.prompt]
      .filter(Boolean)
      .join(" ")

    if (!textToAnalyze) {
      // If no description or prompt, skip
      continue
    }

    const detection = detectDomains(textToAnalyze, config)

    if (detection.domains.length > 0) {
      mappings.push({
        agentName: agent.name,
        domains: detection.domains,
      })
    }
  }

  return mappings
}
