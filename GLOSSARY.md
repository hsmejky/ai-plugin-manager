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
A difference between what the project claims or needs and what is true on the current Host releases: a failing check, an untested claim, a stale doc, an unused capability, or a requested feature not yet released.
_Avoid_: Drift, debt
