name: Bug Report
description: Report a bug or unexpected behavior
title: "[Bug]: "
labels: ["bug"]
body:
  - type: markdown
    attributes:
      value: |
        Thanks for taking the time to fill out this bug report!

  - type: input
    id: version
    attributes:
      label: Plugin Version
      description: What version of opencode-agent-monitor are you using?
      placeholder: e.g., 1.0.0
    validations:
      required: true

  - type: input
    id: opencode-version
    attributes:
      label: OpenCode Version
      description: What version of OpenCode are you using?
      placeholder: e.g., 2025.3.1
    validations:
      required: true

  - type: input
    id: runtime
    attributes:
      label: Runtime
      description: What runtime are you using? (Bun, Node.js)
      placeholder: e.g., Bun 1.2.0
    validations:
      required: true

  - type: textarea
    id: description
    attributes:
      label: Bug Description
      description: A clear and concise description of what the bug is.
    validations:
      required: true

  - type: textarea
    id: reproduction
    attributes:
      label: Steps to Reproduce
      description: How can we reproduce this behavior?
      placeholder: |
        1. Configure the plugin with...
        2. Run OpenCode with...
        3. Observe...
    validations:
      required: true

  - type: textarea
    id: expected
    attributes:
      label: Expected Behavior
      description: What did you expect to happen?
    validations:
      required: true

  - type: textarea
    id: logs
    attributes:
      label: Relevant Log Output
      description: Please copy and paste any relevant log output.
      render: shell

  - type: textarea
    id: config
    attributes:
      label: Plugin Configuration
      description: Share your plugin configuration (redact any sensitive values).
      render: json
