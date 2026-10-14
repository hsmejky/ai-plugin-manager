# Spec: `setup` skill that installs and updates the project's plugins in both Hosts

Issue #60. Decisions: [#57 decision comment](https://github.com/hsmejky/ai-plugin-manager/issues/57#issuecomment-6169273004) (all recommended defaults accepted). Host facts: [research note #58](../research/plugin-install-update-cli-2026-10-14.md) (Claude Code 2.1.299, codex-cli 0.162.1, Windows, 2026-10-14). Maintainer limits: [plugin-maintainer](../../.claude/agents/plugin-maintainer.md) (#59). Format follows the `check-setup` spec (#2). Terms follow [GLOSSARY.md](../../GLOSSARY.md).

## Problem

A developer who adopts the shared setup must follow the [per-machine steps](../agents/claude-codex-sharing.md#per-machine-steps) by hand in each Host, and `check-setup` only reports what is wrong. The steps are Host-specific and have traps: in Claude Code a declared marketplace must be added before `install` works, and `claude plugin marketplace add --scope project` drops `"autoUpdate": true` from the committed `.claude/settings.json`; in Codex nothing installs until the project is trusted, and a refresh deletes the old plugin version. Declaring a new Shared plugin means editing two files in two formats without breaking P3 to P9.

## Solution

A second skill in this plugin, `setup`, invoked only explicitly (`/ai-plugin-manager:setup`, `$ai-plugin-manager:setup`). From either Host it brings both Hosts' Machine setup in line with the project's Project setup (registers declared marketplaces, installs declared plugins, updates them), and on request first edits the Project setup (declare a Shared plugin in both Hosts, move or remove a pin). It always prints a plan first (each command and each file edit, per Host) and changes nothing until the user confirms. It never grants trust, never upgrades a Host, never moves a pin unasked, never removes anything. It ends by running `check-setup`'s static checks in the same process and reporting them.

## User stories

1. As a developer on a fresh machine, I want one command that registers the project's marketplaces and installs its plugins in both Hosts, so that I skip the per-machine steps.
2. As a developer, I want the same command to update the installed plugins from the declared marketplaces, so that one call covers install and update.
3. As a developer, I want to see every command and file edit per Host before anything changes, and to confirm it, so that the skill never surprises me.
4. As a developer, I want the skill to apply exactly the plan I confirmed, and to stop with the new plan when the state changed in between.
5. As a developer, I want to say "add plugin X from marketplace Y" and get the declaration in both `.claude/settings.json` and `.codex/config.toml`, then the install, so that both Hosts stay symmetric (P4, P5).
6. As a developer, I want to move both Hosts' pin of a marketplace to one release tag, or remove it, in one request (P8, P9).
7. As a developer, I want a request refused when the resulting Project setup would fail a check-setup P-check (reserved name P3, short SHA P8, source mismatch P6).
8. As a developer, I want the committed files byte-identical after the machine steps (`autoUpdate`, line endings, formatting kept), so that `git status` shows only the edits I asked for.
9. As a developer with an untrusted project, I want the skill to stop for that Host and print check-setup's M2 fix, never to grant trust itself.
10. As a developer with Codex plugins switched off (M6), I want the skill to stop for Codex and print the M6 fix.
11. As a developer with only one Host installed, I want the other set up and the missing one reported.
12. As a developer, I want each step that needs me (trust, restart or `/reload-plugins`, a new Codex session) listed as a manual step, never claimed as done.
13. As a developer, I want a pinned `ref` left as it is by every update.
14. As a developer, I want the Hosts themselves left alone (no `claude update`, `codex update`).
15. As a developer, I want the run to end with check-setup's verdict, so that I know the result is the right way.
16. As a developer running from Codex, I want the skill to ask for the sandbox escalation it needs (network, writes outside the workspace) instead of failing silently.
17. As the plugin maintainer, I want a read-only plan step I can run against the real Hosts, and a Live verification that writes only to a temporary `CLAUDE_CONFIG_DIR`, `HOME`/`USERPROFILE`, `CODEX_HOME` and a temporary project copy.
18. As the plugin maintainer, I want every stubbed Host output the skill's tests use compared with the installed Hosts' real output.

## Implementation decisions

### Form and invocation

- Skill folder `skills/setup/` with `SKILL.md` (`name: setup`, `disable-model-invocation: true`) and `agents/openai.yaml` (`policy:` / `allow_implicit_invocation: false`), listed in the `skills` array of `.claude-plugin/plugin.json`. Invoked as `/ai-plugin-manager:setup` and `$ai-plugin-manager:setup`; bare `$setup` does not load it in Codex ([verification](../agents/verification.md#verify-by-hand)).
- L1 effect: the expected skill list of `ai-plugin-manager` stays `check-setup` in both Hosts; `setup` is hidden in both, so L1 raises no disagreement warn. A test asserts that the shipped `setup` sets both settings and that `implicitInvocationDisabled` judges its `openai.yaml` as `false`.
- `SKILL.md` follows `check-setup`'s pattern: Node.js >= 20 guard (stop with "setup requires Node.js >= 20"), the `${CLAUDE_SKILL_DIR}` note for Codex, `--project <dir>`. `test/doc-sync.test.mjs` extends its Node minimum check to `skills/setup/SKILL.md`.
- Skill flow: (1) guard Node; (2) translate the user's request into flags and run `plan`; (3) render the plan and ask for confirmation, changing nothing; (4) on a yes, run `apply` with the same flags and `--expect <digest>`; in Codex, request escalation for this command (network, writes to the Host homes); (5) render the report from its JSON alone. After `apply` starts, the model reads no file from the skill or plugin directory: Codex may have deleted the old plugin version directory ([note §Codex 8](../research/plugin-install-update-cli-2026-10-14.md)).

### Script and seam

- `skills/setup/scripts/setup.mjs`, Node >= 20, zero dependencies. Core module: `planSetup(env, request) -> plan` and `applySetup(env, plan) -> report`. `env` is check-setup's `env` (`projectDir`, `homeDir`, `codexHome`, `platform`, `runCommand`); `runCommand` gains an optional `cwd` (already supported by `defaultRunCommand`). All filesystem writes go through one small writer in `env` so tests can observe them.
- CLI: `node setup.mjs plan [request flags] [--project <dir>]` and `node setup.mjs apply [same flags] --expect <digest>`. Request flags: none (sync only), `--add <plugin>@<marketplace> [--source <owner/repo | git URL>]`, `--pin <marketplace> --ref <tag-or-branch>`, `--unpin <marketplace>`. Output: one JSON object on stdout. Exit codes: 0 done; 1 a step failed or a check the skill is responsible for fails afterwards; 2 usage error, refused request, or plan changed since confirmation (prints the new plan).
- Plan shape: `{ digest, request, projectEdits: [{ file, before, after }], hosts: { claude|codex: { status: 'ready'|'skipped'|'stopped', reason, fix, steps: [{ cmd, args, cwd, why, check }] } }, manual: [{ host, what, fix }], refused? }`. `digest` is a SHA-256 of the plan without `digest`; `apply` recomputes the plan and returns exit 2 when the digest differs.
- `plan` is read-only: it runs only `--version` and the `list --json` commands and reads files. `apply` runs only the commands and edits listed in the plan.
- Code shared with check-setup is imported from `../../check-setup/scripts/` (both skills live under one plugin root, which both Hosts install whole): `loadDeclarations`, `detectHosts`, `HOST` (including `marketplaceAddArg`), `listInstalledPlugins`, `listMarketplaces`, `claudeTrust`, `codexTrust`, `checkCodexFeatures`, `codexHome`, `parseToml`, `runChecks`. check-setup gets one refactor: `declarations.mjs` exports a `parseDeclarations({ claudeText, codexText })` that `loadDeclarations` uses, so the planner validates proposed text without writing it. Nothing is copied. The tracer bullet's Live verification asserts that each Host's installed copy contains `skills/check-setup/scripts/check-setup.mjs` next to `skills/setup/`.
- All imports are static, so the whole script is loaded before any Host command runs.

### Guards (per Host, before any step)

- Host CLI missing (M1): the Host is `skipped`, the other proceeds (decision 7). Older than the tested version: a plan note, the Host proceeds.
- Untrusted project (M2, via `claudeTrust`/`codexTrust`, Windows path forms included): the Host is `stopped` with check-setup's M2 fix (decision 6), even for Claude Code, where install would work untrusted.
- Codex M6 fails: Codex `stopped` with the M6 fix; the skill does not change `[features]`.
- Host config missing or unreadable: the Host is `skipped` with the reason check-setup gives.

### Machine setup steps (decisions 2a, 5)

Claude Code (always first):
1. Each declared marketplace that `claude plugin marketplace list --json` lacks: `claude plugin marketplace add <arg> --scope project --json`, `<arg>` from `HOST.claude.marketplaceAddArg` (`owner/repo`, plus `#<ref>` when the declaration pins one). Supported sources in v1: `github` (with or without `ref`) and `git` without `ref`; any other form becomes a manual step with M3's fix. `claude-plugins-official` is never added.
2. Each declared, registered marketplace: `claude plugin marketplace update <name> --json`.
3. Each enabled plugin: `claude plugin install <id> --scope project --json` when not installed, else `claude plugin update <id> --scope project --json`. A foreign same-named plugin is left installed (removal is out of scope); installing the declared id clears M4.
4. Byte restore: the skill snapshots `.claude/settings.json` after its own Project setup edits and writes those bytes back after the Claude steps, so the dropped `autoUpdate` ([note §Claude 2](../research/plugin-install-update-cli-2026-10-14.md)) and any line-ending rewrite never reach the repository. The declaration was already in the file, so restoring loses no registration. `--scope user` was rejected: it declares the marketplace for every project on the machine.
5. Manual step when anything was installed or updated: restart Claude Code or run `/reload-plugins`.

Codex (always last, because its refresh deletes the old version of this plugin):
1. Each declared Git marketplace: `codex plugin marketplace upgrade <name> --json`, `cwd` = project root. In a trusted project this clones, installs the enabled plugins and refreshes them ([note §Codex 1, 3](../research/plugin-install-update-cli-2026-10-14.md)); a pinned `ref` stays where it is. The note ran the unnamed form for a fresh install; whether the named form also installs is verified by the tracer bullet's Live verification. If it does not, the slice uses the unnamed form only when the configured Git marketplaces equal the declared ones, otherwise a manual step, and records the result in `verification.md`. Built-in marketplaces are not upgraded.
2. No `codex plugin add`: it writes the user config. A plugin still not installed afterwards is reported with M4's fix.
3. Success is read from data, not from the command: `codex plugin list --json` before and after gives the version change per plugin; a step fails on exit != 0 or a non-empty `errors` (exit code with errors is unverified, so both are read).
4. Manual step: start a new Codex session in the project.

Claude steps: a step fails on exit != 0 or `outcome: "failed"` (`failureCode` reported as is). A failed step stops the remaining steps of that Host; the other Host continues.

### Project setup edits (decision 2b)

- Applied before the Machine setup steps, to both files, whichever Hosts are present.
- `--add <plugin>@<marketplace>`: the source comes from `--source`, else from the marketplace's declaration in either Host; both declared with different sources (P6) refuses. Writes the missing parts only: Claude `extraKnownMarketplaces.<m>` `{ "source": { "source": "github", "repo": … } | { "source": "git", "url": … }, "autoUpdate": true }` and `enabledPlugins["<id>"] = true`; Codex `[marketplaces.<m>]` `source_type = "git"`, `source = <codexUrlFor>` and `[plugins."<id>"] enabled = true`. An already complete declaration is a no-op.
- `--pin <m> --ref <r>` sets `ref` on both Hosts (Claude `source.ref`, Codex `ref`); `--unpin <m>` removes both. A 40-hex SHA is refused (Claude takes no SHA, so P9 would warn), all-hex shorter refs are refused (P8). Updates never touch `ref` (decision 5).
- Validation: the planner parses the proposed texts with `parseDeclarations` and runs check-setup's `checkPluginDeclarations` and `checkCodexMarketplaceRef` on them; any P-check that would fail where it passed before refuses the request with that finding.
- Writers keep the file's line endings, BOM, indentation and key order. JSON: parse, edit, `JSON.stringify(…, null, <detected indent>)`, original final newline. TOML: a line editor for the subset the reader handles: append new tables at the end, insert or replace a `ref =` line inside an existing `[marketplaces.<m>]` table; a declaration in another shape (inline table, dotted keys) refuses with a manual edit.
- The skill never commits; the report lists the changed files.

### Verification after apply

`applySetup` runs check-setup's `runChecks` (static, never `--live`) in the same process and returns the findings. Responsible checks: M3, M4 for each non-skipped, non-stopped Host, plus P3 to P9 when the request edited the Project setup. Any fail among them gives exit 1. M5 stays a warn by design.

### check-setup fixes point to setup (#60 item 6)

M3, M4, M5 fixes, P4 and P5 (missing declaration on one Host: `--add`), P3 (undeclared marketplace when the other Host declares it), P8 and P9 (`--pin`/`--unpin`) keep their exact commands and add "or run `/ai-plugin-manager:setup` (Claude Code) / `$ai-plugin-manager:setup` (Codex)" with the flag. P1, P2, P6, P7, M1, M2, M6 do not point to it.

### Docs, manifests, ADR, version

- ADR 0003 (written with this spec): the plugin's first writing skill, its plan-confirm-apply boundary and what it never does.
- `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` descriptions: verifies and sets up (installs and updates) the shared Claude Code and Codex agent setup.
- `README.md`: adoption step 2 becomes "run the setup skill", the Tests section lists the setup suite and its live test. `docs/agents/claude-codex-sharing.md`: per-machine steps start with "run the setup skill", the manual steps stay as the fallback and for trust. `docs/agents/plugin-authoring.md`: two skills, cross-skill imports, `setup` as the user-only example. `docs/agents/verification.md`: running the plan step, the live test, new manual rows. `GLOSSARY.md`: no new term; the skill is described with Project setup and Machine setup.
- Version: each slice that changes the skill, its scripts, check-setup or the manifests bumps `version` in `.claude-plugin/plugin.json` in the same commit (`AGENTS.md`); the tracer bullet takes the next minor (0.6.0 from 0.5.1). Docs-only slices do not bump.

## Testing decisions

- Seam: `planSetup(env, request)` and `applySetup(env, plan)`. Tests assert on plan steps (command, args, cwd), file edits, report statuses and exit codes, never on helpers.
- Fake Host: a stateful `runCommand` stub per Host that answers `--version`, the list commands and the write commands with JSON shaped like the stubs in `skills/check-setup/scripts/test/host-stubs.mjs` (extended with the write commands' output), and changes its state (add registers, install installs, Codex upgrade installs and bumps versions, Claude `marketplace add --scope project` drops `autoUpdate` from the fixture file as 2.1.299 does). After `apply`, `runChecks` against the same fake must report no fail among the responsible checks, and a second `plan` must contain no install or add step: the offline form of the "right way" outcome.
- Cases: fresh machine, both Hosts; each Host missing; each Host untrusted (Windows and POSIX path forms); M6 off; `CODEX_HOME` set; already installed (update steps only); pinned `ref` untouched and passed as `#ref`; byte-identical settings after a fake that drops `autoUpdate` and rewrites CRLF; unsupported source form; failed step (Claude `outcome: failed`, Codex exit 1 and non-empty `errors`) stops that Host only; digest mismatch; `--add` (new, mirrored from one Host, no-op), `--pin`, `--unpin`; refusals (reserved name, short SHA, full SHA, P6 mismatch, TOML shape); `plan` issues no write command and leaves every fixture file unchanged.
- Host CLI test (opt-in, `CHECK_SETUP_HOST_CLI=1` pattern): compares the new stubs of `claude plugin marketplace add|update`, `claude plugin install|update` and `codex plugin marketplace upgrade` with real output from temporary homes and a local throwaway marketplace (no network), and checks every command and flag in `skills/setup/` against `--help`.
- Live verification (opt-in, `SETUP_LIVE=1 node --test skills/setup/scripts/test/live-setup.test.mjs`; network, no login): temporary `CLAUDE_CONFIG_DIR`, `HOME`, `USERPROFILE`, `CODEX_HOME` and a temporary git copy of this repository's Project setup; the test (not the skill) seeds trust in the temporary homes; runs the CLI `plan`, then `apply --expect`, then check-setup's CLI: no fail among M2 to M4 and P1 to P9; committed files byte-identical; a second `plan` has no install step; each Host's install contains `skills/check-setup/scripts/check-setup.mjs`; the real `~/.claude.json`, `~/.claude/settings.json` and `~/.codex/config.toml` keep their SHA-256. This is the maintainer's Live verification of the skill.
- CI: `.github/workflows/offline-tests.yml` gains a step `node --test skills/setup/scripts/test/*.test.mjs`.
- Manual rows in `verification.md`: invoking the skill through each Host's model (plan shown, waits for confirmation); hidden from the model in both Hosts (`claude -p` and `codex exec` skills prompts omit `setup`, `$ai-plugin-manager:setup` loads it); Codex deleting the old version while the skill runs, Windows open files (note unknown 4); effect after `/reload-plugins` or a new session; Linux and macOS live runs (note unknown 3).

## Research unknowns, settled

1. `plugin update` without `marketplace update`: moot, the skill always runs both.
2. Hand-written Claude trust: moot, the skill never writes trust.
3. Codex timing and Linux/macOS: manual step and manual row.
4. Windows open-file deletion: static imports, Codex last, manual row.
5. Failure vocabularies: a step fails on exit code or the failure field, whichever shows.
6. CRLF rewrite: moot, byte restore.

## Out of scope

- Removals: uninstalling plugins, dropping declarations or marketplaces (decision 2c).
- Granting trust, changing `[features]`, upgrading Hosts.
- Host-specific (one-Host) plugin declarations, `directory`/`url`/pinned `git` sources for Claude `marketplace add`, Codex built-in marketplaces.
- Fixing P1, P2, P6, P7 or instruction files.
- Committing the edits.
- Hosts other than Claude Code and Codex.

## Slices

Filed as `ready-for-agent`, `P3`, tracer bullet first; each lists its own done-when. Issue numbers are in #60.

1. Tracer bullet: `setup` skill with plan/apply, guards, Machine setup install path for both Hosts, byte restore, in-process verification, offline fake-Host tests, Live verification, CI step, manifest entry and descriptions, ADR link, version bump.
2. Host CLI test covers the setup stubs and commands.
3. Update path: `marketplace update` + `plugin update` (Claude), version comparison before and after (Codex), restart manual steps.
4. `--add`: JSON and TOML writers, `parseDeclarations`, P-check validation, refusals.
5. `--pin` / `--unpin`.
6. check-setup fixes point to `setup`.
7. Docs: README, sharing doc, authoring doc, verification doc.
