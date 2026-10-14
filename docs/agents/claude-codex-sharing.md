# Sharing instructions and skills between Claude Code and Codex

## Goal

Claude Code and Codex work from the same project instructions and the same skills in this repository.

## Scope

Project level only. Out of scope:

- User-level configuration (`~/.claude`, `~/.codex`) and its eventual removal.
- Hooks: they stay Host-specific (the Claude context-budget hook stays user-level).
- MCP servers.
- Subagents (formats are incompatible).

## Decisions

1. **Instructions:** `AGENTS.md` is canonical, with Host-labelled passages where the hosts differ. `CLAUDE.md` contains only `@AGENTS.md`. Claude Code expands the import at session start, so the content carries the same weight as if written in `CLAUDE.md`. Native `AGENTS.md` loading in Claude Code is not relied on: it needs Claude Code v2.1.277 or later, is unavailable in some sessions, and by default applies only when no `CLAUDE.md` exists in the working directory or above; the **Project instructions** setting (`pluginConfigs` → `cc-plugin-agents-md@builtin` → `options.instructionFiles`, user or managed settings only, value `claude-md-and-agents-md`) loads both, but a repository cannot set it for collaborators ([Claude Code memory: AGENTS.md](https://code.claude.com/docs/en/memory#agents-md)).
2. **Plugin skills:** installed through a plugin for each Host, not committed as copies. The plugin is their source, and a copy would drift from it. Plugin skills are never edited or renamed locally, so upstream updates keep applying.
3. **Plugins in general:** shared only when both Hosts can install them from one source.
4. **Skills outside a Shared plugin:** not installed by default. When one is needed, install it for both Hosts explicitly (for example `npx skills add <source> --skill <name> -a claude-code -a codex`) and commit the result. Project scope writes `.claude/skills/` for Claude Code and `.agents/skills/` for Codex. This follows the skills CLI convention (its README describes project scope as "Committed with your project, shared with team", [vercel-labs/skills](https://github.com/vercel-labs/skills)). With no plugin both Hosts can install, the committed copy is the single shared source that every clone gets, so the Hosts stay aligned without per-machine steps. Keep those directories out of `.gitignore`.

The concrete plugin list lives in `.claude/settings.json` and `.codex/config.toml`. This document uses `<plugin>@<marketplace>` for an entry in it.

## Related docs

- [Plugin authoring](plugin-authoring.md): manifests, skill layout and invocation, versioning, update mechanics and version drift, local testing. Read it before changing skills, manifests or plugin setup.
- [Verification](verification.md): how to verify a Project setup and Machine setup.

## Per-host setup

The Project setup each Host reads:

| | Claude Code | Codex |
|---|---|---|
| Instructions | `CLAUDE.md` → `@AGENTS.md` | `AGENTS.md` (native) |
| Plugin enablement (committed) | `.claude/settings.json` `enabledPlugins` (`<plugin>@<marketplace>`) and `extraKnownMarketplaces` (the marketplace, its source and `"autoUpdate": true`) | `.codex/config.toml` `[marketplaces.<marketplace>]` (`source_type`, `source`; the key equals the marketplace's own name) and `[plugins."<plugin>@<marketplace>"] enabled = true` |

Install each Shared plugin only from the marketplace declared for it. A same-named plugin from another marketplace (for example `claude-plugins-official` ships its own `mattpocock-skills`) is a different copy, and the Hosts' versions then drift.

How each Host invokes a plugin skill and picks up updates is in the [authoring doc](plugin-authoring.md#invoke-a-skill-in-each-host) ([updates](plugin-authoring.md#how-each-host-picks-up-updates)).

## Per-machine steps

The Machine setup, once per machine and Host.

1. **Prerequisites:** both CLIs installed, at versions no older than those tested: Claude Code 2.1.296 and codex-cli 0.160.1.
2. **Claude Code:**
   1. Run `claude` interactively in the repository and accept the workspace trust dialog. Project-scope plugins load only after trust is accepted for the repository folder itself; `-p` or trusting a parent folder is not enough.
   2. Stay in that session until `/plugin` → Marketplaces lists the marketplace. Claude registers a marketplace declared only in project settings in the background after an interactive session starts ([plugin loading](https://code.claude.com/docs/en/plugins/loading)).
   3. Install `<plugin>@<marketplace>` from `/plugin` there, or from the shell with `claude plugin install <plugin>@<marketplace> --scope project`. Before step 2 completes, the shell command fails with `Plugin "<plugin>" not found in marketplace "<marketplace>"`; the `claude plugin marketplace update <marketplace>` that the error suggests does not help before the marketplace is registered (it fails with `Marketplace '<marketplace>' not found`). The install leaves the content of `.claude/settings.json` unchanged but rewrites it with LF line endings; `.gitattributes` checks the file out with LF, so `git status` stays clean.
   4. Fallback if the marketplace never appears: `claude plugin marketplace add <source>`, then install. Committed settings still take precedence, so `autoUpdate` applies.
   5. Alternative to 4: `claude plugin install <plugin> --marketplace <source>` adds the marketplace and installs in one step from the shell (Claude Code 2.1.292+; the in-session `/plugin install <plugin> --marketplace <source>` needs 2.1.275+). The shell form declares the marketplace in user settings ([install and manage plugins](https://code.claude.com/docs/en/plugins/install#add-a-marketplace-and-install-in-one-command)).

   Cloud sessions do not load plugins enabled in `.claude/settings.json` or add its `extraKnownMarketplaces`, so plugin skills are unavailable there ([install and manage plugins, cloud session tab](https://code.claude.com/docs/en/plugins/install); marketplaces are not added: [plugin loading](https://code.claude.com/docs/en/plugins/loading#plugins-shared-through-a-repository)).
3. **Codex:** Codex reads a project's `.codex/` (including `[marketplaces]` and `[plugins]`) only when the project is trusted; untrusted layers are ignored.
   1. Run `codex` once in the repository and accept the trust prompt. Fallback: add this to the user-level `~/.codex/config.toml` ([config reference](https://learn.chatgpt.com/docs/config-file/config-reference)); on Windows the key is the lowercased path (observed: `c:\users\<user>\<repo>`):

      ```toml
      [projects.'<absolute path>']
      trust_level = "trusted"
      ```
   2. In a trusted project, a session start fetches the declared marketplace itself (verified in an isolated `CODEX_HOME`: no `codex plugin marketplace add` needed, no user config written). On a fresh trusted machine the first `codex exec` may list `NONE` (and a first verification run may fail) because the marketplace is fetched during that session; another session then lists the skills. Running `codex plugin marketplace upgrade <marketplace>` from inside the repository is optional.
4. **Verify** with the [verification doc](verification.md).
