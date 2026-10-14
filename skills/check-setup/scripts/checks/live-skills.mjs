// L1 (opt-in, env.live): ask each Host non-interactively which skills it sees and compare with the
// skills the installed plugins are expected to provide. Runs a model call, so nothing happens without env.live.
//
//   expectedSkills(pluginDir): skill names a model should see for a plugin directory (null: directory missing)
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { readJson } from '../files.mjs';
import { pass, fail, skip } from '../findings.mjs';
import { HOST, HOSTS, skipUnlessRunnable } from '../hosts.mjs';

import { listInstalledPlugins } from '../plugins.mjs';



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
function expectedSkills(pluginDir) {
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

/** Skill names found in a model reply: one token per line, bullets/backticks/`plugin:` prefix removed. */
function parseSkillNames(text) {
  const names = new Set();
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim().replace(/^(?:[-*•]|\d+[.)])\s+/, '').replace(/[`*]/g, '').trim();
    if (!/^[\w.:-]+$/.test(line) || line.toUpperCase() === 'NONE') continue;
    names.add(line.slice(line.lastIndexOf(':') + 1));
  }
  return names;
}

async function checkHost(host, decl, hostInfo, env) {
  const base = { id: 'L1', host, layer: 'machine' };
  const { label, configFile } = HOST[host];
  const skipped = skipUnlessRunnable(host, decl, hostInfo, base);
  if (skipped) return skipped;
  if (decl.plugins.size === 0) return skip(base, `${configFile} enables no plugin`);
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
    const dir = HOST[host].pluginDir(plugin, env);
    const expected = dir ? expectedSkills(dir) : null;
    if (expected === null) {
      notes.push(`${id}: plugin directory not found (${dir || 'no installPath'}), cannot determine its skills`);
      continue;
    }
    if (expected.length === 0) {
      notes.push(`${id} provides no model-invocable skill`);
      continue;
    }
    const reply = await env.runCommand(host, HOST[host].promptArgs(promptFor(plugin.name)), {
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

export async function checkLiveSkills(env, { hosts, decls }) {
  if (!env.live) return [];
  const findings = [];
  for (const host of HOSTS) findings.push(await checkHost(host, decls[host], hosts[host], env));
  return findings;
}
