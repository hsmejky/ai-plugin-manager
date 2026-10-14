# State

Maintained by the `plugin-maintainer` agent (`.claude/agents/plugin-maintainer.md`). Last session: 2026-10-14 (third: #27 decided and briefed; no new Host release, installed Hosts still 2.1.299 and 0.162.1, so objectives 1-4 carry over from the second session).

## Hosts

| Host        | Last processed stable release | Installed version at last live verification |
| ----------- | ----------------------------- | ------------------------------------------- |
| Claude Code | 2.1.299, newest in CHANGELOG and npm `latest` (CHANGELOG has no 2.1.297 or 2.1.298 section). Claude Code's own `stable` channel is older: npm dist-tag `stable` = 2.1.287 on 2026-10-14; which one counts is asked in #29 | 2.1.299 (2026-10-14: offline tests 92/92 and links 4/4, `check-setup --live` all pass, manual checks pass) |
| Codex       | 0.162.1 (release notes 0.161.0, 0.162.0, 0.162.1; GitHub latest and npm `latest` on 2026-10-14) | 0.162.1 (2026-10-14: offline tests, `check-setup --live`, manual checks incl. negative check pass; `plugin list --json` and `marketplace list --json` shapes match the test stubs) |

## Watching

- Agent Plugins root `plugin.json` (agent-plugins.org): Claude Code does not support it (unverified, secondary source; the site was unreachable on 2026-10-14). Trigger: the Claude Code CHANGELOG or docs announce support for a root `plugin.json` or the Agent Plugins spec; then file a research spike on replacing `.claude-plugin/plugin.json`.

## Watch list

- <https://github.com/mattpocock/skills>: upstream of the `mattpocock-skills` Shared plugin this project enables; skill churn and its `agents/openai.yaml` invocation policy affect L1's expected skills.
- <https://agent-plugins.org/specification>: the "portable" root `plugin.json` format that OpenAI's docs prefer and Codex looks up first; a move towards it would change this repo's manifest layout.
- <https://agentskills.io>: cross-Host `SKILL.md` frontmatter standard; governs how invocation flags like `disable-model-invocation` are meant to behave across Hosts.
- <https://learn.chatgpt.com/docs/config-file/config-reference>: canonical Codex config reference since `developers.openai.com/codex/*` redirects here; marketplace, plugin and project trust keys.
- <https://code.claude.com/docs/en/setup>: Claude Code release channels (`latest`, `stable`) and `claude doctor`; defines which version counts as current for #29.

## What next

19, 20, 23, 21, 22, 24, 27, 29, 25, 28, 26
