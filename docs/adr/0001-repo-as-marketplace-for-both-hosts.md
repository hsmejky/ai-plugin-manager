# This repository is a plugin marketplace for both Hosts

The setup checker must reach any project that adopts the shared agent setup, in both Claude Code and Codex. We ship it as a plugin from this repository, which acts as a single marketplace read by both Hosts (`.claude-plugin/marketplace.json` and `.claude-plugin/plugin.json`, the layout mattpocock/skills uses and Codex also reads). Target projects enable it as one more Shared plugin, so the checker is installed through the same mechanism it verifies.

## Considered Options

- **Committed skill copies** in each project's `.claude/skills/` and `.agents/skills/`: rejected because every project carries two copies that drift from each other and from upstream.
- **`npx skills add`**: rejected because it adds a third installation path outside the one the checker verifies.
