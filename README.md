# ai-plugin-manager

Keeps Claude Code and Codex coordinated at the project level: shared instructions in `AGENTS.md`, shared skills through plugins enabled for both hosts, and host-specific configuration kept in `.claude/` and `.codex/`.

## Contents

- `AGENTS.md`: canonical project instructions for both hosts.
- `CLAUDE.md`: imports `AGENTS.md`.
- `.claude/settings.json`: Claude Code plugin enablement and marketplaces.
- `.codex/config.toml`: Codex plugin marketplaces and enablement.
- `docs/agents/`: agent-facing docs, listed below.

## Setting up a machine

The setup skill ships inside the `ai-plugin-manager` plugin, so it does not exist on a fresh machine. Bootstrap order:

1. Install the plugin by hand in one Host (your choice): trust the project in that Host, then follow that Host's steps in the [per-machine steps](docs/agents/claude-codex-sharing.md#per-machine-steps) until `ai-plugin-manager@ai-plugin-manager` is installed. Trust is always manual.
2. Run the setup skill in that Host (`/ai-plugin-manager:setup` in Claude Code, `$ai-plugin-manager:setup` in Codex). It shows a plan, waits for your confirmation, then registers the declared marketplaces and installs the enabled plugins in both Hosts. It stops for a Host whose project is not trusted, so trust the project in the other Host first.

The per-machine steps can also be completed by hand for both Hosts; the skill is a shortcut, not a requirement.

## Adopting the plugin in a project

The plugin provides the `setup` skill (installs the declared plugins; user-invoked only) and the `check-setup` skill, which verifies a project's Project setup and the current machine's Machine setup for both Hosts. It needs Node.js. Copy-paste steps:

1. Declare the plugin in the project (committed), as this repository does:
   - Claude Code, in `.claude/settings.json`: `"enabledPlugins": { "ai-plugin-manager@ai-plugin-manager": true }` and `"extraKnownMarketplaces": { "ai-plugin-manager": { "source": { "source": "github", "repo": "hsmejky/ai-plugin-manager" }, "autoUpdate": true } }`.
   - Codex, in `.codex/config.toml`: `[marketplaces.ai-plugin-manager]` (`source_type = "git"`, `source = "https://github.com/hsmejky/ai-plugin-manager.git"`) and `[plugins."ai-plugin-manager@ai-plugin-manager"]` with `enabled = true`.
2. On each machine, follow the [bootstrap order](#setting-up-a-machine): install the plugin by hand in one Host, then run the setup skill (`/ai-plugin-manager:setup` or `$ai-plugin-manager:setup`); or complete the [per-machine steps](docs/agents/claude-codex-sharing.md#per-machine-steps) by hand in both Hosts.
3. Run the setup checker (the live check is opt-in): see [running the checker](docs/agents/verification.md#run-the-setup-checker).
4. Read the report, apply the fixes and rerun until no fail remains. See [reading the report](docs/agents/verification.md#read-the-report).

## Docs

- [claude-codex-sharing.md](docs/agents/claude-codex-sharing.md): how instructions and skills are shared between the hosts.
- [plugin-authoring.md](docs/agents/plugin-authoring.md): how to create and maintain a Shared plugin for both Hosts (manifests, skills, versioning, updates, local testing).
- [verification.md](docs/agents/verification.md): how to verify a setup in either Host.
- [checklist.md](skills/check-setup/checklist.md): every `check-setup` check with rationale and fix.
- [domain.md](docs/agents/domain.md): domain docs layout.
- [issue-tracker.md](docs/agents/issue-tracker.md): issue tracker conventions.
- [triage-labels.md](docs/agents/triage-labels.md): triage labels.

## Tests

- Markdown links: `node --test test/markdown-links.test.mjs` fails when a relative link or anchor in a tracked `.md` file points to a missing file or heading. External URLs are not checked.
- check-setup skill: `node --test skills/check-setup/scripts/test/*.test.mjs` (see that directory for the suites).
- setup skill: `node --test skills/setup/scripts/test/*.test.mjs` (offline fake Hosts). Live (opt-in, network, no login, temporary Host homes and project copy only): `SETUP_LIVE=1 node --test skills/setup/scripts/test/live-setup.test.mjs`.
- Real Host CLIs (opt-in): `CHECK_SETUP_HOST_CLI=1 node --test skills/check-setup/scripts/test/host-cli.test.mjs` compares the test stubs and the documented command names with the installed `claude` and `codex` (skipped per Host when its CLI is absent; without the variable only the offline helper tests run).
- Live Hosts (opt-in): `CHECK_SETUP_LIVE_INSTRUCTIONS=1 node --test skills/check-setup/scripts/test/live-instructions.test.mjs` asks the logged-in Hosts the instructions prompt and the negative-check skills prompt (model calls; temporary Host homes, deleted afterwards, that get only the access tokens, never a refresh token, so the real logins stay untouched).
- Codex drift (opt-in): `CHECK_SETUP_CODEX_DRIFT=1 node --test skills/check-setup/scripts/test/codex-drift.test.mjs` checks that a Codex session moves a marketplace installed at an old revision to the configured ref, for a user-level and a project-only declaration (network, no login; temporary `CODEX_HOME` only).
- Doc sync: `node --test test/doc-sync.test.mjs` keeps facts that several docs repeat in step.
- CI: `.github/workflows/offline-tests.yml` runs the offline suites (Markdown links, doc sync, check-setup skill, setup skill) on every push to `main` and every pull request, on Node 20 and 24, on Linux and Windows. The live check is not run in CI (it needs Host authentication).
