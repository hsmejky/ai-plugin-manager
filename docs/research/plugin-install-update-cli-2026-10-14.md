# Non-interactive plugin install and update in Claude Code and Codex

Research note for issue #58 (blocks #60). Run on 2026-10-14, Windows 11, Claude Code 2.1.299 and codex-cli 0.162.1 (both installed, both the versions the repository was last verified on). Terms follow `GLOSSARY.md`. M3, M4 and M5 are the Machine setup checks in `skills/check-setup/checklist.md`.

Method. Every live command ran only with temporary homes: Claude Code with `CLAUDE_CONFIG_DIR`, `HOME` and `USERPROFILE` pointing into a throwaway directory, Codex with `CODEX_HOME` pointing into one, all inside a scratch copy of this repository's `.claude/settings.json` and `.codex/config.toml`. No Host was logged in in those homes (no authentication was supplied). The real `~/.claude` and `~/.codex` were not touched. Commands ran with stdin from `/dev/null` (non-TTY). Paths in outputs are shortened to `<tmp>`. For update behaviour I used a local throwaway marketplace `lm` (plugin `lp`, versions 1.0.0 then 1.0.1) because I cannot push to the real repository; the limits of that substitute are marked below.

Labels: **[run]** observed here, **[doc]** read in official docs, **[source]** read in Host source (via earlier repository notes), **[unverified]**.

## Short answers

| Question | Claude Code 2.1.299 | codex-cli 0.162.1 |
|---|---|---|
| 1. Fully non-interactive path to M3/M4/M5 from Project setup only | Yes for M3, M4, M5: per declared marketplace `claude plugin marketplace add <source> --scope project`, then `claude plugin install <plugin>@<marketplace> --scope project`. Not for M2 (trust), see below. | Yes, once the project is trusted: one `codex plugin marketplace upgrade` (no `plugin add`). Trust must be written to the user config by hand (or by an interactive prompt). |
| 2. Where it writes | `marketplace add --scope project` rewrites the committed `.claude/settings.json` and drops `autoUpdate` from the added marketplace's entry. | Nothing in the project; user config gets `[plugins."id"] enabled = true` only from `plugin add`. |
| 3. Update needs a second step | `marketplace update <name>`, then `plugin update <id>` (restart to apply). | `marketplace upgrade` alone refreshes the marketplace and the installed plugin cache. No `plugin update` exists. |
| 4. Idempotent | Yes, exit 0 everywhere; "already done" is visible in JSON. | Yes, exit 0; "already done" visible for `marketplace add` and `upgrade`, not for `plugin add`/`remove`. |
| 6. Prompts / auth | No prompt in my runs; network needed for GitHub sources; no login needed. `-y` only for `command`-source plugins. | No prompt; network for Git sources; no login needed. |
| 7. Takes effect | Next session start or `/reload-plugins`. | Next session start (not tested interactively). |

## Per Host

### Claude Code

**1. Command sequence [run].** From a directory containing only the committed `.claude/settings.json` (both marketplaces declared, `enabledPlugins` set), with an empty `CLAUDE_CONFIG_DIR`:

```
claude plugin marketplace list --json        -> []   (exit 0)
claude plugin install ai-plugin-manager@ai-plugin-manager --scope project --json
  -> {"command":"install","outcome":"failed",...,"message":"Plugin \"ai-plugin-manager\" not found in marketplace \"ai-plugin-manager\". Your local copy may be out of date — try `claude plugin marketplace update ai-plugin-manager`.","failureCode":"not_found"}   (exit 1)
claude plugin marketplace update ai-plugin-manager --json
  -> {"command":"marketplace-update","marketplace":"ai-plugin-manager","outcome":"failed","message":"Marketplace 'ai-plugin-manager' not found. ...","failureCode":"not_configured"}   (exit 1)
```

This reproduces the finding in `docs/agents/claude-codex-sharing.md`. The working shell sequence, one `marketplace add` per declared marketplace and then one `install` per enabled plugin:

```
claude plugin marketplace add hsmejky/ai-plugin-manager --scope project --json   (exit 0, outcome ok)
claude plugin marketplace add mattpocock/skills --scope project --json            (exit 0, outcome ok)
claude plugin install ai-plugin-manager@ai-plugin-manager --scope project --json  (exit 0, "Successfully installed plugin ... (scope: project)")
claude plugin install mattpocock-skills@mattpocock --scope project --json          (exit 0)
```

