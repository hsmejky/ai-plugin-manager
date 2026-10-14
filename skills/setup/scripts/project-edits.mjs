// Project setup writers of the setup skill: edit .claude/settings.json and .codex/config.toml as text,
// keeping line endings, BOM, indentation and key order, and validate the result with check-setup's P-checks
// before anything is written. Pure: text in, text out; setup.mjs does the file I/O.
//
//   editJson(text, mutate)                     -> new JSON text (parse, mutate(object), stringify)
//   appendTomlTables(text, blocks)             -> text with new tables at the end
//   setTomlKey(text, path, key, literal|null)  -> text with `key = literal` set inside table `path`
//                                                 (inserted, replaced, or removed for null); null if no such table
//   proposeAdd(env, files, request)            -> { edits } | { refused }
//   edits = [{ file, before, after }] (before null when the file does not exist), only for files that change.
//   files = { claude: text|null, codex: text|null }.
import { CLAUDE_SETTINGS, CODEX_CONFIG, parseDeclarations, sourceKey, codexUrlFor } from '../../check-setup/scripts/declarations.mjs';
import { splitPath, parseToml } from '../../check-setup/scripts/toml.mjs';
import { checkPluginDeclarations } from '../../check-setup/scripts/checks/plugin-declarations.mjs';
import { checkCodexMarketplaceRef } from '../../check-setup/scripts/checks/codex-marketplace-ref.mjs';

const BOM = '﻿';
const eolOf = (text) => (text.includes('\r\n') ? '\r\n' : '\n');
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// ---------------------------------------------------------------- JSON

/** Parse `text`, let `mutate(object)` edit it, and write it back with the file's BOM, indent, EOL and final newline. */
export function editJson(text, mutate) {
  const bom = text.startsWith(BOM) ? BOM : '';
  const body = text.slice(bom.length);
  const eol = eolOf(body);
  const indentMatch = /^([ \t]+)\S/m.exec(body);
  const indent = indentMatch ? (indentMatch[1][0] === '\t' ? '\t' : indentMatch[1].length) : 2;
  const finalNewline = body === '' ? true : /\n$/.test(body);
  const data = body.trim() === '' ? {} : JSON.parse(body);
  mutate(data);
  const out = JSON.stringify(data, null, indent).replace(/\n/g, eol);
  return bom + out + (finalNewline ? eol : '');
}

// ---------------------------------------------------------------- TOML

const quoteKey = (k) => (/^[A-Za-z0-9_-]+$/.test(k) ? k : JSON.stringify(k));
const tomlString = (s) => JSON.stringify(s);

/** Append `blocks` (each an array of lines, header first) at the end of `text`, blank line between tables. */
export function appendTomlTables(text, blocks) {
  if (blocks.length === 0) return text;
  const eol = eolOf(text);
  let out = text;
  if (out !== '' && !/\n$/.test(out)) out += eol;
  for (const block of blocks) {
    if (out !== '' && !/(\r?\n){2}$/.test(out)) out += eol;
    out += block.join(eol) + eol;
  }
  return out;
}

const samePath = (a, b) => a.length === b.length && a.every((p, i) => p === b[i]);

function headerPath(line) {
  const t = line.trim();
  if (!t.startsWith('[') || t.startsWith('[[')) return null;
  const close = t.lastIndexOf(']');
  if (close < 0) return null;
  return splitPath(t.slice(1, close), 0);
}

/**
 * Set `key = literal` (a TOML literal such as `"v1"` or `true`) inside table `path`, or remove the key when
 * `literal` is null. Keeps the other lines, the line's indentation and trailing comment. Returns null when
 * the table has no header of its own. Throws when an existing key line is in a shape this editor does not handle.
 */
export function setTomlKey(text, path, key, literal) {
  const eol = eolOf(text);
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => {
    const p = headerPath(l);
    return p && samePath(p, path);
  });
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length && !/^\s*\[/.test(lines[end])) end++;
  const keyLine = new RegExp(`^(\\s*)${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*(.*)$`);
  for (let i = start + 1; i < end; i++) {
    const m = keyLine.exec(lines[i]);
    if (!m) continue;
    if (literal === null) {
      lines.splice(i, 1);
      return lines.join(eol);
    }
    const value = /^("(?:[^"\\]|\\.)*"|'[^']*'|[^#\s]+)(\s*#.*)?\s*$/.exec(m[2]);
    if (!value) throw new Error(`cannot edit ${key} in table [${path.join('.')}]: unsupported value`);
    lines[i] = `${m[1]}${key} = ${literal}${value[2] ?? ''}`;
    return lines.join(eol);
  }
  if (literal === null) return text;
  let at = end;
  while (at > start + 1 && lines[at - 1].trim() === '') at--;
  lines.splice(at, 0, `${key} = ${literal}`);
  return lines.join(eol);
}

