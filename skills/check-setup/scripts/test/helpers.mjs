import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/** Create a fixture directory from { 'relative/path': 'content' }. */
export function fixture(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'check-setup-'));
  for (const [rel, content] of Object.entries(files)) {
    const file = join(dir, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return dir;
}

/** Build a runChecks env around a fixture project. */
export function envFor(projectDir, overrides = {}) {
  return {
    projectDir,
    homeDir: fixture(),
    platform: 'linux',
    runCommand: async () => ({ ok: false, error: 'command not found' }),
    live: false,
    ...overrides,
  };
}

export const find = (findings, id) => findings.filter((f) => f.id === id);
