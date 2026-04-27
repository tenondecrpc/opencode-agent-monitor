# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.0.x   | Yes       |

## Reporting a Vulnerability

We take the security of this plugin seriously. If you discover a security vulnerability, please follow these steps:

1. **Do NOT** open a public GitHub issue
2. Email the maintainer directly with details
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will respond within 48 hours and work to resolve the issue promptly.

## Security Features

### Sensitive Data Redaction

The plugin automatically redacts the following patterns from logs:

- API keys (`api_key`, `apikey`, `secret_key`)
- Access tokens and auth tokens
- Bearer tokens
- Passwords
- AWS credentials (access key IDs, secret access keys)
- Database connection strings (MongoDB, PostgreSQL, MySQL, Redis)
- Base64-encoded secrets
- Private keys

Redaction is **enabled by default** and can be disabled via configuration (not recommended).

### Data Locality

- **All logs are written locally** to your project's `.opencode/` directory
- **No network requests** are made by this plugin
- **No telemetry** or analytics are collected
- **No data is sent** to external services

### Safe Error Handling

- Log write failures are caught and reported to stderr
- Errors never crash the plugin or OpenCode
- JSON parsing failures during redaction fall back to the original object

### Log Rotation

- Automatic log rotation prevents unbounded disk usage
- Configurable size limits and file retention
- Old rotated files are automatically cleaned up

## Best Practices for Users

1. **Keep redaction enabled** - Only disable if you have a specific need and understand the risks
2. **Review log files** - Periodically check `.opencode/agent-monitor.log` for any accidentally logged sensitive data
3. **Use `.gitignore`** - The plugin's `.gitignore` already excludes log files, but verify they're not committed
4. **Rotate logs regularly** - Adjust `maxLogSize` and `maxRotatedFiles` based on your needs
5. **Limit log access** - Ensure only authorized users can read the log directory

## Dependency Security

- Dependencies are kept minimal to reduce supply chain risk
- `devDependencies` are not included in the published package
- The `files` field in `package.json` limits what gets published
- Regular dependency audits are recommended

## Audit Log

Security-related changes are noted in commit messages and pull request descriptions.
