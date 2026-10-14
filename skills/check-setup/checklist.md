# check-setup checklist

Single source for every check: id, rationale, fix. Add new checks here.

## Project setup

### P1: `AGENTS.md` exists

Rationale: `AGENTS.md` is the one instruction file both Hosts read. Without it, neither Host gets project instructions.
Fix: create `AGENTS.md` in the project root with the shared agent instructions.

### P2: `CLAUDE.md` exists and imports `@AGENTS.md`

Rationale: Claude Code reads `AGENTS.md` natively (2.1.277+) only when no `CLAUDE.md` exists in the working directory or above, and not in every session ([memory](https://code.claude.com/docs/en/memory#agents-md)). A `CLAUDE.md` with the line `@AGENTS.md` makes every session load the shared instructions.
Fix: create `CLAUDE.md` containing the line `@AGENTS.md`, or add that line to the existing file.

### P3: Claude settings are valid and every enabled plugin's marketplace is declared

Rationale: the expected Shared plugins come from `.claude/settings.json` (`enabledPlugins`). A JSON typo silently disables them, and a plugin whose marketplace is not in `extraKnownMarketplaces` cannot be installed on a fresh machine. The Claude built-in marketplace `claude-plugins-official` is exempt: it needs no declaration. Skip when the file does not exist.
Fix: repair the JSON, and add `"<marketplace>": { "source": { "source": "github", "repo": "<owner>/<repo>" }, "autoUpdate": true }` under `extraKnownMarketplaces`.

### P4: Codex project config declares the marketplace and the plugin

Rationale: Codex reads `.codex/config.toml`. Every plugin enabled there (`[plugins."<plugin>@<marketplace>"]`, `enabled = true`) needs its marketplace declared (`[marketplaces.<name>]` with `source_type` and `source`); Codex's built-in marketplaces (`openai-bundled`, `openai-curated`, `openai-curated-remote`, `openai-primary-runtime`; source: `codex plugin marketplace list --json` and `codex plugin list --json`, codex-cli 0.162.1, 2026-10-14) are exempt for the same reason. If Claude settings enable plugins but `.codex/config.toml` is missing, that is a fail. Malformed TOML is a fail, not a crash. Skip when neither Host declares plugins.
Fix: add the two tables, for example `[marketplaces.m]` with `source_type = "git"` and `source = "https://github.com/<owner>/<repo>.git"`, plus `[plugins."a@m"]` with `enabled = true`.

### P5: Shared plugin sets match across Hosts

Rationale: a plugin enabled in only one Host is usually an omission, but Host-specific plugins are allowed, so it is a warn. Skip when either config is missing or unreadable (P3 and P4 report that).
Fix: enable the plugin in the other Host (Codex table above; Claude `"<plugin>@<marketplace>": true` in `enabledPlugins`), or ignore if intentional.

### P6: the same marketplace has the same source in both Hosts

Rationale: a marketplace declared in both Hosts must resolve to the same repository, or the Hosts install different code under one name. Sources are compared after normalisation (Claude `github` + `repo` equals a Codex git URL for the same repository; `.git` suffix, scheme and case are ignored). A source shape that cannot be normalised (for example an unknown `source` type) cannot be compared, and two such sources are never treated as equal: P6 warns that they could not be compared instead of passing. A real difference between two recognised sources is still a fail. Skip when no marketplace is declared in both.
Fix: set one source in both configs.

### P7: declared Claude marketplaces have `"autoUpdate": true`

Rationale: Claude Code does not auto-update third-party marketplaces unless the entry sets `"autoUpdate": true`, so a project without it stays on an old plugin version while Codex follows the marketplace head (M5 drift). Auto-update is on by default for `claude-plugins-official` and the other official marketplace names except `knowledge-work-plugins` and `first-party-plugins`, but Claude Code accepts those names only for sources under `github.com/anthropics/`; those entries are exempt, a same-named entry from another source is not. P3 still exempts only `claude-plugins-official`. Sources: https://code.claude.com/docs/en/settings-reference#extraknownmarketplaces, https://code.claude.com/docs/en/discover-plugins ("Keep plugins updated") and https://code.claude.com/docs/en/plugins/security (official names), read 2026-10-14, Claude Code 2.1.299; not run live.
Result: warn when an `extraKnownMarketplaces` entry in `.claude/settings.json` has no `"autoUpdate": true` (key missing or `false`); pass otherwise. Skip when the file is missing or unreadable (P3 reports that) or declares no marketplace that needs it.
Fix: add `"autoUpdate": true` next to `"source"` in the named `extraKnownMarketplaces` entry.

### P8: Codex marketplace `ref` follows Codex's full-SHA rule

Checked for every `[marketplaces.<name>]` in `.codex/config.toml` that sets `ref`. Source: `docs/research/codex-marketplace-ref-pinning-2026-10-14.md` (#26), verified on codex-cli 0.162.1.
Rationale: Codex treats a ref as a commit only when `is_full_git_sha` holds: exactly 40 ASCII hex characters, untrimmed (`marketplace_upgrade/git.rs`, tag `rust-v0.162.1`); any other ref goes to `git ls-remote` as a branch or tag name. `codex plugin marketplace add <repo>@a157af3` succeeds, but every later upgrade, including the startup auto-upgrade, fails with "git ls-remote returned empty output for marketplace source" and the plugin silently stops updating.
Result: warn when a `ref` is all hex but not 40 characters (4 to 39: Codex does not treat it as a short SHA, so it fails unless a branch or tag of that name exists. P8 warns deliberately here because it cannot tell offline whether such a branch or tag exists, and the message says so rather than calling it a short SHA; 41 to 64 including a SHA-256 id: not a commit, always looked up as a name) or has surrounding whitespace (Codex does not trim); pass for no `ref`, a full 40-hex SHA, or a tag or branch name; skip when `.codex/config.toml` is missing or unreadable (P4 reports that) or declares no marketplace.
Fix: set `ref` to the full 40-character SHA, or to a tag or branch name.

## Machine setup

### M1: Host CLI installed and at least the tested version

Checked per Host. Tested versions: Claude Code 2.1.299, codex-cli 0.162.1. Detection runs `<host> --version` (see `scripts/hosts.mjs`, `detectHosts`).
Rationale: the setup was verified with these versions; a missing CLI cannot use the shared plugins, and an older one may behave differently.
Result: warn when the CLI is missing, older than the tested version, or prints no parseable version ("version undetermined": the CLI runs, but its `--version` output holds no x.y.z, so the minimum cannot be verified); pass otherwise. When a Host is missing, its other machine checks (M2 onward) are skipped with a reason.
Fix: install or update the CLI and put it on PATH.

### M2: Project is trusted

Checked per Host, for the project root.
- Claude Code: `~/.claude.json` `projects` has an entry for the project path (forward slashes, e.g. `C:/Users/me/repo`) with `hasTrustDialogAccepted: true`. A trusted parent folder does not count. On Windows the path match is case-insensitive, because the case of drive letter and folders varies between launches; on POSIX it is exact.
- Codex: `~/.codex/config.toml` has `[projects.'<path>']` with `trust_level = "trusted"`. On Windows the path is lowercased with backslashes; on POSIX it is exact. `~/.codex/config.toml` is read with the repository's own TOML reader; if it cannot be parsed, the check is a warn with the parse error (trust cannot be judged), not a fail.
Rationale: both Hosts load project-level plugin configuration only for trusted projects.
Fix: Claude Code, run `claude` interactively in the repository and accept the workspace trust dialog. Codex, run `codex` there and accept the trust prompt, or add the table above to `~/.codex/config.toml`.

### M3: declared marketplaces are registered

Checked per Host, for the marketplaces the project declares (Claude `extraKnownMarketplaces`, Codex `[marketplaces.<name>]`), against `claude plugin marketplace list --json` / `codex plugin marketplace list --json` (Codex nests the list under `marketplaces`).
Rationale: a declared marketplace is only a declaration; the plugin cannot be installed until the Host has registered it on this machine.
Result: fail when a declared marketplace is not registered; warn when the list command fails; skip when the Host CLI is missing (M1), the Host config is missing or unreadable, or no marketplace is declared. The skip reason names the missing file, or the file and its parse error. When Codex reports "marketplace root does not contain a supported manifest", the warn's fix names the declared sources: each must have `.claude-plugin/marketplace.json` at the declared ref (publish it, or point the declaration at a ref that has it), and a stale registration is repaired with `codex plugin marketplace remove <name>` then `codex plugin marketplace add <url>`.
Fix: `claude plugin marketplace add <owner/repo>` or `codex plugin marketplace add <git url>`, taken from the project's own declaration.

### M4: expected plugins are installed and enabled from the declared marketplace

Checked per Host, for the plugins that Host's own project config enables (not only the Shared plugins), against `claude plugin list --json` / `codex plugin list --json`. The id must match exactly, `plugin@marketplace`.
- Claude: "enabled" is deliberately not checked against the CLI. `claude plugin list --json` reports a project-scope plugin as `enabled: true` only for the current project (Claude Code 2.1.299, 2026-10-14: `"scope":"project","enabled":true,"projectEnabled":true`); `enabled: false` appears on entries that belong to other projects, so the flag depends on which project the CLI runs in. The project's `enabledPlugins` is the source of truth for "enabled"; only "installed" is read from the CLI.
- Codex: the installed entry must also report `enabled: true`.
Rationale: a plugin that is declared but not installed does nothing, and a same-named plugin from a different marketplace is different code under the same name.
Result: fail when a plugin is not installed, is disabled (Codex), or only a same-named plugin from another marketplace is installed; warn when the list command fails (Codex gets the same manifest-specific fix as in M3); skip as for M3, or when the Host enables no plugin.
Fix: `claude plugin install <id>` / `codex plugin add <id>`; for a foreign same-named plugin, first `claude plugin uninstall` / `codex plugin remove` it.

### M5: Shared plugin versions match across Hosts

Compares the installed version of every Shared plugin (enabled by the project in both Hosts) between Claude Code and Codex.
Rationale: different versions of one plugin make the Hosts behave differently. It is a warn because the Hosts may legitimately update at different times.
Result: warn on a difference between two release numbers (`1.2.3`); warn "cannot compare" when a Host reports no version or one that is not a release number (a commit SHA, `<semver>-<sha>`, `local`, `unknown`), including when neither Host reports one or both print the same placeholder (`unknown` from Claude Code, `local` from Codex), because nothing was compared; pass only when every Shared plugin has identical real versions (identical release numbers or identical SHA strings); skip when a Host CLI is missing, a config is unreadable, there are no Shared plugins, or none is installed in both Hosts (M4 reports that).
Fix: update the Host with the older version. Claude Code: `claude plugin marketplace update <marketplace>`, then `claude plugin update <id>`, then restart. Codex: start a Codex session in the project (it upgrades the marketplace at start), or run `codex plugin marketplace upgrade <marketplace>` from the project. Never edit or reset the marketplace checkout by hand. For "cannot compare", no upgrade helps: set a release `version` in the plugin manifest and publish it.
Unverified: what `codex plugin list --json` and `claude plugin list --json` print for a plugin without manifest `version` was not run. From source (`docs/research/plugin-authoring-both-hosts.md`): Claude Code falls back to the marketplace-entry version, then a 12-character commit SHA, else `unknown`; Codex uses `local` in its cache refresh. Observed on codex-cli 0.162.1 (2026-10-14): `0.1.12-5f7cd798dc99` for `github@openai-curated-remote`. The stubs in the M5 tests are unverified for the no-version case.

### M6: Codex plugin support is not switched off

Checked for Codex: `[features]` `plugins` in the project's `.codex/config.toml` and in `~/.codex/config.toml`.
Rationale: `plugins = false` turns off Codex plugin support. Observed on codex-cli 0.162.1 (isolated `CODEX_HOME`, Windows, 2026-10-14): no plugin skill reaches the model (`codex debug prompt-input`), `codex plugin list --json` reports `{"installed": [], "available": []}` and `codex plugin marketplace list --json` reports `{"marketplaces": []}`, all with exit 0 and no message naming the flag; the config tables and plugin cache stay on disk. M3 and M4 then fail too, but their fixes do not help (`codex plugin marketplace add` says the marketplace is already added, `codex plugin add` says the plugin was not found), so fix M6 first. A trusted project's value overrides the user config in both directions; an untrusted project's `.codex/config.toml` is ignored until it is trusted; `codex -c features.plugins=...` overrides both. `codex features list` shows the effective value in its `plugins` row. Not read: profiles (`[profiles.<name>.features]`) and managed or system config.
Result: fail when the project config sets `plugins = false` (Codex applies it once the project is trusted), or when the user config sets it and no trusted project config sets `plugins = true`; pass otherwise; skip when Codex is not installed (M1) or a config cannot be parsed (the skip names the file and parse error).
Fix: remove `plugins = false` from the `[features]` table of the named file, or set it to `true`. For `~/.codex/config.toml`, `codex features enable plugins` does the same.

## Live check (opt-in)

Runs only with `--live`, which the skill passes only when the user explicitly asks for a live check. Without it no model call is made and no L1 finding appears. It needs network and authentication in each Host.

### L1: each Host lists the expected skills

Checked per Host, for every plugin the Host's project config enables and that is installed (M4 reports the rest). The expected skills come from the installed plugin: Claude Code from the manifest `skills` array (else `skills/*/SKILL.md`) under `installPath` of `claude plugin list --json`; Codex from `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/`. Each Host hides a user-only skill by its own setting, so the expected set is per Host: Claude Code does not expect a skill with `disable-model-invocation: true` in `SKILL.md`; Codex does not expect one whose `agents/openai.yaml` sets `policy.allow_implicit_invocation: false` (exactly `false`; Codex ignores `disable-model-invocation`). `agents/openai.yaml` is read by `scripts/openai-yaml.mjs`, a line reader for the common shapes (block or flow map, quoted keys, `False`, byte-order mark, comments at any column, a flow map over several lines); a file it cannot judge (anchors, aliases, duplicate keys, tab indentation, a value on a later line, several documents) gets a warn finding saying L1 cannot tell, and the skill is neither expected nor reported hidden. Where the two settings disagree for a skill, L1 adds a warn finding for the hiding Host that names the skill, and the fix is to set both or neither. Each Host is asked, per plugin and from the project root, with the skills prompt of [the verification doc](../../docs/agents/verification.md#verify-by-hand): `claude -p "..."` (never `--bare`, which skips plugin sync) and `codex exec --skip-git-repo-check "..."`. Claude Code has no flag that lists skills, hence the model call.
Rationale: confirms end to end that the Host actually sees the plugin's skills, which the static checks cannot prove.
Result: pass when every expected skill is named in the reply; fail when any is missing (including a reply of `NONE`) or when Claude Code (2.1.299+) reports on stderr that a settings file failed validation (the finding names the file and entry it printed, e.g. `.claude/settings.json (enabledPlugins): Expected record, but received string`; such a file is ignored wholesale, plugins included); skip with the reason when the Host CLI is missing, the command fails (network, authentication, sandbox, timeout), the reply holds no skill name, or no installed plugin can be tested. Replies are model output, so a skip or a one-off fail is worth one rerun.
Fix: start a new session so the plugins reload (the first session on a fresh machine only fetches the marketplace), then rerun; otherwise recheck M2 to M4.

### L2: each Host is at its Latest release

Also `--live` only; it makes no model call but needs network (without `--live` no L2 finding appears and nothing goes online). Checked per installed Host: the installed version (`<host> --version`) against the Latest release from npm dist-tags, read straight from the registry (`https://registry.npmjs.org/-/package/<package>/dist-tags`, not `npm view`, which can answer from its local cache with exit 0 while offline, needs a shell on Windows that leaves an orphaned npm on timeout, and prints DEP0190 on Node 24). Codex (`@openai/codex`) uses `latest`. Claude Code (`@anthropic-ai/claude-code`) uses the tag of the channel the machine follows: `autoUpdatesChannel` from `.claude/settings.local.json`, `.claude/settings.json`, then `~/.claude/settings.json` (first one set), else `latest`. A machine on `stable` is not reported behind `latest`. The message names the channel it assumed. The check does not detect the install method: a Homebrew cask, apt, dnf or apk install chooses its channel by package, so a false "behind" there is expected and the message says so. That the `latest` and `stable` dist-tags equal Claude Code's channels is unverified (the setup page does not mention npm dist-tags); it matched on 2026-10-14.
Rationale: a Host that lags its Latest release can make every other check's verdict stale.
Result: pass when the installed version is at or above the Latest release; warn when behind; skip with the reason when the Host is not installed, its version is unreadable, the `autoUpdatesChannel` value is not `latest` or `stable`, or the lookup fails (registry not reached, HTTP error, unexpected output). A failed lookup is never a pass.
Fix: run `claude update` or `codex update`.
