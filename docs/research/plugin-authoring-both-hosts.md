# Authoring a Shared plugin for Claude Code and Codex

Research note for issue #12 (parent spec #11). All sources were checked on 2026-10-14. Terms follow `GLOSSARY.md` (Host, Shared plugin, Project setup, Machine setup). Source numbers in brackets refer to the Sources list at the end.

Source-code citations use tag `rust-v0.162.1` of `openai/codex` (latest release on the check date, commit `092d3acd6bec3e3a14bdc7e7a2810ab628ab759d`). The installed CLIs were codex-cli 0.160.1 and Claude Code 2.1.299.

## Summary

- Codex reads this repository's existing Claude layout. Its source lists `.claude-plugin/marketplace.json` as a marketplace file and `.claude-plugin/plugin.json` as a plugin manifest [S1, S2]. A separate Codex manifest is not required for this repo to load in Codex.
- The Codex manifest lookup order is: root `plugin.json` (only when its `$schema` starts with `https://agent-plugins.org/schemas/`), then `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json` [S1, S3]. OpenAI's docs present the root `plugin.json` ("portable") format as the preferred one and call `.codex-plugin/plugin.json` a compatibility fallback [S4, S5].
- Codex namespaces plugin skills as `<plugin-name>:<skill>`, with the name taken from the manifest [S6]. The `$<plugin>:<skill>` invocation in `docs/agents/claude-codex-sharing.md` is consistent with the source, but OpenAI's docs do not state the syntax [S4, S7].
- Claude Code invokes plugin skills as `/<plugin>:<skill>` [S8].
- Updates differ in mechanism. Claude Code compares a computed version (manifest `version`, else entry `version`, else commit SHA) [S9]. Codex upgrades a git marketplace when the remote revision of its ref differs from the installed snapshot, then force-reinstalls the configured plugins' cache regardless of the `version` string [S10, S11]. The `AGENTS.md` claim "Codex follows marketplace HEAD" is confirmed by source, with the caveats in section 4.
- Local testing: Claude Code has `--plugin-dir` (session-only, loaded in place) and local-path marketplaces (also loaded in place, no version bump needed) [S8, S9]. Codex has `codex plugin marketplace add <local dir>`; no `--plugin-dir` equivalent was found [S4, S12].
- Host-specific parts: Host config files (`.claude/settings.json`, `.codex/config.toml`), hooks, UI metadata, update trigger. Shared parts: `SKILL.md` files, the marketplace file and (for this repo) `.claude-plugin/plugin.json`.

## 1. How the Host discovers and reads a marketplace

### Codex

- Marketplace file candidates, in source order: `.agents/plugins/marketplace.json`, `.agents/plugins/api_marketplace.json`, `.claude-plugin/marketplace.json`, `.cursor-plugin/marketplace.json` (`MARKETPLACE_MANIFEST_RELATIVE_PATHS`) [S2]. The docs list `$REPO_ROOT/.agents/plugins/marketplace.json` (repo), `~/.agents/plugins/marketplace.json` (personal) and `$REPO_ROOT/.claude-plugin/marketplace.json` ("legacy-compatible") [S4, S5].
- Fields read per plugin entry (`RawMarketplaceManifestPlugin`): `name`, `source` (a `./` path string, or an object with `source` = local, url, git-subdir or npm), `policy` (optional; `installation`, `authentication`, `products`), `category` (optional); all other entry keys are kept and used as an inline fallback manifest when the plugin root has no manifest file [S2]. The docs call `policy` and `category` required [S5]. The source defaults both, so this repo's entry (name, source, description, category, no `policy`) parses. This is a doc/source disagreement; the source is taken as authoritative.
- Top level: `name` is the marketplace ID; `interface.displayName` is optional [S5]. Local `source.path` values start with `./`, resolve against the marketplace root and must stay inside it. An unresolvable entry is skipped, not fatal [S5].
- Adding a marketplace: `codex plugin marketplace add` accepts `owner/repo[@ref]`, HTTP(S) or SSH git URLs, or a local directory; `--ref` and `--sparse` apply to git sources only [S4, S12, S13].
- Project declaration: `[marketplaces.<name>]` in `.codex/config.toml`, read only in trusted projects. This rests on the repo's own observations [S14]; OpenAI's plugin docs defer the key table elsewhere [S4]. See open question 3.
- Installed CLI check: `codex plugin marketplace list` shows the marketplaces Codex considers and their roots [S12].

