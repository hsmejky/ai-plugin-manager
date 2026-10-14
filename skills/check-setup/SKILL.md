---
name: check-setup
description: Check whether the shared Claude Code and Codex agent setup of the current project is correct. Use when plugins or skills don't load, or the user asks to verify the setup.
---

# check-setup

Read-only: never change any file or config.

## 1. Guard Node.js

Run `node --version`. If the command fails or the major version is below 20, report
"check-setup requires Node.js >= 20" and stop. Do not run anything else.

## 2. Run the script

Run from the project directory:

```
node "${CLAUDE_SKILL_DIR}/scripts/check-setup.mjs"
```

Add `--live` only when the user explicitly asks for it (argument `live`, or wording like "live check" or
"ask each Host to list its skills"). Never add it on your own, for "why aren't my skills loading?" or any
other request: it makes one model call per Host and plugin and needs network and authentication.

`${CLAUDE_SKILL_DIR}` is a substitution Claude Code performs in skill content, not an environment variable. If the literal text `${CLAUDE_SKILL_DIR}` remains (Codex), use the path of this skill directory instead.
`--project <dir>` overrides the project root (default: git top level of the current directory).
The script prints `{ projectDir, findings }` as JSON and exits 1 when any finding failed.
Exit 1 is a normal result, not an error.

## 3. Render

Each finding is `{ id, host, layer, status, message, fix }` with `host` in `claude | codex | both`,
`layer` in `project | machine`, `status` in `pass | warn | fail | skip`.

1. One summary line: counts of fail, warn, skip and pass, e.g. "2 fail, 1 warn, 0 skip, 5 pass".
2. A Markdown table `| Status | Id | Finding | Fix |` per group, in this order and omitting empty
   groups: Claude Code / Project setup, Codex / Project setup, Both Hosts / Project setup,
   Claude Code / Machine setup, Codex / Machine setup, Both Hosts / Machine setup (`host: both`,
   `layer: machine`, e.g. M5). Never drop a finding for lack of a group. Show `fix` for warn and fail only.
   Live check findings (`L1`, `L2`) sit in the Machine setup groups; a `skip` there is a network, auth or
   sandbox limit, not a broken setup, so report its reason as is.

Rationale and fix for every check id are in [checklist.md](checklist.md).
