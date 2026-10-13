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

1. **Instructions:** `AGENTS.md` is canonical, with host-labelled passages where the hosts differ. `CLAUDE.md` contains only `@AGENTS.md`. Claude Code expands the import at session start, so the content carries the same weight as if written in `CLAUDE.md`. Native `AGENTS.md` loading in Claude Code is not relied on, because it stops silently as soon as a `CLAUDE.md` exists.
2. **Skills:** installed through the `mattpocock-skills` plugin for each host, not committed as copies. Both hosts install it from the same GitHub source (`mattpocock/skills`), so their versions align. Claude does not use the `claude-plugins-official` copy. Plugin skills are never edited or renamed locally, so upstream updates keep applying.
3. **Plugins in general:** shared only when the plugin ships a variant for both hosts.
4. **Skills outside the plugin** (`skills/misc`, `skills/in-progress` upstream) are not installed. When one is needed, install it with `npx skills add mattpocock/skills --skill <name> -a claude-code -a codex`.

## Per-host setup

| | Claude Code | Codex |
|---|---|---|
| Instructions | `CLAUDE.md` → `@AGENTS.md` | `AGENTS.md` (native) |
| Plugin enablement (committed) | `.claude/settings.json` `enabledPlugins` (`mattpocock-skills@mattpocock`) and `extraKnownMarketplaces` (marketplace `mattpocock`, GitHub `mattpocock/skills`) | `.codex/config.toml` `[plugins."mattpocock-skills@mattpocock"] enabled = true` |
| One-time machine step | `claude plugin install mattpocock-skills@mattpocock --scope project` (the marketplace is declared in project settings) | `codex plugin marketplace add mattpocock/skills` (writes user-level config; no project-level marketplace exists) |
| Skill invocation | `/mattpocock-skills:<skill>` | `mattpocock-skills:<skill>` (same prefix; verified with `codex exec`) |
| Updates | automatic | at startup |

Codex reads project `.codex/` configuration only for trusted projects.

Claude adds project marketplaces only after the workspace trust dialog, and cloud sessions skip `extraKnownMarketplaces`, so plugin skills are unavailable there.

## Verification

A fresh session of each host must:

- Claude: list the plugin skills (e.g. `/mattpocock-skills:grilling`; plugin 1.3.1 ships `grilling`, not `grill-with-docs`, so no alias resolution is observable) and load `AGENTS.md` through `CLAUDE.md`.
- Codex: list the plugin skills, with no duplicate from a local `.agents/skills` copy.

Check automatically with `claude -p` and `codex exec`, then confirm in the Codex desktop app.
