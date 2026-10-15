---
name: goal-review
description: Run the Goal review of a PR that closes a goal-agent issue. Use before merging such a PR, as `/goal-review <PR number>`.
disable-model-invocation: true
---

# Goal review of a PR

Argument: the PR number `<n>`. Contract: `docs/agents/goal-agents.md` § Goal review.

1. List the PR's closing issues and their labels:
   `gh pr view <n> --json closingIssuesReferences,headRefOid`, then `gh issue view <issue> --json labels` for each.
2. The agent names are the `<name>` of every `goal-agent:<name>` label, except `goal-agent:state`.
   None: say "No Goal review is required for PR #<n>" and stop.
3. For each name, spawn it with the Agent tool, `subagent_type: <name>`, prompt:
   `Goal review of PR #<n>. Follow docs/agents/goal-agents.md § Goal review.`
   Spawn the agents in parallel.
4. Relay each agent's verdict and findings. Do not merge, tag, or re-run to get a pass.
   A re-review happens only on a new head SHA, when the user asks.