Afterwards `claude plugin marketplace list --json` listed both (keys `name`, `source`, `repo`, `installLocation`) and `claude plugin list --json` listed both plugins (`id`, `version` 0.5.1 and 1.3.1, `scope` `project`, `enabled` true, `installPath`, `installedAt`, `lastUpdated`, `projectPath`, `projectEnabled` true). No `.claude.json` `projects` entry was created, so the install does not need or record workspace trust. M3, M4 and the Claude side of M5 therefore pass. The `<source>` for each `marketplace add` has to be derived from the project's `extraKnownMarketplaces` entry (`github` + `repo` -> `owner/repo`); the `git`, `url` and `directory` source forms need other argument forms [doc: install page, "Add a marketplace" table].

Limit on "one call": M2 (trust) is outside this sequence. Docs: project-scope plugins load only after the workspace trust dialog for that folder, "Trusting a parent folder or running with `-p` isn't enough" [doc: https://code.claude.com/docs/en/plugins/loading, "Plugins shared through a repository"]. Whether hand-writing `projects[<path>].hasTrustDialogAccepted` in `~/.claude.json` satisfies it was not tested [unverified]. So a shell sequence yields the install, not a plugin that loads in the next session, unless the folder was already trusted.

The documented one-step alternative also works non-interactively [run]: `claude plugin install ai-plugin-manager --marketplace hsmejky/ai-plugin-manager --json` -> `scope":"user"`, and it declared the marketplace and `enabledPlugins` in the user `settings.json` of the temp config dir (exit 0). That is a user-scope setup, not the project one [doc: install page, "Add and install from your shell", 2.1.292+].

Why not rely on the interactive background registration [doc: loading page, "Plugins and marketplaces that aren't on disk at session start"]: it needs a running interactive session; `claude -p` does not do it (sharing doc; the install page says `/plugin` is unavailable in `-p`).

**2. Where each command writes [run].**
- `marketplace add --scope project`: `.claude/settings.json` `extraKnownMarketplaces` (rewritten), plus `<CLAUDE_CONFIG_DIR>/plugins/known_marketplaces.json` and `plugins/marketplaces/<name>/`. Without `--scope` the default is user scope [`--help`].
- Isolated cause of the dropped `autoUpdate` (the open point in the sharing doc): in a fresh config dir with the committed file, one `claude plugin marketplace add hsmejky/ai-plugin-manager --scope project` removed `"autoUpdate": true` from that marketplace's entry only; the other marketplace's entry (`mattpocock`) kept it. A later `install --scope project` changed nothing further. So `marketplace add --scope project` drops it, `install` does not. The doc statement that the committed `.claude/settings.json` "takes precedence" over a CLI-added marketplace is contradicted. The second, repeated `add` reported `already on disk — declared in project settings`.
- `install --scope project`: `enabledPlugins` stays as committed (content unchanged), `installed_plugins.json` and `plugins/cache/<marketplace>/<plugin>/<version>/` in the config dir.
- Line endings: with a CRLF copy of the committed file, every line break was still CRLF after `marketplace add` and after `install` (one line fewer because `autoUpdate` went). The sharing doc's "rewrites with LF" was not reproduced on 2.1.299 for a CRLF input; with LF input there is nothing to observe. The doc claim is unverified as written (its version is not recorded, `verification.md`).

**3. Update [run + doc].** With a local `directory` marketplace (`lm`), after bumping the manifest version to 1.0.1 in the marketplace directory:
- `claude plugin update lp@lm --scope project --json` -> `"updateOutcome":"updated","oldVersion":"1.0.0","newVersion":"1.0.1"`, message ends "Restart to apply changes."; `marketplace update lm` before it was not needed for a `directory` source (it is read in place; docs: "A marketplace added from a local `file` or `directory` source has no copy" [doc: loading page, "Find plugins on disk"]). So this run does not show whether a GitHub or git marketplace needs `marketplace update` first. Docs: `claude plugin install name@marketplace` refreshes that marketplace first; `claude plugin marketplace update` with no name "refreshes every marketplace's listing but leaves your installed plugins at their current versions" [doc: install page, "Update plugins now"]. So for github/git sources the sequence is `marketplace update <name>` then `plugin update <id>`. An earlier repository run did that on a github source with a tag `ref` (`verification.md`, Claude Code ref row). I could not host a git or github marketplace here (`file://` and `git://` sources are rejected: `Invalid marketplace source format`), so "does `plugin update` alone refresh a github catalog" is [unverified].
- No version change: manifest `version` unchanged but content changed -> `update` reports `lp is already at the latest version (1.0.1).` (`updateOutcome":"up_to_date"`). Consistent with the documented rule that a pinned manifest `version` keeps the cached copy [doc: loading page, "Versions and updates"]. For this repository's plugin the manifest pins `version`, hence the bump rule in `AGENTS.md`.
- Pinned `ref`: `marketplace add owner/repo#<tag>` accepts a branch or tag; a tag `ref` followed `marketplace update`/`plugin update` to the tag's commit (earlier run, `verification.md`; not rerun). A `directory` source takes no ref.
- Automatic update: only interactive sessions, after the first message plus up to 10 minutes, for marketplaces with `autoUpdate` [doc: loading page, "When auto-update runs"]. The `autoUpdate` loss above removes a marketplace from that.

**4. Idempotency [run].** `marketplace add` repeated: exit 0, `outcome":"ok"`, message `Marketplace '<name>' already on disk — declared in project settings` (no distinct field; message text only). `install` repeated: exit 0, `outcome":"ok"`, message `Plugin "<id>" is already installed (scope: project)` plus fields `installedVersion` and `availableVersion`. `update` current: exit 0, `updateOutcome":"up_to_date"`, `oldVersion` = `newVersion`. `marketplace update <name>` repeated: exit 0, `ok`.

**5. `--json` [run].** One JSON object on one line on stdout for `install`, `update`, `marketplace add` and `marketplace update`; fields `command`, `outcome` (`ok` or `failed`), `plugin`/`pluginId`/`marketplace`, `scope`, `message`, and on failure `failureCode` (seen: `not_found`, `not_configured`, `invalid_source`); `update` adds `updateOutcome` (`updated`, `up_to_date`) with versions; `install` adds `installedVersion`/`availableVersion` when already installed. Exit 1 on failure with the same JSON (and without `--json` a human error). `marketplace update --json` without a name exits 1 (`--json needs a marketplace name`). In `marketplace add --json` the object is the last stdout line and earlier progress lines are inside `message`. `list --json` commands print a JSON array (no wrapper). "Already done" is `outcome: ok` plus text or `updateOutcome`; there is no `alreadyInstalled` boolean [run]. Failure codes are a fixed vocabulary only as far as seen; the full list is [unverified].

**6. Prompts, network, auth.** No prompt appeared with stdin closed. `--yes` is needed only when a plugin or marketplace entry declares a `command` source or `headersHelper` ("required when stdin or stdout is not a TTY", `claude plugin install --help`; `--accept-command <sha256>` is the narrower form). Neither applies to `ai-plugin-manager` or `mattpocock-skills`. GitHub sources are cloned over HTTPS or SSH with the machine's git credentials and no prompts, so a private repository fails instead of asking [doc: install page, "Add a private marketplace"]. No Claude login was present in the temp home and all commands worked [run].

**7. Takes effect.** Installed plugins "load the next time you start Claude Code, or when you run `/reload-plugins` in a session that's already open"; `plugin update` "restart required to apply" [doc: install page "Install from your shell"; `--help`]. A running session keeps the versions it loaded.

**8. Updating `ai-plugin-manager` while its skill runs.** Docs: the old version directory is kept (marker `.orphaned_at`, removed by background cleanup 14 days later) "so a session that already loaded the old version keeps running", and hook, MCP and LSP paths keep the previous version's path until `/reload-plugins` [doc: loading page, "Cleanup of previous versions", "When auto-update runs"]. [run]: after `plugin update`, the cache held both `1.0.0` and `1.0.1`. So updating during a running skill is safe for the running session; only `${CLAUDE_PLUGIN_ROOT}` paths read after a reload change.

### Codex

**1. Command sequence [run].** Temp `CODEX_HOME`, project config copied from this repository, project not trusted:
- `codex plugin marketplace list --json` -> `{"marketplaces": []}` (exit 0); `codex plugin add ai-plugin-manager@ai-plugin-manager --json` -> `Error: plugin \`ai-plugin-manager\` was not found in marketplace \`ai-plugin-manager\`` (exit 1). The untrusted project's declarations are ignored.
- After writing `[projects.'<lowercased windows path>'] trust_level = "trusted"` to `$CODEX_HOME/config.toml`: `codex plugin marketplace list --json` and `codex plugin add` still fail (exit 1) with `marketplace root does not contain a supported manifest` because the declared Git marketplaces are not yet cloned.
- `codex plugin marketplace upgrade --json` (run from the project directory) -> exit 0, `{"selectedMarketplaces":["ai-plugin-manager","mattpocock"],"upgradedRoots":[<two roots>],"errors":[]}`. It cloned both marketplaces, and `codex plugin list --json` then already showed both plugins with `"installed": true, "enabled": true` (versions 0.5.1 and 1.3.1) and cache directories `plugins/cache/<marketplace>/<plugin>/<version>/`, without any `plugin add`. M3, M4 and the Codex side of M5 pass after this one call.
- So the Codex sequence is: (a) trust the project (user config entry; the interactive prompt writes the same key, see sharing doc), (b) `codex plugin marketplace upgrade` from inside the project. Trust is a hand-written file edit, not a Codex command.
- Alternative without a project, user-level [run]: `codex plugin marketplace add hsmejky/ai-plugin-manager --json` then `codex plugin add ai-plugin-manager@ai-plugin-manager --json` wrote `[marketplaces.ai-plugin-manager] source_type = "git"` and `[plugins."ai-plugin-manager@ai-plugin-manager"] enabled = true` to the user config.

**2. Where it writes [run].** `marketplace upgrade` wrote no config at all (user config only had the trust entry; the project's `.codex/config.toml` stayed byte-identical to the committed file). Its output is `<CODEX_HOME>/.tmp/marketplaces/<name>` and the plugin cache. `marketplace add` and `plugin add` write the user config as above. `marketplace add` of a local path writes `source_type = "local"` with a `\\?\` prefixed path, and it replaced the project's git declaration of the same name in my run, so do not use a path to re-add a declared marketplace.

**3. Update [run].** In a trusted project with a Git marketplace (local repo as Git source), after committing version 1.0.1: `codex plugin list` still showed 1.0.0; `codex plugin marketplace upgrade lm --json` returned the root in `upgradedRoots`, the cache directory `1.0.0` was gone and only `1.0.1` remained, and `codex plugin list --json` showed 1.0.1. A content-only commit with the same `version` also returned `upgradedRoots` and the cached `SKILL.md` contained the new line, so the cache was refreshed in place without a version change. No `plugin add` rerun is needed, and there is no `plugin update` command [`codex plugin --help`; `codex plugin upgrade` -> `unrecognized subcommand`]. Source explains it: after an upgrade that changed a root, Codex force-reinstalls the cache for all configured plugin keys, ignoring `version` [source: `docs/research/codex-marketplace-auto-upgrade-2026-10-14.md`, `plugin-authoring-both-hosts.md`; `openai/codex` `rust-v0.162.1` `codex-rs/core-plugins/src/manager.rs`]. Pinned `ref`: with `ref = "v1.0.0"` added to the project config, `upgrade` moved the marketplace to the tag (cache back to 1.0.0, `upgradedRoots` listed); later upgrades with the tag unchanged (even after new commits on `main`) returned `upgradedRoots: []` and the human text `Marketplace \`lm\` is already up to date.` Short SHAs break later upgrades (`verification.md`, P8). Upgrade is also automatic at session start in a trusted project (earlier notes; not rerun here).

**4. Idempotency [run].**
- `marketplace add` twice: first `"alreadyAdded": false`, second `"alreadyAdded": true`, both exit 0 (human: `Marketplace \`ai-plugin-manager\` is already added from <url>.`).
- `plugin add` twice: identical JSON both times, exit 0, no "already installed" field.
- `marketplace upgrade` with nothing new: `"upgradedRoots": []`, exit 0. Right after `marketplace add` plus `plugin add`, the first `upgrade` still listed the root in `upgradedRoots` (add does not record the revision), so a non-empty `upgradedRoots` does not prove the content changed (consistent with the warning in `verification.md`).
- `plugin remove` of an installed plugin and again of a removed plugin: both exit 0 with the same JSON. The `[plugins]` entry was removed from user config.
- Errors: unknown plugin -> `Error: plugin \`nosuch\` was not found in marketplace \`<m>\`` exit 1; unknown marketplace for upgrade -> ``Error: marketplace `nosuch` is not configured as a Git marketplace`` exit 1.

**5. `--json` [run].** `marketplace add`: `{marketplaceName, installedRoot, alreadyAdded}`. `plugin add`: `{pluginId, name, marketplaceName, version, installedPath, authPolicy}`. `marketplace upgrade`: `{selectedMarketplaces, upgradedRoots, errors}` (the exit code with a non-empty `errors` was not tested [unverified]). `plugin list`: `{installed:[{pluginId,name,marketplaceName,version,installed,enabled,source,marketplaceSource,installPolicy,authPolicy}], available:[]}`. `marketplace list`: `{marketplaces:[{name,root,marketplaceSource}]}`. Failures print a plain `Error: ...` line (stderr/stdout mix not separated here) with exit 1, not JSON [run].

**6. Prompts, network, auth [run].** No prompts, no login in the temp home. `upgrade` and `marketplace add` need network for Git sources. Every invocation printed `WARNING: proceeding, even though we could not create PATH aliases: Refusing to create helper binaries under temporary dir` because `CODEX_HOME` was under the temp directory; harmless. My shell merged stdout and stderr, so which stream carries it is [unverified]; a script that parses `--json` output should read stdout only.

**7. Takes effect.** The next Codex session reads the cache; not tested interactively (`verification.md` records the first session on a fresh machine may list nothing).

**8. Updating while a skill runs.** [run]: the previous version directory was deleted from the cache by the refresh (only the new version directory remained). A running skill that reads files under the old `plugins/cache/.../<version>/` path after the refresh can lose them; on Windows an open file may block the deletion [unverified]. Safe pattern: do not run a plugin refresh from inside the skill that lives in that plugin; read the skill's files first or run the refresh in a fresh process after the skill finishes. This differs from Claude Code, which keeps the old directory for 14 days.

## Consequences for #60 (not decisions)

- Claude Code: the shell sequence needs the source of each declared marketplace, and it drops `autoUpdate` for each marketplace added with `--scope project`; the skill must restore it (or use `--scope user`, which leaves the committed file alone, and then the project file still declares the marketplace). Trust (M2) remains an interactive step or an unverified file edit.
- Codex: a single `marketplace upgrade` in a trusted project covers M3, M4, M5; it has no JSON field proving a content change, so compare `plugin list --json` versions before and after.
- Neither Host can update `ai-plugin-manager` "in one call" for the whole machine: Claude Code updates per plugin, Codex per marketplace.

## Open unknowns

1. Claude Code `plugin update` alone, on a github or git marketplace without a prior `marketplace update` [unverified; no hostable git source].
2. Whether hand-writing `hasTrustDialogAccepted` in `~/.claude.json` satisfies the Claude trust dialog [unverified].
3. Interactive-session effect timing for Codex, and Codex behaviour on Linux/macOS [unverified].
4. Whether the Windows open-file case blocks Codex's old-version deletion [unverified].
5. Claude failure-code vocabulary and Codex `upgrade` exit code when `errors` is non-empty [unverified].
6. The CRLF-to-LF rewrite in the sharing doc: not reproduced for CRLF input on 2.1.299.

## Sources

- Claude Code docs, read 2026-10-14: https://code.claude.com/docs/en/plugins/install, https://code.claude.com/docs/en/plugins/loading
- `claude plugin install|update|list --help`, `claude plugin marketplace add|update --help` (Claude Code 2.1.299), `codex plugin --help`, `codex plugin add|list|remove --help`, `codex plugin marketplace upgrade --help` (codex-cli 0.162.1)
- Repository: `docs/agents/claude-codex-sharing.md`, `docs/agents/verification.md`, `docs/research/codex-marketplace-auto-upgrade-2026-10-14.md`, `docs/research/plugin-authoring-both-hosts.md`, `docs/research/codex-marketplace-ref-pinning-2026-10-14.md`, `skills/check-setup/checklist.md` (M2 to M5)
- Codex source via those notes: `openai/codex` tag `rust-v0.162.1`, `codex-rs/core-plugins/src/manager.rs`. Not re-read in this run.
- Not read: the Claude Code CHANGELOG and the Codex release notes (the version gates cited come from the install page).
