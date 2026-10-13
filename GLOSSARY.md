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
