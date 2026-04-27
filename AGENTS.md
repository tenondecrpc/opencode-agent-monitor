# AGENTS.md — Agent Guidelines for opencode-agent-monitor

## Project Overview

**opencode-agent-monitor** is an OpenCode plugin that provides observability into how AI agents and subagents are routed, what tools they use, and whether task-domain assignments are appropriate. It writes structured JSON-line logs with optional sensitive data redaction, log rotation, and domain detection.

**Repository:** https://github.com/tenondecrpc/opencode-agent-monitor

---

## Runtime & Build Rules

### Node.js Version

- **Node.js 22 is the only supported version** for all builds, tests, and development.
- Always use `nvm use 22` or ensure `node --version` returns `v22.x` before running any command.
- CI, local builds, and test runs **must** execute under Node.js 22.
- Do not use Node.js 18, 20, or any other version — `package.json` enforces `"engines": { "node": ">=22.0.0" }`.

### Required Commands

```bash
node --version          # Must be v22.x
npm install             # Install dependencies
npm run build           # Compile TypeScript (tsc)
npm test                # Run vitest tests
npm run lint            # Run ESLint
npm run typecheck       # Type check without emitting
```

---

## Architecture

### Module Structure

```
src/
├── index.ts              # Plugin entry point — ONLY exports AgentMonitor + default
├── exports.ts            # Re-exports of utilities (import via "opencode-agent-monitor/exports")
├── types.ts              # Type definitions, DEFAULT_CONFIG, DEFAULT_DOMAIN_DEFINITIONS
├── config.ts             # Configuration resolution (JSON + programmatic + auto-discovery)
├── logger.ts             # StructuredLogger with rotation and redaction
├── domain-detector.ts    # Domain detection engine + regex safety
├── agent-discovery.ts    # Agent discovery from opencode.json and agent markdown files
├── agent-mapping-utils.ts # Agent domain mapping utilities
├── json-config.ts        # JSON config type definitions
└── utils.ts              # resolveOpenCodeDir utility
```

### Plugin Export Rule (CRITICAL)

**The main entry point (`src/index.ts`) must ONLY export:**
- `AgentMonitor` — the plugin function
- `default` — pointing to `AgentMonitor`

**Never add re-exports of utilities, types, or classes to `index.ts`.** OpenCode's plugin loader iterates over all module exports and expects each one to be a function. Non-function exports cause errors like:
- `Cannot call a class constructor without |new|`
- `Plugin export is not a function`

All utility re-exports live in `src/exports.ts` and are exposed via the `opencode-agent-monitor/exports` subpath in `package.json`.

---

## Business Rules

### 1. Domain Detection

- Domains are **open string types** — any domain name can be used.
- Built-in defaults (`frontend`, `backend`, `cloud`, `security`, `architect`, `qa`, `documenter`, `refiner`, `explore`, `vision`, `general`) are starting points, not enforced types.
- Users define custom domains via JSON config or programmatic config.
- Domain detection uses **regex pattern matching** against tool input/output text.
- All regex patterns are **validated for safety** before compilation (no catastrophic backtracking).
- Patterns are **pre-compiled once** during config resolution for performance.

### 2. Agent-to-Domain Mapping

- Mappings tell the plugin which agent handles which domain(s).
- **Auto-detection** (enabled by default) reads `opencode.json` and `.config/opencode/agents/*.md` to discover agents and analyze their descriptions/prompts.
- **Manual mappings always take precedence** over auto-detected ones.
- If no mappings exist, fallback is **substring matching** (agent name contains domain name).
- Agent names are **normalized to lowercase** for matching.

### 3. Routing Mismatch Detection

- A mismatch occurs when a task's detected domain doesn't match the assigned agent's configured responsibilities.
- Mismatches trigger:
  - Log entry with type `routing.mismatch`
  - Structured log (if `display.structuredLogging` is enabled)
  - Toast notification (if `display.toasts` is enabled)

### 4. Configuration Resolution Order

1. `.config/opencode/agent-monitor.json` (preferred) or `.opencode/agent-monitor.json` (legacy)
2. `userConfig` parameter (programmatic)
3. Auto-discovery from OpenCode's agent configuration
4. Built-in defaults