// ---------------------------------------------------------------- add

const GITHUB_SHORT = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const GIT_URL = /^(https?:\/\/|ssh:\/\/|git:\/\/|git@)\S+$/;

/** The source of a marketplace as both Hosts spell it, from `--source`. */
function fromSourceFlag(source) {
  if (GITHUB_SHORT.test(source)) {
    return { claude: { source: 'github', repo: source }, codexUrl: codexUrlFor(sourceKey({ source: 'github', repo: source })) };
  }
  if (GIT_URL.test(source)) return { claude: { source: 'git', url: source }, codexUrl: source };
  return null;
}

/** The source of a marketplace as declared by one Host, as both Hosts spell it, or null when it cannot be mirrored. */
function fromDeclaration(host, entry) {
  const raw = entry.raw ?? {};
  const ref = typeof raw.ref === 'string' && raw.ref !== '' ? raw.ref : undefined;
  if (host === 'claude') {
    if (raw.source === 'github' && raw.repo) return { claude: { source: 'github', repo: raw.repo }, codexUrl: codexUrlFor(entry.key), ref };
    if (raw.source === 'git' && raw.url) return { claude: { source: 'git', url: raw.url }, codexUrl: raw.url, ref };
    return null;
  }
  if (raw.source !== 'git' || !raw.url) return null;
  const gh = /^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/i.exec(raw.url);
  return { claude: gh ? { source: 'github', repo: gh[1] } : { source: 'git', url: raw.url }, codexUrl: raw.url, ref };
}

const refuse = (message, extra = {}) => ({ refused: { message, ...extra } });

function parseAdd(spec) {
  const at = spec.lastIndexOf('@');
  if (at <= 0 || at === spec.length - 1) return null;
  return { id: spec, plugin: spec.slice(0, at), marketplace: spec.slice(at + 1) };
}

/** The Claude settings edit for `--add`. */
function addToClaude(text, add, source) {
  const have = parseDeclarations({ claudeText: text === '' ? null : text }).claude;
  if (have.state === 'ok' && have.marketplaces.has(add.marketplace) && have.plugins.has(add.id)) return text;
  return editJson(text, (json) => {
    for (const key of ['extraKnownMarketplaces', 'enabledPlugins']) {
      if (json[key] !== undefined && !isObject(json[key])) throw new Error(`"${key}" in ${CLAUDE_SETTINGS} is not an object`);
    }
    json.extraKnownMarketplaces ??= {};
    json.enabledPlugins ??= {};
    if (!json.extraKnownMarketplaces[add.marketplace]) {
      json.extraKnownMarketplaces[add.marketplace] = {
        source: { ...source.claude, ...(source.ref ? { ref: source.ref } : {}) },
        autoUpdate: true,
      };
    }
    if (json.enabledPlugins[add.id] !== true) json.enabledPlugins[add.id] = true;
  });
}

/** Throws when the declarations this request touches are not in plain [tables] the line editor can extend. */
function checkCodexShape(text, add) {
  const toml = parseToml(text);
  for (const key of ['marketplaces', 'plugins']) {
    if (toml[key] !== undefined && !isObject(toml[key])) throw new Error(`"${key}" in ${CODEX_CONFIG} is not a table of tables`);
  }
  const market = toml.marketplaces?.[add.marketplace];
  const plugin = toml.plugins?.[add.id];
  if ((market !== undefined && !isObject(market)) || (plugin !== undefined && !isObject(plugin))) {
    throw new Error(`the declaration of ${add.marketplace} or ${add.id} in ${CODEX_CONFIG} is not a [table]`);
  }
}

/** The Codex config edit for `--add`; throws on a declaration shape this editor does not handle. */
function addToCodex(text, add, source) {
  checkCodexShape(text, add);
  const toml = parseToml(text);
  const market = toml.marketplaces?.[add.marketplace];
  const plugin = toml.plugins?.[add.id];
  let out = text;
  const blocks = [];
  if (market === undefined) {
    blocks.push([
      `[marketplaces.${quoteKey(add.marketplace)}]`,
      'source_type = "git"',
      `source = ${tomlString(source.codexUrl)}`,
      ...(source.ref ? [`ref = ${tomlString(source.ref)}`] : []),
    ]);
  }
  if (plugin === undefined) blocks.push([`[plugins.${quoteKey(add.id)}]`, 'enabled = true']);
  else if (plugin.enabled !== true) {
    const edited = setTomlKey(out, ['plugins', add.id], 'enabled', 'true');
    if (edited === null) throw new Error(`the declaration of ${add.id} in ${CODEX_CONFIG} has no [plugins."${add.id}"] table`);
    out = edited;
  }
  return appendTomlTables(out, blocks);
}

