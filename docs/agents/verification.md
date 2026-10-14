# Verifying a setup

How to verify the Project setup and Machine setup of a project that uses a Shared plugin, in Claude Code and Codex. This is the only place that describes the verification steps. Complete the [per-machine steps](claude-codex-sharing.md#per-machine-steps) first.

## Run the setup checker

The `check-setup` skill verifies both Hosts and needs Node.js 20 or later. Run it from the project root:

- Claude Code: `/ai-plugin-manager:check-setup`
- Codex: `$ai-plugin-manager:check-setup`

The live check (L1) is opt-in: it makes one model call per Host and plugin and needs network and authentication, so it runs only when you ask for it ("live check", or the argument `live`). A skipped live check reflects a network, authentication or sandbox limit, not a broken setup.

## Read the report

The report starts with a summary line (counts of fail, warn, skip and pass), followed by one table per group, in this order: Claude Code, Codex, then Both Hosts, each for Project setup and then Machine setup; empty groups are omitted. Each finding has:

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
