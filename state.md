# State

Maintained by the `plugin-maintainer` agent (`.claude/agents/plugin-maintainer.md`). Last session: 2026-10-14.

## Hosts

| Host        | Last processed stable release | Installed version at last live verification |
| ----------- | ----------------------------- | ------------------------------------------- |
| Claude Code | 2.1.299 (CHANGELOG has no 2.1.297 or 2.1.298 section) | 2.1.299 (2026-10-14: offline tests, `check-setup --live`, manual checks pass) |
| Codex       | 0.162.1 (release notes 0.161.0, 0.162.0, 0.162.1) | 0.160.1 (2026-10-14: same runs pass); 0.161.0 to 0.162.1 not yet run live |

## Watching

- Codex CLI behaviour on 0.161.0 or later is unverified (installed 0.160.1). Trigger: installed Codex is 0.161.0 or later; then rerun the offline tests, `check-setup --live` and the manual checks, and compare `codex plugin list --json` and `codex plugin marketplace list --json` with the test stubs.
- Agent Plugins root `plugin.json` (agent-plugins.org): Claude Code does not support it (unverified, secondary source; the site was unreachable on 2026-10-14). Trigger: the Claude Code CHANGELOG or docs announce support for a root `plugin.json` or the Agent Plugins spec; then file a research spike on replacing `.claude-plugin/plugin.json`.

## Watch list

- <https://github.com/mattpocock/skills>: upstream of the `mattpocock-skills` Shared plugin this project enables; skill churn and its `agents/openai.yaml` invocation policy affect L1's expected skills.
- <https://agent-plugins.org/specification>: the "portable" root `plugin.json` format that OpenAI's docs prefer and Codex looks up first; a move towards it would change this repo's manifest layout.
- <https://agentskills.io>: cross-Host `SKILL.md` frontmatter standard; governs how invocation flags like `disable-model-invocation` are meant to behave across Hosts.
- <https://learn.chatgpt.com/docs/config-file/config-reference>: canonical Codex config reference since `developers.openai.com/codex/*` redirects here; marketplace, plugin and project trust keys.

## What next

19, 20, 23, 21, 22, 24, 27, 25, 28, 26