### Claude Code

- Reads `.claude-plugin/marketplace.json` from a GitHub repo, git URL, local directory or file, or hosted URL [S8]. Marketplace entries accept component fields and a `strict` flag that decides how entry fields combine with `plugin.json` [S16].
- Relative-path plugin sources (this repo uses `"source": "./"`) need no install record; the plugin loads from the marketplace itself [S9].
- Project enablement uses `enabledPlugins` and `extraKnownMarketplaces` in `.claude/settings.json`; a declared marketplace is cloned in the background after session start [S9]. Already documented in the repo.

## 2. Does Codex need its own manifest?

### Codex

- Not required. `find_plugin_manifest_path` tries root `plugin.json` first (accepted only if its `$schema` is an `agent-plugins.org` schema), then `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json` [S1, S3]. This repo has only `.claude-plugin/plugin.json`, so Codex picks that file.
- Fields the legacy-format parser reads (`RawPluginManifest`): `name`, `version`, `description`, `keywords`, `skills`, `mcpServers`, `apps`, `hooks`, `interface`, `extensions` [S17]. A blank `name` falls back to the plugin directory name. `version` is trimmed; empty means unset [S17]. Other keys in this repo's manifest (`author`, `repository`) are not in that struct, which has no `deny_unknown_fields`, so serde ignores them [S17].
- `skills` paths must start with `./` and resolve under the plugin root [S17]. This repo's `"skills": ["./skills/check-setup"]` points at one skill folder; Claude documents that form as valid and adds it to the default `skills/` scan [S18]. In Codex, listed paths replace the default `skills/` root, and a legacy-format manifest scans each root recursively for `SKILL.md`, so the single folder is found [S20, S21] (source reading, not executed).
- OpenAI's preferred new format is a root `plugin.json` with `$schema`, `name`, `version`, `description`, optional `author/homepage/repository/license/keywords`, and OpenAI-only settings under `extensions.com.openai` (`interface`, `apps`, `hooks`, `onboardingSkill`). `.codex-plugin/plugin.json` is a fallback used only when `extensions.com.openai` is absent; the two are not merged [S4, S5]. The docs say OpenAI also accepts "legacy and Claude-compatible manifests", without detail [S4].
- Disagreement: `@plugin-creator` still scaffolds the older Codex layout rather than the portable one [S5].

### Claude Code

- Manifest is `.claude-plugin/plugin.json` and is optional; if present only `name` is required. All other files stay at the plugin root, not inside `.claude-plugin/` [S18].
- Unknown top-level keys are stripped (validation warning). `claude plugin validate <path>` checks plugin and marketplace manifests [S18].
- Components are namespaced under the manifest `name` [S18].

## 3. Skill registration, exposure and invocation

### Codex

- Registration: manifest `skills` field or the conventional `skills/` directory [S5, S17]. The namespace is the plugin name from the nearest manifest above the `SKILL.md`; the source comment gives the example "a skill named `search` beneath a plugin named `sample` is exposed as `sample:search`" [S6].
- Invocation: in the CLI and IDE extension, `$` mentions a skill and `/skills` lists them; implicit matching by description also applies [S7]. The OpenAI skills page does not describe plugin namespacing [S7]. With S6, `$<plugin>:<skill>` follows from the namespace, and the repo's note that it was observed on codex-cli 0.160.1 stands. Not stated in OpenAI docs.
- Standalone (non-plugin) skill discovery: `$CWD/.agents/skills` up to the repo root, `$HOME/.agents/skills`, `/etc/codex/skills` [S7].
- Per-plugin enablement: `[plugins."<plugin>@<marketplace>"] enabled = true` in `.codex/config.toml`, project config applies only in trusted projects [S4, S5].

