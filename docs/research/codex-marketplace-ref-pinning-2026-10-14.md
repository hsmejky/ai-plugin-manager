# Pinning Codex marketplaces with `ref` to reduce version drift

Research note for issue #26. All sources were checked on 2026-10-14. Terms follow `GLOSSARY.md` (Host, Shared plugin, Project setup). Source numbers in brackets refer to the Sources list at the end. This note extends `docs/research/plugin-authoring-both-hosts.md` (which stays as written) and resolves its open questions 3 and (partly) 4.

Source-code citations use tag `rust-v0.162.1` of `openai/codex` (latest release on the check date, tag object `7a078f6bb4ce0dc2a81408b334ce52979d92c603`, commit `092d3acd6bec3e3a14bdc7e7a2810ab628ab759d`, from `git ls-remote --tags https://github.com/openai/codex`). The installed CLI is codex-cli 0.162.1, the same version as the tag, so source and behaviour refer to the same release.

## Answers to the issue's questions

**1. Can a project pin a Codex git marketplace to a tag or commit?**
Yes. `[marketplaces.<name>]` takes `source_type = "git"`, `source` and an optional `ref` ("Optional Git branch, tag, or commit") [S1]. In source the TOML key `ref` maps to `MarketplaceConfig.ref_name` [S2]. Marketplaces "can be defined in system, cloud-managed, user, or trusted-project config.toml" [S1], so the committed `.codex/config.toml` can carry the pin. Verified locally (isolated `CODEX_HOME`, details in "Local verification"): a trusted project's `.codex/config.toml` with `ref = "<full sha>"` installed that exact commit (plugin 0.2.0) and the plugin cache; `codex plugin marketplace add owner/repo --ref <ref>` and `owner/repo@<ref>` write `ref = "..."` to the user `config.toml`.

**2. Does the pin make Codex update a Shared plugin at the same points as Claude Code?**
Partly, and only with conditions.
- Pinned, Codex no longer follows the branch head. On each upgrade it resolves the remote revision of the ref and does nothing when it equals the installed snapshot [S3, S4]. With a tag or a full SHA the remote revision only changes if the tag is moved, so Codex changes only when the pin in config changes (verified: changing `ref` from a SHA to `main` re-synced the marketplace and replaced plugin cache version 0.2.0 with 0.2.1).
- Codex updates "at the same points" as Claude Code only if each release is a tag created on the commit that bumps `version`, and consumers move the pin on both Hosts. Claude Code updates when the computed version changes, and with the repo's `"source": "./"` and a manifest `version` that is the manifest string at whatever commit of the marketplace checkout it has [S5, S6]. Claude Code's own marketplace checkout is unpinned unless `ref` is also set in `extraKnownMarketplaces` (branch or tag only; a SHA is not a marketplace-source field) [S7]. If Claude Code stays on the branch head and Codex on a tag, the two can still differ between a push and the next tag, and Claude Code's "version string unchanged" rule still hides pushes from it [S5].
- Pinning does not make Codex see the manifest `version`. Codex's marketplace upgrade compares git revisions, not versions; a plugin cache refresh follows any upgraded marketplace root [S3, S8] (see the earlier note, section 4). So the pin controls when Codex moves; the `version` bump controls when Claude Code moves. Drift disappears only when both moves are made together.

