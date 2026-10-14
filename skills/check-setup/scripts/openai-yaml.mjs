// Reads `policy.allow_implicit_invocation` from the text of a Codex `agents/openai.yaml` without a YAML library.
// Handles the common shapes (block map, flow map over several lines, quoted keys, comments, BOM, CRLF) and
// answers null for anything it cannot judge reliably, so a caller never treats an unreadable file as visible or hidden.
//
//   implicitInvocationDisabled(text): true (set to false: hidden from the model), false (visible), null (cannot tell)

const UNKNOWN = null;
const TARGET = 'allow_implicit_invocation';
const KEY = /^(?:"([^"\\]*)"|'([^']*)'|([^\s"'#{}[\],&*!|>%@`?:-][^:#]*?|-[^\s:#][^:#]*?))[ ]*:(?:[ ]+|$)/;

/** Text without a trailing ` # comment` (a `#` inside quotes is kept). */
function stripComment(s) {
  let quote = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i);
  }
  return s;
}

/** { key, rest } of a `key: rest` line, or null when the line does not start with a simple key. */
function parseKey(line) {
  const m = KEY.exec(line);
  if (!m) return null;
  return { key: (m[1] ?? m[2] ?? m[3]).trim(), rest: line.slice(m[0].length) };
}

/** true / false for a plain boolean, 'other' for another plain or quoted scalar, UNKNOWN for anything unreadable. */
function scalar(raw) {
  const v = stripComment(raw).trim();
  if (v === '') return UNKNOWN; // value on a later line, or null: not judged
  if (/^[&*!|>%@`{[]/.test(v)) return UNKNOWN; // anchor, alias, tag, block scalar, nested flow
  if (/^["']/.test(v)) return /^(["']).*\1$/.test(v) ? 'other' : UNKNOWN;
  if (/^(true|false)$/i.test(v)) return v.toLowerCase() === 'true';
  return 'other';
}

/** Splits a flow map body at top-level commas. */
function splitFlow(body) {
  const parts = [];
  let depth = 0;
  let quote = '';
  let cur = '';
  for (const c of body) {
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
    else if (c === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

/** Folds the value of the target key into `state`; returns false when the input is unreadable. */
function take(state, kv) {
  if (kv.key === '<<') return false; // merge key: keys come from elsewhere
  if (kv.key !== TARGET) return true;
  if (state.found !== undefined) return false; // duplicate key
  const v = scalar(kv.rest);
  if (v === UNKNOWN) return false;
  state.found = v;
  return true;
}

/** Index just past the `}` that closes a flow map whose opening brace precedes `body`, or -1. */
function flowEnd(body) {
  let depth = 1;
  let quote = '';
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  return -1;
}

const result = (state) => (state.found === undefined ? false : state.found === false);

export function implicitInvocationDisabled(text) {
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines.some((l) => /^(---|\.\.\.)(\s|$)/.test(l) || l.startsWith('%'))) return UNKNOWN;
  if (lines.some((l) => /^ *\t/.test(l))) return UNKNOWN;
  // Blank and comment-only lines are dropped (a comment at any indentation does not end a block).
  const rows = lines.filter((l) => stripComment(l).trim() !== '');

  let policyAt = -1;
  for (let r = 0; r < rows.length; r++) {
    if (/^\s/.test(rows[r]) || parseKey(rows[r])?.key !== 'policy') continue;
    if (policyAt >= 0) return UNKNOWN; // duplicate key
    policyAt = r;
  }
  if (policyAt < 0) return false;

  const rest = stripComment(parseKey(rows[policyAt]).rest).trim();
  const state = { found: undefined };

  if (rest.startsWith('{')) {
    let body = rest.slice(1);
    for (let r = policyAt; ; ) {
      const end = flowEnd(body);
      if (end >= 0) {
        for (const part of splitFlow(body.slice(0, end))) {
          const kv = parseKey(part.trim().replace(/^([^:]*:)(?=\S)/, '$1 ') + ' ');
          if (!kv || !take(state, kv)) return UNKNOWN;
        }
        return result(state);
      }
      if (++r >= rows.length) return UNKNOWN; // never closed
      body += ` ${stripComment(rows[r]).trim()}`;
    }
  }
  if (rest !== '' && rest !== '~' && rest !== 'null') return UNKNOWN; // scalar or alias instead of a map

  let indent = -1;
  for (let r = policyAt + 1; r < rows.length && /^\s/.test(rows[r]); r++) {
    const ind = /^ */.exec(rows[r])[0].length;
    if (indent < 0) indent = ind;
    if (ind < indent) return UNKNOWN; // dedent that does not end the block
    if (ind > indent) continue; // belongs to a deeper key
    const kv = parseKey(rows[r].slice(ind));
    if (!kv || !take(state, kv)) return UNKNOWN;
  }
  return result(state);
}
