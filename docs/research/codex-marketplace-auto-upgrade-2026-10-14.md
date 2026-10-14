# When Codex upgrades git marketplaces on its own, and how to turn it off

Research note for issue #33. Checked on 2026-10-14. Terms follow `GLOSSARY.md` (Host, Shared plugin, Project setup). Source numbers in brackets refer to the Sources list at the end. This note extends `docs/research/codex-marketplace-ref-pinning-2026-10-14.md` (the "pinning note") and `docs/research/plugin-authoring-both-hosts.md` and leaves both as written.

Source-code citations use tag `rust-v0.162.1` of `openai/codex` (commit `092d3acd6bec3e3a14bdc7e7a2810ab628ab759d`, tag object `7a078f6bb4ce0dc2a81408b334ce52979d92c603`). It is still the latest stable tag on the check date (`git ls-remote --tags`: next older tags are `rust-v0.162.0` and `rust-v0.161.0`), so no release since 0.162.1 needed reading. The installed CLI is codex-cli 0.162.1, the same release. Each claim is marked **[source]** (read in code), **[live]** (observed with the CLI) or **unverified**.

## Answers to the issue's questions

**1. When does Codex upgrade configured git marketplaces automatically?**
At Codex startup, once per app-server start, with no timer. **[source]** `PluginsManager::maybe_start_plugin_startup_tasks_for_config` spawns a thread `plugins-marketplace-auto-upgrade` that runs `upgrade_configured_marketplaces_for_config_with_mode(..., None, PluginGitMode::Automatic, ...)` over all configured git marketplaces [S1]. The only guard is an `in_flight` flag, so two overlapping starts do not run it twice [S1]. The function is called once, when the app server's message processor is built, if `plugin_startup_tasks` is set [S2]. The in-process app server (used by `codex exec` and by the TUI in its embedded mode) always sets it [S3, S4, S5]. The standalone `codex app-server` sets it unless `PluginStartupTasks::Skip` is chosen, which the source ties to a test-only flag (`disable_plugin_startup_tasks_for_tests`) [S6].
- **[live]** `codex exec "hi"` (no authentication; the model call fails with 401 afterwards) moved a marketplace pinned in the user config from an old commit (`a157af3`, plugin 0.2.0) to the current `main` (`36e17a0`, plugin 0.2.1) before the failure. Authentication is not needed for the upgrade.
- **Not verified:** the interactive TUI. The source shows it starts `InProcessAppServerClient::start` for its `Embedded` target [S5], which sets the startup task, but a TUI session was not run. A TUI attached to a `LocalDaemon` or `Remote` app server (`AppServerTarget` variants [S5]) would depend on that server's start-up instead (unverified).

**2. Is there an interval or timestamp rule?**
No. **[source]** Nothing in `marketplace_upgrade.rs` or `manager.rs` compares a time against the upgrade. `MarketplaceConfig.last_updated` is parsed but ignored (`last_updated: _` in `parse_configured_git_marketplace`) [S7, S8]. Each start does one remote revision lookup (`git ls-remote <source> <ref|HEAD>`, none for a full 40-hex SHA) and compares it to the installed snapshot; equal means no change [S7, S9; pinning note, "Fetch and update"]. The git calls have a 30 second timeout (`MARKETPLACE_UPGRADE_GIT_TIMEOUT`) [S7].
- **[live]** Two `codex exec` runs back to back with the config changed in between (`ref` = old SHA, then `main`) each re-synced the marketplace immediately (`a157af3`, then `36e17a0`). No minimum interval applies.
- Consequence: the "short-lived drift" assumption holds in this sense: every Codex start (`exec` or TUI) closes drift for an unpinned marketplace. Drift lasts as long as no Codex session has started since the last push.

