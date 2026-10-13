# Sharing instructions and skills between Claude Code and Codex

Tested with Claude Code 2.1.296 and codex-cli 0.160.1.

## Goal

Claude Code and Codex work from the same project instructions and the same skills in this repository.

## Scope

Project level only. Out of scope:

- User-level configuration (`~/.claude`, `~/.codex`) and its eventual removal.
- Hooks: they stay host-specific (the Claude context-budget hook stays user-level).
- MCP servers.
- Subagents (formats are incompatible).

## Decisions

1. **Instructions:** `AGENTS.md` is canonical, with host-labelled passages where the hosts differ. `CLAUDE.md` contains only `@AGENTS.md`. Claude Code expands the import at session start, so the content carries the same weight as if written in `CLAUDE.md`. Native `AGENTS.md` loading in Claude Code is not relied on: it needs Claude Code v2.1.277 or later, is unavailable in some sessions, and applies only when no `CLAUDE.md` exists in the working directory or above ([Claude Code memory: AGENTS.md](https://code.claude.com/docs/en/memory#agents-md)).
2. **Skills:** installed through a plugin for each host, not committed as copies. Both hosts install the plugin from the same source, but each host updates on its own schedule (see Updates), so versions can drift until both are updated. Plugin skills are never edited or renamed locally, so upstream updates keep applying.
3. **Plugins in general:** shared only when both hosts can install it from one source.
4. **Skills outside a shared plugin:** not installed by default. When one is needed, install it for both hosts explicitly (for example with `npx skills add <source> --skill <name> -a claude-code -a codex`).

The concrete plugin list lives in `.claude/settings.json` and `.codex/config.toml`. This document uses `<plugin>@<marketplace>` for an entry in it.

## Per-host setup

| | Claude Code | Codex |
|---|---|---|
| Instructions | `CLAUDE.md` → `@AGENTS.md` | `AGENTS.md` (native) |
| Plugin enablement (committed) | `.claude/settings.json` `enabledPlugins` (`<plugin>@<marketplace>`) and `extraKnownMarketplaces` (the marketplace and its source) | `.codex/config.toml` `[marketplaces.<marketplace>]` (`source_type`, `source`; the key equals the marketplace's own name) and `[plugins."<plugin>@<marketplace>"] enabled = true` |
| One-time machine step | Trust the workspace, then `claude plugin install <plugin>@<marketplace> --scope project` (below) | Trust the project (below); the first Codex session in it fetches the marketplace |
| Skill invocation | `/<plugin>:<skill>` | `$<plugin>:<skill>` or pick from `/skills` ([Codex skills](https://learn.chatgpt.com/docs/build-skills)); that page documents `$skill` and `/skills`, not the `$<plugin>:<skill>` form, which was observed with codex-cli 0.160.1 |
| Updates | Off by default for third-party marketplaces; the marketplace entry in `extraKnownMarketplaces` sets `"autoUpdate": true`, so Claude refreshes it and updates its plugins in the background, only in interactive sessions, after the first message plus a random delay of up to 10 minutes, so `claude -p` does not trigger it (applied on `/reload-plugins` or the next launch). Manual: `claude plugin update <plugin>@<marketplace>`; `claude plugin marketplace update <marketplace>` refreshes only the marketplace listing. | `codex plugin marketplace upgrade [<marketplace>]` refreshes Git marketplace snapshots (omit the name for all). Automatic update timing is not verified. |

Sources: [Claude Code: keep plugins updated](https://code.claude.com/docs/en/discover-plugins#keep-plugins-updated), [settings reference: extraKnownMarketplaces](https://code.claude.com/docs/en/settings-reference#extraknownmarketplaces); `codex plugin marketplace upgrade --help`.

Install each shared plugin only from the marketplace declared for it (`extraKnownMarketplaces` for Claude, `[marketplaces.<marketplace>]` for Codex). A same-named plugin from another marketplace (for example `claude-plugins-official` ships its own `mattpocock-skills`) is a different copy, and the hosts' versions then drift.

Claude loads project-scope plugins only after the workspace trust dialog is accepted for the repository folder; running with `-p` or trusting a parent folder is not enough. Cloud sessions do not load plugins enabled in `.claude/settings.json` or add its `extraKnownMarketplaces` at all, so plugin skills are unavailable there ([plugin loading](https://code.claude.com/docs/en/plugins/loading#plugins-shared-through-a-repository)). Per machine: run `claude` interactively in the repository once and accept the trust dialog, then run the install command.

Codex reads a project's `.codex/` (including its `[marketplaces]` and `[plugins]` tables) only when that project is trusted; an untrusted project's `.codex/` layers are ignored. Trust is a per-machine step:

1. Run `codex` once in the repository and accept the trust prompt.
2. Fallback: add this to the user-level `~/.codex/config.toml` (the `projects.<path>.trust_level` key is in the [Codex config reference](https://learn.chatgpt.com/docs/config-file/config-reference)):

```toml
[projects.'<absolute path>']
trust_level = "trusted"
```

On Windows the key is the lowercased path (observed: `c:\users\<user>\<repo>`).

In a trusted project, a Codex session start fetches the declared marketplace itself (verified in an isolated `CODEX_HOME`: no `codex plugin marketplace add` or `upgrade` needed, no user config written). If the first session started before the fetch finished, run `codex plugin marketplace upgrade <marketplace>`; the same command refreshes it later.

## Verification

Run the same prompt non-interactively in each host from the repository root:

```
claude -p "List the names of all skills available to you that come from the <plugin> plugin. Output only the names, one per line, or NONE. Do not run any tools."
codex exec --skip-git-repo-check "List the names of all skills available to you that come from the <plugin> plugin. Output only the names, one per line, or NONE. Do not run any tools."
```

Pass: both hosts list the same set of names. Skills with `disable-model-invocation: true` are user-only slash commands and do not appear in a model's list, so compare against the skills listed in the `skills` array of the plugin manifest (`.claude-plugin/plugin.json`) that lack that flag, not against the full command list or every `SKILL.md` in the plugin's source repository.

Negative check: run the `codex exec` command from a directory outside the repository. It must output `NONE`.
