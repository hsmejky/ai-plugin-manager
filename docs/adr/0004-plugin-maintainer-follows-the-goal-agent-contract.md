# plugin-maintainer follows the Goal agent contract

`plugin-maintainer` runs on the Goal agent contract in [`docs/agents/goal-agents.md`](../agents/goal-agents.md), adopted from [Goal agents with the Engineering skills](https://github.com/hsmejky/goal-agent/blob/ce44493c27f14bbb08a68398cf168c289409f034/docs/goal-agents-with-engineering-skills.md) at `ce44493` ([spec #85](https://github.com/hsmejky/ai-plugin-manager/issues/85#issuecomment-6175370983)). Its state moves from the committed `state.md` to one State issue labelled `goal-agent:state`; every finding enters through triage as `needs-triage` with a category label and the scope label `goal-agent:plugin-maintainer`, so triage is where the user endorses work; and the `P1`-`P4` priority labels are retired and deleted: urgency is stated in the issue, and the State issue's Order, which the user owns, says what runs next.

## Considered Options

- **Keep `state.md`**: rejected. It copied tracker facts and went stale within a day (its "What next" listed closed issues and missed new ones), and every update was a commit.
- **Keep `P1`-`P4`**: rejected. No Engineering skill reads priority, and the labels drifted from category to rank. All 43 issues carrying them were closed, so they are deleted rather than kept as history.
- **Keep filing `ready-for-agent`**: rejected. It bypassed triage, so no issue had a category label or an Agent Brief, and the user could not tell the agent's issues from their own.

## Consequences

- `state.md` stays in git history. Two Watching items moved unchanged and one was rewritten, all to the State issue's `## Deferred items`; the reserved-spellings item became #86; the watch list moved to the definition's Watched sources. Its last processed Host releases moved to the State issue's `## Checkpoints`; its session log, installed versions and "What next" were dropped.
- The agent's only repository write is its project memory (`.claude/agent-memory/plugin-maintainer/`); the definition, `docs/agents/`, `GLOSSARY.md` and the ADRs are the user's.