**3. Can it be turned off, and how?**
Only by turning off the whole plugins feature or by pinning. **[source]** The task is spawned only when `PluginsConfigInput.plugins_enabled` is true [S1], which is `config.features.enabled(Feature::Plugins)` [S10]. `Feature::Plugins` has key `plugins`, stage stable, default on [S11]. So `[features] plugins = false` in `config.toml` disables the startup upgrade.
- **[live]** With a marketplace configured at `ref = "main"` but installed at the old commit, `codex exec` with `[features] plugins = false` left it at `a157af3`; the same config without that line moved it to `36e17a0`.
- This is a blunt switch: it disables all plugin support (skills, MCP servers and apps from plugins), not only upgrades [S11 description "Enable plugins."; effect on use not tested here].
- **No dedicated key, env var or CLI flag** for the marketplace upgrade was found in the source read: the gating condition above is the only one in the startup path [S1], and `last_updated`/`last_revision` do not control it [S7, S8]. The docs search is partial: the config reference page lists `marketplaces.<name>.*` keys and no automatic-upgrade or `features.plugins` entry in the first 100000 of 158187 characters [S12]; the remainder was not read (the fetch tool ignored an offset). **Unverified** for the unread part of the page and for other docs pages.
- Policy side: managed requirements can restrict allowed marketplace sources (`MarketplacePolicy::from_requirements`, `restrict_to_allowed_sources`); the upgrade then records a per-marketplace error instead of upgrading a disallowed source [S7, S13]. This restricts sources and is not a switch for the schedule.
- A pin makes the upgrade a no-op for Codex without disabling it: with a tag or full SHA the remote revision only changes when the pin changes (pinning note, answer 2). That is the supported way to hold a version, and it keeps plugins working.

