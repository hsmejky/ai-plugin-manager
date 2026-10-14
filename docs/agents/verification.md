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

Pass: each Host lists every skill it should offer the model. Each Host hides a user-only skill by a different setting: Claude Code by `disable-model-invocation: true` in `SKILL.md`, Codex by `policy.allow_implicit_invocation: false` in the skill's `agents/openai.yaml` (Codex ignores `disable-model-invocation`; it hides the skill only for exactly `false`, and `$skill` still loads it). So the two lists equal each other only for skills that set both or neither; compare each Host against the skills in the `skills` array of the plugin manifest (`.claude-plugin/plugin.json`) that the Host does not hide, not against the full command list or every `SKILL.md` in the plugin's source repository. `check-setup --live` warns when the two settings disagree for a skill.

Not yet run live: that Codex omits a skill with `allow_implicit_invocation: false` from its list while `$<skill>` still loads it (for example `ask-matt` of `mattpocock-skills`). The rule comes from Codex source (`openai/codex` tag `rust-v0.162.1`, [research](../research/codex-skill-visibility-invocation-policy.md)), not from a run. Check it by hand with `codex exec` and record the codex-cli version here.

Instructions:

```
claude -p "In which language must project artifacts be written, according to the project instructions? Answer in one word. Do not run any tools."
codex exec --skip-git-repo-check "In which language must project artifacts be written, according to the project instructions? Answer in one word. Do not run any tools."
```

Pass: both answer `English` (the project language rule in `AGENTS.md`). Any specific rule from `AGENTS.md` works.

Negative check: run the `codex exec` skills command from a directory outside the repository. It must output `NONE`, provided the plugin is not also enabled in the user-level Codex config.
