# Verifying a setup

How to verify the Project setup and Machine setup of a project that uses a Shared plugin, in Claude Code and Codex. This is the only place that describes the verification steps. Complete the [per-machine steps](claude-codex-sharing.md#per-machine-steps) first.

## Run the setup checker

The `check-setup` skill verifies both Hosts and needs Node.js 20 or later. Run it from the project root:

- Claude Code: `/ai-plugin-manager:check-setup`
- Codex: `$ai-plugin-manager:check-setup`

The live check (L1) is opt-in: it makes one model call per Host and plugin and needs network and authentication, so it runs only when you ask for it ("live check", or the argument `live`). A skipped live check reflects a network, authentication or sandbox limit, not a broken setup.

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

Pass: both Hosts list the same set of names. Skills with `disable-model-invocation: true` are user-only slash commands and do not appear in a model's list, so compare against the skills listed in the `skills` array of the plugin manifest (`.claude-plugin/plugin.json`) that lack that flag, not against the full command list or every `SKILL.md` in the plugin's source repository.

Instructions:

```
claude -p "In which language must project artifacts be written, according to the project instructions? Answer in one word. Do not run any tools."
codex exec --skip-git-repo-check "In which language must project artifacts be written, according to the project instructions? Answer in one word. Do not run any tools."
```

Pass: both answer `English` (the project language rule in `AGENTS.md`). Any specific rule from `AGENTS.md` works.

Negative check: run the `codex exec` skills command from a directory outside the repository. It must output `NONE`, provided the plugin is not also enabled in the user-level Codex config.

## Manual checks of Host behaviour

Claims in this repository's docs and in `check-setup` fixes that describe how a Host behaves and that no test covers. A Host release can change any of them without a test failing, so recheck the row after a Host release and update the versions. Versions are the ones the claim was last confirmed on (audit of 2026-10-14 unless noted); "source" rows were read from Host source or docs, not run.

| Claim | Where | How to recheck | Last confirmed |
|---|---|---|---|
| The offline test stubs of `claude plugin list --json`, `claude plugin marketplace list --json`, `codex plugin list --json` and `codex plugin marketplace list --json` match the real output shapes (M4, L1 cache path) | `skills/check-setup/scripts/test/*.test.mjs`, [checklist](../../skills/check-setup/checklist.md) | Run the four commands in a project with a plugin installed and compare keys and nesting with the stubs. The duplicate-id case is covered by #19 | Claude Code 2.1.299, codex-cli 0.160.1 |
| Command names and flags in fix texts and docs exist: `claude plugin install/update/validate/marketplace add/update`, `claude --plugin-dir`, `codex plugin add/remove/marketplace add/upgrade` | [checklist](../../skills/check-setup/checklist.md) fixes, [sharing doc](claude-codex-sharing.md#per-machine-steps), [authoring doc](plugin-authoring.md), the prompts above | Run `<host> plugin --help` and `<host> plugin marketplace --help`, and check each name used | Claude Code 2.1.299, codex-cli 0.160.1 |
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

Not yet automated, although automatable: the stub-versus-real shape comparison and the command-name check (they need the installed CLIs, no authentication), and the instructions and negative checks and the Codex drift test (they need network and Host authentication, so opt-in like L1). Each has its own issue.
