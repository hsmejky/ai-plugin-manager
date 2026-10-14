# The setup skill writes only a confirmed plan

`check-setup` is read-only. The `setup` skill is the plugin's first part that changes a machine and committed files, so its boundary is fixed here ([spec](../specs/setup-skill.md), decisions in [#57](https://github.com/hsmejky/ai-plugin-manager/issues/57#issuecomment-6169273004)). It runs only on explicit invocation in both Hosts. A read-only `plan` step prints every command and file edit per Host; `apply` runs only after the user confirms, and only the plan whose digest the user confirmed. It never grants trust, never changes Codex `[features]`, never upgrades a Host, never moves a pinned `ref` unless asked, and never removes anything. Committed files change only by the Project setup edits the user asked for: the skill restores `.claude/settings.json` byte for byte after Claude Code's CLI rewrites it.

## Considered Options

- **Auto-fix in `check-setup`**: rejected because a model-invocable checker would then change things on a question like "why aren't my skills loading?".
- **Model-invocable `setup`**: rejected because neither Host's model should change machine config or committed files on its own.
- **Claude Code `--scope user` for `marketplace add`**: rejected because it declares the marketplace for every project on the machine.

## Consequences

- The maintainer runs only `plan` against the real Hosts; `apply` runs in Live verification against temporary Host homes and a temporary project copy.
- Trust stays a manual step in both Hosts.
