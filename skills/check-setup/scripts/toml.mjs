// Minimal TOML reader for the subset used by Codex config files:
// [dotted."quoted".'tables'], key = "string" | 'literal' | true | false | number,
// comments. Arrays and inline tables on one line are kept as raw strings.
// Not supported (throws): multi-line strings/arrays, dotted keys, [[array tables]].
// parseToml(text) -> plain object; throws Error('line N: ...') on malformed input.

export function splitPath(text, lineNo) {
  const parts = [];
  let i = 0;
  const bad = () => new Error(`line ${lineNo}: bad table name`);
  while (i < text.length) {
    while (text[i] === ' ' || text[i] === '\t') i++;
    let key = '';
    if (text[i] === '"' || text[i] === "'") {
      const q = text[i++];
      while (i < text.length && text[i] !== q) {
        // Basic (double-quoted) keys honour backslash escapes; literal (single-quoted) keys do not.
        if (q === '"' && text[i] === '\\' && i + 1 < text.length) i++;
        key += text[i++];
      }
      if (text[i] !== q) throw bad();
      i++;
    } else {
      while (i < text.length && /[A-Za-z0-9_-]/.test(text[i])) key += text[i++];
      if (!key) throw bad();
    }
    parts.push(key);
    while (text[i] === ' ' || text[i] === '\t') i++;
    if (i >= text.length) break;
    if (text[i] !== '.') throw bad();
    i++;
  }
  if (parts.length === 0) throw bad();
  return parts;
}

/** Remove a trailing comment, respecting quotes. */
function stripComment(line) {
  let quote = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === '\\' && quote === '"') i++;
      else if (c === quote) quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '#') return line.slice(0, i);
  }
  return line;
}

function parseValue(raw, lineNo) {
  const v = raw.trim();
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^[+-]?\d[\d_]*(\.\d+)?$/.test(v)) return Number(v.replace(/_/g, ''));
  if (v.startsWith("'")) {
    if (v.length < 2 || !v.endsWith("'") || v.startsWith("'''")) throw new Error(`line ${lineNo}: bad string`);
    return v.slice(1, -1);
  }
  if (v.startsWith('"')) {
    if (v.length < 2 || !v.endsWith('"') || v.startsWith('"""')) throw new Error(`line ${lineNo}: bad string`);
    try {
      return JSON.parse(v);
    } catch {
      throw new Error(`line ${lineNo}: bad string escape`);
    }
  }
  if ((v.startsWith('[') && v.endsWith(']')) || (v.startsWith('{') && v.endsWith('}'))) return v;
  throw new Error(`line ${lineNo}: unsupported value`);
}

export function parseToml(text) {
  const root = {};
  let table = root;
  const lines = text.split(/\r?\n/);
  for (let n = 0; n < lines.length; n++) {
    const line = stripComment(lines[n]).trim();
    if (!line) continue;
    if (line.startsWith('[[')) throw new Error(`line ${n + 1}: array tables are not supported`);
    if (line.startsWith('[')) {
      if (!line.endsWith(']')) throw new Error(`line ${n + 1}: unterminated table header`);
      table = root;
      for (const part of splitPath(line.slice(1, -1), n + 1)) {
        if (typeof table[part] !== 'object' || table[part] === null) table[part] = {};
        table = table[part];
      }
      continue;
    }
    const eq = line.indexOf('=');
    if (eq < 0) throw new Error(`line ${n + 1}: expected key = value`);
    const keyParts = splitPath(line.slice(0, eq), n + 1);
    if (keyParts.length !== 1) throw new Error(`line ${n + 1}: dotted keys are not supported`);
    table[keyParts[0]] = parseValue(line.slice(eq + 1), n + 1);
  }
  return root;
}
