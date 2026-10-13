# check-setup checklist

Single source for every check: id, rationale, fix. Add new checks here.

## Project setup

### P1: `AGENTS.md` exists

Rationale: `AGENTS.md` is the one instruction file both Hosts read. Without it, neither Host gets project instructions.
Fix: create `AGENTS.md` in the project root with the shared agent instructions.

### P2: `CLAUDE.md` exists and imports `@AGENTS.md`

Rationale: Claude Code reads `CLAUDE.md`, not `AGENTS.md`. A line `@AGENTS.md` in it makes Claude Code load the shared instructions.
Fix: create `CLAUDE.md` containing the line `@AGENTS.md`, or add that line to the existing file.

### P3: Claude settings are valid and every enabled plugin's marketplace is declared

Rationale: the expected Shared plugins come from `.claude/settings.json` (`enabledPlugins`). A JSON typo silently disables them, and a plugin whose marketplace is not in `extraKnownMarketplaces` cannot be installed on a fresh machine. `claude-plugins-official` is built in and needs no declaration. Skip when the file does not exist.
Fix: repair the JSON, and add `"<marketplace>": { "source": { "source": "github", "repo": "<owner>/<repo>" } }` under `extraKnownMarketplaces`.

### P4: Codex project config declares the marketplace and the plugin

Rationale: Codex reads `.codex/config.toml`. Every plugin enabled there (`[plugins."<plugin>@<marketplace>"]`, `enabled = true`) needs its marketplace declared (`[marketplaces.<name>]` with `source_type` and `source`); Codex's own marketplaces (`openai-bundled`, `openai-curated`, `openai-primary-runtime`) are exempt. If Claude settings enable plugins but `.codex/config.toml` is missing, that is a fail. Malformed TOML is a fail, not a crash. Skip when neither Host declares plugins.
Fix: add the two tables, for example `[marketplaces.m]` with `source_type = "git"` and `source = "https://github.com/<owner>/<repo>.git"`, plus `[plugins."a@m"]` with `enabled = true`.

### P5: Shared plugin sets match across Hosts

Rationale: a plugin enabled in only one Host is usually an omission, but Host-specific plugins are allowed, so it is a warn. Skip when either config is missing or unreadable (P3 and P4 report that).
Fix: enable the plugin in the other Host (Codex table above; Claude `"<plugin>@<marketplace>": true` in `enabledPlugins`), or ignore if intentional.

### P6: the same marketplace has the same source in both Hosts

Rationale: a marketplace declared in both Hosts must resolve to the same repository, or the Hosts install different code under one name. Sources are compared after normalisation (Claude `github` + `repo` equals a Codex git URL for the same repository; `.git` suffix, scheme and case are ignored). Skip when no marketplace is declared in both.
Fix: set one source in both configs.
