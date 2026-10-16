// R29: the one rule for closing references. A reference is one of GitHub's nine closing keywords
// (case-insensitive, optional colon) followed by `#n` or `owner/repo#n`. Sidebar links, `Part of`
// and `Refs` do not count.
const CLOSING = /(?<![\w-])(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)(?![\w-]):?[ \t]+(?:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+))?#(\d+)(?!\w)/gi;

/** @returns {{repo: string|null, number: number}[]} unique references in order of appearance; repo is null for `#n`. */
export function parseClosingRefs(body) {
  const seen = new Set();
  const refs = [];
  for (const m of String(body ?? "").matchAll(CLOSING)) {
    const repo = m[1] ?? null;
    const number = Number(m[2]);
    const key = `${repo?.toLowerCase() ?? ""}#${number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ repo, number });
  }
  return refs;
}
