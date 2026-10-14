# Codex startup auto-upgrade for a marketplace declared only in project config

Research note for issue #35. Checked on 2026-10-14. Terms follow `GLOSSARY.md` (Host, Shared plugin, Project setup). Source numbers in brackets refer to the Sources list at the end. This note builds on `docs/research/codex-marketplace-auto-upgrade-2026-10-14.md` (the "auto-upgrade note") and `docs/research/codex-marketplace-ref-pinning-2026-10-14.md` (the "pinning note"), and corrects the auto-upgrade note's answer 4 and live run 6. Both notes stay as written.

Source-code citations use tag `rust-v0.162.1` of `openai/codex` (commit `092d3acd6bec3e3a14bdc7e7a2810ab628ab759d`). It is still the latest stable tag on the check date (`git ls-remote --tags`; newer tags are only `rust-v0.163.0-alpha.*`, the newest `rust-v0.163.0-alpha.12`). The installed CLI is codex-cli 0.162.1 on Windows 11. Each claim is marked **[source]** (read in code), **[live]** (observed with the CLI) or **unverified**.

## Answer

**Yes.** The startup auto-upgrade upgrades a git marketplace declared only in a trusted project's `.codex/config.toml`, on Windows, under `codex exec`, both from a git repository and from a non-git directory with `--skip-git-repo-check` **[live, runs A, C, S; source S1-S4]**. So the default Project setup closes Codex version drift on its own, under these conditions:

1. **The project is trusted** for the directory Codex starts in. An untrusted project's layer is loaded but disabled, so its marketplace is not seen and nothing is upgraded **[live, run T; source S5]**.
2. **A Codex session starts in the project** (the cwd, or a subdirectory of it). The upgrade runs once per start, with no timer (auto-upgrade note, answers 1 and 2).
3. **The process lives until the upgrade finishes.** The upgrade runs on a detached OS thread that nobody waits for **[source S1]**. A `codex exec` that ended about 1 to 3 seconds after start never completed the upgrade, for project-level and user-level declarations alike; runs that lasted about 16 seconds always did **[live, runs F, G versus A, C, S, U]**. A manual `upgrade` of this repository took about 2.2 seconds on this machine **[live]**, which is the order of the window. Whether a logged-in `codex exec` with a short answer lasts long enough is **unverified**; the #20 observation suggests it usually does.
4. **The remote revision differs from the revision recorded in the installed marketplace's metadata file.** Codex decides "already up to date" from `.codex-marketplace-install.json`, not from the checkout's content **[source S3]**. This is what made live run 6 negative (see below).
5. Plugins are enabled (`features.plugins`, default on) and the marketplace is not pinned to a fixed `ref` (auto-upgrade note, answer 3; pinning note).

Confidence: high for `codex exec` on Windows; the interactive TUI is **unverified** (same embedded app server per source, auto-upgrade note S5, and a TUI session normally lives long enough for condition 3).

## Why the two observations conflict

**Run 6 was an artifact of how the "old commit" was set up, not a project-config limitation.**

- **[source]** `upgrade_configured_git_marketplace` returns without changes when the installed root validates and `installed_marketplace_metadata_matches(previous_snapshot, marketplace, remote_revision)` is true [S3]. The snapshot is read from `<marketplace root>/.codex-marketplace-install.json`, which records `source_type`, `source`, `ref_name`, `sparse_paths` and `revision` [S4]. The git HEAD of the checkout is never compared.
- **[live]** The preserved run-6 `CODEX_HOME` (`h3` in the session scratchpad) contains a marketplace checkout at `a157af3` (plugin 0.2.0) whose metadata file says `"ref_name": "main"`, `"revision": "36e17a0..."`, which was remote `main` at the time. That combination arises when the manual `upgrade` of run 5 moved the marketplace to `main` and the checkout was then reset to the old commit by hand (inferred from the state; the exact command used is not recorded). At startup the remote `main` (`36e17a0`) equalled the recorded revision, so Codex treated the marketplace as current.
- **[live, run B]** Reproduced deliberately: project-only declaration with `ref = "main"`, manual `upgrade` (metadata `702dfc6`), `git checkout a157af3` inside the marketplace root, then `codex exec`: stayed at 0.2.0.
- **[live, run U]** The same manipulation with a **user-level** declaration also stayed at 0.2.0. The effect is therefore not specific to project config, and the auto-upgrade note's runs 1 to 4 were positive only because they changed `ref` in config, which changes the metadata comparison (pinning note, "Fetch and update").
- **[live, run E]** A copy of the unchanged run-6 `CODEX_HOME`, run again in the same project after `main` had moved to `702dfc6`, upgraded to `702dfc6` (plugin 0.2.1).

**The #20 observation is the normal case.** A project-only declaration on the real machine, a logged-in `codex exec` that lasted a full model turn, and an installed revision older than remote `main`: all conditions above hold, and runs A, C and S reproduce the result without login.

## Evidence

### Source (tag `rust-v0.162.1`)

