# ai-plugin-manager

Keeps Claude Code and Codex coordinated at the project level: shared instructions in `AGENTS.md`, shared skills through plugins enabled for both hosts, and host-specific configuration kept in `.claude/` and `.codex/`.

## Contents

- `AGENTS.md`: canonical project instructions for both hosts.
- `CLAUDE.md`: imports `AGENTS.md`.
- `.claude/settings.json`: Claude Code plugin enablement and marketplaces.
- `.codex/config.toml`: Codex plugin marketplaces and enablement.
- `docs/agents/`: agent-facing docs, listed below.

## Setting up a machine

Follow the [per-machine steps](docs/agents/claude-codex-sharing.md#per-machine-steps).

## Adopting the plugin in a project

The plugin provides the `check-setup` skill, which verifies a project's Project setup and the current machine's Machine setup for both Hosts. It needs Node.js. Copy-paste steps:

1. Declare the plugin in the project (committed), as this repository does:
   - Claude Code, in `.claude/settings.json`: `"enabledPlugins": { "ai-plugin-manager@ai-plugin-manager": true }` and `"extraKnownMarketplaces": { "ai-plugin-manager": { "source": { "source": "github", "repo": "hsmejky/ai-plugin-manager" }, "autoUpdate": true } }`.
   - Codex, in `.codex/config.toml`: `[marketplaces.ai-plugin-manager]` (`source_type = "git"`, `source = "https://github.com/hsmejky/ai-plugin-manager.git"`) and `[plugins."ai-plugin-manager@ai-plugin-manager"]` with `enabled = true`.
2. On each machine, complete the [per-machine steps](docs/agents/claude-codex-sharing.md#per-machine-steps) in each Host (trust the project, install the plugin).
3. Run the skill from the project root: Claude Code `/ai-plugin-manager:check-setup`, Codex `$ai-plugin-manager:check-setup`. Ask for a "live check" to also have each Host list the plugin's skills (a model call, off by default).
4. Read the report: each finding has a check id, a status (pass, warn, fail or skip) and a fix. Apply the fixes and rerun until no fail remains. The checks are defined in [the checklist](skills/check-setup/checklist.md).

## Docs

- [claude-codex-sharing.md](docs/agents/claude-codex-sharing.md): how instructions and skills are shared between the hosts.
- [checklist.md](skills/check-setup/checklist.md): every `check-setup` check with rationale and fix.
- [domain.md](docs/agents/domain.md): domain docs layout.
- [issue-tracker.md](docs/agents/issue-tracker.md): issue tracker conventions.
- [triage-labels.md](docs/agents/triage-labels.md): triage labels.

## Tests

- Markdown links: `node --test test/markdown-links.test.mjs` fails when a relative link or anchor in a tracked `.md` file points to a missing file or heading. External URLs are not checked.
- check-setup skill: `node --test skills/check-setup/scripts/test/*.test.mjs` (see that directory for the suites).
