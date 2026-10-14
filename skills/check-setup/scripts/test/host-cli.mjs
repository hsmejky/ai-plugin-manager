// Test support for host-cli.test.mjs: compare stub and real CLI JSON, and read command names from
// CLI help and from docs.
//
//   shapeMismatches(stub, real) -> ['<path>: <problem>']   stub keys and nesting missing from real output
//   helpEntries(helpText)       -> { commands: Set, flags: Set }
//   commandUsages(text)         -> [{ host, args: ['plugin', 'marketplace'?, sub?], flags: ['--x'] }]

const kind = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

/**
 * Where the real output lacks a key of the stub, or has a different type or nesting there.
 * Extra keys in the real output are fine: the checker reads only what the stubs model.
 * Each stub array entry is compared with the first real entry.
 */
export function shapeMismatches(stub, real, path = '') {
  const at = path || '(root)';
  const [s, r] = [kind(stub), kind(real)];
  if (s !== r) return [`${at}: stub has ${s}, real output has ${r}`];
  if (s === 'array') {
    if (stub.length === 0) return [];
    if (real.length === 0) return [`${path}[0]: real output has no entry to compare`];
    return stub.flatMap((entry, i) => shapeMismatches(entry, real[0], `${path}[${i}]`));
  }
  if (s !== 'object') return [];
  return Object.keys(stub).flatMap((key) => {
    const sub = path ? `${path}.${key}` : key;
    if (!Object.hasOwn(real, key)) return [`${sub}: missing in the real output`];
    return shapeMismatches(stub[key], real[key], sub);
  });
}

/**
 * Subcommand names (aliases included) from the `Commands:` section of a commander (Claude Code) or
 * clap (Codex) help text, and every `--flag` the text mentions.
 */
export function helpEntries(help) {
  const commands = new Set();
  let inCommands = false;
  for (const line of help.split(/\r?\n/)) {
    if (/^\S/.test(line)) inCommands = /^Commands:/.test(line);
    const m = inCommands && /^ {2}(\S+)/.exec(line);
    if (m) for (const name of m[1].split('|')) commands.add(name);
  }
  const flags = new Set(help.match(FLAG) ?? []);
  return { commands, flags };
}

const FLAG = /(?<![\w-])--[a-z][a-z0-9-]*/g;
const WORD = /^[a-z][a-z-]*$/;

/**
 * Host commands named in a doc or source text: `<host> plugin [marketplace] [<sub>] ... --flag` and
 * `<host> --flag ...`. A command runs to the end of its code span, string or line; `${host}` (a fix
 * template) stands for both Hosts. Other commands (`claude -p`, `codex exec`) and prose are ignored.
 */
export function commandUsages(text) {
  const usages = [];
  for (const m of text.matchAll(/(?<=^|[^\w$-]|\\n)(claude|codex|\$\{host\})([^`'"\n\\]*)/g)) {
    const tokens = m[2].trim().split(/\s+/);
    const args = [];
    if (tokens[0] === 'plugin') {
      args.push('plugin');
      if (tokens[1] === 'marketplace') args.push('marketplace');
      if (WORD.test(tokens[args.length] ?? '')) args.push(tokens[args.length]);
    } else if (!tokens[0].startsWith('--')) continue;
    const flags = m[2].match(FLAG) ?? [];
    for (const host of m[1] === '${host}' ? ['claude', 'codex'] : [m[1]]) usages.push({ host, args, flags });
  }
  return usages;
}
