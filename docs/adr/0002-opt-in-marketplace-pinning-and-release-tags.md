# Marketplace pinning is opt-in, releases are tagged `v<version>`

Codex follows a marketplace's git ref and Claude Code follows the manifest `version`, so the Hosts can briefly run different plugin content. We keep the default Project setup unpinned (Codex follows the branch head, Claude Code follows `version`) and offer pinning with `ref` as an opt-in for projects that want the Hosts to change only on purpose. To make a pin practical, every release is a git tag named `v<plugin version>` on the commit that bumps `version` in `.claude-plugin/plugin.json`. The how-to is in `docs/agents/plugin-authoring.md` ("Pin a marketplace to a release"); the evidence is in `docs/research/codex-marketplace-ref-pinning-2026-10-14.md`.

## Considered Options

- **Leave as is** (no tags, no pinning docs): rejected because a project that wants stability has no tag to pin to, and a short-SHA pin silently breaks Codex upgrades (#32).
- **Pin by default**: rejected because a pinned Codex marketplace never updates by itself, so every consuming project would edit `ref` on both Hosts for every release.
- **Tag name `<plugin>--v<version>`** (Claude Code's convention for dependents): rejected because this marketplace has one plugin and nothing depends on it; the plain `v<version>` is shorter and reads the same on both Hosts.

## Consequences

- Claude Code's marketplace-source `ref` takes a branch or tag only, so a pin both Hosts share is a tag; Codex also accepts a full SHA.
- The maintainer creates and pushes release tags after the bump commit is on `main`; agents never do. Lightweight tags are preferred (an annotated tag made `codex plugin marketplace upgrade` re-sync on every run in codex-cli 0.162.1).
- `check-setup` warns (P9, #34) when a marketplace declared in both Hosts is pinned differently, including when only one Host pins; it skips marketplaces whose sources differ (P6 fails those).
