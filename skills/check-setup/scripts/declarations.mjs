// Reads the target project's own plugin declarations (nothing hard-coded).
// Reusable by later checks: loadDeclarations(projectDir) -> { claude, codex }.
//
// Each Host entry: { state: 'missing' | 'invalid' | 'ok', file, error?, plugins, marketplaces }
//   plugins:      Set of 'plugin@marketplace' ids enabled by the project
//   marketplaces: Map marketplace name -> { key, raw }
//                 key = normalized source (see sourceKey), raw = the Host's own source object
// The Shared plugins expected by a project are the intersection of claude.plugins and codex.plugins.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseToml } from './toml.mjs';

export const CLAUDE_SETTINGS = '.claude/settings.json';
export const CODEX_CONFIG = '.codex/config.toml';


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

const obj = (v) => (v && typeof v === 'object' ? v : {});

function buildClaude(json) {
  const plugins = new Set();
  const marketplaces = new Map();
  for (const [id, on] of Object.entries(obj(obj(json).enabledPlugins))) if (on === true) plugins.add(id);
  for (const [name, entry] of Object.entries(obj(obj(json).extraKnownMarketplaces))) {
    const raw = obj(entry).source;
    marketplaces.set(name, { key: sourceKey(raw), raw });
  }
  return { plugins, marketplaces };
}

function buildCodex(toml) {
  const plugins = new Set();
  const marketplaces = new Map();
  for (const [id, entry] of Object.entries(obj(toml.plugins))) if (obj(entry).enabled === true) plugins.add(id);
  for (const [name, entry] of Object.entries(obj(toml.marketplaces))) {
    const raw = { source: obj(entry).source_type, url: obj(entry).source };
    marketplaces.set(name, { key: sourceKey(raw), raw });
  }
  return { plugins, marketplaces };
}

export function loadDeclarations(projectDir) {
  return {
    claude: read(projectDir, CLAUDE_SETTINGS, JSON.parse, buildClaude),
    codex: read(projectDir, CODEX_CONFIG, parseToml, buildCodex),
  };
}

function urlKey(url) {
  return String(url)
    .trim()
    .replace(/^[a-z+]+:\/\//i, '')
    .replace(/^git@([^:]+):/, '$1/')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

/**
 * Normalize a marketplace source from either Host to a comparable string, or '' if unknown.
 * Accepts Claude's { source: 'github', repo } / { source: 'git', url } / { source: 'directory', path }
 * and Codex's { source: 'git'|'local', url }.
 */
export function sourceKey(source) {
  const s = obj(source);
  if (s.source === 'github' && s.repo) return urlKey(`github.com/${s.repo}`);
  if ((s.source === 'git' || s.source === 'url') && s.url) return urlKey(s.url);
  if ((s.source === 'directory' || s.source === 'local') && (s.path || s.url)) {
    return `local:${String(s.path ?? s.url).replace(/\\/g, '/').toLowerCase()}`;
  }
  return '';
}

/** Codex `source` URL for a marketplace known by its normalized key, or '' when not derivable. */
export function codexUrlFor(key) {
  return key && !key.startsWith('local:') ? `https://${key}.git` : '';
}
