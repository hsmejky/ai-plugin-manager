// P8: a Codex marketplace `ref` that is an abbreviated commit SHA breaks every later upgrade.
import { pass, warn, skip } from '../findings.mjs';
import { CODEX_CONFIG } from '../declarations.mjs';

// Only a full 40-hex SHA skips `git ls-remote` in Codex; a shorter hex ref matches no remote ref.
const isShortSha = (ref) => typeof ref === 'string' && /^[0-9a-f]{4,39}$/i.test(ref.trim());

export async function checkCodexMarketplaceRef(env, { decls: { codex } }) {
  const base = { id: 'P8', host: 'codex', layer: 'project' };
  if (codex.state !== 'ok') return [skip(base, `${CODEX_CONFIG} is missing or unreadable (see P4); no Codex marketplace ref to check`)];
  if (codex.marketplaces.size === 0) return [skip(base, 'No Codex marketplace is declared')];
  const bad = [...codex.marketplaces].filter(([, m]) => isShortSha(m.raw.ref));
  if (bad.length === 0) return [pass(base, 'No Codex marketplace ref is an abbreviated commit SHA')];
  return [
    warn(
      base,
      `Codex marketplace ref is an abbreviated commit SHA, so every upgrade fails ("git ls-remote returned empty output"): ${bad.map(([n, m]) => `"${n}" (ref = "${m.raw.ref}")`).join(', ')}`,
      `In ${CODEX_CONFIG}, set ref to the full 40-character SHA, or to a tag or branch name (for example ${bad.map(([n]) => `[marketplaces.${n}] ref = "<full 40-character SHA or tag>"`).join('; ')}).`,
    ),
  ];
}