// ---------------------------------------------------------------- validation

const rank = (status) => (status === 'fail' ? 2 : status === 'warn' ? 1 : 0);
const key = (f) => `${f.id}:${f.host}`;

async function pFindings(env, decls) {
  const ctx = { decls };
  return [...(await checkPluginDeclarations(env, ctx)), ...(await checkCodexMarketplaceRef(env, ctx))];
}

/** The first P-check finding that is worse after the edit than before it, or null. */
async function worsened(env, before, after) {
  const was = new Map((await pFindings(env, before)).map((f) => [key(f), rank(f.status)]));
  return (await pFindings(env, after)).find((f) => rank(f.status) > (was.get(key(f)) ?? 0)) ?? null;
}

/**
 * Propose the edits of `--add <plugin>@<marketplace> [--source <s>]`. Writes only the parts that are missing.
 * Returns { edits: [] } for a no-op, { edits } on success, { refused: { message, finding? } } otherwise.
 */
export async function proposeAdd(env, files, request) {
  const add = parseAdd(request.add);
  if (!add) return refuse(`--add expects <plugin>@<marketplace>, got "${request.add}"`);
  const before = parseDeclarations({ claudeText: files.claude, codexText: files.codex });
  for (const h of ['claude', 'codex']) {
    if (before[h].state === 'invalid') {
      return refuse(`${before[h].file} cannot be read (${before[h].error}); edit it by hand to add ${add.id}`);
    }
  }

  try {
    if (files.codex) checkCodexShape(files.codex, add);
  } catch (e) {
    return refuse(`Unsupported file shape: ${e.message}. Add ${add.id} by hand.`);
  }

  const declared = ['claude', 'codex'].filter((h) => before[h].marketplaces.has(add.marketplace));
  let source = null;
  if (request.source !== undefined) {
    source = fromSourceFlag(request.source);
    if (!source) return refuse(`--source must be <owner>/<repo> or a git URL, got "${request.source}"`);
    const wanted = sourceKey(source.claude);
    for (const h of declared) {
      if (before[h].marketplaces.get(add.marketplace).key !== wanted) {
        return refuse(`Marketplace "${add.marketplace}" is already declared in ${before[h].file} with a different source than --source (P6)`);
      }
    }
  }
  if (declared.length === 2) {
    const [c, x] = declared.map((h) => before[h].marketplaces.get(add.marketplace));
    if (c.key !== x.key) {
      return refuse(`Marketplace "${add.marketplace}" has different sources in ${CLAUDE_SETTINGS} and ${CODEX_CONFIG} (P6); make them equal first`);
    }
  }
  if (declared.length === 1) {
    // Mirror the declared source (and its pin, so P9 stays quiet) into the Host that lacks it.
    const h = declared[0];
    source = fromDeclaration(h, before[h].marketplaces.get(add.marketplace));
    if (!source) {
      return refuse(`The source of marketplace "${add.marketplace}" in ${before[h].file} cannot be mirrored (only github and git sources); declare it by hand in the other Host`);
    }
  }
  if (!source && declared.length === 0) {
    return refuse(`Marketplace "${add.marketplace}" is not declared in either Host: pass --source <owner>/<repo> or a git URL`);
  }

  const next = { claude: files.claude, codex: files.codex };
  try {
    next.claude = addToClaude(files.claude ?? '', add, source);
    next.codex = addToCodex(files.codex ?? '', add, source);
  } catch (e) {
    return refuse(`Unsupported file shape: ${e.message}. Add ${add.id} by hand.`);
  }

  const after = parseDeclarations({ claudeText: next.claude, codexText: next.codex });
  const bad = await worsened(env, before, after);
  if (bad) return refuse(`${bad.id} (${bad.status}): ${bad.message}`, { finding: bad });

  const edits = [];
  if (next.claude !== files.claude) edits.push({ file: CLAUDE_SETTINGS, before: files.claude, after: next.claude });
  if (next.codex !== files.codex) edits.push({ file: CODEX_CONFIG, before: files.codex, after: next.codex });
  return { edits, decls: after };
}
