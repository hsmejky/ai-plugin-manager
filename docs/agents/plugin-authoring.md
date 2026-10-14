# Authoring a Shared plugin for Claude Code and Codex

How to create and maintain a Shared plugin that both Hosts install from this marketplace. Why this repository is one marketplace for both Hosts is recorded in [ADR 0001](../adr/0001-repo-as-marketplace-for-both-hosts.md) and not repeated here. What is shared and how each Host's Project setup and Machine setup look is in the [sharing doc](claude-codex-sharing.md).

Codex facts in this doc come from the [research note](../research/plugin-authoring-both-hosts.md) (sources checked on 2026-10-14 against codex-cli 0.160.1 and `openai/codex` tag `rust-v0.162.1`); each one links to the section that cites its primary source. Claude Code facts are shown by this repository's files or cited from the same note or the Claude Code docs.

## Layout

```
.claude-plugin/marketplace.json   marketplace manifest, read by both Hosts
.claude-plugin/plugin.json        plugin manifest, read by both Hosts
skills/<skill>/SKILL.md           one folder per skill
```

Both Hosts read this layout. Codex reads `.claude-plugin/marketplace.json` as a compatibility path (its native one is `.agents/plugins/marketplace.json`) and falls back to `.claude-plugin/plugin.json` when the plugin has no root `plugin.json` with an `agent-plugins.org` `$schema` and no `.codex-plugin/plugin.json` ([research §1](../research/plugin-authoring-both-hosts.md#1-how-the-host-discovers-and-reads-a-marketplace), [§2](../research/plugin-authoring-both-hosts.md#2-does-codex-need-its-own-manifest)).

No Codex manifest is needed for the current plugin, and none is added here ([research: recommendation](../research/plugin-authoring-both-hosts.md#does-a-codex-manifest-look-necessary-recommendation-only)). Adding one would be a new decision on top of ADR 0001, not an authoring step. Revisit it when the plugin needs Codex-only UI metadata or hooks, or if Codex drops the `.claude-plugin/` fallback.

## Marketplace manifest

`.claude-plugin/marketplace.json` lists the plugins this marketplace offers.

| Field | What it does |
|---|---|
| `name` | Marketplace ID: the `<marketplace>` in `<plugin>@<marketplace>`. Consuming projects use it as the `extraKnownMarketplaces` key (Claude Code) and the `[marketplaces.<name>]` key (Codex); in this repo the Codex key equals the marketplace's own name (observed in this repo, research S14 in the [sources](../research/plugin-authoring-both-hosts.md#sources); unverified: [open question 3](../research/plugin-authoring-both-hosts.md#open-questions)). Renaming it breaks every consuming project. |
| `owner` | Marketplace owner. |
| `description` | Marketplace description. |
| `plugins[]` | One entry per plugin. |
| `plugins[].name` | Plugin name: the `<plugin>` in `<plugin>@<marketplace>`. Keep it equal to the plugin manifest `name`. |
| `plugins[].source` | Where the plugin lives. `"./"` means the repository root. Codex resolves local `./` paths against the marketplace root, requires them to stay inside it, and skips an unresolvable entry ([research §1](../research/plugin-authoring-both-hosts.md#1-how-the-host-discovers-and-reads-a-marketplace)). In Claude Code a relative-path plugin loads from the marketplace itself, with no install record of its own ([research §1](../research/plugin-authoring-both-hosts.md#1-how-the-host-discovers-and-reads-a-marketplace)). |
| `plugins[].description` | Entry description. |
| `plugins[].category` | Category. Codex reads it; OpenAI's docs call it required, Codex's source defaults it ([research §1](../research/plugin-authoring-both-hosts.md#1-how-the-host-discovers-and-reads-a-marketplace)). Keep it set. |

Codex also reads a `policy` per entry; OpenAI's docs call it required, Codex's source treats it as optional and this repo's entry omits it ([research §1](../research/plugin-authoring-both-hosts.md#1-how-the-host-discovers-and-reads-a-marketplace)). Codex also keeps other entry keys as an inline fallback manifest when the plugin root has no manifest file ([research §1](../research/plugin-authoring-both-hosts.md#1-how-the-host-discovers-and-reads-a-marketplace)). In Claude Code, entry fields combine with `plugin.json` according to the entry's `strict` flag ([research §1](../research/plugin-authoring-both-hosts.md#1-how-the-host-discovers-and-reads-a-marketplace)).
## Plugin manifest

`.claude-plugin/plugin.json` describes the plugin. Claude Code requires only `name` when the file exists and strips unknown top-level keys with a validation warning ([research §2](../research/plugin-authoring-both-hosts.md#2-does-codex-need-its-own-manifest)). Codex reads `name`, `version`, `description`, `keywords`, `skills`, `mcpServers`, `apps`, `hooks`, `interface` and `extensions`, and ignores other keys ([research §2](../research/plugin-authoring-both-hosts.md#2-does-codex-need-its-own-manifest)).

| Field | What it does |
|---|---|
| `name` | Plugin name and skill namespace in both Hosts (`<name>:<skill>`). A blank `name` makes Codex fall back to the directory name ([research §2](../research/plugin-authoring-both-hosts.md#2-does-codex-need-its-own-manifest)); always set it. |
| `version` | The string Claude Code compares to decide whether to update. See [Versioning](#versioning). Codex trims it and treats an empty value as unset ([research §2](../research/plugin-authoring-both-hosts.md#2-does-codex-need-its-own-manifest)). |
| `description` | Plugin description, read by both Hosts. |
| `author`, `repository` | Read by Claude Code; Codex ignores them ([research §2](../research/plugin-authoring-both-hosts.md#2-does-codex-need-its-own-manifest)). |
| `skills` | Skill folders, each a `./` path under the plugin root. See [Skills](#skills). |

Validate both manifests with `claude plugin validate <path>` before testing ([research §2](../research/plugin-authoring-both-hosts.md#2-does-codex-need-its-own-manifest)).

## Skills

### Layout and registration

Each skill is a folder `skills/<skill>/` with a `SKILL.md` whose frontmatter has `name` and `description`, as `skills/check-setup/SKILL.md` does. Keep `name` equal to the folder name.

Register every skill folder in the manifest `skills` array (`"./skills/<skill>"`). The Hosts treat that array differently ([research §2](../research/plugin-authoring-both-hosts.md#2-does-codex-need-its-own-manifest)):

- Claude Code adds the listed paths to its default `skills/` scan, so it would find an unlisted `skills/<skill>/` anyway.
- Codex replaces the default `skills/` root with the listed paths and scans each of them for `SKILL.md`, so an unlisted skill does not appear in Codex.

Per the research note, Codex replaces its default `skills/` root with the listed paths (from source reading, not run), so list every skill folder.

### Invoke a skill in each Host

Both Hosts namespace a plugin skill under the plugin manifest `name` ([research §2](../research/plugin-authoring-both-hosts.md#2-does-codex-need-its-own-manifest), [§3](../research/plugin-authoring-both-hosts.md#3-skill-registration-exposure-and-invocation)).

| | Claude Code | Codex |
|---|---|---|
| Explicit invocation | `/<plugin>:<skill>` | `$<plugin>:<skill>` |
| List skills | type `/` | `/skills` |
| Implicit use | | matched by description |

Codex's `$<plugin>:<skill>` form follows from its source and was observed with codex-cli 0.160.1; OpenAI's docs describe only `$skill`, `/skills` and implicit matching by description, not the plugin namespace ([research §3](../research/plugin-authoring-both-hosts.md#3-skill-registration-exposure-and-invocation)).

### User-only skills

The Hosts hide a skill from the model by different settings ([research](../research/codex-skill-visibility-invocation-policy.md)). To make a Shared plugin skill user-only (invoked only by `/<plugin>:<skill>` or `$<plugin>:<skill>`), set both: `disable-model-invocation: true` in `SKILL.md` for Claude Code, and `policy:` / `allow_implicit_invocation: false` in `skills/<skill>/agents/openai.yaml` for Codex. Codex ignores `disable-model-invocation`, and Claude Code ignores `agents/openai.yaml`, which is Codex-only metadata inside a Shared plugin. Setting only one leaves the skill model-invocable in the other Host; `check-setup --live` warns about it (L1).

### Naming and descriptions

- Write the description as what the skill does, then when to use it ("Use when …"), as `check-setup` does. Codex can pick a skill by its description alone ([research §3](../research/plugin-authoring-both-hosts.md#3-skill-registration-exposure-and-invocation)).
- Keep Host-specific syntax out of skill text. When a skill must tell the user how to run something, give both forms, as the README does for `check-setup`.

## Shared and Host-specific parts

From the [research note](../research/plugin-authoring-both-hosts.md#6-host-specific-versus-shared-plugin-parts):

| Part | Shared | Host-specific detail |
|---|---|---|
| `skills/*/SKILL.md` | Yes | none |
| `.claude-plugin/marketplace.json` | Yes | native for Claude Code, compatibility path for Codex |
| `.claude-plugin/plugin.json` | Yes | native for Claude Code, fallback for Codex |
| Manifest `name`, `version`, `description`, `skills` | Parsed by both | `skills` adds (Claude Code) or replaces (Codex) the default root |
| UI metadata | No | Claude Code `displayName`, `icon`; Codex `interface` |
| Project enablement | No | `.claude/settings.json` or `.codex/config.toml` ([sharing doc](claude-codex-sharing.md#per-host-setup)) |
| Update trigger | No | version string or marketplace git revision ([updates](#how-each-host-picks-up-updates)) |
| Invocation | No | `/` or `$` ([invocation](#invoke-a-skill-in-each-host)) |

Keep everything in the shared rows. A change that needs a Host-specific part (hooks, UI metadata, MCP servers) is outside the current plugin's scope; check it in both Hosts.

## Versioning

Every user-facing change to the plugin (skills, checklist, scripts, manifests) bumps `version` in `.claude-plugin/plugin.json` in the same commit. A docs-only change does not.

Why: Claude Code resolves a plugin's version from the manifest `version` first, and a pinned `version` keeps users on their cached copy until that string changes, however many commits are pushed ([research §4](../research/plugin-authoring-both-hosts.md#4-how-updates-are-picked-up)). A change pushed without a bump never reaches Claude Code users. For Codex the bump is harmless: its git upgrade path does not compare the `version` string ([research §4](../research/plugin-authoring-both-hosts.md#4-how-updates-are-picked-up)). If a Codex manifest is ever added, bump its `version` in the same commit too.

### Release tags

Each release is a git tag named `v<plugin version>` (`v0.5.0` for `version` `0.5.0`) on the commit that sets that `version`. The tag is what a consuming project pins ([pinning](#pin-a-marketplace-to-a-release)). The plain `v<version>` form was chosen over Claude Code's `<plugin>--v<version>` convention, which exists for dependents that resolve a plugin version inside a marketplace with several plugins ([host a marketplace](https://code.claude.com/docs/en/plugins/host-marketplace)); this repository's marketplace holds one plugin and nothing depends on it ([ADR 0002](../adr/0002-opt-in-marketplace-pinning-and-release-tags.md)). Use a lightweight tag (`git tag v0.5.0 <sha>`), not an annotated one: with an annotated tag, `codex plugin marketplace upgrade` re-synced the marketplace on every run instead of reporting it up to date (codex-cli 0.162.1, one observed run, see [verification](verification.md#manual-checks-of-host-behaviour)). The maintainer creates and pushes the tag after the version-bump commit is on `main`; agents do not create or push tags.

## How each Host picks up updates

### Claude Code

- Auto-update is off by default for third-party marketplaces. Consuming projects set `"autoUpdate": true` in the `extraKnownMarketplaces` entry, so Claude Code refreshes the marketplace and updates its plugins in the background, only in interactive sessions, after the first message plus a random delay of up to 10 minutes. `claude -p` does not trigger it. Updates apply on `/reload-plugins` or the next launch ([Claude Code: keep plugins updated](https://code.claude.com/docs/en/discover-plugins#keep-plugins-updated), [settings reference: extraKnownMarketplaces](https://code.claude.com/docs/en/settings-reference#extraknownmarketplaces), [research §4](../research/plugin-authoring-both-hosts.md#4-how-updates-are-picked-up)).
- Manual: `claude plugin update <plugin>@<marketplace>`, then restart. `claude plugin marketplace update <marketplace>` refreshes only the marketplace listing.

### Codex

- Codex follows the git marketplace's ref: an upgrade compares the remote revision of the configured ref with the installed snapshot, activates a new snapshot when they differ, and then reinstalls the configured plugins' cache without comparing `version` ([research §4](../research/plugin-authoring-both-hosts.md#4-how-updates-are-picked-up)).
- Automatic: Codex starts a marketplace auto-upgrade task at startup when plugins are enabled; a session started in the trusted project upgrades the marketplace (observed in the #33 and #35 notes and relied on by the M5 fix, codex-cli 0.162.1; not rerun for this edit); it runs once per Codex start, with no interval, and a marketplace pinned to a tag or branch `ref` still costs one `git ls-remote` per start, a full-SHA pin none ([#33 note](../research/codex-marketplace-auto-upgrade-2026-10-14.md), codex-cli 0.162.1, source `rust-v0.162.1`). The only off switch is `[features] plugins = false`, which disables all plugin support; do not use it to freeze versions, pin instead ([pinning](#pin-a-marketplace-to-a-release)).
- Manual: `codex plugin marketplace upgrade <marketplace>`. Where the marketplace is not configured as a git marketplace it fails with ``Error: marketplace `<marketplace>` is not configured as a Git marketplace`` ([research §4](../research/plugin-authoring-both-hosts.md#4-how-updates-are-picked-up)).

### Version drift

Claude Code updates when the `version` string changes; Codex updates when the marketplace's git ref moves. Commits pushed between two version bumps reach Codex users but not Claude Code users, so the Hosts can briefly run different plugin content. Short drift between releases is expected; bumping `version` with every user-facing change keeps it short.

Unpinned Codex drift closes by itself when all of these hold: the project is trusted; a Codex session starts in the project (drift persists while none does); the process lives until the upgrade finishes (about 2 s, a very short `codex exec` can end first); and the remote revision differs from the one recorded in `.codex-marketplace-install.json` ([#35 note](../research/codex-marketplace-auto-upgrade-project-config-2026-10-14.md), codex-cli 0.162.1, Windows). If it does not close, run `codex plugin marketplace upgrade <marketplace>` from the project. A project that wants Codex to change only on purpose can [pin a release](#pin-a-marketplace-to-a-release) instead.

## Pin a marketplace to a release

Pinning is an opt-in. The default Project setup stays unpinned: Codex follows the branch head, Claude Code follows the manifest `version` ([ADR 0002](../adr/0002-opt-in-marketplace-pinning-and-release-tags.md)). A project that wants both Hosts to change only on purpose pins both to the same [release tag](#release-tags) and moves both pins together per release.

Facts (codex-cli 0.162.1, source `rust-v0.162.1`, verified in an isolated `CODEX_HOME`; details in the [#26 note](../research/codex-marketplace-ref-pinning-2026-10-14.md)):

- Codex: `[marketplaces.<marketplace>]` in a trusted project's `.codex/config.toml` takes `ref`, a branch, tag or full 40-character commit SHA ([Codex config reference](https://developers.openai.com/codex/config-reference)). Never use a short SHA: it is accepted when added, but every later `upgrade` fails with `git ls-remote returned empty output for marketplace source` (#32).
- A pinned Codex marketplace never updates by itself: `codex plugin marketplace upgrade` and the start-up upgrade do nothing while `ref` is unchanged. Changing `ref` re-syncs the marketplace and the plugin cache at the next start in that project.
- Claude Code: the marketplace-source `ref` in `extraKnownMarketplaces` takes a branch or tag, not a SHA ([marketplace reference](https://code.claude.com/docs/en/plugins/marketplace-reference), checked 2026-10-14). A pin both Hosts share is therefore a tag. Claude Code still updates a plugin only when its computed `version` differs, so a tag on the version-bump commit is what makes the two Hosts agree.
- Both pins move together per release (edit `ref` in `.codex/config.toml` and in `.claude/settings.json`), or the Hosts drift. `check-setup` does not yet warn when only one Host pins or the refs differ.
- A tag pin on Codex was run against a throwaway local git repository (codex-cli 0.162.1): `ref` set to a tag installed that tag's content, and moving `ref` to a later tag, then to a branch, re-synced.

Unverified (labelled so in [verification](verification.md#manual-checks-of-host-behaviour)):

- Two projects with different `ref` values for one marketplace name share one Codex install per `CODEX_HOME` and may re-sync each other back and forth. Not run ([#26 note](../research/codex-marketplace-ref-pinning-2026-10-14.md), open question 3).
- Claude Code with a tag `ref` and `"autoUpdate": true`: not run, because Claude Code accepts only `owner/repo`, `https://` and `./path` sources and a local tagged repository could not be served without hosting it. Check it once the first release tag exists on `origin`.

## Test an unreleased change locally

Run the repository tests first: `node --test test/markdown-links.test.mjs test/doc-sync.test.mjs` and `node --test skills/check-setup/scripts/test/*.test.mjs`. Then `claude plugin validate .` from the repository root. On Claude Code 2.1.299 a good result ends with `Validation passed with warnings`: the warning `CLAUDE.md at the plugin root is not loaded as project context` is inherent to this layout (ADR 0001) and the Project setup needs that `CLAUDE.md`, so do not remove it. The advice to add a one-step install line (`/plugin install ai-plugin-manager --marketplace hsmejky/ai-plugin-manager`) is optional; errors are what to fix.

### Claude Code

- One session: `claude --plugin-dir <path to this repository>` loads the plugin in place as `<name>@inline` and overrides a same-named installed plugin ([research §5](../research/plugin-authoring-both-hosts.md#5-testing-an-unreleased-change-locally)). Invoke the skill and check the change.
- Repeated testing: `claude plugin marketplace add <path>` adds the working copy as a local marketplace. Relative-path plugins load in place, so edits apply at the next session start or on `/reload-plugins`, with no version bump ([research §5](../research/plugin-authoring-both-hosts.md#5-testing-an-unreleased-change-locally)).

### Codex

- Codex has no session-only `--plugin-dir` equivalent ([research §5](../research/plugin-authoring-both-hosts.md#5-testing-an-unreleased-change-locally)).
- Add the working copy as a local marketplace with `codex plugin marketplace add <path>` (a directory, no ref), enable `[plugins."<plugin>@<marketplace>"]` in the test project's `.codex/config.toml`, and start a new session ([research §5](../research/plugin-authoring-both-hosts.md#5-testing-an-unreleased-change-locally)).
- Codex installs the plugin into a cache under `~/.codex/plugins/cache/`. Whether an edit with an unchanged `version` reaches that cache without `codex plugin remove` and `codex plugin add` is not established ([research open question 5](../research/plugin-authoring-both-hosts.md#open-questions)). If the change does not show up, remove and add the plugin, or test in an isolated `CODEX_HOME` as the [per-machine steps](claude-codex-sharing.md#per-machine-steps) do.

## Before you push

1. The plugin `version` is bumped if the change is user-facing ([Versioning](#versioning)).
2. Every skill folder is listed in the manifest `skills` array ([Layout and registration](#layout-and-registration)).
3. Both test suites pass and `claude plugin validate .` reports no errors.
4. After the change is pushed and each Host has updated, [verify the setup](verification.md) in both Hosts.
