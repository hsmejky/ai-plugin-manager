# Which skills Codex offers to the model: `disable-model-invocation` versus `openai.yaml` policy

Research note for issue #25. All sources were checked on 2026-10-14. Terms follow `GLOSSARY.md` (Host, Shared plugin). Source numbers in brackets refer to the Sources list at the end.

Source-code citations use tag `rust-v0.162.1` of `openai/codex` (commit `092d3acd6bec3e3a14bdc7e7a2810ab628ab759d`, the latest stable release on the check date). The installed Codex CLI is codex-cli 0.162.1, the same version. Behaviour below is read from source and from the installed plugin cache; no model call was made, so nothing here was observed by running `codex exec` (see open question 1).

## Answer

1. **Codex ignores `disable-model-invocation`.** The `SKILL.md` frontmatter parser in Codex reads only `name`, `description` and `metadata.short-description`; every other key is dropped silently [S1]. A repo-wide search of the sparse checkout of `codex-rs` at the tag found the string `disable-model-invocation` nowhere in the skill loader.
2. **Codex's only model-visibility control is `policy.allow_implicit_invocation` in `agents/openai.yaml`** next to `SKILL.md` [S2, S3, S4]. Default `true`. With `false`, the skill is dropped from the skill list that Codex renders into the model's prompt, but a user mention (`$skill`) still loads it [S5, S6, S7]. Codex's OpenAI docs state the same [S4].
3. **Claude Code is the mirror image.** `disable-model-invocation: true` keeps the description out of context and stops the model invoking the skill; the user can still run `/name` [S8]. Claude Code does not read `agents/openai.yaml` (nothing in its docs mentions it; not further verified).
4. **Therefore the L1 assumption in `check-setup` and `docs/agents/verification.md` does not hold for Codex in general.** It holds only for plugins that set both settings. A skill with only `disable-model-invocation: true` stays in Codex's model-visible list; a skill with only `allow_implicit_invocation: false` stays in Claude Code's list.
5. **The upstream `mattpocock-skills` plugin sets both**, by documented convention ("Keep the two in sync: a skill is user-invoked in both harnesses or neither") [S9], and the installed cache confirms it (below). So L1 is correct for that plugin and for this repo's `check-setup`, which sets neither.

Confidence: high for Codex's source behaviour at `rust-v0.162.1` and for Claude Code's documented behaviour; medium that the live model list matches the source-level catalog (not run); the agentskills.io specification defines no invocation control field [S10].

## Evidence

### Codex: loading and the policy

- `SkillFrontmatter` has fields `name`, `description` and `metadata` (`short-description`) only, with no `deny_unknown_fields`, so other keys are ignored [S1].
- The sibling file is `agents/openai.yaml` (`SKILLS_METADATA_DIR = "agents"`, `SKILLS_METADATA_FILENAME = "openai.yaml"`) [S2]. Its `policy` block deserializes to `allow_implicit_invocation: Option<bool>` and `products` [S3].
- `SkillMetadata::allows_implicit_invocation()` returns the policy value, `true` when the policy or the key is absent [S11].
- The host skill provider builds each catalog entry and calls `hidden_from_prompt()` when `!skill.allows_implicit_invocation()`; the executor provider does the same [S5, S6]. `hidden_from_prompt()` sets `prompt_visible = false`, and `is_model_visible()` is `enabled && prompt_visible` [S7]. The rendered prompt catalog, the skill list/read tools and the routing card filter on `is_model_visible()` [S7].
- A hidden skill remains invocable: the test `prompt_hidden_skill_can_still_be_invoked` sends `$hidden-skill`; the catalog fragment omits it, a second fragment contains `<name>hidden-skill</name>`, and the skill file is read [S12].
- Separately, a skill can be `disabled()` (not model-visible and not enabled) from Codex configuration paths [S5, S7]. That is user configuration, not plugin metadata, and is not covered here.
- `products` in the policy restricts a skill to certain OpenAI products (`matches_product_restriction`) [S3, S11]. Not traced further.

### Codex: documentation

- OpenAI's skills page: `allow_implicit_invocation` (default `true`): when `false`, Codex will not implicitly invoke the skill based on the user prompt; explicit `$skill` invocation still works. Implicit selection happens when the task matches the `description`. The page documents only `name` and `description` as `SKILL.md` frontmatter [S4]. The page text was obtained through a summarising fetch, so these are close paraphrases, not verbatim quotes.

### Claude Code

- `disable-model-invocation: true` prevents Claude from automatically loading the skill; the invocation table says the user can invoke it, Claude "not on its own", and the description is not in context. If Claude tries anyway, Claude Code blocks the call [S8].
- `user-invocable: false` is the opposite direction (model only). It has no Codex equivalent in the source above [S1, S8].
- Plugin skills appear in the docs' field-support table as supporting every field, so the flag applies to plugin skills [S8] (stated by implication, not by an explicit sentence).

### Installed state on this machine (codex-cli 0.162.1)

- `~/.codex/plugins/cache/mattpocock/mattpocock-skills/1.3.1/` contains `agents/openai.yaml` beside each skill. `ask-matt`, `grill-with-docs` and `implement` all have both `disable-model-invocation: true` in `SKILL.md` and `policy: allow_implicit_invocation: false` in `openai.yaml` (found by search; `ask-matt` file inspected) [S13].
- This repo's own skill, `check-setup`, has neither setting (no `disable` match in `skills/*/SKILL.md`). The plugin cache of ai-plugin-manager 0.2.1 holds the same files as the repo [S13].

## Implications for this repo