### Claude Code

- Skills load from `skills/<name>/SKILL.md` plus directories listed in the manifest `skills` field; a plugin with `SKILL.md` at its root and no `skills/` loads as one skill [S18].
- Invocation: `/<plugin>:<skill>`, listed after typing `/` [S8].

## 4. How updates are picked up

### Codex

- For git marketplaces the upgrade reads the remote revision of the configured ref (`git_remote_revision`) and returns early when the installed snapshot already matches; otherwise it clones to staging and activates the new snapshot [S10].
- After any upgrade that changed a marketplace root, `refresh_non_curated_plugin_cache_force_reinstall_detailed` reinstalls the configured plugins' cache, so the `version` string is not compared on this path [S11]. Cache path: `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/`; in source the version is the manifest `version`, or the constant `local` when a legacy-format manifest has none [S19]. The docs instead say `$VERSION` is `local` for local plugins [S5]; doc/source disagreement.
- Automatic: when plugins are enabled, startup spawns a `plugins-marketplace-auto-upgrade` task in `PluginGitMode::Automatic` [S11]. Trigger timing, any interval and opt-out were not found; the docs do not describe automatic upgrades [S4]. Open question 4.
- Manual: `codex plugin marketplace upgrade [name]` [S4, S12]. It fails with "marketplace `<name>` is not configured as a Git marketplace" for non-git marketplaces [S11].
- A second path, `IfVersionChanged`, reinstalls only when the manifest version differs from the active cached version [S20]. With no `version` in the manifest the version is the constant `local`, so this path never refreshes.
- Net effect for this repo: a push to the tracked ref is enough for Codex (git path); bumping `version` is needed for Claude and harmless for Codex.

### Claude Code

- Version resolution: manifest `version`, then marketplace-entry `version`, then the source's commit SHA (12 characters for github/url/git-subdir; the installed directory's SHA for relative paths in a git-hosted marketplace); `unknown` for non-git local directories and npm [S9]. A pinned manifest `version` keeps users on the cached copy until the string changes, however many commits are pushed [S9]. This confirms the repo's "Claude updates only when that string changes".
- Auto-update is off by default for third-party and local marketplaces and on for most official ones (not `knowledge-work-plugins`, `first-party-plugins`) and claude.ai marketplaces [S8, S9]. Precedence: `autoUpdate` in `extraKnownMarketplaces`, then `known_marketplaces.json`, then the default. It runs in interactive sessions after the first message plus a random delay of up to ten minutes [S9]. Already in the repo docs.
- Manual: `claude plugin update <plugin>@<marketplace>` (restart required), `/plugin` Update now or Update marketplace, `claude plugin marketplace update [name]` (listing only), then `/reload-plugins` [S8, S12].
- `claude plugin install name@marketplace` refreshes that marketplace first, except for local file or directory marketplaces [S9].

## 5. Testing an unreleased change locally

### Codex

- Add a local marketplace root: `codex plugin marketplace add <dir>` (directory only, no ref) [S4, S12, S13]. Enable per project with `[plugins."<plugin>@<marketplace>"]` in `.codex/config.toml` [S4].
- Installed local plugins are cached under `~/.codex/plugins/cache/`; the docs say to restart the desktop app after changes "so the local install picks up the new files", then test in a new chat [S4, S5].
- `codex plugin remove` uninstalls and removes the local cache; `codex plugin add` installs [S12]. Whether remove then add is needed to refresh an edited local plugin with an unchanged `version` is not established (open question 5).
- No session-only `--plugin-dir` equivalent appears in `codex plugin --help` [S12].
- `$plugin-creator` scaffolds a plugin and a marketplace entry [S4].

