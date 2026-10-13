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
2. **Skills:** installed through a plugin for each host, not committed as copies. Both hosts install the plugin from the same source, so their versions align. Plugin skills are never edited or renamed locally, so upstream updates keep applying.
3. **Plugins in general:** shared only when the plugin ships a variant for both hosts.
4. **Skills outside a shared plugin:** not installed by default. When one is needed, install it for both hosts explicitly (for example with `npx skills add <source> --skill <name> -a claude-code -a codex`).

The concrete plugin list lives in `.claude/settings.json` and `.codex/config.toml`. This document uses `<plugin>@<marketplace>` for an entry in it.

## Per-host setup

| | Claude Code | Codex |
|---|---|---|
| Instructions | `CLAUDE.md` → `@AGENTS.md` | `AGENTS.md` (native) |
| Plugin enablement (committed) | `.claude/settings.json` `enabledPlugins` (`<plugin>@<marketplace>`) and `extraKnownMarketplaces` (the marketplace and its source) | `.codex/config.toml` `[plugins."<plugin>@<marketplace>"] enabled = true` |
| One-time machine step | `claude plugin install <plugin>@<marketplace> --scope project` (the marketplace is declared in project settings) | `codex plugin marketplace add <source>` (writes user-level config; no project-level marketplace exists), plus trusting the project (below) |
| Skill invocation | `/<plugin>:<skill>` | `<plugin>:<skill>` (same prefix; verify with `codex exec`) |
| Updates | automatic | at startup |

Codex reads a project's `.codex/` only when that project is marked trusted in the user-level `~/.codex/config.toml`:

```toml
[projects.'<lowercased absolute path>']
trust_level = "trusted"
```

This is a per-machine step.

Claude adds project marketplaces only after the workspace trust dialog, and cloud sessions skip `extraKnownMarketplaces`, so plugin skills are unavailable there.

## Verification

A fresh session of each host must:

- Claude: list the plugin skills and load `AGENTS.md` through `CLAUDE.md`.
- Codex: list the plugin skills, with no duplicate from a local `.agents/skills` copy.

Check automatically with `claude -p` and `codex exec`, then confirm in the Codex desktop app.

Negative check: run the same `codex exec` prompt from a directory outside the repository. It must list none of the plugin's skills.