- `skills/check-setup/scripts/checks/live-skills.mjs` (`readSkill`, `expectedSkills`) excludes a skill when `SKILL.md` has `disable-model-invocation: true`, and uses that one set for both Hosts [S14]. `checklist.md` (L1) and `docs/agents/verification.md` say the same [S14]. For a plugin that sets only one of the two settings, this yields a wrong expected set in one Host: a false fail in one Host. With only `disable-model-invocation: true`, L1 excludes the skill, but Codex still lists it (unexpected extra name; whether L1 fails on extras was not checked). With only `allow_implicit_invocation: false`, L1 expects the skill, Codex hides it (reported missing) and Claude Code lists it.
- The right model is a per-Host expected set: Claude Code from `disable-model-invocation`; Codex from `agents/openai.yaml` `policy.allow_implicit_invocation` (hidden when exactly `false`). Both Hosts should additionally be reported when the two settings disagree for a skill, because that mismatch is the upstream convention violation [S9].
- `docs/agents/verification.md` "Pass: both Hosts list the same set of names" holds only when the settings are in sync; the sentence about `disable-model-invocation` skills "not in a model's list" is Claude-specific and should say so.
- `docs/agents/plugin-authoring.md` / `claude-codex-sharing.md` should state: to make a Shared plugin skill user-only, set both settings; either alone hides it in one Host only. The Shared (cross-Host) part of a skill is `SKILL.md`; `agents/openai.yaml` is Codex-only metadata, so this is a Host-specific file inside a Shared plugin.
- No change is needed for today's setup: `check-setup` is model-invoked in both Hosts, and L1 passed in both Hosts on 2026-10-14 per the issue.

## Open questions

1. Not verified live: a `codex exec` run listing skills of the cache above (for example `ask-matt` should be absent from the list and `$ask-matt` should still load). The conclusion rests on source and tests. A model's reply to "list your skills" may also include skills it knows only from names mentioned elsewhere.
2. Does the Codex model list in a plugin context come only from this catalog path, or do other code paths (for example the dynamic skill selector, the shadow selection experiment) show hidden skills? The routing card and shadow experiment filter on `is_model_visible()`; the full tree was not audited [S7].
3. Whether Claude Code ever reads `agents/openai.yaml`: no evidence found, not searched in Claude Code source (closed). Docs silent.
4. Codex `products` restrictions: when a skill is filtered by product, it may be absent from the list regardless of the implicit setting; not traced [S3, S11].
5. Whether the `learn.chatgpt.com` page is the stable canonical doc URL; it redirected from developers.openai.com on the check date and may move.

## Follow-up issues suggested

- check-setup L1: compute the expected skill set per Host (SKILL.md flag for Claude Code, `openai.yaml` policy for Codex) and warn on a mismatch between the two.
- `docs/agents/verification.md` and `checklist.md`: document the per-Host rule.
- `docs/agents/plugin-authoring.md`: add the "set both settings" rule for user-only skills.
- Optional: run the live Codex check from open question 1 once and record the outcome here.

## Sources

All checked 2026-10-14.

- S1. openai/codex `codex-rs/skills/src/parser.rs`, `SkillFrontmatter`, `SkillFrontmatterMetadata`. https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/skills/src/parser.rs
- S2. openai/codex `codex-rs/ext/skills/src/loader/mod.rs` (`SKILLS_METADATA_DIR`, `SKILLS_METADATA_FILENAME`). https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/ext/skills/src/loader/mod.rs
- S3. openai/codex `codex-rs/ext/skills/src/loader/metadata.rs`, `Policy`, `resolve_policy`. https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/ext/skills/src/loader/metadata.rs
- S4. OpenAI, Build skills. https://learn.chatgpt.com/docs/build-skills (redirect target of developers.openai.com/codex/skills)
- S5. openai/codex `codex-rs/ext/skills/src/provider/host.rs`, catalog entry builder (`hidden_from_prompt`). https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/ext/skills/src/provider/host.rs
- S6. openai/codex `codex-rs/ext/skills/src/provider/executor.rs`. https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/ext/skills/src/provider/executor.rs
- S7. openai/codex `codex-rs/ext/skills/src/catalog.rs` (`hidden_from_prompt`, `is_model_visible`) and its callers `render_dedup.rs`, `world_state_catalogs.rs`, `tools/list.rs`, `tools/read.rs`, `dynamic_skill_selector/character_routing_card.rs` under `codex-rs/ext/skills/src/`. https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/ext/skills/src/catalog.rs
- S8. Claude Code docs, Skills. https://code.claude.com/docs/en/skills (the last ~7,000 characters of the page were not read)
- S9. mattpocock/skills `.agents/invocation.md` (main branch on the check date, fetched through raw.githubusercontent.com). https://github.com/mattpocock/skills/blob/main/.agents/invocation.md
- S10. Agent Skills specification, frontmatter fields (`name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`). https://agentskills.io/specification
- S11. openai/codex `codex-rs/skills/src/model.rs`, `allows_implicit_invocation`, `matches_product_restriction`. https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/skills/src/model.rs
- S12. openai/codex `codex-rs/ext/skills/tests/skills_extension.rs`, `prompt_hidden_skill_can_still_be_invoked`. https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/ext/skills/tests/skills_extension.rs
- S13. Local files on this machine: `~/.codex/plugins/cache/mattpocock/mattpocock-skills/1.3.1/skills/engineering/*/agents/openai.yaml` and `SKILL.md`; `~/.codex/plugins/cache/ai-plugin-manager/ai-plugin-manager/0.2.1/`; `codex --version` = codex-cli 0.162.1.
- S14. This repo, `skills/check-setup/scripts/checks/live-skills.mjs`, `skills/check-setup/checklist.md` (L1), `docs/agents/verification.md` (internal, secondary).