### Claude Code

- `claude --plugin-dir <path>` loads a directory for one session, in place, as `<name>@inline`; it overrides a same-named installed plugin [S8, S9].
- A marketplace added from a local path (`claude plugin marketplace add ./dir`): relative-path plugins load in place, edits apply at the next session start or `/reload-plugins`, no version bump needed [S9].
- `claude plugin validate <path>` before testing [S18].

## 6. Host-specific versus shared plugin parts

| Part | Shared | Claude Code | Codex |
|---|---|---|---|
| `skills/*/SKILL.md` | Yes | Read directly | Read directly |
| Marketplace file | `.claude-plugin/marketplace.json` read by both [S2, S8] | Native | Compatibility path; `.agents/plugins/marketplace.json` is native |
| Plugin manifest | `.claude-plugin/plugin.json` read by both [S3, S18] | Native | Fallback after root `plugin.json` and `.codex-plugin/plugin.json` |
| `name`, `version`, `description`, `skills`, `mcpServers`, `hooks` | Parsed by both | Yes | Yes [S17]; hook semantics differ (out of repo scope) |
| UI metadata | No | `displayName`, `icon`, ... | `interface`, or `extensions.com.openai` in the portable format [S5] |
| Project enablement | No | `.claude/settings.json` | `.codex/config.toml` |
| Update trigger | No | Version string | Git revision of the marketplace ref |
| Local test | No | `--plugin-dir`, local marketplace | Local marketplace `add` |
| Invocation | No | `/<plugin>:<skill>` | `$<plugin>:<skill>`, `/skills` |

## Does a Codex manifest look necessary? (recommendation only)

No, not for the current plugin. Codex's source reads `.claude-plugin/marketplace.json` and `.claude-plugin/plugin.json` as fallbacks, uses the `name`, `version` and `skills` fields this repo sets, and exposes the skill as `ai-plugin-manager:check-setup` [S2, S3, S6, S17]. The `AGENTS.md` statement that there is no Codex manifest is accurate.

Reasons to revisit: (a) OpenAI documents root `plugin.json` with `extensions.com.openai` as the preferred format and the Claude-style path as legacy, so the fallback could change in a future release (no deprecation notice found); (b) Codex-only UI metadata (`interface`) or hooks would need it; (c) Codex's `skills` field replaces the default `skills/` root while Claude's adds to it, so a manifest change that relies on either behaviour must be checked on both Hosts [S18, S20]. The `check-setup` live check (L1) already detects a regression after a Codex upgrade.

## Open questions

1. Resolved from source (see section 2): Codex finds `"skills": ["./skills/check-setup"]` via a recursive scan [S20, S21]. Not tested by running Codex here.
2. Do OpenAI docs or the Agent Plugins spec (`agentplugins/agent-plugins-spec`) promise continued support for the `.claude-plugin/*` fallbacks? Only code shows them; the docs say "legacy and Claude-compatible" without detail [S4]. The spec was not read.
3. Authoritative documentation for the `[marketplaces.<name>]` keys in `.codex/config.toml`. Source reads `source_type` (only `"git"` entries are upgraded), `source`, a ref, `sparse_paths`, `last_updated`, `last_revision` [S10]; the exact TOML name of the ref key was not checked, and OpenAI's plugin docs defer to config docs that were not retrieved here [S4].
4. When does Codex's automatic marketplace upgrade run (each start, interval, trusted projects only) and can it be disabled? Code shows a startup task [S11]; the interval logic and settings were not traced.
5. For a local (non-git) marketplace with an unchanged manifest `version`, does an edit reach the plugin cache without `codex plugin remove` and `add`? The docs say a restart picks up new files [S5]; the source's startup refresh is `IfVersionChanged` [S11, S20], which suggests not. Contradiction; untested because plugin installs were out of scope.
6. Root `plugin.json` edge cases, from source only [S3]: without an `agent-plugins.org` `$schema` it is skipped and lookup falls through to the `.*-plugin/` paths; with an unsupported `agent-plugins.org` schema version it is still selected; if it is a symlink or not a regular file, lookup stops and no manifest is found. Not tested.

