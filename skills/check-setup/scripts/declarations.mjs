// Reads the target project's own plugin declarations (nothing hard-coded).
// Reusable by later checks: loadDeclarations(projectDir) -> { claude, codex }.
//
// Each Host entry: { state: 'missing' | 'invalid' | 'ok', file, error?, plugins, marketplaces }
//   plugins:      Set of 'plugin@marketplace' ids enabled by the project
//   marketplaces: Map marketplace name -> normalized source key (see sourceKey)
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const CLAUDE_SETTINGS = '.claude/settings.json';

export function marketplaceOf(pluginId) {
  const at = pluginId.lastIndexOf('@');
  return at < 0 ? '' : pluginId.slice(at + 1);
}

function read(projectDir, rel, parse, build) {
  const file = join(projectDir, rel);
  const base = { file: rel, plugins: new Set(), marketplaces: new Map() };
  if (!existsSync(file)) return { ...base, state: 'missing' };
  try {
    return { ...base, ...build(parse(readFileSync(file, 'utf8'))), state: 'ok' };
  } catch (e) {
    return { ...base, state: 'invalid', error: e.message };
  }
}

function buildClaude(json) {
  const plugins = new Set();
  const marketplaces = new Map();
  const enabled = json && typeof json === 'object' ? json.enabledPlugins : undefined;
  for (const [id, on] of Object.entries(enabled ?? {})) if (on === true) plugins.add(id);
  const known = json && typeof json === 'object' ? json.extraKnownMarketplaces : undefined;
  for (const [name, entry] of Object.entries(known ?? {})) {
    marketplaces.set(name, sourceKey(entry?.source));
  }
  return { plugins, marketplaces };
}

export function loadDeclarations(projectDir) {
  return {
    claude: read(projectDir, CLAUDE_SETTINGS, JSON.parse, buildClaude),
  };
}

/** Normalize a marketplace source from either Host to a comparable string, or '' if unknown. */
export function sourceKey(source) {
  if (!source || typeof source !== 'object') return '';
  if (source.source === 'github' && source.repo) return `github.com/${source.repo}`.toLowerCase();
  return '';
}
