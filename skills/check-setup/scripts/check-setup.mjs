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

import { checkHostTrust } from './checks/host-trust.mjs';

const CHECK_GROUPS = [checkProjectInstructions, checkHostTrust];

export async function runChecks(env) {
  const findings = [];
  for (const group of CHECK_GROUPS) findings.push(...(await group(env)));
  return findings;
}

export function defaultRunCommand(cmd, args) {
  return new Promise((done) => {
    execFile(cmd, args, { timeout: 30000, windowsHide: true }, (err, stdout) =>
      done(err ? { ok: false, error: err.message } : { ok: true, stdout }),
    );
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
