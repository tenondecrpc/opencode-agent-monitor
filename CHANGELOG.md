# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Simple JSON config file** — `.opencode/agent-monitor.json` for configuration without writing TypeScript
- **Auto-detection of agents** — reads `opencode.json` and `.opencode/agents/*.md` to discover user's agents
- **Automatic agent-to-domain mapping generation** — analyzes agent descriptions and prompts to detect domains
- `autoDetectAgents` config option (default: `true`) to enable/disable auto-discovery
- `resolveConfigAsync()` for async config resolution with auto-discovery support
- `discoverAgents()` function to find agents from OpenCode's configuration
- `generateAgentMappings()` function to create domain mappings from agent analysis
- `AgentMonitorJsonConfig` type for the JSON config file format
- `DiscoveredAgent` type representing an agent found in OpenCode's config
- `includeGlobalConfig` option for `discoverAgents()` to control whether to read global config
- Tests for agent discovery, JSON config loading, and async config resolution

### Changed

- **Breaking**: `Domain` type is now open (`string`) instead of a closed union — any domain name can be used
- **Breaking**: `customDomainPatterns` config replaced by `domains` (array of `DomainDefinition`) and `mergeDomainDefinitions` flag
- Domain detection is now fully driven by user-configurable `DomainDefinition[]` — built-in defaults are a starting point, not a constraint
- Routing mismatch detection uses explicit `agentMappings` (agent name → domains) instead of naive substring matching
- Fallback to substring matching when no agent mappings are configured
- `resolveConfig()` now merges or replaces domain definitions based on `mergeDomainDefinitions` flag
- Agent mapping names are normalized to lowercase for case-insensitive matching
- Added `getAgentDomains()` helper to look up an agent's configured domains
- Exported `DEFAULT_DOMAIN_DEFINITIONS` for users who want to reference or extend built-in patterns
- Updated README with comprehensive configuration examples for custom domains and agent mappings
- Tests expanded from 43 to 75 covering open domains, custom definitions, agent mappings, auto-discovery, and JSON config

## [1.0.0] - 2025-04-26

### Added

- Initial release of opencode-agent-monitor
- Domain detection engine with 11 domain categories (frontend, backend, cloud, security, architect, qa, documenter, refiner, explore, vision, general)
- Routing mismatch detection and warnings
- Tool execution tracking (before/after hooks)
- Permission request and decision tracking
- Session lifecycle monitoring (created, updated, idle, deleted, compacted, error)
- Message tracking with domain analysis
- File edit tracking
- Command execution tracking
- TUI toast tracking
- Structured JSON-line logging
- Automatic sensitive data redaction (API keys, tokens, passwords, connection strings, bearer tokens)
- Log rotation with configurable size limits and file retention
- Zero-configuration setup with secure defaults
- Full TypeScript support with type definitions
- Comprehensive test suite
- CI/CD pipeline with lint, typecheck, test, and build jobs
- Release automation via GitHub Actions
- Documentation: README, CHANGELOG, CONTRIBUTING, SECURITY, LICENSE
- GitHub issue templates (bug report, feature request)
- Pull request template

[Unreleased]: https://github.com/tenonde/opencode-agent-monitor/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/tenonde/opencode-agent-monitor/releases/tag/v1.0.0
