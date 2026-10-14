# Agent instructions

## Project language

Write project artifacts in English, including documentation, specifications, issues, ADRs, glossary entries, research notes, code comments, commit messages, and pull request text. User-facing conversation may remain in the user's language.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `hsmejky/ai-plugin-manager`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` plus `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Claude and Codex sharing

Claude Code and Codex share these instructions and the `mattpocock-skills` plugin.
Before changing agent instructions, skills, or plugin setup, read `docs/agents/claude-codex-sharing.md`.

## Plugin versioning

Every user-facing change to the plugin (skills, checklist, scripts, manifests) bumps `version` in `.claude-plugin/plugin.json` in the same commit; Claude updates only when that string changes. Codex follows the marketplace HEAD and has no manifest here; bump any Codex manifest added later in the same commit.

## Token economy

- Follow-up work goes to a new agent rather than resuming the previous agent's history:
  Claude uses `Agent` rather than `SendMessage`; Codex uses `collaboration.spawn_agent`
  rather than `collaboration.followup_task`. This applies to review findings, fixes,
  the next step, or an agent that hit Claude's `maxTurns` or another execution limit.
  Give the new agent a brief of links, not content, plus the previous report (≤ 300 words) and `git log`.
- CI status (GitHub): one `gh pr checks <n> --watch` call. No polling loops over check-runs
  or `actions/runs`, no REST calls via `curl` or `git credential fill`.
- Codebase lookups and markdown reads that produce more than a few lines of output go to
  Claude's Explore agent with model haiku, or a Codex agent created with
  `collaboration.spawn_agent` and model `gpt-6-luna`, not inline reads.
- Independent parts of work (design or implementation of a separate block, web research) go to new or forked
  agents; spawn them freely, in parallel when independent, using Claude's `Agent`
  or Codex's `collaboration.spawn_agent` when available.
- Codex context budget: warning at 130k tokens, ceiling at 150k per agent.
  Claude continues to use its user-level `~/.claude/hooks/context-budget.js` and
  `CLAUDE_CONTEXT_BUDGET_TOKENS`; its existing configuration is unchanged.
  On a context warning that remaining work will not fit, or when
  the user says "handoff", and only if work remains: write `handoff-<task>.md` (goal, current
  state, done, remaining steps, links) in the scratchpad (Claude) or the OS temporary
  directory (Codex), report its absolute path, then stop.
  If the task is already complete, skip the handoff and just give the final report. Continue
  with a fresh agent given that path; the agent spawned from a handoff file reads it, then
  deletes it (not the spawner: a background successor may not have read it yet).

## Model choice

Use the models for the active host: Claude models in Claude, Codex models in Codex.
Set `model` explicitly on every Claude `Agent` call (forks inherit and ignore it).
For Codex `collaboration.spawn_agent`, set `model` and, where specified,
`reasoning_effort` with `fork_turns="none"` or a limited number of turns;
full-history forks inherit the parent model and do not accept overrides.

- Claude haiku / Codex gpt-6-luna: lookups and extraction. Searches, summarising or quoting doc
  sections, inventories ("list every X"), CI log triage, mechanical edits with an
  exact spec (rename, marker removal, format fixes).
- Claude sonnet / Codex gpt-6.1-sol with reasoning_effort=medium: default for execution against a clear brief. TDD slices from a plan,
  writing tests, doc patches from an explicit item list, single-dimension reviews,
  web research.
- Claude opus / Codex gpt-6.1-sol with reasoning_effort=high or xhigh: judgement and synthesis.
  Design interviews, specs and design docs, design and plan reviews,
  cross-document consistency, architecture work, hard debugging,
  verifying review findings adversarially.
- Claude fable / Codex gpt-6-astra: never chosen automatically by an agent.
  Only the user authorizes this escalation. When opus or gpt-6.1-sol at high or
  xhigh effort has failed on a task, report it and suggest the active host's
  escalation model instead of switching.

Escalate, don't resume: if an agent's result is weak, run a new agent one tier up
(Claude: haiku → sonnet → opus;
Codex: gpt-6-luna → gpt-6.1-sol medium → gpt-6.1-sol high/xhigh)
with the previous report (≤ 300 words), rather than resuming the previous agent.
Escalation to fable or gpt-6-astra requires the user's instruction.
