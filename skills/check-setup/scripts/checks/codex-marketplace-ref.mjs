// P8: a Codex marketplace `ref` that is not a full 40-hex SHA (all-hex of another length, or padded) may break upgrades.
import { pass, warn, skip } from '../findings.mjs';
import { CODEX_CONFIG } from '../declarations.mjs';

// Codex treats a ref as a commit only when `is_full_git_sha` holds: exactly 40 ASCII hex characters,
// untrimmed (openai/codex tag rust-v0.162.1, codex-rs/core/src/marketplace_upgrade/git.rs). Any other ref is
// sent to `git ls-remote` as a branch or tag name.
const HEX = /^[0-9a-f]+$/i;
function problem(ref) {
  if (typeof ref !== 'string') return null;
  if (ref !== ref.trim()) return 'has surrounding whitespace, which Codex does not trim, so it is looked up as a branch or tag name';
  if (!HEX.test(ref)) return null;
  if (ref.length === 40) return null;
  if (ref.length < 40) return `is ${ref.length} hex characters: Codex looks it up as a branch or tag name, so it fails unless a branch or tag of that name exists (it is not treated as a short SHA)`;
  return `is ${ref.length} hex characters, not a 40-character commit SHA: Codex sends it to "git ls-remote" as a name and the lookup fails`;
}

export async function checkCodexMarketplaceRef(env, { decls: { codex } }) {
  const base = { id: 'P8', host: 'codex', layer: 'project' };
  if (codex.state !== 'ok') return [skip(base, `${CODEX_CONFIG} is missing or unreadable (see P4); no Codex marketplace ref to check`)];
  if (codex.marketplaces.size === 0) return [skip(base, 'No Codex marketplace is declared')];
  const bad = [...codex.marketplaces].map(([n, m]) => [n, m, problem(m.raw.ref)]).filter(([, , why]) => why);
  if (bad.length === 0) return [pass(base, 'No Codex marketplace ref differs from the full-SHA rule')];
  return [
    warn(
      base,
      `Codex marketplace ref is not a full commit SHA and may not be a real branch or tag, so upgrades can fail ("git ls-remote returned empty output"): ${bad.map(([n, m, why]) => `"${n}" (ref = ${JSON.stringify(m.raw.ref)} ${why})`).join('; ')}`,
      `In ${CODEX_CONFIG}, set ref to the full 40-character SHA, or to an existing tag or branch name without surrounding whitespace (for example ${bad.map(([n]) => `[marketplaces.${n}] ref = "<full 40-character SHA or tag>"`).join('; ')}).`,
    ),
  ];
}