- Startup path. `codex exec` loads its config with the launch cwd (`AbsolutePathBuf::current_dir()` unless `-C` is given) and starts the in-process app server only after the git-repo check passes [S6]. The app server calls `maybe_start_plugin_startup_tasks_for_config(&config.plugins_config_input(), reload_config, ...)` with `reload_config = plugin_config_reload::for_cwd(config_manager, config.cwd)` [S2]. `for_cwd` reloads with `ConfigManager::load_config_layers_for_cwd(cwd)`, which calls `load_config_layers_state` with that cwd, the same CLI and loader overrides and the same `codex_home` [S2, S7]. So the startup task sees the same layers, including trusted project layers, as the session. No separate or earlier config load without project layers was found.
- Selection. `load_configured_git_marketplaces` reads `marketplaces.*` from `config_layer_stack.effective_config()` [S3, line 162-165]; disabled (untrusted) project layers do not contribute.
- Trust. For each directory from the project root to the cwd that has a `.codex` folder, `decision_for_dir` looks up the directory, then the project root, then the git repo root in `[projects]`; keys are compared lowercased on Windows. Untrusted or unknown directories get a `disabled_reason` [S5].
- Up-to-date check: `installed_marketplace_metadata_matches` [S3 line 252; S4 lines 10, 68-74].
- Activation check. Before the new root is activated, `ensure_configured_git_marketplace_unchanged` reloads config through `reload_config` and aborts if the marketplace changed or disappeared [S3 lines 292-300]. For a project-only declaration this reload uses the session cwd, so it finds the declaration (run A passed this step).
- Thread lifetime. The task runs on `std::thread::Builder::new().name("plugins-marketplace-auto-upgrade").spawn(...)`; the join handle is dropped and nothing joins it at shutdown [S1, lines 2842-2881]. A Rust process exits when `main` returns regardless of other threads (Rust `std::thread` docs, standard behaviour; not re-read for this note). Errors are only logged as warnings [S1].
- The pre-release `rust-v0.163.0-alpha.12` has the same detached thread and the same metadata check (`manager.rs` around line 2852, `marketplace_upgrade.rs` line 252, read with `gh api`) [S8].

### Live (codex-cli 0.162.1, Windows 11, isolated `CODEX_HOME` per run under the session scratchpad; the real `~/.codex` and real project trust were not touched)

Setup unless stated: a throwaway project with `git init`, its path trusted in the temporary user config, and `<project>/.codex/config.toml` declaring `[marketplaces.ai-plugin-manager]` (`source_type = "git"`, public repo) plus the plugin enabled. The marketplace was installed at `a157af3` (plugin 0.2.0) with `ref` = that full SHA and a manual `upgrade`, then `ref` was set to `main` (remote `main` = `702dfc6`, plugin 0.2.1). Then `codex exec "hi"` with stdin closed (`</dev/null`; otherwise it waits on stdin before starting the app server [S6, line 2328]) and `RUST_LOG=warn,codex_core_plugins=debug`. No login: the model call fails with 401 after five retries per transport, so each run lasts about 16 seconds.

| Run | Variation | Duration | Result |
|-----|-----------|----------|--------|
| A | as above, cwd = project root | 16 s | upgraded to `702dfc6`, marketplace and plugin cache 0.2.1 |
| C | project without `.git`, `--skip-git-repo-check` | 17 s | upgraded, plugin cache 0.2.1 |
| S | cwd = `<project>/sub/deeper` | 16 s | upgraded |
| T | as A, but the project is not trusted (empty user config) | 16 s | not upgraded (expected: project layer disabled) |
| B | as A, but installed via manual `upgrade` at `main`, then `git checkout a157af3` inside the marketplace root (metadata still `702dfc6`) | 16 s | not upgraded: reproduces run 6 |
| U | as B, declaration in user config instead, non-git cwd | 16 s | not upgraded: same effect without project config |
| E | copy of the original run-6 `CODEX_HOME`, original project, after remote `main` moved | 16 s | upgraded from `a157af3` to `702dfc6` |
| F | as A, but `model_provider` pointing at a local server that answers HTTP 400 at once (`request_max_retries = 0`, `stream_max_retries = 0`) | 1-3 s | not upgraded, four runs in a row; an empty `.staging` directory was left |
| G | as F with a user-level declaration | 1 s | not upgraded |

After run F, a manual `codex plugin marketplace upgrade ai-plugin-manager` in the same project took 2.2 seconds and upgraded. A provider pointing at a closed port does not give a fast exit: `codex exec` kept retrying ("waiting for network") until a 240 s timeout, and that run did upgrade.

Not run: the interactive TUI; a logged-in session (no credentials were used); Linux or macOS.

## Implications for this repo

