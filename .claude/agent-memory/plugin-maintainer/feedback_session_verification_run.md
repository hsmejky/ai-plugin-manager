---
name: session-verification-run
description: How to run Objective 1 verification quickly each session, checkpoint the large docs sources, and handle docs-worded Deferred triggers
metadata:
  type: feedback
---

Run the whole Objective 1 suite every session after a Host release; it takes about 2 minutes total and needs no user action.

**Why:** On 2026-10-14 (Claude Code 2.1.300, codex-cli 0.162.1) every step ran unattended and green; a full run is cheap evidence for any finding.

**How to apply:**
- Offline: `node --test test/*.test.mjs`, then the two `skills/*/scripts/test/*.test.mjs` globs.
- Live, in this order (sequential, they share Host CLIs): `CHECK_SETUP_HOST_CLI=1` host-cli test; `node skills/check-setup/scripts/check-setup.mjs --live` (prints JSON; it has no `--help`, any argv just runs the checks; summarise with a node one-liner and strip user paths); `node skills/setup/scripts/setup.mjs plan`; `CHECK_SETUP_LIVE_INSTRUCTIONS=1` live-instructions; `SETUP_LIVE=1` live-setup; `CHECK_SETUP_CODEX_DRIFT=1` codex-drift.
- Latest releases: `npm view @anthropic-ai/claude-code dist-tags`, `gh release list -R openai/codex` (pre-releases are `0.x.0-alpha`, not the followed channel).
- `claude-code-docs` and `codex-docs` are too big for one session: checkpoint them as the list of pages read plus date and Host version, and continue from there.
- Tested-version raise after a passing rerun: wait for triage of #95 before filing again per release.
- Before acting on a Deferred item whose trigger is "the docs describe X", grep the repo first: on 2026-10-15 such a trigger had already been true when written (verification.md row 72 cited the page), so it was a no-gap removal, not a filing.
- Codex docs pages that matter: `learn.chatgpt.com/docs/build-skills` and `developers.openai.com/plugins/build/plugins`; `learn.chatgpt.com/docs/build-plugins` is ChatGPT Plugin Creator only.
