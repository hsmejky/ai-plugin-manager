# Sharing instructions and skills between Claude Code and Codex

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
2. **Plugin skills:** installed through a plugin for each host, not committed as copies. The plugin is their source, and a copy would drift from it. Plugin skills are never edited or renamed locally, so upstream updates keep applying.
3. **Plugins in general:** shared only when both hosts can install them from one source.
4. **Skills outside a shared plugin:** not installed by default. When one is needed, install it for both hosts explicitly (for example `npx skills add <source> --skill <name> -a claude-code -a codex`) and commit the result. Project scope writes `.claude/skills/` for Claude Code and `.agents/skills/` for Codex. This follows the skills CLI convention (its README describes project scope as "Committed with your project, shared with team", [vercel-labs/skills](https://github.com/vercel-labs/skills)). With no plugin both hosts can install, the committed copy is the single shared source that every clone gets, so the hosts stay aligned without per-machine steps. Keep those directories out of `.gitignore`.

The concrete plugin list lives in `.claude/settings.json` and `.codex/config.toml`. This document uses `<plugin>@<marketplace>` for an entry in it.

## Per-host setup

| | Claude Code | Codex |
|---|---|---|
| Instructions | `CLAUDE.md` → `@AGENTS.md` | `AGENTS.md` (native) |
| Plugin enablement (committed) | `.claude/settings.json` `enabledPlugins` (`<plugin>@<marketplace>`) and `extraKnownMarketplaces` (the marketplace and its source) | `.codex/config.toml` `[marketplaces.<marketplace>]` (`source_type`, `source`; the key equals the marketplace's own name) and `[plugins."<plugin>@<marketplace>"] enabled = true` |
| Skill invocation | `/<plugin>:<skill>` | `$<plugin>:<skill>` or pick from `/skills` |
| Manual update | `claude plugin update <plugin>@<marketplace>` | `codex plugin marketplace upgrade <marketplace>` (run inside the trusted repository) |

Install each shared plugin only from the marketplace declared for it. A same-named plugin from another marketplace (for example `claude-plugins-official` ships its own `mattpocock-skills`) is a different copy, and the hosts' versions then drift.

**Invocation.** Codex documents `$skill` and `/skills` ([Codex skills](https://learn.chatgpt.com/docs/build-skills)), not the `$<plugin>:<skill>` form, which was observed with codex-cli 0.160.1.

**Updates.**

- Claude: off by default for third-party marketplaces. The `extraKnownMarketplaces` entry sets `"autoUpdate": true`, so Claude refreshes the marketplace and updates its plugins in the background, only in interactive sessions, after the first message plus a random delay of up to 10 minutes. `claude -p` does not trigger it. Updates apply on `/reload-plugins` or the next launch. `claude plugin marketplace update <marketplace>` refreshes only the marketplace listing.
- Codex: `codex plugin marketplace upgrade <marketplace>` refreshes a Git marketplace snapshot. Run it from inside the trusted repository (any subdirectory works); where the marketplace is not configured it fails with `Error: marketplace `<marketplace>` is not configured as a Git marketplace`. Automatic update timing is not verified.
- Version drift: the plugin manifest sets `version`, and Claude updates only when that string changes, while Codex follows the git marketplace's HEAD. Short drift between releases is expected.

Sources: [Claude Code: keep plugins updated](https://code.claude.com/docs/en/discover-plugins#keep-plugins-updated), [settings reference: extraKnownMarketplaces](https://code.claude.com/docs/en/settings-reference#extraknownmarketplaces); `codex plugin marketplace upgrade --help`.

## Per-machine steps

1. **Prerequisites:** both CLIs installed, at versions no older than those tested: Claude Code 2.1.296 and codex-cli 0.160.1.
2. **Claude Code:**
   1. Run `claude` interactively in the repository and accept the workspace trust dialog. Project-scope plugins load only after trust is accepted for the repository folder itself; `-p` or trusting a parent folder is not enough.
   2. Stay in that session until `/plugin` → Marketplaces lists the marketplace. Claude registers a marketplace declared only in project settings in the background after an interactive session starts ([plugin loading](https://code.claude.com/docs/en/plugins/loading)).
   3. Install `<plugin>@<marketplace>` from `/plugin` there, or from the shell with `claude plugin install <plugin>@<marketplace> --scope project`. Before step 2 completes, the shell command fails with `Plugin "<plugin>" not found in marketplace "<marketplace>"`; the `claude plugin marketplace update <marketplace>` that the error suggests does not help before the marketplace is registered (it fails with `Marketplace '<marketplace>' not found`). The install leaves the content of `.claude/settings.json` unchanged but rewrites it with LF line endings; `.gitattributes` checks the file out with LF, so `git status` stays clean.
   4. Fallback if the marketplace never appears: `claude plugin marketplace add <source>`, then install. Committed settings still take precedence, so `autoUpdate` applies.

   Cloud sessions do not load plugins enabled in `.claude/settings.json` or add its `extraKnownMarketplaces`, so plugin skills are unavailable there ([plugin loading](https://code.claude.com/docs/en/plugins/loading#plugins-shared-through-a-repository)).
3. **Codex:** Codex reads a project's `.codex/` (including `[marketplaces]` and `[plugins]`) only when the project is trusted; untrusted layers are ignored.
   1. Run `codex` once in the repository and accept the trust prompt. Fallback: add this to the user-level `~/.codex/config.toml` ([config reference](https://learn.chatgpt.com/docs/config-file/config-reference)); on Windows the key is the lowercased path (observed: `c:\users\<user>\<repo>`):

      ```toml
      [projects.'<absolute path>']
      trust_level = "trusted"
      ```
   2. In a trusted project, a session start fetches the declared marketplace itself (verified in an isolated `CODEX_HOME`: no `codex plugin marketplace add` needed, no user config written). On a fresh trusted machine the first `codex exec` may list `NONE` (and a first Verification run may fail) because the marketplace is fetched during that session; another session then lists the skills. Running `codex plugin marketplace upgrade <marketplace>` from inside the repository is optional.
4. **Verify** (below).

## Verification

The `check-setup` skill automates the Project setup and Machine setup checks; its [checklist](../../skills/check-setup/checklist.md) is the single list of checks, rationale and fixes. Its live check (L1) reuses the skills prompt below.

To verify by hand, run each prompt non-interactively in each host from the repository root.

Skills:

```
claude -p "List the names of all skills available to you that come from the <plugin> plugin. Output only the names, one per line, or NONE. Do not run any tools."
codex exec --skip-git-repo-check "List the names of all skills available to you that come from the <plugin> plugin. Output only the names, one per line, or NONE. Do not run any tools."
```

Pass: both hosts list the same set of names. Skills with `disable-model-invocation: true` are user-only slash commands and do not appear in a model's list, so compare against the skills listed in the `skills` array of the plugin manifest (`.claude-plugin/plugin.json`) that lack that flag, not against the full command list or every `SKILL.md` in the plugin's source repository.

Instructions:

```
claude -p "In which language must project artifacts be written, according to the project instructions? Answer in one word. Do not run any tools."
codex exec --skip-git-repo-check "In which language must project artifacts be written, according to the project instructions? Answer in one word. Do not run any tools."
```

Pass: both answer `English` (the project language rule in `AGENTS.md`). Any specific rule from `AGENTS.md` works.

Negative check: run the `codex exec` skills command from a directory outside the repository. It must output `NONE`, provided the plugin is not also enabled in the user-level Codex config.
