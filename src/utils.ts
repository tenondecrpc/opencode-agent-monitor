import fs from "node:fs/promises"
import path from "node:path"

/**
 * Result of resolving the OpenCode config directory.
 */
export interface ResolvedOpenCodeDir {
  /** The resolved directory path (either .config/opencode or .opencode). */
  dir: string
  /** Which location was used. */
  source: "config-opencode" | "opencode" | "fallback"
  /** Whether a warning was logged because neither directory exists. */
  warned: boolean
}

/**
 * Resolve the OpenCode config directory for a given project.
 *
 * Checks in this order:
 * 1. `<projectDir>/.config/opencode/` (modern macOS/Linux location)
 * 2. `<projectDir>/.opencode/` (legacy location)
 * 3. Falls back to `.config/opencode` and logs a warning to stderr
 *    if neither directory exists.
 */
export async function resolveOpenCodeDir(
  projectDir: string
): Promise<ResolvedOpenCodeDir> {
  const configOpencode = path.join(projectDir, ".config", "opencode")
  const legacyOpencode = path.join(projectDir, ".opencode")

  try {
    await fs.access(configOpencode)
    return { dir: configOpencode, source: "config-opencode", warned: false }
  } catch {
    // .config/opencode does not exist, try legacy
  }

  try {
    await fs.access(legacyOpencode)
    return { dir: legacyOpencode, source: "opencode", warned: false }
  } catch {
    // .opencode does not exist either
  }

  // Neither exists — log a warning and fall back to .config/opencode
  process.stderr.write(
    `[agent-monitor] Neither "${configOpencode}" nor "${legacyOpencode}" found. ` +
      `Using "${configOpencode}" as default. ` +
      `Create one of these directories so the plugin can store its config and logs.\n`
  )

  return { dir: configOpencode, source: "fallback", warned: true }
}
