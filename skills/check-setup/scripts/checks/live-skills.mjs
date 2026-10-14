// L1 (opt-in, env.live): ask each Host non-interactively which skills it sees and compare with the
// skills the installed plugins are expected to provide. Runs a model call, so nothing happens without env.live.
//
//   pluginSkills(pluginDir) / expectedSkills(skills, host): skills of a plugin directory and the names a Host's model should see
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { readJson } from '../files.mjs';
import { pass, fail, skip, warn } from '../findings.mjs';
import { HOST, HOSTS, skipUnlessRunnable } from '../hosts.mjs';

import { implicitInvocationDisabled } from '../openai-yaml.mjs';
import { listInstalledPlugins } from '../plugins.mjs';



/** The readSkill field that says a Host hides the skill from its model. */
const HIDDEN_KEY = { claude: 'claudeHidden', codex: 'codexHidden' };

/**
 * Whether `agents/openai.yaml` sets `policy.allow_implicit_invocation: false` (Codex hides the skill from the
 * model only for exactly that boolean): true, false, or null when the file cannot be read reliably.
 */
function codexHidden(dir) {
  const file = join(dir, 'agents', 'openai.yaml');
  if (!existsSync(file)) return false;
  try {
    return implicitInvocationDisabled(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** { name, claudeHidden, codexHidden } from a skill directory, or null when it has no SKILL.md. */
function readSkill(dir) {
  const file = join(dir, 'SKILL.md');
  if (!existsSync(file)) return null;
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const fm = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? '';
  const name = /^name:\s*["']?([^"'\n]+?)["']?\s*$/m.exec(fm)?.[1] ?? basename(dir);
  const claudeHidden = /^disable-model-invocation:\s*true\s*$/m.test(fm);
  return { name, claudeHidden, codexHidden: codexHidden(dir) };
}

/**
 * The skills of a plugin directory: the manifest `skills` array (`.claude-plugin/plugin.json`), else
 * every `skills/<name>/SKILL.md` (null: directory missing). Each Host hides a skill from the model by its
 * own setting: Claude Code by `disable-model-invocation: true`, Codex by `allow_implicit_invocation: false`.
 */
function pluginSkills(pluginDir) {
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
  return dirs.map(readSkill).filter(Boolean);
}

/** Names of the skills the Host's model should see (sorted, unique). */
function expectedSkills(skills, host) {
  const hidden = HIDDEN_KEY[host];
  return [...new Set(skills.filter((s) => s[hidden] === false).map((s) => s.name))].sort();
}

/** Warnings for skills one Host hides and the other still offers to the model; `host` is the hiding one. */
function visibilityWarnings(base, id, skills, host) {
  const mine = HIDDEN_KEY[host];
  const other = HIDDEN_KEY[host === 'claude' ? 'codex' : 'claude'];
  const [label, otherLabel] = host === 'claude' ? ['Claude Code', 'Codex'] : ['Codex', 'Claude Code'];
  const setting = {
    claude: '`disable-model-invocation: true` in SKILL.md',
    codex: '`policy.allow_implicit_invocation: false` in agents/openai.yaml',
  };
  return skills
    .filter((s) => s[mine] === true && s[other] === false)
    .map((s) =>
      warn(
        base,
        `${id}: skill ${s.name} is hidden from the model in ${label} (${setting[host]}) but ${otherLabel} still offers it`,
        `To make the skill user-only in both Hosts, set both ${setting.claude} and ${setting.codex}; to keep it model-invocable in both, remove ${setting[host].split(' in ')[0]}.`,
      ),
    );
}

/** Warnings for skills whose agents/openai.yaml cannot be read reliably: L1 does not judge their visibility. */
function unreadableWarnings(base, id, skills) {
  return skills
    .filter((s) => s.codexHidden === null)
    .map((s) =>
      warn(
        base,
        `${id}: cannot tell whether Codex hides skill ${s.name}: agents/openai.yaml is not in a form L1 reads reliably, so the skill is not checked`,
        'Write policy.allow_implicit_invocation as a plain block (policy:, then an indented allow_implicit_invocation: false) or a one-line flow map, without anchors, aliases, duplicate keys or tab indentation.',
      ),
    );
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

/**
 * Settings validation problems Claude Code (2.1.299+) prints on stderr of `claude -p`, one
 * "<file> (<entry>): <problem>" per line after the "These settings files did not load" header.
 */
function settingsErrors(stderr) {
  const text = String(stderr ?? '');
  const at = text.indexOf('settings files did not load');
  if (at < 0) return [];
  return text
    .slice(at)
    .split(/\r?\n/)
    .slice(1)
    .map((l) => l.trim())
    .filter((l) => /\(.+\):/.test(l));
}

async function checkHost(host, decl, hostInfo, env, warnings) {
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
    const skills = dir ? pluginSkills(dir) : null;
    const expected = skills && expectedSkills(skills, host);
    if (skills) warnings.push(...visibilityWarnings(base, id, skills, host));
    if (skills && host === 'codex') warnings.push(...unreadableWarnings(base, id, skills));
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
    const invalid = settingsErrors(reply.stderr);
    if (!reply.ok && invalid.length === 0) {
      return skip(base, `${label} could not answer (network, authentication or CLI problem): ${reply.error}`);
    }
    if (invalid.length > 0) {
      return fail(
        base,
        `${label} did not load these settings files, so nothing in them is in effect (plugins included): ${invalid.join('; ')}`,
        `Correct the listed entries so the settings file validates (JSON that parses can still be schema-invalid), then rerun with --live.`,
      );
    }
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
  for (const host of HOSTS) {
    const warnings = [];
    findings.push(await checkHost(host, decls[host], hosts[host], env, warnings), ...warnings);
  }
  return findings;
}
