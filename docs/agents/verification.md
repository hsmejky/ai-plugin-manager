# Verifying a setup

How to verify the Project setup and Machine setup of a project that uses a Shared plugin, in Claude Code and Codex. This is the only place that describes the verification steps. Complete the [per-machine steps](claude-codex-sharing.md#per-machine-steps) first.

## Run the setup checker

The `check-setup` skill verifies both Hosts and needs Node.js 20 or later. Run it from the project root:

- Claude Code: `/ai-plugin-manager:check-setup`
- Codex: `$ai-plugin-manager:check-setup`

The live checks are opt-in and run only when you ask for them ("live check", or the argument `live`). L1 makes one model call per Host and plugin and needs network and authentication. L2 (latest release) makes no model call; it reads the npm registry over HTTPS and needs network (no npm process). A skipped live check reflects a network, authentication or sandbox limit, not a broken setup.

## Read the report

The report starts with a summary line (counts of fail, warn, skip and pass), followed by one table per group, in this order: Claude Code / Project setup, Codex / Project setup, Both Hosts / Project setup, then the same three for Machine setup; empty groups are omitted. Each finding has:

- a check id (see [the checklist](../../skills/check-setup/checklist.md) for what each check verifies, why, and how to fix it)
- a status: `pass`, `warn`, `fail` or `skip`
- a fix, shown for `warn` and `fail`

Apply the fixes and rerun until no `fail` remains. A `fail` makes the script exit 1; that is a normal result, not an error.

## Verify by hand

Run each prompt non-interactively in each Host from the repository root.

Skills:

```
claude -p "List the names of all skills available to you that come from the <plugin> plugin. Output only the names, one per line, or NONE. Do not run any tools."
codex exec --skip-git-repo-check "List the names of all skills available to you that come from the <plugin> plugin. Output only the names, one per line, or NONE. Do not run any tools."
```

Pass: each Host lists every skill it should offer the model. Each Host hides a user-only skill by a different setting: Claude Code by `disable-model-invocation: true` in `SKILL.md`, Codex by `policy.allow_implicit_invocation: false` in the skill's `agents/openai.yaml` (Codex ignores `disable-model-invocation`; it hides the skill only for exactly `false`, and `$<plugin>:<skill>` still loads it; bare `$<skill>` does not). So the two lists equal each other only for skills that set both or neither; compare each Host against the skills in the `skills` array of the plugin manifest (`.claude-plugin/plugin.json`) that the Host does not hide, not against the full command list or every `SKILL.md` in the plugin's source repository. `check-setup --live` warns when the two settings disagree for a skill.

Run live with codex-cli 0.162.1 on 2026-10-14: `codex exec` listed every `mattpocock-skills` skill except the hidden ones; the plugin-qualified `$mattpocock-skills:ask-matt` loaded `ask-matt`, while bare `$ask-matt` replied NOT LOADED. So a skill with `allow_implicit_invocation: false` is invoked only as `$<plugin>:<skill>`. The rule also follows from Codex source (`openai/codex` tag `rust-v0.162.1`, [research](../research/codex-skill-visibility-invocation-policy.md)).

Instructions:

```
claude -p "In which language must project artifacts be written, according to the project instructions? Answer in one word. Do not run any tools."
codex exec --skip-git-repo-check "In which language must project artifacts be written, according to the project instructions? Answer in one word. Do not run any tools."
```

Pass: both answer `English` (the project language rule in `AGENTS.md`). Any specific rule from `AGENTS.md` works.

Negative check: run the `codex exec` skills command from a directory outside the repository. It must output `NONE`, provided the plugin is not also enabled in the user-level Codex config.

## Manual checks of Host behaviour

Claims in this repository's docs and in `check-setup` fixes that describe how a Host behaves and that no test covers. A Host release can change any of them without a test failing, so recheck the row after a Host release and update the versions. The tested versions of check M1 (`testedVersion` in `skills/check-setup/scripts/hosts.mjs`, checklist M1, the sharing doc prerequisites) are the Host versions this suite was last verified on: when you rerun this table or the Host CLI tests (`CHECK_SETUP_HOST_CLI=1`) on newer Host versions and they pass, raise all three in the same commit. Versions are the ones the claim was last confirmed on (audit of 2026-10-14 unless noted); "source" rows were read from Host source or docs, not run.

| Claim | Where | How to recheck | Last confirmed |
|---|---|---|---|
| Host error strings: `Plugin "<plugin>" not found in marketplace "<marketplace>"`, `Marketplace '<marketplace>' not found` (Claude Code), ``marketplace `<marketplace>` is not configured as a Git marketplace`` (Codex); the M4 no-manifest pattern matches the real message | [sharing doc](claude-codex-sharing.md#per-machine-steps), [authoring doc](plugin-authoring.md#codex), `checks/marketplace-plugins.mjs` | Provoke each error and compare the text | Claude Code 2.1.299, codex-cli 0.160.1 (Codex string: source `rust-v0.162.1`) |
| Trust gating: Claude Code project-scope plugins load only after interactive trust of the repository folder itself (`-p` or a trusted parent is not enough); Codex ignores an untrusted project's `.codex/` | [sharing doc](claude-codex-sharing.md#per-machine-steps) | Follow the per-machine steps on a fresh clone, then run the skills prompt | Claude Code 2.1.299, codex-cli 0.160.1 |
| Claude Code registers a marketplace declared only in project settings in the background after an interactive session starts; Cloud sessions do not load project plugins | [sharing doc](claude-codex-sharing.md#per-machine-steps) | `/plugin` > Marketplaces in a fresh interactive session | Claude Code 2.1.299 (Cloud: docs only) |
| In a trusted project a Codex session start fetches the declared marketplace itself; the first session on a fresh machine may list `NONE` | [sharing doc](claude-codex-sharing.md#per-machine-steps) | Isolated `CODEX_HOME`, trusted project, `codex exec` twice | codex-cli 0.160.1 |
| Claude Code auto-update (`autoUpdate: true`): interactive sessions only, after the first message plus up to 10 minutes; `claude -p` does not trigger it | [authoring doc](plugin-authoring.md#claude-code) | Docs only; observe a version change after an interactive session | Claude Code docs, 2026-10-14 (not run) |
| Codex closes drift at the next session started in the trusted project, for user-level and project-only declarations (Windows). Method rules: [#33 note](../research/codex-marketplace-auto-upgrade-2026-10-14.md), [#35 note](../research/codex-marketplace-auto-upgrade-project-config-2026-10-14.md). Do not infer an upgrade from the output of `codex plugin marketplace upgrade`: it prints success even when nothing changed. Interactive TUI, a short logged-in `codex exec` and Linux/macOS are unmeasured | [authoring doc](plugin-authoring.md#codex) | Isolated `CODEX_HOME`, marketplace added with `--ref <old full SHA>`, config `ref` changed to the branch, `codex exec "hi" </dev/null` without login; compare installed revision and plugin cache `version` before and after | codex-cli 0.162.1, Windows |
| Version drift and the version-bump rule: Claude Code keeps the cached copy until `version` changes; Codex upgrades by git revision and ignores `version` | [authoring doc](plugin-authoring.md#versioning) | Source: research §4 | Claude Code docs; codex-cli source `rust-v0.162.1` (not run) |
| Local testing: `claude --plugin-dir` loads the plugin as `<name>@inline`; a local marketplace loads relative-path plugins in place; Codex has no `--plugin-dir` equivalent and its cache refresh on an unchanged `version` is open | [authoring doc](plugin-authoring.md#test-an-unreleased-change-locally) | Follow the section on a throwaway change | Research §5, 2026-10-14 (not all run) |
| Manifest semantics: Codex skills root replaced by the `skills` array; blank `name` falls back to the directory name; `version` is trimmed; `$<plugin>:<skill>` invocation | [authoring doc](plugin-authoring.md#plugin-manifest) | Source: [research §2, §3](../research/plugin-authoring-both-hosts.md) | codex-cli source `rust-v0.162.1`; `$<plugin>:<skill>` observed on 0.160.1 |
| The instructions check above makes both Hosts answer `English` | [Verify by hand](#verify-by-hand) | Run the two prompts | Claude Code 2.1.299, codex-cli 0.160.1 |
| The negative check above lists `NONE` outside the repository | [Verify by hand](#verify-by-hand) | Run the `codex exec` skills prompt from another directory | codex-cli 0.160.1 |
| `claude plugin install` leaves the content of `.claude/settings.json` unchanged but rewrites it with LF line endings | [sharing doc](claude-codex-sharing.md#per-machine-steps) | Install a project-scope plugin on Windows into a checkout with CRLF settings; compare bytes and `git status` | Version not recorded (claim from commit `54a08e4`, 2026-10-13, which names none); not rerun |
| Committed `.claude/settings.json` takes precedence over a marketplace added with `claude plugin marketplace add`, so `autoUpdate` still applies | [sharing doc](claude-codex-sharing.md#per-machine-steps) | Add the marketplace by hand, then read the effective `autoUpdate` in `/plugin` > Marketplaces | Unverified: no docs page cited as of 2026-10-14, not run |
| `claude plugin install <plugin> --marketplace <source>` adds and installs in one step and declares the marketplace in user settings (Claude Code 2.1.292+; in-session `/plugin install ... --marketplace` 2.1.275+) | [sharing doc](claude-codex-sharing.md#per-machine-steps) | Run it with a throwaway marketplace; check user settings | Claude Code docs (`plugins/install`); not run |
| On Windows the Codex `[projects.'<path>']` trust key is the lowercased path (`c:\users\<user>\<repo>`) | [sharing doc](claude-codex-sharing.md#per-machine-steps) | Trust a project via the prompt and read the key written to `~/.codex/config.toml` | Observed once, codex-cli 0.160.1, Windows |
| P7: Claude Code does not auto-update third-party marketplaces unless the entry sets `"autoUpdate": true`; the official marketplace names default to on, which P7 exempts only for `claude-plugins-official` (#41) | [checklist P7](../../skills/check-setup/checklist.md) | Declare a third-party marketplace without `autoUpdate`; observe no update after an interactive session | Claude Code docs, `discover-plugins` and `settings-reference`, 2026-10-14; not run |
| P8: `codex plugin marketplace add <repo>@<short SHA>` succeeds, but every later upgrade fails with "git ls-remote returned empty output for marketplace source"; only a full 40-hex SHA skips `ls-remote` (#42) | [checklist P8](../../skills/check-setup/checklist.md) | Add a marketplace with an abbreviated `--ref`, then run `codex plugin marketplace upgrade <name>` | codex-cli 0.162.1 (source `is_full_git_sha`) |
| M6: `[features] plugins = false` (user config, or a trusted project's `.codex/config.toml`) stops plugin skills loading and makes `codex plugin list --json` and `codex plugin marketplace list --json` report empty lists with exit 0; a trusted project's value overrides the user's; an untrusted project's is ignored (#36) | [checklist M6](../../skills/check-setup/checklist.md), `checks/codex-features.mjs` | Isolated `CODEX_HOME` with a local marketplace and installed plugin; set the flag in each place and compare `codex features list`, both list commands and `codex debug prompt-input "hi"` (lists the skills without login) | codex-cli 0.162.1, Windows (profiles, managed config and a logged-in `codex exec` not run) |
| L1: `claude -p` with a schema-invalid settings file exits `0` and prints `These settings files did not load, ...` followed by one `<file> (<entry>): <problem>` line per entry; the header stays plural for one file | `checks/live-skills.mjs`, stub in `live-skills.test.mjs` | Run `claude -p "hi"` in a scratch directory with an invalid `.claude/settings.json` | Claude Code 2.1.299 |
| Which Claude Code entry is loaded when `claude plugin list --json` has a user-scope and a project-scope entry for the same plugin id: this repo assumes the project entry (`plugins.mjs` lists project/local entries first; pinned by L1 tests, #46) | `plugins.mjs`, `live-skills.test.mjs` | Install the same plugin at user and project scope with different versions; start `claude` in the project and read the version in `/plugin` | Not run; rule chosen, unverified |

Automated against the installed CLIs, no network or authentication ([`host-cli.test.mjs`](../../skills/check-setup/scripts/test/host-cli.test.mjs), opt-in: the CLI tests run only with `CHECK_SETUP_HOST_CLI=1`, and a Host whose CLI is not on `PATH` is skipped, as in CI; the helper tests in the same file are part of the offline run). Each CLI runs only in temporary Host homes (`CODEX_HOME`; `CLAUDE_CONFIG_DIR`, `HOME`, `USERPROFILE`), never the user's config. After a Host release, run `CHECK_SETUP_HOST_CLI=1 node --test skills/check-setup/scripts/test/host-cli.test.mjs` and update the stubs or the docs it names:

- The offline test stubs (`test/host-stubs.mjs`) of `claude plugin list --json`, `claude plugin marketplace list --json`, `codex plugin list --json` and `codex plugin marketplace list --json`: every stub key exists in the real output with the same type and nesting (extra real keys are allowed). The GitHub (Claude Code) and Git (Codex) marketplace entries are seeded into the temporary Host state, because adding one needs network. Passed on Claude Code 2.1.299 and codex-cli 0.162.1.
- Command names and flags in fix texts and docs: every `<host> plugin [marketplace] <command> --<flag>` and `<host> --<flag>` in the checklist, the check-setup sources (including the install and uninstall verbs in `hosts.mjs`), `docs/agents/` and `README.md` must appear in the matching `--help` output. Passed on Claude Code 2.1.299 and codex-cli 0.162.1.

Not yet automated, although automatable: the instructions and negative checks (they need network and Host authentication) and the Codex drift test (it needs network, no login), so opt-in like L1. Follow-ups: [#39](https://github.com/hsmejky/ai-plugin-manager/issues/39) (instructions and negative checks), [#40](https://github.com/hsmejky/ai-plugin-manager/issues/40) (Codex drift test).
