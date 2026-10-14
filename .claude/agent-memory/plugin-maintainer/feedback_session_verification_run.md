---
name: session-verification-run
description: How to run Objective 1 verification quickly each session, and how to checkpoint the large docs sources
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
