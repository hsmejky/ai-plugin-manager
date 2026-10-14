#!/usr/bin/env node
// check-setup: verify the shared agent setup. Read-only; never changes anything.
//
// runChecks(env) -> Promise<Finding[]>
//   env = { projectDir, homeDir, platform, runCommand, live }
//   runCommand(cmd, args) -> Promise<{ ok, stdout?, error? }>  (never throws)
// To add a check group: create checks/<group>.mjs exporting an async function
// (env) => Finding[] and append it to CHECK_GROUPS below.
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkProjectInstructions } from './checks/project-instructions.mjs';
import { checkPluginDeclarations } from './checks/plugin-declarations.mjs';

import { checkHostTrust } from './checks/host-trust.mjs';
import { checkMarketplacePlugins } from './checks/marketplace-plugins.mjs';

import { checkLiveSkills } from './checks/live-skills.mjs';

const CHECK_GROUPS = [checkProjectInstructions, checkPluginDeclarations, checkHostTrust, checkMarketplacePlugins, checkLiveSkills];

export async function runChecks(env) {
  const findings = [];
  for (const group of CHECK_GROUPS) findings.push(...(await group(env)));
  return findings;
}

// opts: { cwd, timeout } (model calls pass a longer timeout). stdin is closed so a CLI never waits on it.
export function defaultRunCommand(cmd, args, opts = {}) {
  return new Promise((done) => {
    const child = execFile(
      cmd,
      args,
      { timeout: opts.timeout ?? 30000, cwd: opts.cwd, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (!err) return done({ ok: true, stdout });
        const detail = (stderr || stdout || '').toString().trim().split(/\r?\n/).slice(-3).join(' ').slice(0, 300);
        done({ ok: false, error: detail ? `${err.message} | ${detail}` : err.message });
      },
    );
    child.stdin?.end();
  });
}

function gitTopLevel(dir) {
  return new Promise((done) => {
    execFile('git', ['rev-parse', '--show-toplevel'], { cwd: dir }, (err, stdout) =>
      done(err ? dir : stdout.trim()),
    );
  });
}

export async function main(argv) {
  const live = argv.includes('--live');
  const i = argv.indexOf('--project');
  const start = resolve(i >= 0 && argv[i + 1] ? argv[i + 1] : process.cwd());
  const projectDir = i >= 0 ? start : await gitTopLevel(start);
  const findings = await runChecks({
    projectDir,
    homeDir: homedir(),
    platform: process.platform,
    runCommand: defaultRunCommand,
    live,
  });
  process.stdout.write(JSON.stringify({ projectDir, findings }, null, 2) + '\n');
  return findings.some((f) => f.status === 'fail') ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
