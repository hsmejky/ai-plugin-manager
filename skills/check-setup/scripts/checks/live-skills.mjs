// L1 (opt-in, env.live): ask each Host non-interactively which skills it sees and compare with the
// skills the installed plugins are expected to provide. Runs a model call, so nothing happens without env.live.
//
//   expectedSkills(pluginDir) -> string[] | null   (null: directory missing)
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pass, fail, skip } from '../findings.mjs';
import { HOSTS, HOST_LABELS, detectHosts } from '../hosts.mjs';
import { loadDeclarations, CLAUDE_SETTINGS, CODEX_CONFIG } from '../declarations.mjs';
import { listInstalledPlugins } from './marketplace-plugins.mjs';

const CONFIG_FILE = { claude: CLAUDE_SETTINGS, codex: CODEX_CONFIG };

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** { name, userOnly } from a skill directory, or null when it has no SKILL.md. */
function readSkill(dir) {
  const file = join(dir, 'SKILL.md');
  if (!existsSync(file)) return null;
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const fm = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? '';
  const name = /^name:\s*["']?([^"'\n]+?)["']?\s*$/m.exec(fm)?.[1] ?? basename(dir);
  const userOnly = /^disable-model-invocation:\s*true\s*$/m.test(fm);
  return { name, userOnly };
}

/**
 * Names of the skills a model should see for a plugin directory: the manifest `skills` array
 * (`.claude-plugin/plugin.json`), else every `skills/<name>/SKILL.md`. Skills with
 * `disable-model-invocation: true` are user-only and excluded.
 */
export function expectedSkills(pluginDir) {
  if (!existsSync(pluginDir)) return null;
  const listed = readJson(join(pluginDir, '.claude-plugin', 'plugin.json'))?.skills;
  let dirs;
  if (Array.isArray(listed) && listed.length > 0) {
    dirs = listed.filter((p) => typeof p === 'string').map((p) => join(pluginDir, p));
  } else {
    const root = join(pluginDir, 'skills');
    dirs = existsSync(root)
      ? readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => join(root, e.name))
      : [];
  }
  const names = dirs.map(readSkill).filter((s) => s && !s.userOnly).map((s) => s.name);
  return [...new Set(names)].sort();
}

// ---- L1 check ----------------------------------------------------------------------------------

const LIVE_TIMEOUT_MS = 180000;

const promptFor = (plugin) =>
  `List the names of all skills available to you that come from the ${plugin} plugin. ` +
  'Output only the names, one per line, or NONE. Do not run any tools.';

// Never pass --bare to claude: it skips plugin sync, so plugin skills would not be visible.
const invocation = (host, prompt) =>
  host === 'claude' ? ['-p', prompt] : ['exec', '--skip-git-repo-check', prompt];

/** Skill names found in a model reply: one token per line, bullets/backticks/`plugin:` prefix removed. */
export function parseSkillNames(text) {
  const names = new Set();
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim().replace(/^(?:[-*•]|\d+[.)])\s+/, '').replace(/[`*]/g, '').trim();
    if (!/^[\w.:-]+$/.test(line) || line.toUpperCase() === 'NONE') continue;
    names.add(line.slice(line.lastIndexOf(':') + 1));
  }
  return names;
}

function pluginDir(host, plugin, env) {
  if (host === 'claude') return plugin.installPath;
  return join(env.homeDir, '.codex', 'plugins', 'cache', plugin.marketplace, plugin.name, plugin.version ?? '');
}

async function checkHost(host, decl, hostInfo, env) {
  const base = { id: 'L1', host, layer: 'machine' };
  const label = HOST_LABELS[host];
  if (!hostInfo.installed) return skip(base, `${label} CLI is not installed (see M1)`);
  if (decl.state !== 'ok' || decl.plugins.size === 0) return skip(base, `${CONFIG_FILE[host]} enables no plugin`);
  const list = await listInstalledPlugins(host, env);
  if (!list.ok) return skip(base, `Could not list ${label} plugins (${list.error})`);

  const missing = [];
  let tested = 0;
  const notes = [];
  for (const id of decl.plugins) {
    const plugin = list.plugins.find((p) => p.id === id);
    if (!plugin) {
      notes.push(`${id} is not installed (see M4)`);
      continue;
    }
    const dir = pluginDir(host, plugin, env);
    const expected = dir ? expectedSkills(dir) : null;
    if (expected === null) {
      notes.push(`${id}: plugin directory not found (${dir || 'no installPath'}), cannot determine its skills`);
      continue;
    }
    if (expected.length === 0) {
      notes.push(`${id} provides no model-invocable skill`);
      continue;
    }
    const reply = await env.runCommand(host, invocation(host, promptFor(plugin.name)), {
      cwd: env.projectDir,
      timeout: LIVE_TIMEOUT_MS,
    });
    if (!reply.ok) return skip(base, `${label} could not answer (network, authentication or CLI problem): ${reply.error}`);
    const seen = parseSkillNames(reply.stdout);
    if (seen.size === 0 && !/\bNONE\b/i.test(reply.stdout ?? '')) {
      return skip(base, `${label} answered without any skill name, so the reply cannot be judged`);
    }
    tested++;
    const absent = expected.filter((n) => !seen.has(n));
    if (absent.length > 0) missing.push({ id, absent });
  }
  if (tested === 0) return skip(base, notes.join('; ') || `${label}: nothing to test`);
  if (missing.length === 0) return pass(base, `${label} lists every expected skill of the plugins the project enables`);
  return fail(
    base,
    `${label} does not list: ${missing.map((m) => `${m.id}: ${m.absent.join(', ')}`).join('; ')}`,
    `Start a new ${label} session so plugins reload (on a fresh machine the first session only fetches the marketplace), then rerun with --live. If it persists, check M2 to M4 and that each plugin's version is current.`,
  );
}

export async function checkLiveSkills(env) {
  if (!env.live) return [];
  const decls = loadDeclarations(env.projectDir);
  const hostInfos = await detectHosts(env);
  const findings = [];
  for (const host of HOSTS) findings.push(await checkHost(host, decls[host], hostInfos[host], env));
  return findings;
}