Later sources override earlier ones.

### 5. Security Rules

- **Sensitive data redaction is enabled by default** — API keys, tokens, passwords, connection strings, JWTs, GitHub tokens, Slack tokens, Stripe keys, SSH keys are all redacted.
- **No data leaves the machine** — all logs are written locally.
- **No network calls** — the plugin does not make HTTP requests.
- **Log file permissions** are set to `0o600` (owner read/write only).
- **Log directory permissions** are set to `0o700` (owner only).
- **Path traversal protection** — `logPath` is validated to be within the project directory (symlinks resolved via `fs.realpath`).
- **Safe bounds** — `maxLogSize` capped at 100 MB, `maxRotatedFiles` capped at 50.
- **Error isolation** — log failures never crash the plugin; structured logging failures are silently caught.

### 6. Log Rotation

- Rotation triggers when log file exceeds `maxLogSize` (default: 10 MB).
- Files are shifted: `.log` → `.log.1` → `.log.2` → ... → `.log.N`
- Oldest file is deleted when it exceeds `maxRotatedFiles` (default: 5).
- Rotation has a **concurrency lock** (`rotating` flag) to prevent race conditions.

### 7. Config Directory Resolution

- Checks `.config/opencode/` first (modern location).
- Falls back to `.opencode/` (legacy location).
- If neither exists, logs a warning to stderr and uses `.config/opencode/` as default.

### 8. OpenCode Runtime Logs (Reference)

> **Note for agents:** When debugging plugin behavior or checking for errors, OpenCode's own runtime logs are stored per-session in the following locations. Go directly to these paths instead of running deep file searches.

| Platform | Log Directory |
|---|---|
| **macOS** | `~/.local/share/opencode/log/` |
| **Linux** | `~/.local/share/opencode/log/` |
| **Windows** | `%LOCALAPPDATA%\opencode\log\` |

Each session generates a timestamped log file (e.g., `2026-04-27T151423.log`). The most recent file is the current session. Search for `ERROR` or `service=plugin` to find plugin-related issues.

---

## Code Conventions

- **TypeScript** — strict mode, ESM only (`"type": "module"`).
- **No default exports from utility modules** — only `index.ts` has a default export.
- **Error handling** — never throw from plugin hooks; catch and log to stderr.
- **Async-first** — use `resolveConfigAsync` for full functionality (auto-discovery, JSON config).
- **No circular dependencies** — `config.ts` re-exports `getAgentDomains` from `agent-mapping-utils.ts` to break cycles.
- **Redaction safety** — if JSON re-parse fails after redaction, return a safe placeholder instead of the unredacted original.

---

## Testing

- **Framework:** Vitest
- **Coverage:** `npm run test:coverage`
- **Node.js 22 is the only allowed version** for running tests. Never use a Node.js version matrix or test against Node.js 18, 20, or any version below 22.
- All new features must include tests.
- Tests must pass before committing.

---

## Git Workflow

- Branch naming: `fix/...`, `feat/...`, `chore/...`, `docs/...`
- Commit messages: conventional commits format
- Always run `npm run build && npm test && npm run lint` before pushing.

### Releases (Automatic)

Releases are fully automated via **semantic-release**. **Never manually bump the version in `package.json`.**

The version is determined by your commit messages:

| Commit type | Version bump | Example |
|---|---|---|
| `fix:` | Patch (1.0.0 → 1.0.1) | `fix: resolve config path traversal` |
| `feat:` | Minor (1.0.0 → 1.1.0) | `feat: add permission tracking` |
| `BREAKING CHANGE:` in body | Major (1.0.0 → 2.0.0) | `feat: new API\n\nBREAKING CHANGE: removed legacy config` |
| `docs:`, `chore:`, `refactor:`, `style:` | Patch | `docs: add runtime log locations` |

**To release:** just merge a PR to `main`. The CI workflow handles everything:
1. Runs quality gates (lint, test, typecheck, audit)
2. Analyzes commits to determine version bump
3. Updates `package.json` version
4. Generates `CHANGELOG.md`
5. Publishes to npm
6. Creates git tag
7. Creates GitHub Release
