# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the "Label in our tracker" column to match whatever vocabulary you actually use.

## Priority labels

The `plugin-maintainer` agent (`.claude/agents/plugin-maintainer.md`) adds one priority label to every issue it files, by the objective the gap is against:

| Label | Gap                                                        |
| ----- | ---------------------------------------------------------- |
| `P1`  | Verification fails or a Host release breaks compatibility  |
| `P2`  | A Host release is not yet processed                        |
| `P3`  | The docs do not match reality                              |
| `P4`  | A research finding that would change the project           |
