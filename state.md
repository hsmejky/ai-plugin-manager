# State

Maintained by the `plugin-maintainer` agent (`.claude/agents/plugin-maintainer.md`). Last session: 2026-10-14 (twelfth: state after PR #52 merged at `adec79d`: plugin 0.5.0, #31 #34 #39 #40 #49 #50 #51 #53 closed; adds P9 (cross-Host marketplace `ref` drift), P3 FAIL for reserved Anthropic marketplace names from a non-Anthropic source, CODEX_HOME support (M2, M6, M4 fix text, L1), M1 tested versions Claude Code 2.1.299 / codex-cli 0.162.1, opt-in live tests `CHECK_SETUP_LIVE_INSTRUCTIONS=1` and `CHECK_SETUP_CODEX_DRIFT=1`; tag `v0.5.0` (lightweight, first release tag) pushed on `adec79d`, which unblocks #55; review: https://github.com/hsmejky/ai-plugin-manager/pull/52#issuecomment-6167854246 filed #54, #55; no Host release check, docs audit or watch-list scan this session; eleventh: PR #48 merged at `9d94837`, #49-#51 filed).

## Hosts

| Host        | Last processed Latest release (maintainer target per #29: Claude Code `latest` channel, newest Codex release) | Installed version at last live verification |
| ----------- | ----------------------------- | ------------------------------------------- |
| Claude Code | 2.1.299, newest in CHANGELOG and npm `latest` (CHANGELOG has no 2.1.297 or 2.1.298 section). Claude Code's `stable` channel is older (npm dist-tag `stable` = 2.1.287 on 2026-10-14); per #29 the maintainer targets `latest` | 2.1.299 (2026-10-14, PR #52 merged at `adec79d`: offline suite 242 tests, 233 pass, 0 fail, 9 skipped; CI 4/4; live runs on Windows with temp Host homes: instructions 3/3, drift both cases a157af3 to 885adc1, host-cli 11 pass. Earlier, PR #48 merged at `9d94837`: offline tests 213 pass / 4 skipped by default, 217 pass with `CHECK_SETUP_HOST_CLI=1`; CI 4/4. On this machine the plugin is 0.2.1 in Claude Code and 0.3.0 in Codex vs 0.4.0 on `main` (M5 drift, not caused by #48). Earlier, PR #37 branch `2862756`: offline tests 145/145, `check-setup` P1-P8 and M1-M5 pass; at `31488b1`: `check-setup --live` all pass incl. P7, P8, L2; `claude -p` settings-error stderr matches the L1 stub, exit 0) |
| Codex       | 0.162.1 (release notes 0.161.0, 0.162.0, 0.162.1; GitHub latest and npm `latest` on 2026-10-14) | 0.162.1 (2026-10-14, PR #52 merged at `adec79d`: same runs as Claude Code. Earlier, PR #48 merged at `9d94837`: same test run as Claude Code, incl. M6 (`[features] plugins = false`). Earlier, PR #37 branch: `check-setup --live` all pass; skills with `allow_implicit_invocation: false` absent from the list, `$<plugin>:<skill>` loads them, bare `$<skill>` does not (#45)) |

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

54, 55
