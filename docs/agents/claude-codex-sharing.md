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
2. **Skills:** installed through a plugin for each host, not committed as copies. Both hosts install the plugin from the same source, but each host updates on its own schedule (see Updates), so versions can drift until both are updated. Plugin skills are never edited or renamed locally, so upstream updates keep applying.
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
| Updates | Off by default for third-party marketplaces (on for `claude-plugins-official`). Update the plugin with `claude plugin update <plugin>@<marketplace>`; `claude plugin marketplace update <marketplace>` refreshes only the marketplace listing. Auto-update is toggled per marketplace on the `/plugin` Marketplaces tab. | `codex plugin marketplace upgrade [<marketplace>]` refreshes Git marketplace snapshots (omit the name for all). Automatic update timing is not verified. |

Sources: [Claude Code: keep plugins updated](https://code.claude.com/docs/en/discover-plugins#keep-plugins-updated); `codex plugin marketplace upgrade --help`.

Install each shared plugin only from the marketplace declared for it (`extraKnownMarketplaces` for Claude, the added marketplace for Codex). A same-named plugin from another marketplace (for example `claude-plugins-official` ships its own `mattpocock-skills`) is a different copy, and the hosts' versions then drift.

Codex reads a project's `.codex/` only when that project is trusted; an untrusted project's `.codex/` layers are ignored. Trust is a per-machine step:

1. Run `codex` once in the repository and accept the trust prompt.
2. Fallback: add this to the user-level `~/.codex/config.toml`:

```toml
[projects.'<absolute path>']
trust_level = "trusted"
```

On Windows the key is the lowercased path (observed: `c:\users\hsmej\ai-plugin-manager`). The official Codex docs reviewed do not describe the trust prompt; only third-party sources do.

Claude adds project marketplaces only after the workspace trust dialog, and cloud sessions skip `extraKnownMarketplaces`, so plugin skills are unavailable there.

## Verification

Run the same prompt non-interactively in each host from the repository root:

```
claude -p "List the names of all skills available to you that come from the <plugin> plugin. Output only the names, one per line, or NONE. Do not run any tools."
codex exec --skip-git-repo-check "List the names of all skills available to you that come from the <plugin> plugin. Output only the names, one per line, or NONE. Do not run any tools."
```

Pass: both hosts list the same set of names. Skills with `disable-model-invocation: true` are user-only slash commands and do not appear in a model's list, so compare against the plugin's `SKILL.md` files without that flag, not against the full command list.

Negative check: run the `codex exec` command from a directory outside the repository. It must output `NONE`.

Then confirm in the Codex desktop app.
