# check-setup checklist

Single source for every check: id, rationale, fix. Add new checks here.

## Project setup

### P1: `AGENTS.md` exists

Rationale: `AGENTS.md` is the one instruction file both Hosts read. Without it, neither Host gets project instructions.
Fix: create `AGENTS.md` in the project root with the shared agent instructions.

### P2: `CLAUDE.md` exists and imports `@AGENTS.md`

Rationale: Claude Code reads `CLAUDE.md`, not `AGENTS.md`. A line `@AGENTS.md` in it makes Claude Code load the shared instructions.
Fix: create `CLAUDE.md` containing the line `@AGENTS.md`, or add that line to the existing file.

### P3: Claude settings are valid and every enabled plugin's marketplace is declared

Rationale: the expected Shared plugins come from `.claude/settings.json` (`enabledPlugins`). A JSON typo silently disables them, and a plugin whose marketplace is not in `extraKnownMarketplaces` cannot be installed on a fresh machine. `claude-plugins-official` is built in and needs no declaration. Skip when the file does not exist.
Fix: repair the JSON, and add `"<marketplace>": { "source": { "source": "github", "repo": "<owner>/<repo>" } }` under `extraKnownMarketplaces`.

### P4: Codex project config declares the marketplace and the plugin

Rationale: Codex reads `.codex/config.toml`. Every plugin enabled there (`[plugins."<plugin>@<marketplace>"]`, `enabled = true`) needs its marketplace declared (`[marketplaces.<name>]` with `source_type` and `source`); Codex's own marketplaces (`openai-bundled`, `openai-curated`, `openai-primary-runtime`) are exempt. If Claude settings enable plugins but `.codex/config.toml` is missing, that is a fail. Malformed TOML is a fail, not a crash. Skip when neither Host declares plugins.
Fix: add the two tables, for example `[marketplaces.m]` with `source_type = "git"` and `source = "https://github.com/<owner>/<repo>.git"`, plus `[plugins."a@m"]` with `enabled = true`.

### P5: Shared plugin sets match across Hosts

Rationale: a plugin enabled in only one Host is usually an omission, but Host-specific plugins are allowed, so it is a warn. Skip when either config is missing or unreadable (P3 and P4 report that).
Fix: enable the plugin in the other Host (Codex table above; Claude `"<plugin>@<marketplace>": true` in `enabledPlugins`), or ignore if intentional.

### P6: the same marketplace has the same source in both Hosts

Rationale: a marketplace declared in both Hosts must resolve to the same repository, or the Hosts install different code under one name. Sources are compared after normalisation (Claude `github` + `repo` equals a Codex git URL for the same repository; `.git` suffix, scheme and case are ignored). Skip when no marketplace is declared in both.
Fix: set one source in both configs.

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

### M3: declared marketplaces are registered

Checked per Host, for the marketplaces the project declares (Claude `extraKnownMarketplaces`, Codex `[marketplaces.<name>]`), against `claude plugin marketplace list --json` / `codex plugin marketplace list --json` (Codex nests the list under `marketplaces`).
Rationale: a declared marketplace is only a declaration; the plugin cannot be installed until the Host has registered it on this machine.
Result: fail when a declared marketplace is not registered; warn when the list command fails; skip when the Host CLI is missing (M1), the Host config is missing or unreadable, or no marketplace is declared.
Fix: `claude plugin marketplace add <owner/repo>` or `codex plugin marketplace add <git url>`, taken from the project's own declaration.

### M4: expected plugins are installed and enabled from the declared marketplace

Checked per Host, for the plugins that Host's own project config enables (not only the Shared plugins), against `claude plugin list --json` / `codex plugin list --json`. The id must match exactly, `plugin@marketplace`.
- Claude: "enabled" comes from the project's `enabledPlugins`; the CLI reports `enabled: false` for plugins enabled only through project settings, so only "installed" is read from the CLI.
- Codex: the installed entry must also report `enabled: true`.
Rationale: a plugin that is declared but not installed does nothing, and a same-named plugin from a different marketplace is different code under the same name.
Result: fail when a plugin is not installed, is disabled (Codex), or only a same-named plugin from another marketplace is installed; warn when the list command fails; skip as for M3, or when the Host enables no plugin.
Fix: `claude plugin install <id>` / `codex plugin add <id>`; for a foreign same-named plugin, first `claude plugin uninstall` / `codex plugin remove` it.

### M5: Shared plugin versions match across Hosts

Compares the installed version of every Shared plugin (enabled by the project in both Hosts) between Claude Code and Codex.
Rationale: different versions of one plugin make the Hosts behave differently. It is a warn because the Hosts may legitimately update at different times.
Result: warn on any difference; skip when a Host CLI is missing, a config is unreadable, there are no Shared plugins, or none is installed in both Hosts (M4 reports that).
Fix: update the Host with the older version (`claude plugin update <id>`, or `codex plugin remove` then `add`), refreshing the marketplace first if needed.

## Live check (opt-in)

Runs only with `--live`, which the skill passes only when the user explicitly asks for a live check. Without it no model call is made and no L1 finding appears. It needs network and authentication in each Host.

### L1: each Host lists the expected skills

Checked per Host, for every plugin the Host's project config enables and that is installed (M4 reports the rest). The expected skills come from the installed plugin: Claude Code from the manifest `skills` array (else `skills/*/SKILL.md`) under `installPath` of `claude plugin list --json`; Codex from `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/`. Skills with `disable-model-invocation: true` are user-only and not expected. Each Host is asked, per plugin and from the project root, with the prompt of `docs/agents/claude-codex-sharing.md` (Verification): `claude -p "..."` (never `--bare`, which skips plugin sync) and `codex exec --skip-git-repo-check "..."`. Claude Code has no flag that lists skills, hence the model call.
Rationale: confirms end to end that the Host actually sees the plugin's skills, which the static checks cannot prove.
Result: pass when every expected skill is named in the reply; fail when any is missing (including a reply of `NONE`); skip with the reason when the Host CLI is missing, the command fails (network, authentication, sandbox, timeout), the reply holds no skill name, or no installed plugin can be tested. Replies are model output, so a skip or a one-off fail is worth one rerun.
Fix: start a new session so the plugins reload (the first session on a fresh machine only fetches the marketplace), then rerun; otherwise recheck M2 to M4.
