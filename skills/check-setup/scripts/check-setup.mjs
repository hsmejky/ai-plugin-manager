#!/usr/bin/env node
// check-setup: verify the shared agent setup. Read-only; never changes anything.
//
// runChecks(env) -> Promise<Finding[]>
//   env = { projectDir, homeDir, platform, runCommand, live }
//   runCommand(cmd, args) -> Promise<{ ok, stdout?, error? }>  (never throws)
// To add a check group: create checks/<group>.mjs exporting an async function
// (env, { hosts, decls }) => Finding[] and append it to CHECK_GROUPS below.
// hosts = detectHosts(env) and decls = loadDeclarations(projectDir), computed once per run.
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkProjectInstructions } from './checks/project-instructions.mjs';
import { checkPluginDeclarations } from './checks/plugin-declarations.mjs';
import { checkHostTrust } from './checks/host-trust.mjs';
import { checkMarketplacePlugins } from './checks/marketplace-plugins.mjs';
import { checkLiveSkills } from './checks/live-skills.mjs';
import { checkCodexMarketplaceRef } from './checks/codex-marketplace-ref.mjs';
import { checkLatestRelease } from './checks/latest-release.mjs';
import { detectHosts } from './hosts.mjs';
import { loadDeclarations } from './declarations.mjs';

const CHECK_GROUPS = [checkProjectInstructions, checkPluginDeclarations, checkCodexMarketplaceRef, checkHostTrust, checkMarketplacePlugins, checkLiveSkills, checkLatestRelease];

export async function runChecks(env) {
  const context = { hosts: await detectHosts(env), decls: loadDeclarations(env.projectDir) };
  const findings = [];
  for (const group of CHECK_GROUPS) findings.push(...(await group(env, context)));
  return findings;
}

// opts: { cwd, timeout } (model calls pass a longer timeout). stdin is closed so a CLI never waits on it.
export function defaultRunCommand(cmd, args, opts = {}) {
  return new Promise((done) => {
    const child = execFile(
      cmd,
      args,
      // npm is npm.cmd on Windows, which execFile can run only through a shell (fixed arguments only).
      { timeout: opts.timeout ?? 30000, cwd: opts.cwd, windowsHide: true, shell: cmd === 'npm' && process.platform === 'win32', maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (!err) return done({ ok: true, stdout, stderr: String(stderr ?? '') });
        const detail = (stderr || stdout || '').toString().trim().split(/\r?\n/).slice(-3).join(' ').slice(0, 300);
        done({ ok: false, error: detail && !err.message.includes(detail) ? `${err.message} | ${detail}` : err.message, stderr: String(stderr ?? '') });
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
