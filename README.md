# opencode-agent-monitor

> Monitor, audit, and analyze agent/subagent routing and tool usage in OpenCode sessions.

[![CI](https://github.com/tenonde/opencode-agent-monitor/actions/workflows/ci.yml/badge.svg)](https://github.com/tenonde/opencode-agent-monitor/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/opencode-agent-monitor.svg)](https://www.npmjs.com/package/opencode-agent-monitor)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)

## Overview

**Agent Monitor** is an OpenCode plugin that provides observability into how AI agents and subagents are routed, what tools they use, and whether task-domain assignments are appropriate. It writes structured JSON-line logs with optional sensitive data redaction, log rotation, and domain detection.

### Key Features

- **Open Domain Detection** — Define your own domain categories with custom keyword patterns, or use the built-in defaults. No hardcoded types.
- **Agent-to-Domain Mapping** — Tell the plugin which of your agents handle which domains, regardless of what you name them.
- **Routing Mismatch Alerts** — Warns when a task's detected domain doesn't match the assigned agent's configured responsibilities.
- **Tool Usage Tracking** — Logs all tool executions with session context.
- **Permission Auditing** — Tracks permission requests and decisions.
- **Session Lifecycle** — Monitors session creation, updates, compaction, errors, and deletion.
- **Sensitive Data Redaction** — Automatically redacts API keys, tokens, passwords, and connection strings from logs.
- **Log Rotation** — Automatic log file rotation with configurable size limits and retention.
- **Structured Logging** — JSON-line format for easy parsing and analysis.
- **Zero Configuration** — Works out of the box with sensible, secure defaults.

## Installation

### From npm (Recommended)

1. Add the plugin to your `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-agent-monitor"]
}
```

2. OpenCode will automatically install the plugin on next startup.

### From Local File

1. Clone or download this repository:

```bash
git clone https://github.com/tenonde/opencode-agent-monitor.git
cd opencode-agent-monitor
npm install
npm run build
```

2. Copy the built plugin to your OpenCode plugins directory:

```bash
# Project-level (recommended)
cp dist/index.js .opencode/plugins/agent-monitor.js

# Or global
cp dist/index.js ~/.config/opencode/plugins/agent-monitor.js
```

### From Source (Development)

```bash
git clone https://github.com/tenonde/opencode-agent-monitor.git
cd opencode-agent-monitor
npm install
npm run dev  # Watch mode for development
```

Then reference the source file in your config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["./path/to/opencode-agent-monitor/src/index.ts"]
}
```

## Usage

Once installed, the plugin automatically starts monitoring. Logs are written to:

```
.opencode/agent-monitor.log
```

### Log Format

Each line is a JSON object:

```json
{"ts":"2025-04-26T10:30:00.000Z","type":"tool.execute.after","tool":"bash","sessionID":"abc123","guessedDomains":["backend","cloud"],"domainConfidence":0.45}
{"ts":"2025-04-26T10:30:01.000Z","type":"routing.mismatch","expectedDomains":["frontend"],"actualAgent":"backend","mismatches":["frontend"],"confidence":0.62}
{"ts":"2025-04-26T10:30:02.000Z","type":"permission.asked","tool":"write","sessionID":"abc123"}
```

### Analyzing Logs

Use `jq` or any JSON-line parser to analyze logs:

```bash
# View all routing mismatches
jq 'select(.type == "routing.mismatch")' .opencode/agent-monitor.log

# Count tool usage by tool name
jq -r 'select(.type | startswith("tool.")) | .tool' .opencode/agent-monitor.log | sort | uniq -c | sort -rn

# View all permission requests
jq 'select(.type | startswith("permission."))' .opencode/agent-monitor.log

# Filter by session
jq 'select(.sessionID == "your-session-id")' .opencode/agent-monitor.log
```

## Configuration

The plugin works with zero configuration. All settings use secure defaults.

### Quick Start: Simple JSON Config (No Code Required)

Create a `.opencode/agent-monitor.json` file in your project:

```json
{
  "autoDetectAgents": true,
  "domains": [
    { "name": "data-science", "patterns": ["pandas", "numpy", "matplotlib"] }
  ],
  "mergeDomains": true
}
```

That's it. The plugin will:
1. **Auto-detect your agents** from `opencode.json` and `.opencode/agents/*.md`
2. **Analyze their descriptions and prompts** to figure out what domains they handle
3. **Generate agent-to-domain mappings** automatically
4. **Merge your custom domains** with the built-in defaults

### Full JSON Config Options

```json
{
  "enabled": true,
  "logPath": ".opencode/agent-monitor.log",
  "maxLogSize": 10485760,
  "maxRotatedFiles": 5,
  "enableDomainDetection": true,
  "enableToolTracking": true,
  "enablePermissionTracking": true,
  "enableSessionTracking": true,
  "redactSensitiveData": true,
  "logLevel": "info",
  "emitRoutingWarnings": true,
  "excludedTools": [],

  "autoDetectAgents": true,

  "domains": [
    { "name": "data-science", "patterns": ["pandas", "numpy", "matplotlib"] },
    { "name": "mobile", "patterns": ["react native", "flutter", "swift"] }
  ],
  "mergeDomains": true,

  "agentMappings": [
    { "agentName": "my-ui-agent", "domains": ["frontend", "vision"] },
    { "agentName": "api-builder", "domains": ["backend", "cloud"] }
  ],

  "display": {
    "toasts": false,
    "structuredLogging": true
  }
}
```

### Display Options

The plugin has three levels of visibility, from always-on to optional:

| Level | What | Default | Configurable? |
|---|---|---|---|
| **File logging** | All events written to `.opencode/agent-monitor.log` | ✅ Always on | No (mandatory) |
| **Structured logging** | Events sent to OpenCode's internal log viewer via `client.app.log()` | ✅ On | Yes |
| **Toast notifications** | Brief pop-up messages in the TUI for important events | ❌ Off | Yes |

#### Toast Notifications

When enabled, the plugin shows brief, non-intrusive toast messages for:

- **Routing mismatches** — when a task's detected domain doesn't match the assigned agent
- **Session errors** — when a session encounters an error
- **Permission denials** — when a permission request is denied

```json
{
  "display": {
    "toasts": true
  }
}
```

Example toast: `⚠ Routing mismatch: "backend" handling [frontend]`

Toasts auto-dismiss and don't interrupt the workflow.

#### Structured Logging

When enabled (default), events are sent to OpenCode's internal logging system. These can be viewed through OpenCode's log viewer and filtered by service name `agent-monitor`.

```json
{
  "display": {
    "structuredLogging": false
  }
}
```

### How Auto-Detection Works

When `autoDetectAgents` is `true` (default), the plugin:

1. **Reads `opencode.json`** — finds all agents in the `"agent"` section
2. **Reads `.opencode/agents/*.md`** — finds all markdown-defined agents
3. **Analyzes descriptions and prompts** — uses the domain detection engine to figure out what each agent does
4. **Generates mappings** — creates `agentName → domains` mappings automatically

For built-in agents (`build`, `plan`, `general`, `explore`), the plugin already knows their domains.

For custom agents, it analyzes text like:

```json
{
  "agent": {
    "security-reviewer": {
      "description": "Reviews code for security vulnerabilities, OWASP compliance, and encryption",
      "prompt": "You are a security expert. Look for XSS, CSRF, and injection attacks."
    }
  }
}
```

This auto-generates: `{ agentName: "security-reviewer", domains: ["security"] }`

### Manual Override

Auto-detected mappings are merged with manually configured ones. **Manual mappings always take precedence:**

```json
{
  "autoDetectAgents": true,
  "agentMappings": [
    { "agentName": "my-agent", "domains": ["custom-domain"] }
  ]
}
```

If auto-detection finds `my-agent` handles `["frontend"]`, the manual mapping `["custom-domain"]` wins.

### Disable Auto-Detection

```json
{
  "autoDetectAgents": false
}
```

When disabled, only manually configured `agentMappings` are used. If no mappings are configured, the plugin falls back to substring matching (checks if agent name contains domain name).

### Basic Options

| Option | Default | Description |
|---|---|---|
| `enabled` | `true` | Enable or disable the monitor |
| `logPath` | `.opencode/agent-monitor.log` | Path to the log file |
| `maxLogSize` | `10485760` (10 MB) | Max log file size before rotation (0 = disabled) |
| `maxRotatedFiles` | `5` | Number of rotated log files to keep |
| `enableDomainDetection` | `true` | Enable domain detection and routing analysis |
| `enableToolTracking` | `true` | Enable tool usage tracking |
| `enablePermissionTracking` | `true` | Enable permission request tracking |
| `enableSessionTracking` | `true` | Enable session lifecycle tracking |
| `redactSensitiveData` | `true` | Redact secrets, keys, and tokens from logs |
| `logLevel` | `"info"` | Log level for structured logging |
| `emitRoutingWarnings` | `true` | Emit warnings for routing mismatches |
| `excludedTools` | `[]` | Tools to exclude from tracking |

### TypeScript Configuration (Advanced)

For full programmatic control, create a plugin wrapper in TypeScript:

```typescript
// .opencode/plugins/agent-monitor.ts
import {
  AgentMonitor,
  resolveConfigAsync,
  StructuredLogger,
  detectDomains,
  detectAgentMismatch,
} from "opencode-agent-monitor"

// Option 1: Use the plugin as-is (auto-detects agents, uses defaults)
export const AgentMonitorDefault = async (ctx) => {
  return AgentMonitor(ctx)
}

// Option 2: Build your own monitor with custom config
export const AgentMonitorCustom = async ({ client, directory }) => {
  const config = await resolveConfigAsync(
    {
      domains: [
        {
          name: "data-science",
          patterns: ["pandas", "numpy", "matplotlib", "jupyter", "sklearn"],
        },
      ],
      mergeDomainDefinitions: true,
    },
    directory
  )

  const logger = new StructuredLogger(config)

  return {
    event: async ({ event }) => {
      await logger.write({ type: "event", eventType: event?.type })
    },
    // ... other hooks
  }
}
```

### Agent-to-Domain Mappings

**With auto-detection enabled (default)**, you don't need to configure mappings manually — the plugin discovers your agents and generates mappings automatically.

For manual configuration, use the JSON config file:

```json
{
  "agentMappings": [
    { "agentName": "my-ui-specialist", "domains": ["frontend", "vision"] },
    { "agentName": "api-builder", "domains": ["backend"] },
    { "agentName": "cloud-deployer", "domains": ["cloud", "security"] },
    { "agentName": "fullstack-dev", "domains": ["frontend", "backend", "cloud"] }
  ]
}
```

With these mappings:
- If a task about "React components" is given to `my-ui-specialist` → **no mismatch** (handles frontend)
- If a task about "React components" is given to `api-builder` → **mismatch** (doesn't handle frontend)
- If a task about "React + Docker" is given to `fullstack-dev` → **no mismatch** (handles both)

#### Fallback behavior (no mappings configured)

If you don't configure `agentMappings` and auto-detection finds no agents, the plugin checks if the agent name contains the domain name:

- Agent `"frontend-agent"` + task about "React" → **no mismatch** (name contains "frontend")
- Agent `"backend"` + task about "React" → **mismatch** (name doesn't contain "frontend")

## Built-in Default Domains

These domains ship as defaults but are **not enforced as types**. You can use any domain name you want.

| Domain | Sample Keywords |
|---|---|
| `frontend` | React, Vue, CSS, UI, responsive, accessibility, component, layout |
| `backend` | API, REST, GraphQL, database, route, controller, service, webhook |
| `cloud` | AWS, GCP, Azure, Docker, Kubernetes, Terraform, CI/CD, deploy |
| `security` | IAM, secrets, encryption, vulnerability, OWASP, OAuth, JWT, RBAC |
| `architect` | Design pattern, SOLID, microservice, DDD, scalability, coupling |
| `qa` | Test, Jest, Cypress, regression, coverage, edge case, E2E |
| `documenter` | README, docs, changelog, migration, runbook, tutorial |
| `refiner` | Refactor, cleanup, lint, formatting, naming, dead code |
| `explore` | Search, discover, dependency, trace, convention, map |
| `vision` | Screenshot, image, visual, mockup, design, Figma |
| `general` | Summary, rewrite, utility, helper, script, automation |

## Security

This plugin follows security best practices:

- **Sensitive data redaction** is enabled by default, protecting API keys, tokens, passwords, and connection strings
- **No data leaves your machine** — all logs are written locally
- **No network calls** — the plugin does not make any HTTP requests
- **Safe error handling** — log failures never crash the plugin
- **Log rotation** prevents unbounded disk usage

See [SECURITY.md](SECURITY.md) for the full security policy.

## Project Structure

```
opencode-agent-monitor/
├── src/
│   ├── index.ts              # Plugin entry point
│   ├── types.ts              # TypeScript type definitions (open Domain type)
│   ├── config.ts             # Configuration resolution + agent mappings
│   ├── logger.ts             # Structured logger with rotation
│   └── domain-detector.ts    # Domain detection engine
├── tests/
│   ├── domain-detector.test.ts
│   ├── logger.test.ts
│   └── config.test.ts
├── .github/
│   ├── workflows/
│   │   ├── ci.yml            # CI pipeline
│   │   └── release.yml       # Release automation
│   ├── ISSUE_TEMPLATE/
│   └── pull_request_template.md
├── package.json
├── tsconfig.json
├── eslint.config.js
├── .prettierrc
├── .gitignore
├── README.md
├── CHANGELOG.md
├── CONTRIBUTING.md
├── SECURITY.md
└── LICENSE
```

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18.0.0
- [npm](https://www.npmjs.com/) (comes with Node.js)
- [OpenCode](https://opencode.ai) (for testing)

### Scripts

```bash
npm install           # Install dependencies
npm run build         # Build the plugin
npm run dev           # Watch mode
npm test              # Run tests
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage
npm run lint          # Run ESLint
npm run lint:fix      # Fix linting issues
npm run format        # Format code with Prettier
npm run typecheck     # Type check without emitting
```

### Running Tests

```bash
npm test
```

### Publishing

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Create a git tag: `git tag v1.0.0`
4. Push the tag: `git push origin v1.0.0`
5. The release workflow will publish to npm automatically

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Ways to Contribute

- Report bugs via [GitHub Issues](https://github.com/tenonde/opencode-agent-monitor/issues)
- Suggest features or improvements
- Submit pull requests
- Improve documentation
- Add new domain patterns to the defaults
- Write tests

## License

This project is licensed under the [MIT License](LICENSE).

## Acknowledgments

- Built for [OpenCode](https://opencode.ai) — the open-source AI coding agent
- Inspired by the need for agent observability in multi-agent workflows
