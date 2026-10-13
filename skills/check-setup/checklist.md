# check-setup checklist

Single source for every check: id, rationale, fix. Add new checks here.

## Project setup

### P1: `AGENTS.md` exists

Rationale: `AGENTS.md` is the one instruction file both Hosts read. Without it, neither Host gets project instructions.
Fix: create `AGENTS.md` in the project root with the shared agent instructions.

### P2: `CLAUDE.md` exists and imports `@AGENTS.md`

Rationale: Claude Code reads `CLAUDE.md`, not `AGENTS.md`. A line `@AGENTS.md` in it makes Claude Code load the shared instructions.
Fix: create `CLAUDE.md` containing the line `@AGENTS.md`, or add that line to the existing file.

## Machine setup

### M1: Host CLI installed and at least the tested version

Checked per Host. Tested versions: Claude Code 2.1.296, codex-cli 0.160.1. Detection runs `<host> --version` (see `scripts/hosts.mjs`, `detectHosts`).
Rationale: the setup was verified with these versions; a missing CLI cannot use the shared plugins, and an older one may behave differently.
Result: warn when the CLI is missing, older than the tested version, or prints no parseable version; pass otherwise. When a Host is missing, its other machine checks (M2 onward) are skipped with a reason.
Fix: install or update the CLI and put it on PATH.

### M2: Project is trusted

Checked per Host, for the project root.
- Claude Code: `~/.claude.json` `projects` has an entry for the project path (forward slashes, e.g. `C:/Users/me/repo`) with `hasTrustDialogAccepted: true`. A trusted parent folder does not count.
- Codex: `~/.codex/config.toml` has `[projects.'<path>']` with `trust_level = "trusted"`. On Windows the path is lowercased with backslashes; on POSIX it is exact.
Rationale: both Hosts load project-level plugin configuration only for trusted projects.
Fix: Claude Code, run `claude` interactively in the repository and accept the workspace trust dialog. Codex, run `codex` there and accept the trust prompt, or add the table above to `~/.codex/config.toml`.