- `docs/agents/plugin-authoring.md`, "Version drift": the claim that drift is short holds for the default Project setup (project-only declaration): Codex moves to the marketplace head at the next Codex session started in the trusted project. The section should add the conditions: a session must start in the project (drift persists while none does), the project must be trusted, and a very short `codex exec` can end before the upgrade finishes. The auto-upgrade note's implication that project-only declarations "may not" auto-upgrade is withdrawn.
- `check-setup` M5 hint (`skills/check-setup/scripts/checks/marketplace-plugins.mjs:109`, `skills/check-setup/checklist.md`): a Codex lag is normally closed by starting one Codex session in the project; the deterministic fix is `codex plugin marketplace upgrade <marketplace>` run from the project (needed because the startup upgrade can be cut short or can fail with only a log warning). The current text names a non-existent `update` subcommand (issue #20). `warn` severity remains appropriate.
- M5 compares versions, so it detects a hand-modified checkout that Codex itself does not (run B). It should not suggest editing or resetting the marketplace checkout by hand, and Codex will not repair such a checkout until the remote moves or the config entry changes. A forced re-sync is a `ref` change or removing and re-adding the marketplace (removal path not tested here).
- `docs/agents/verification.md` and future research: to test the startup upgrade, make the installed state old by changing `ref` in config (SHA, then branch), never by checking out an old commit in the marketplace root; close stdin for `codex exec`; and do not use a fast-failing provider, since the process must outlive the upgrade. L1 runs (`codex exec` with a real model call) are long enough in practice (#20; unverified as a guarantee).
- Issue #31 (opt-in pinning): unaffected in substance. Pinning works the same for project-only declarations; with a pin the startup task still does one `ls-remote` (tag or branch) and then matches the metadata. Moving the pin in the project config is enough to trigger a re-sync at the next start in that project (pinning note, runs 6-7; this note, condition 4).
- Two projects pinning different `ref` values for the same marketplace name still share one install root per `CODEX_HOME` (pinning note, open question 3); since each start re-syncs to the starting project's entry, this thrashing is now more likely, not less (unverified).

## Open questions

1. Interactive TUI: expected to behave like `exec` (same embedded app server), and to complete the upgrade because sessions last longer. Not run.
2. Logged-in `codex exec` with a short answer: how often does it exit before the upgrade completes? The window is roughly one `ls-remote` plus one clone plus a plugin cache refresh (about 2 s here); network-dependent and unmeasured with login.
3. Does an interrupted upgrade leave anything behind besides an empty `.staging` directory? Activation is staged, and no partial root was observed, but interruption during `activate_marketplace_root` itself was not tested.
4. Linux and macOS: no platform-specific code was found on this path, so the same behaviour is expected (unverified).
5. Should Codex join or await the upgrade thread at shutdown? This is upstream behaviour; no upstream issue was searched.

## Sources

All checked 2026-10-14. Links use tag `rust-v0.162.1` of https://github.com/openai/codex unless stated.

- S1. `codex-rs/core-plugins/src/manager.rs`, `maybe_start_plugin_startup_tasks_for_config` (lines 2814-2890, detached `std::thread` named `plugins-marketplace-auto-upgrade`) and `upgrade_configured_marketplaces_for_config_with_mode` (lines 2956-3019). https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/core-plugins/src/manager.rs
- S2. `codex-rs/app-server/src/message_processor.rs` (startup call with `plugin_config_reload::for_cwd(config_manager, config.cwd)`, around lines 545-565) and `codex-rs/app-server/src/plugin_config_reload.rs` (`for_cwd`, `defaults`).
- S3. `codex-rs/core-plugins/src/marketplace_upgrade.rs` (`load_configured_git_marketplaces` line 162, `upgrade_configured_git_marketplace` line 225, metadata match line 252, activation with reload check lines 292-300).
- S4. `codex-rs/core-plugins/src/marketplace_upgrade/activation.rs` (`MARKETPLACE_INSTALL_METADATA_FILE = ".codex-marketplace-install.json"` line 10, `InstalledMarketplaceMetadata`, `installed_marketplace_metadata_matches` lines 68-74).
- S5. `codex-rs/config/src/loader/mod.rs` (`ProjectTrustContext::decision_for_dir` and `disabled_reason_for_decision` around lines 1046-1110, Windows lowercase key matching around lines 1406-1430, `discover_project_layers` around lines 1660-1790).
- S6. `codex-rs/exec/src/lib.rs` (config cwd lines 359-365, `RUST_LOG` stderr filter lines 254-259, git-repo check then `InProcessAppServerClient::start` lines 1013-1023, stdin read line 2328).
- S7. `codex-rs/app-server/src/config_manager.rs` (`load_config_layers_for_cwd`, `load_config_layers`, lines 474-502).
- S8. `rust-v0.163.0-alpha.12`: `codex-rs/core-plugins/src/manager.rs` and `codex-rs/core-plugins/src/marketplace_upgrade.rs`, read via `gh api repos/openai/codex/contents/...?ref=rust-v0.163.0-alpha.12`.
- Issue #20 body (positive observation on the real machine): https://github.com/hsmejky/ai-plugin-manager/issues/20
- Issue #35 body: https://github.com/hsmejky/ai-plugin-manager/issues/35
- Local experiments: codex-cli 0.162.1 on Windows 11, `CODEX_HOME` and projects under the session scratchpad (`r35/`), the preserved run-6 home `h3/`, a local Python HTTP server answering 400 for runs F and G, public repo `https://github.com/hsmejky/ai-plugin-manager.git` (`a157af3` = plugin 0.2.0, `702dfc6` = `main`, plugin 0.2.1).