## Sources

All checked 2026-10-14.

- S1. openai/codex `codex-rs/exec-server-protocol/src/protocol.rs`, `DISCOVERABLE_PLUGIN_MANIFEST_PATHS`. https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/exec-server-protocol/src/protocol.rs
- S2. openai/codex `codex-rs/core-plugins/src/marketplace.rs`, `MARKETPLACE_MANIFEST_RELATIVE_PATHS`, `RawMarketplaceManifestPlugin`. https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/core-plugins/src/marketplace.rs
- S3. openai/codex `codex-rs/utils/plugins/src/plugin_namespace.rs`, `find_plugin_manifest_path`. https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/utils/plugins/src/plugin_namespace.rs
- S4. OpenAI, Build plugins (Codex). https://developers.openai.com/codex/plugins/build
- S5. OpenAI, Package your plugin. https://developers.openai.com/plugins/build/plugins
- S6. openai/codex `codex-rs/ext/skills/src/loader/namespace.rs`, doc comment of `SkillNamespaceResolver`. https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/ext/skills/src/loader/namespace.rs
- S7. OpenAI, Build skills (developers.openai.com/codex/skills redirects here). https://learn.chatgpt.com/docs/build-skills
- S8. Claude Code docs, Install and manage plugins. https://code.claude.com/docs/en/discover-plugins
- S9. Claude Code docs, Plugin loading reference (versions, updates, in-place loading, name conflicts). https://code.claude.com/docs/en/plugins/loading
- S10. openai/codex `codex-rs/core-plugins/src/marketplace_upgrade.rs`. https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/core-plugins/src/marketplace_upgrade.rs
- S11. openai/codex `codex-rs/core-plugins/src/manager.rs`, `maybe_start_plugin_startup_tasks_for_config` and `upgrade_configured_marketplaces_for_config_with_mode`. https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/core-plugins/src/manager.rs
- S12. Local CLI help: `codex plugin --help`, `codex plugin marketplace --help`, `codex plugin marketplace list` (codex-cli 0.160.1); `claude plugin --help`, `claude plugin marketplace --help` (Claude Code 2.1.299).
- S13. openai/codex `codex-rs/core-plugins/src/marketplace_add/source.rs`. https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/core-plugins/src/marketplace_add/source.rs
- S14. This repo, `docs/agents/claude-codex-sharing.md` and `README.md` (internal observations, secondary).
- S16. Claude Code docs, Plugin manifest reference, "Marketplace entries and the manifest". https://code.claude.com/docs/en/plugins-reference
- S17. openai/codex `codex-rs/core-plugins/src/manifest.rs`, `RawPluginManifest`. https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/core-plugins/src/manifest.rs
- S18. Claude Code docs, Plugin manifest reference. https://code.claude.com/docs/en/plugins-reference
- S19. openai/codex `codex-rs/core-plugins/src/store.rs` and `codex-rs/core-plugin-common/src/installed.rs` (`DEFAULT_PLUGIN_VERSION = "local"`). https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/core-plugins/src/store.rs
- S20. openai/codex `codex-rs/core-plugins/src/loader.rs`, `refresh_non_curated_plugin_cache_*` (`IfVersionChanged`), `plugin_skill_roots`. https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/core-plugins/src/loader.rs
- S21. openai/codex `codex-rs/ext/skills/src/loader/discovery.rs`, `discover_skills` (`Recursive` versus `DirectChildren`). https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/ext/skills/src/loader/discovery.rs
