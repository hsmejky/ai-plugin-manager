# ai-plugin-manager

Keeps Claude Code and Codex coordinated at the project level: shared instructions in `AGENTS.md`, shared skills through plugins enabled for both hosts, and host-specific configuration kept in `.claude/` and `.codex/`.

## Contents

- `AGENTS.md`: canonical project instructions for both hosts.
- `CLAUDE.md`: imports `AGENTS.md`.
- `.claude/settings.json`: Claude Code plugin enablement and marketplaces.
- `.codex/config.toml`: Codex plugin enablement.
- `docs/agents/`: agent-facing docs, listed below.

## Setting up a machine

Follow the per-machine steps in [docs/agents/claude-codex-sharing.md](docs/agents/claude-codex-sharing.md): install the plugins for each host and, for Codex, trust the project.

## Docs

- [claude-codex-sharing.md](docs/agents/claude-codex-sharing.md): how instructions and skills are shared between the hosts.
- [domain.md](docs/agents/domain.md): domain docs layout.
- [issue-tracker.md](docs/agents/issue-tracker.md): issue tracker conventions.
- [triage-labels.md](docs/agents/triage-labels.md): triage labels.
