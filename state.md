# State

Maintained by the `plugin-maintainer` agent (`.claude/agents/plugin-maintainer.md`). Last session: 2026-10-14 (tenth: re-review of PR #37 at `2862756`: both blockers resolved, merge-ready; #47 filed; items 5-6 added to #45; no Host release check, docs audit or watch-list scan this session; ninth: PR #37 review, #41-#46 filed, #38-#40 triaged).

## Hosts

| Host        | Last processed Latest release (maintainer target per #29: Claude Code `latest` channel, newest Codex release) | Installed version at last live verification |
| ----------- | ----------------------------- | ------------------------------------------- |
| Claude Code | 2.1.299, newest in CHANGELOG and npm `latest` (CHANGELOG has no 2.1.297 or 2.1.298 section). Claude Code's `stable` channel is older (npm dist-tag `stable` = 2.1.287 on 2026-10-14); per #29 the maintainer targets `latest` | 2.1.299 (2026-10-14, PR #37 branch `2862756`: offline tests 145/145, `check-setup` P1-P8 and M1-M5 pass; at `31488b1`: `check-setup --live` all pass incl. P7, P8, L2; `claude -p` settings-error stderr matches the L1 stub, exit 0) |
| Codex       | 0.162.1 (release notes 0.161.0, 0.162.0, 0.162.1; GitHub latest and npm `latest` on 2026-10-14) | 0.162.1 (2026-10-14, PR #37 branch: `check-setup --live` all pass; skills with `allow_implicit_invocation: false` absent from the list, `$<plugin>:<skill>` loads them, bare `$<skill>` does not (#45)) |

## Watching

- Agent Plugins root `plugin.json` (agent-plugins.org): Claude Code does not support it (unverified, secondary source; the site was unreachable on 2026-10-14). Trigger: the Claude Code CHANGELOG or docs announce support for a root `plugin.json` or the Agent Plugins spec; then file a research spike on replacing `.claude-plugin/plugin.json`.
- Claude Code npm dist-tags `latest`/`stable` as the release channels L2 compares against: the mapping is unverified (code.claude.com/docs/en/setup names the channels, not the dist-tags; values matched on 2026-10-14). Trigger: the setup docs or CHANGELOG describe npm dist-tags, or a release where dist-tag and channel differ; then file an issue to confirm or change L2.

## Watch list

- <https://github.com/mattpocock/skills>: upstream of the `mattpocock-skills` Shared plugin this project enables; skill churn and its `agents/openai.yaml` invocation policy affect L1's expected skills.
- <https://agent-plugins.org/specification>: the "portable" root `plugin.json` format that OpenAI's docs prefer and Codex looks up first; a move towards it would change this repo's manifest layout.
- <https://agentskills.io>: cross-Host `SKILL.md` frontmatter standard; governs how invocation flags like `disable-model-invocation` are meant to behave across Hosts.
- <https://learn.chatgpt.com/docs/config-file/config-reference>: canonical Codex config reference since `developers.openai.com/codex/*` redirects here; marketplace, plugin and project trust keys.
- <https://code.claude.com/docs/en/setup>: Claude Code release channels (`latest`, `stable`) and `claude doctor`; defines the release channels behind "Latest release" (#29), incl. Homebrew casks and package-manager repositories that bypass `autoUpdatesChannel`.

## What next

20, 22, 19, 21, 23, 24, 27, 28, 29, 30, 32, 46, 38, 45, 41, 42, 43, 44, 47, 31, 34, 36, 39, 40