**4. Does it also run for a marketplace declared only in a trusted project's `.codex/config.toml`?**
Unresolved, with a negative live observation.
- **[source]** The upgrade reads `marketplaces.*` from the effective config of the config layer stack passed in, which includes project layers when they are loaded [S7]. The startup path passes `config.plugins_config_input()` for the app server's `Config` and a reload closure for the launch `cwd` [S2, S10]. `codex exec` loads its config with the launch cwd and hands it to the in-process server [S3, S14]. Source alone therefore suggests project layers are included.
- **[live, negative]** In a trusted temporary project whose only marketplace declaration was in `<project>/.codex/config.toml` (`ref = "main"`, user config containing only the project's `trust_level = "trusted"`), the manual `codex plugin marketplace upgrade ai-plugin-manager` run inside the project moved the marketplace to `main`, but `codex exec "hi"` run in the same directory (also with the marketplace pre-set to the old commit) did not; it stayed at `a157af3`. The same declaration in the user config did upgrade (answer 1). The cause was not found (not traced to a source line; possibilities such as the trust or project-layer handling on the startup path were not tested). Treat project-only declarations as **not auto-upgraded in `codex exec` 0.162.1 on Windows** until explained, and as unverified for the TUI.

## Evidence

### Source (tag `rust-v0.162.1`)

- `codex-rs/core-plugins/src/manager.rs`, `maybe_start_plugin_startup_tasks_for_config`: `if config.plugins_enabled { ... }` wraps the curated repo sync, the `plugins-marketplace-auto-upgrade` thread (guarded by `configured_marketplace_upgrade_state.in_flight`), remote plugin cache refreshes and a featured-plugin warm-up. After an upgrade that changed any root it calls `on_effective_plugins_changed`; per-marketplace errors are logged as warnings "failed to auto-upgrade configured marketplace" and never shown as failures [S1].
- Same file, `upgrade_configured_marketplaces_for_config_with_mode`: when roots were upgraded it force-refreshes the plugin cache for all configured plugin keys (`refresh_non_curated_plugin_cache_force_reinstall_detailed`) and clears caches [S1]. This is why a plugin's installed copy moves together with the marketplace (pinning note, "Fetch and update").
- `codex-rs/core-plugins/src/git_policy.rs`: `PluginGitMode::Automatic` runs git with repository-local environment variables removed and `GIT_OPTIONAL_LOCKS=0`, so the automatic path ignores git config inherited from the launch project; `Manual` (CLI `upgrade`) keeps the user's explicit git configuration [S15].
- `codex-rs/app-server/src/message_processor.rs`: the call happens when the processor is constructed, using `PluginStartupConfig::Current` (reload for the config cwd) or `Defaults` (after an invalid-config fallback) [S2, S6].
- `codex-rs/app-server/src/in_process.rs`: `plugin_startup_tasks: Some(PluginStartupConfig::Current)` [S3]. `codex-rs/exec/src/lib.rs` builds `InProcessClientStartArgs` with `session_source: SessionSource::Exec` and starts `InProcessAppServerClient` [S14]. `codex-rs/tui/src/lib.rs` has `AppServerTarget::{Embedded, LocalDaemon, Remote}` and starts the in-process client for `Embedded` [S5].
- `codex-rs/features/src/lib.rs`: `FeatureSpec { id: Feature::Plugins, key: "plugins", stage: Stable, default_enabled: true }` [S11]. `codex-rs/core/src/config/mod.rs`, `plugins_config_input`: third argument `self.features.enabled(Feature::Plugins)` [S10].

### Live (codex-cli 0.162.1, Windows 11, isolated `CODEX_HOME` directories under the session scratchpad; the real `~/.codex` was not touched)

All runs used the public repo `hsmejky/ai-plugin-manager`: `.claude-plugin/plugin.json` is 0.2.0 at `a157af3ed15c14d20d8a181cba76fcd7f19dff82` and 0.2.1 at `main` (`36e17a0`). The marketplace was added with `--ref <old SHA>`, then the config `ref` was edited to `main` (so the installed commit and the configured one differ), then `codex exec "hi"` was run from a directory without a git repository (`--skip-git-repo-check`) unless stated.

| # | Setup | Result after `codex exec` |
|---|-------|---------------------------|
| 1 | user config, `ref = "main"`, installed old commit | upgraded to `36e17a0`, plugin 0.2.1 (the call then failed with 401, no login) |
| 2 | same, config set back to the old SHA, run; then set to `main`, run again immediately | `a157af3` after the first run, `36e17a0` after the second (no interval) |
| 3 | same as 1 plus `[features] plugins = false` | stayed at `a157af3` |
| 4 | same as 3 with the `[features]` lines removed (control) | upgraded to `36e17a0` |
| 5 | trusted project, declaration only in `<project>/.codex/config.toml`, manual `codex plugin marketplace upgrade` inside it | upgraded to `main` |
| 6 | as 5, startup path via `codex exec "hi"` in the project, installed old commit | stayed at `a157af3` (not upgraded) |

Run 6 was repeated with different ways of launching the command; none changed the outcome. Not run: an interactive TUI session; a session logged in to an OpenAI account (authentication was absent in every run; the source shows no authentication check before the upgrade in the startup path [S1]).

## Implications for this repo

- `AGENTS.md`, "Plugin versioning": the sentence "Codex follows the marketplace HEAD" is accurate for an unpinned marketplace declared in a user-level config: Codex follows HEAD at every startup, with no schedule. Wording could say "at each Codex start" but nothing is wrong. With a `ref` pin (#31) Codex follows the pin instead (pinning note).
- `docs/agents/plugin-authoring.md`, "Version drift": the claim that drift resolves by itself is supported for the user-level declaration case; it needs the qualifier that it happens at the next Codex start and never while no session is started. For a Project setup that declares the Codex marketplace only in `.codex/config.toml`, the live result 6 means the automatic upgrade may not run; the documented remedy then is `codex plugin marketplace upgrade <name>` from the project (result 5).
- #31 opt-in pinning: pinning is the supported way to stop automatic movement without losing plugins. `[features] plugins = false` is the only global off switch found and should not be recommended as a way to freeze versions. The guidance for pinned projects can say: Codex still contacts the remote at each start for a tag or branch pin (one `ls-remote`), not for a full SHA [S9].
- `check-setup` M5 (installed versions, drift as `warn`): the severity rationale holds (the drift closes at the next Codex start for user-level declarations). A project-only declaration plus `exec`-only use could stay stale, so M5's hint for a Codex lag should name the manual `upgrade` command, not "start a Codex session". Whether `check-setup` can detect `features.plugins = false` is a possible new check: with it set, neither plugin loading nor upgrades work (impact of the flag on loading is from the feature description [S11], untested here).
- `docs/agents/verification.md`: any test that expects Codex to pick up a new version must start a Codex session or run `upgrade`; the live method above (isolated `CODEX_HOME`, `codex exec` without login) is a usable no-credential test for the startup upgrade of a user-level declaration.

## Open questions

1. Why does the startup path not upgrade a marketplace declared only in a trusted project's `.codex/config.toml` while the manual command does (live runs 5 and 6)? Candidates not tested: project-layer loading on the startup `Config`, differences on Windows paths, `exec` versus TUI. Needs a trace in `ConfigManager`/`load_config_layers_for_cwd`, or a run on Linux or macOS.
2. Does the interactive TUI behave like `exec` (same embedded server, so expected yes), including for a project-only declaration?
3. Is there a documented statement of automatic marketplace upgrades or the `features.plugins` key anywhere in the OpenAI docs? Only the first 100000 of 158187 characters of the config reference and no other page were read [S12].
4. With a logged-in session, does the cloud-managed or remote plugin catalog path (`remote_plugin`) add other upgrade triggers for non-git marketplaces? Out of scope for this question and untested.
5. When the upgrade fails (offline, auth-required private repo, timeout), the user sees only a log warning [S1]. How a Codex user would notice a stuck marketplace was not tested.

## Sources

All checked 2026-10-14. Links use the tag `rust-v0.162.1` of https://github.com/openai/codex.

- S1. `codex-rs/core-plugins/src/manager.rs` (`maybe_start_plugin_startup_tasks_for_config`, `upgrade_configured_marketplaces_for_config_with_mode`, `configured_marketplace_upgrade_state`). https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/core-plugins/src/manager.rs
- S2. `codex-rs/app-server/src/message_processor.rs` (call to `maybe_start_plugin_startup_tasks_for_config` guarded by `plugin_startup_tasks`). https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/app-server/src/message_processor.rs
- S3. `codex-rs/app-server/src/in_process.rs` (`plugin_startup_tasks: Some(PluginStartupConfig::Current)`).
- S4. `codex-rs/app-server-client/src/lib.rs` (`InProcessAppServerClient::start` calls `codex_app_server::in_process::start`).
- S5. `codex-rs/tui/src/lib.rs` (`AppServerTarget`, `InProcessAppServerClient::start` for embedded startup).
- S6. `codex-rs/app-server/src/lib.rs` (`PluginStartupTasks::{Start, Skip}`, default `Start`, `PluginStartupConfig` fallback) and `codex-rs/app-server/src/main.rs` (`disable_plugin_startup_tasks_for_tests`).
- S7. `codex-rs/core-plugins/src/marketplace_upgrade.rs` (`MARKETPLACE_UPGRADE_GIT_TIMEOUT`, `load_configured_git_marketplaces`, `parse_configured_git_marketplace`, `last_updated: _`).
- S8. `codex-rs/config/src/types.rs` (`MarketplaceConfig.last_updated`).
- S9. `codex-rs/core-plugins/src/marketplace_upgrade/git.rs` (`git_remote_revision`), as described in the pinning note [S4 there].
- S10. `codex-rs/core/src/config/mod.rs` (`plugins_config_input`).
- S11. `codex-rs/features/src/lib.rs` (`Feature::Plugins`, key `plugins`, "Enable plugins.", stable, default enabled).
- S12. OpenAI, Codex config reference. https://learn.chatgpt.com/docs/config-file/config-reference (first 100000 of 158187 characters; no `features.plugins` entry and no automatic-upgrade text found; `plugins.<plugin>.enabled` says "Marketplace refresh can install or refresh configured plugins even when disabled.").
- S13. `codex-rs/core-plugins/src/marketplace_policy.rs` (`MarketplacePolicy::from_requirements`).
- S14. `codex-rs/exec/src/lib.rs` (`InProcessClientStartArgs`, `SessionSource::Exec`, config loaded with the launch cwd).
- S15. `codex-rs/core-plugins/src/git_policy.rs` (`PluginGitMode::{Automatic, Manual}`).
- Local experiments: codex-cli 0.162.1 with `CODEX_HOME` set to directories under the session scratchpad, against the public repo `https://github.com/hsmejky/ai-plugin-manager.git`; a shallow clone of the tag at `rust-v0.162.1` (HEAD `092d3acd...`) was read locally.
- Issue #33 body: https://github.com/hsmejky/ai-plugin-manager/issues/33