**3. Should this project's Project setup or authoring guidance use it?**
Recommendation (the user decides): do not make a `ref` pin part of the default Project setup. Offer it as an opt-in for projects that want Codex to change only on purpose, and make it cheap by tagging releases first. Reasons:
- Cost: a pinned Codex marketplace never auto-updates; every consuming project edits `ref` by hand per release, and the Claude side would need the same edit in `.claude/settings.json` (`ref`, branch or tag) to stay in step [S7].
- The repo has no tags today (`git tag` and `git ls-remote origin` show only `main` and pull refs on 2026-10-14), so a tag pin is not possible yet. A full-SHA pin works today.
- Drift between Hosts is a `warn` in `check-setup` M5 and was resolved by a single upgrade [issue #26 body]; the guidance already accepts short drift (`docs/agents/plugin-authoring.md`, "Version drift").
- What the pin does buy: reproducible Codex behaviour per project, and a way for the project's own CI/verification to test one known revision.

**4. Does `source_type = "local"` give Codex a local-path marketplace testing equivalent?**
Partly confirmed. The config reference documents `source_type` `git | local`, and for a local source says: "Use an absolute path for a local source; the directory contains .agents/plugins/marketplace.json" [S1]. The CLI `codex plugin marketplace add ./path` creates a local marketplace [S9] and the upgrade command fails for it with "is not configured as a Git marketplace" (the earlier note, section 4). Whether an edit in the local directory reaches the plugin cache without remove and add was not tested (earlier note, open question 5, still open). Also note the docs name only `.agents/plugins/marketplace.json`; the source additionally accepts `.claude-plugin/marketplace.json` (earlier note, section 1), so the docs sentence is narrower than the source.

## Evidence

### Config schema (source)

- `MarketplaceConfig` in `codex-rs/config/src/types.rs` has fields `last_updated`, `last_revision`, `source_type`, `source`, `ref` (Rust `ref_name`, doc comment "Git ref to check out when `source_type` is `git`"), `sparse_paths`. It uses `deny_unknown_fields` only for the JSON schema (`schemars`) [S2].
- `MarketplaceSourceType` is `git` or `local` [S2].
- The upgrade loader reads `marketplaces.*` from the merged effective config and only handles entries whose `source_type` is `"git"`; a git entry without `source` is an error [S3]. The effective config includes project layers, which the docs restrict to trusted projects [S1].

### Fetch and update (source)

- Add-time parsing (`parse_marketplace_source`): `owner/repo[@ref]`, `url#ref` or explicit `--ref`; an explicit `--ref` overrides one in the source string; `--ref` on a local path is rejected ("--ref is only supported for git marketplace sources") [S10].
- `git_remote_revision` (`marketplace_upgrade/git.rs`): if the ref is a full 40-hex SHA it is used as the revision without contacting the remote; otherwise it runs `git ls-remote <source> <ref|HEAD>` and takes the first line's SHA [S4]. A short SHA is not a full SHA, so `ls-remote` is asked for it and returns nothing: the upgrade fails with "git ls-remote returned empty output for marketplace source" (verified locally, see below). For an annotated tag the first line is whatever `ls-remote` lists first for the pattern; it is stable as long as the tag does not move (not tested with a real tag, see open questions).
- `upgrade_configured_git_marketplace` (`marketplace_upgrade.rs`): compare the installed metadata snapshot (marketplace config plus revision) with the configured entry plus remote revision; if equal return without changes; otherwise clone into a staging directory, check out the ref, validate the marketplace name, write metadata, activate the new root [S3]. Because the compared metadata is built from the configured entry, changing `ref` in config forces a re-sync (verified locally).
- `clone_git_source`: plain clone, then `git checkout <ref>` (no shallow or ref-specific fetch), so a branch, tag or any SHA reachable from the clone's refs works for the clone; with `sparse_paths` it uses `--filter=blob:none --no-checkout`, then `sparse-checkout set`, then checkout [S4].
- The startup task `plugins-marketplace-auto-upgrade` runs `upgrade_configured_marketplaces_for_config_with_mode(..., PluginGitMode::Automatic, ...)`, which upgrades all configured git marketplaces and, when a root changed, force-reinstalls the configured plugins' cache [S8]. With a pinned tag or SHA this is a no-op each start apart from one `ls-remote` for tags and branches (none for a full SHA) [S4, S8]. Open question 4 of the earlier note (timing and opt-out) is not resolved here: the startup trigger is confirmed, the interval and any disable switch were not traced.
- The installed marketplace lives at `$CODEX_HOME/.tmp/marketplaces/<marketplace name>` (observed; `marketplace_install_root(codex_home).join(name)` in source [S3]). One install per marketplace name per `CODEX_HOME`.

### Documentation

- Codex config reference lists `marketplaces.<name>.source_type`, `.source`, `.ref`, `.sparse_paths`, and the sentence about where marketplaces can be defined. It does not mention automatic upgrades or `last_revision`/`last_updated` [S1]. The page's text was larger than the fetch window; only the first 100000 characters were read, and the marketplace section was in that part.
- OpenAI's plugin docs (Build plugins) were not re-read for pinning; they defer key tables to the config reference, as noted earlier [earlier note, S4].

### Claude Code symmetry

- Plugin entry sources `github`, `url`, `git-subdir` take `ref` (branch or tag) and `sha` (full 40-character commit SHA); with both set, `sha` is checked out [S7].
- Marketplace sources `github` and `git` take `ref` (branch or tag, default branch) [S7]. `claude plugin marketplace add owner/repo@ref` or `#ref` pins the marketplace itself [S7, S11]. A marketplace-level `sha` is not documented [S7].
- Versions: "users get a new copy only when the plugin's computed version differs", from `plugin.json` `version`, then the entry `version`, then the commit; unchanged `version` with new commits does not update [S11]. Claude documents "Hold users on one version" via `ref`/`sha` on plugin entries and `#<ref>` on the add command; "Claude Code has no release-channel concept" and "a ref that moves without a version change leaves users on the cached copy" [S11].
- Claude Code auto-update is off by default for third-party marketplaces and is opt-in per marketplace [S11]; this repo sets `"autoUpdate": true` in `.claude/settings.json`.

### Local verification (codex-cli 0.162.1, Windows, isolated `CODEX_HOME` under the session scratchpad; the real `~/.codex` was not touched)

All runs used the public repo `hsmejky/ai-plugin-manager`, whose `.claude-plugin/plugin.json` is `0.2.0` at commit `a157af3ed15c14d20d8a181cba76fcd7f19dff82` and `0.2.1` at `main` (`df214539a5205dae7b4ae6b3b32f9bb6d225b8af`).

| # | Action | Result |
|---|--------|--------|
| 1 | `codex plugin marketplace add hsmejky/ai-plugin-manager --ref <full SHA of 0.2.0>` | Config gets `source_type = "git"`, `source = "https://github.com/hsmejky/ai-plugin-manager.git"`, `ref = "<sha>"`. Marketplace checked out at that SHA; manifest version 0.2.0. |
| 2 | `codex plugin marketplace upgrade ai-plugin-manager` with the pin unchanged | Prints "Upgraded marketplace ... to the latest configured revision" but the checkout stays at the pinned SHA (the message is printed even when nothing changed). |
| 3 | Edit `ref` to `main`, run `upgrade` | Checkout moves to `main`; manifest 0.2.1. |
| 4 | Edit `ref` to a short SHA (`a157af3`), run `upgrade` | Fails: "git ls-remote returned empty output for marketplace source"; checkout stays at 0.2.1. |
| 5 | `codex plugin marketplace add hsmejky/ai-plugin-manager@a157af3` (short SHA at add time) | Succeeds and writes `ref = "a157af3"`; the subsequent `upgrade` then fails as in 4. A short SHA is therefore unsafe in config. |
| 6 | Trusted temp project with only `.codex/config.toml` (`ref` = full SHA of 0.2.0, plugin enabled), no user-level marketplace; `upgrade ai-plugin-manager` from inside the project | The project-level declaration is honoured: marketplace at 0.2.0, plugin cache `plugins/cache/ai-plugin-manager/ai-plugin-manager/0.2.0`. |
| 7 | Change that project's `ref` to `main`, `upgrade` again | Marketplace at 0.2.1; cache directory 0.2.0 replaced by 0.2.1. |

Not verified: a real tag pin (the repo has no tags; a local `file://` source is rejected by the 0.162.1 parser, "invalid marketplace source format" [S10], so a throwaway tagged repo could not be served without hosting it); the automatic startup upgrade itself (running a Codex session needs authentication, which the isolated `CODEX_HOME` lacks); behaviour when two projects declare different `ref` values for the same marketplace name.

## Implications for this repo

- `AGENTS.md`, "Plugin versioning": the rule stays correct for Claude Code ("Claude updates only when that string changes"). Its sentence "Codex follows the marketplace HEAD" holds only for unpinned marketplaces; a project that pins `ref` makes Codex follow that ref instead. No change is needed unless the project adopts pins; if it does, add that bumping `version` should be paired with a tag.
- `docs/agents/plugin-authoring.md`, "Version drift": add that pinning a Codex marketplace with `ref` (tag or full SHA, never a short SHA) removes drift only if the tag is created on the version-bump commit and the pin is moved on both Hosts, at the price of no automatic Codex updates. This is a doc change for a later issue; this note edits nothing.
- `docs/agents/claude-codex-sharing.md`, Project setup table: the `[marketplaces.<name>]` row lists `source_type` and `source`; `ref` is now documented [S1] and works from a trusted project config (verification 6). It can be mentioned as optional. The "Hosts' versions then drift" wording stays valid.
- `check-setup`: `skills/check-setup/scripts/declarations.mjs` builds the Codex declaration from `source_type` and `source` only and the Claude one from `source`, so `ref` (and Claude's `ref`) is ignored by P-checks comparing sources. A pinned Codex marketplace paired with an unpinned Claude one would pass the "same source" check while the Hosts can differ; M5 (installed versions) would still catch a version difference. Optional follow-up: warn when only one Host pins a ref, or when a Codex `ref` is a short SHA (verification 4 and 5: it breaks `upgrade` and the automatic upgrade path with a logged warning [S8]).
- Tags: the plugin has no release tags. Both a tag pin and Claude's `<plugin>--v<version>` convention for dependents [S11] need tags; creating tags at version-bump commits would be a release-process change.

## Open questions

1. Real tag behaviour: does `git ls-remote <source> <tag>` pick the intended line for annotated and lightweight tags, and for a tag name that also matches a branch or another tag's suffix? The source takes the first line only [S4]. Needs a repo with a tag; not available here.
2. Does the startup auto-upgrade run for a project-level pin without a user-level declaration, and on what schedule? The code path exists [S8] and project config is honoured by the manual command (verification 6); an authenticated session was not run. Also unresolved: disable switch and interval (earlier note, open question 4).
3. Two projects with different `ref` values for the same marketplace name share one install directory per `CODEX_HOME` (observed install path; `install_root.join(name)` [S3]). Expected consequence, not tested: each session's upgrade re-syncs the marketplace to that project's ref and refreshes the plugin cache, so the two projects can thrash each other. Relevant if users keep several projects on different pins.
4. `last_revision` and `last_updated` are written by Codex into config (field docs in [S2]); in the verification runs the user config showed only `source_type`, `source`, `ref`. Where the snapshot metadata actually lives (a file in the marketplace root, `installed_marketplace_metadata_path`) was read in source only [S3].
5. Does Claude Code's marketplace-level `ref` (tag) in `extraKnownMarketplaces` behave as expected with `"autoUpdate": true`, and what does Claude do when the tag moves? Documented only generally [S7, S11]; not tested here.
6. The docs sentence for a local marketplace names only `.agents/plugins/marketplace.json` [S1], while source accepts `.claude-plugin/marketplace.json`; see the earlier note, section 1.

## Sources

All checked 2026-10-14.

- S1. OpenAI, Codex config reference, `marketplaces.<name>.*` keys and "Marketplaces can be defined in system, cloud-managed, user, or trusted-project config.toml". https://learn.chatgpt.com/docs/config-file/config-reference (`developers.openai.com/codex/config-reference` redirects here).
- S2. openai/codex `codex-rs/config/src/types.rs`, `MarketplaceConfig` and `MarketplaceSourceType`. https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/config/src/types.rs
- S3. openai/codex `codex-rs/core-plugins/src/marketplace_upgrade.rs` (`parse_configured_git_marketplace`, `upgrade_configured_git_marketplace`) and `marketplace_upgrade/activation.rs` (`installed_marketplace_metadata_matches`). https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/core-plugins/src/marketplace_upgrade.rs
- S4. openai/codex `codex-rs/core-plugins/src/marketplace_upgrade/git.rs` (`git_remote_revision`, `clone_git_source`, `is_full_git_sha`). https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/core-plugins/src/marketplace_upgrade/git.rs
- S5. Claude Code docs, Plugin loading reference (versions and updates; see also the earlier note, S9). https://code.claude.com/docs/en/plugins/loading
- S6. This repo, `.claude-plugin/marketplace.json` and `.claude-plugin/plugin.json` (`"source": "./"`, `version`), and `.claude/settings.json`, `.codex/config.toml` (marketplace declarations).
- S7. Claude Code docs, Marketplace reference ("Plugin sources" `ref`/`sha`; "Marketplace sources" `ref`). https://code.claude.com/docs/en/plugins/marketplace-reference
- S8. openai/codex `codex-rs/core-plugins/src/manager.rs`, `maybe_start_plugin_startup_tasks_for_config` (thread `plugins-marketplace-auto-upgrade`) and `upgrade_configured_marketplaces_for_config_with_mode`. https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/core-plugins/src/manager.rs
- S9. Local CLI help: `codex plugin marketplace add --help` (codex-cli 0.162.1: `--ref`, `--sparse`, source forms `owner/repo[@ref]`).
- S10. openai/codex `codex-rs/core-plugins/src/marketplace_add/source.rs`, `parse_marketplace_source`, `split_source_ref`, `is_git_url`. https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/core-plugins/src/marketplace_add/source.rs
- S11. Claude Code docs, Host and maintain a marketplace ("Keep users up to date", "Release a new version", "Hold users on one version", "Run release channels", "Host your marketplace" for `#<ref>`). https://code.claude.com/docs/en/plugins/host-marketplace
- Issue #26 body: https://github.com/hsmejky/ai-plugin-manager/issues/26 (the drift observation, ai-plugin-manager 0.2.1 in Claude Code versus 0.2.0 in Codex, is the issue author's own report and was not re-observed).
- Local experiments: codex-cli 0.162.1 on Windows 11 with `CODEX_HOME` set to directories under the session scratchpad, against `https://github.com/hsmejky/ai-plugin-manager.git` (public).
