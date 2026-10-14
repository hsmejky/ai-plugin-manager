// L1 (opt-in, env.live): ask each Host non-interactively which skills it sees and compare with the
// skills the installed plugins are expected to provide. Runs a model call, so nothing happens without env.live.
//
//   expectedSkills(pluginDir) -> string[] | null   (null: directory missing)
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';

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
