# Contributing to opencode-agent-monitor

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to this project.

## Code of Conduct

This project follows a code of conduct that expects all contributors to be respectful and constructive. Please be kind to others in all interactions.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18.0.0
- Git

### Setup

1. Fork the repository on GitHub
2. Clone your fork:

```bash
git clone https://github.com/YOUR_USERNAME/opencode-agent-monitor.git
cd opencode-agent-monitor
```

3. Install dependencies:

```bash
npm install
```

4. Create a branch for your changes:

```bash
git checkout -b feature/your-feature-name
```

## Development Workflow

### Making Changes

1. Write your code following the existing patterns and conventions
2. Add or update tests as needed
3. Ensure all tests pass:

```bash
npm test
```

4. Run the linter:

```bash
npm run lint
npm run format
```

5. Run the type checker:

```bash
npm run typecheck
```

6. Build the project:

```bash
npm run build
```

### Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

Types:

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, semicolons, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Examples:

```
feat(domain-detector): add custom pattern support
fix(logger): handle ENOENT on log rotation
docs(readme): update installation instructions
test(config): add validation tests for edge cases
```

## Pull Requests

1. Push your branch to your fork
2. Open a Pull Request against the `main` branch
3. Fill out the PR template completely
4. Ensure CI checks pass
5. Respond to review feedback

### PR Requirements

- [ ] Tests pass locally
- [ ] Linting passes
- [ ] Type checking passes
- [ ] Build succeeds
- [ ] PR template is filled out
- [ ] CHANGELOG.md is updated (if applicable)

## Adding Domain Patterns

To add new domain detection patterns:

1. Open `src/domain-detector.ts`
2. Add patterns to the `DEFAULT_DOMAIN_PATTERNS` object
3. Add the domain to the `Domain` type in `src/types.ts`
4. Add tests in `tests/domain-detector.test.ts`
5. Update the README domain table

## Security Considerations

- Never commit secrets, API keys, or credentials
- Ensure sensitive data redaction patterns are comprehensive
- Review any changes that affect logging for potential data exposure
- Report security vulnerabilities privately (see [SECURITY.md](SECURITY.md))

## Reporting Issues

- Use [GitHub Issues](https://github.com/tenonde/opencode-agent-monitor/issues)
- Fill out the appropriate template
- Include reproduction steps for bugs
- Redact any sensitive information

## Questions?

- Open a [GitHub Discussion](https://github.com/tenonde/opencode-agent-monitor/discussions)
- Check existing issues and documentation

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
