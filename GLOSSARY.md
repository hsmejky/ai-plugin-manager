# AI Plugin Manager

Shared agent setup for projects worked on by both Claude Code and Codex: one set of instructions and one set of plugins, configured once per project and verified per machine.

## Language

**Host**:
An AI coding agent application that reads the project's instructions and loads its plugins; currently Claude Code or Codex.
_Avoid_: Agent, client, tool, harness

**Shared plugin**:
A plugin the project enables in every Host, so both expose the same skills.
_Avoid_: Common plugin, shared skills

**Project setup**:
The part of the shared agent setup committed to a project's repository, identical for everyone who clones it.
_Avoid_: Repo config, project config

**Machine setup**:
The part of the shared agent setup that lives on one machine outside the repository, such as project trust, marketplace registration, and plugin installation, done once per machine and Host.
_Avoid_: Local setup, user config, environment

**Setup skill**:
The plugin's `setup` skill, invoked only by the user (`/ai-plugin-manager:setup` or `$ai-plugin-manager:setup`). It prints a plan and, after the user confirms that plan, does the Machine setup (marketplace registration, plugin installation) and, on request through flags, edits the Project setup (`--add`, `--pin`, `--unpin`). It never grants trust, changes Codex `[features]`, upgrades a Host, moves a pinned `ref` unasked, or removes anything ([ADR 0003](docs/adr/0003-setup-skill-writes-only-a-confirmed-plan.md)). It is not the Project setup or the Machine setup themselves.
_Avoid_: Setup (alone), installer, setup command

**Setup checker**:
The plugin's read-only `check-setup` skill, which reports whether the Project setup and Machine setup are correct and suggests the Setup skill as a fix. It changes nothing.
_Avoid_: Setup (alone), validator, doctor

**Latest release**:
The newest published release of a Host on the release channel being followed.
_Avoid_: Current stable release

**Live verification**:
Running a shipped part of the plugin against a Host's Latest release, either read-only on the real machine or writing only to a temporary Host home and a temporary copy of a project.
_Avoid_: Live test, smoke test, manual check

**Gap**:
A difference between what the project claims or needs and what is true on the current Host releases: a failing check, an untested claim, a stale doc, an unused capability, or a requested feature that has no issue or spec yet, or whose spec in `plugin-maintainer`'s scope closed without a released version bump, release tag or docs follow-up. `plugin-maintainer`'s word for a finding in the Goal agent contract.
_Avoid_: Drift, debt

## Goal agents

**Goal agent**:
A subagent definition that owns a long-term goal and works toward it across many sessions, keeping its continuity in durable artifacts (files, issues) rather than in conversation memory. This repo has two: `plugin-maintainer`, defined here, and `goal-steward`, which covers this repo from its Home repo `hsmejky/goal-steward-home`.
_Avoid_: Maintainer (one instance, not the kind), long-running agent

**Objective**:
One of the aims a Goal agent's definition lists in ranked order; every issue the Goal agent files serves exactly one Objective.
_Avoid_: Priority, P-level

**Order**:
The Goal agent's recommended sequence for working its open issues, derived from Objective rank and dependencies; a recommendation the user may override, never a property of a single issue.
_Avoid_: Priority, rank, urgency

**Spec-sized**:
Said of a finding too large for one fresh context window, or not verifiable on its own; it needs a spec and slices before implementation, which the user makes, never the Goal agent.
_Avoid_: Epic, large gap, big issue

**Goal agent contract**:
The rules every Goal agent follows regardless of repo: how it files issues, marks its output, keeps its State issue, and what it never writes. What varies per repo (which Goal agents exist, their labels, tracker commands) is the repo's configuration, not part of the contract.
_Avoid_: Shared contract, Goal agent rules

**State issue**:
The one tracker issue per Goal agent that holds its Order, Deferred items, Checkpoints and any pending handoff note; the user reads and edits it alongside the agent.
_Avoid_: State file, state.md, dashboard

**Checkpoint**:
How far a Goal agent has processed one external source it watches (for example, the last release of a Host it has examined), so the next session resumes from there.
_Avoid_: Last seen, cursor

**Deferred item**:
Something a Goal agent has found that nobody can act on until a named external trigger fires; it is filed as an issue only after the trigger fires.
_Avoid_: Watching, parked issue, backlog item
