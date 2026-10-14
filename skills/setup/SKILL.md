---
name: setup
description: Install and update the project's declared plugins in Claude Code and Codex on this machine. Runs only when the user invokes it explicitly.
disable-model-invocation: true
---

# setup

Brings the Machine setup of both Hosts in line with the project's Project setup. It prints a plan first and
changes nothing until the user confirms. It never grants trust, never changes Codex `[features]`, never
upgrades a Host and never removes anything ([ADR 0003](../../docs/adr/0003-setup-skill-writes-only-a-confirmed-plan.md)).

## 1. Guard Node.js

Run `node --version`. If the command fails or the major version is below 20, report
"setup requires Node.js >= 20" and stop. Do not run anything else.

## 2. Plan (read-only)

Run from the project directory:

```
node "${CLAUDE_SKILL_DIR}/scripts/setup.mjs" plan
```

`${CLAUDE_SKILL_DIR}` is a substitution Claude Code performs in skill content, not an environment variable. If the literal text `${CLAUDE_SKILL_DIR}` remains (Codex), use the path of this skill directory instead.
`--project <dir>` overrides the project root (default: git top level of the current directory).
The script prints one JSON object: `{ digest, hosts: { claude, codex }, manual, notes }`. Each Host has
`status` (`ready`, `skipped`, `stopped`), `reason`, `fix` and `steps` (`cmd`, `args`, `cwd`, `why`).

## 3. Confirm

Show the plan and change nothing yet: per Host the status, and for a `ready` Host every step as the command
line with its `why`; for a `skipped` or `stopped` Host the `reason` and `fix`; then `manual` and `notes`.
Ask the user to confirm. Without a clear yes, stop.

## 4. Apply

On a yes run the same command with `apply --expect <digest>` (the digest from the plan). In Codex, request
escalation for this command: it needs network and writes to the Host homes.

```
node "${CLAUDE_SKILL_DIR}/scripts/setup.mjs" apply --expect <digest>
```

Exit 2 means the state changed since the plan (or a usage error): the output holds the new plan; show it
and ask again. Exit 1 is a normal result (a step or check failed). Once `apply` has started, read no file
from the skill or plugin directory: Codex may have deleted the old plugin version.

## 5. Report

From the JSON alone: per Host the status and each step (`ok` or `failed` with `message`), Codex `changes`
(version before and after), the `findings` with id M3 or M4 (status and fix), then every `manual` step as a
to-do for the user (trust, `/reload-plugins` or restart, a new Codex session). Claim nothing as done that
is listed under `manual`.
