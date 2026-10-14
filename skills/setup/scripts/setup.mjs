#!/usr/bin/env node
// setup: bring both Hosts' Machine setup in line with the project's Project setup.
// Writes only what a confirmed plan lists (ADR 0003): `plan` is read-only, `apply --expect <digest>`
// runs exactly the plan with that digest.
//
//   planSetup(env, request) -> plan     read-only: `--version` and `list --json` commands, file reads
//   applySetup(env, plan)   -> report   runs the plan's steps, restores .claude/settings.json byte for byte
//   runCli(argv, env)       -> { code, json }
//   env = check-setup's env ({ projectDir, homeDir, codexHome, platform, runCommand, fetchJson }) plus
//         writeFile(file, data), the only way this script writes a file.
// Exit codes: 0 done, 1 a step or a check this skill is responsible for failed, 2 usage error or plan changed.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runChecks, defaultRunCommand, defaultFetchJson, gitTopLevel } from '../../check-setup/scripts/check-setup.mjs';
import { loadDeclarations, parseDeclarations, CLAUDE_SETTINGS, CODEX_CONFIG } from '../../check-setup/scripts/declarations.mjs';
import { proposeAdd, proposePin } from './project-edits.mjs';
import { detectHosts, HOST, HOSTS, compareVersions, skipUnlessRunnable } from '../../check-setup/scripts/hosts.mjs';
import { listInstalledPlugins, listMarketplaces, marketplaceOf } from '../../check-setup/scripts/plugins.mjs';
import { checkCodexFeatures } from '../../check-setup/scripts/checks/codex-features.mjs';

const STEP_TIMEOUT = 300000;
// Marketplaces Claude Code knows without a declaration: never added.
const CLAUDE_BUILTIN = new Set(['claude-plugins-official']);

// ---------------------------------------------------------------- plan

/** Why a Host gets no steps, as { status, reason, fix }, or null when it can proceed. */
async function guard(env, host, info, decl, hosts) {
  const { label } = HOST[host];
  if (!info.installed) {
    return { status: 'skipped', reason: `${label} CLI is not installed (M1)`, fix: `Install ${label} (tested with ${HOST[host].testedVersion}) and put \`${host}\` on PATH.` };
  }
  const unrunnable = skipUnlessRunnable(host, decl, info, {});
  if (unrunnable) return { status: 'skipped', reason: unrunnable.message, fix: '' };
  const trust = HOST[host].checkTrust(env);
  if (trust.status !== 'pass') return { status: 'stopped', reason: trust.message, fix: trust.fix };
  if (host === 'codex') {
    const m6 = (await checkCodexFeatures(env, { hosts })).find((f) => f.status === 'fail');
    if (m6) return { status: 'stopped', reason: m6.message, fix: m6.fix };
  }
  return null;
}

const step = (cmd, args, cwd, why, check) => ({ cmd, args, cwd, why, check });

/** `marketplace add` argument for a declared Claude marketplace, or null for a source not supported yet. */
function claudeAddArg(name, raw) {
  const base = HOST.claude.marketplaceAddArg(name, raw);
  if (raw?.source === 'github' && raw.repo) return raw.ref ? `${base}#${raw.ref}` : base;
  if (raw?.source === 'git' && raw.url && !raw.ref) return base;
  return null;
}

async function planClaude(env, decl, manual) {
  const { projectDir: cwd } = env;
  const list = await listMarketplaces('claude', env);
  if (!list.ok) return { status: 'skipped', reason: `Could not list Claude Code marketplaces (${list.error})`, fix: '', steps: [] };
  const plugins = await listInstalledPlugins('claude', env);
  if (!plugins.ok) return { status: 'skipped', reason: `Could not list Claude Code plugins (${plugins.error})`, fix: '', steps: [] };
  const registered = new Set(list.marketplaces.map((m) => m.name));
  const steps = [];
  const available = new Set(registered);
  for (const [name, entry] of decl.marketplaces) {
    if (registered.has(name) || CLAUDE_BUILTIN.has(name)) continue;
    const arg = claudeAddArg(name, entry.raw);
    if (arg === null) {
      manual.push({ host: 'claude', what: `Marketplace "${name}" has a source form setup does not add`, fix: `claude plugin marketplace add ${HOST.claude.marketplaceAddArg(name, entry.raw)}` });
      continue;
    }
    steps.push(step('claude', ['plugin', 'marketplace', 'add', arg, '--scope', 'project', '--json'], cwd, `register marketplace ${name}`, 'M3'));
    available.add(name);
  }
  for (const name of decl.marketplaces.keys()) {
    if (registered.has(name) && !CLAUDE_BUILTIN.has(name)) {
      steps.push(step('claude', ['plugin', 'marketplace', 'update', name, '--json'], cwd, `refresh marketplace ${name}`, 'M3'));
    }
  }
  for (const id of decl.plugins) {
    if (!available.has(marketplaceOf(id))) continue;
    const verb = plugins.plugins.some((p) => p.id === id) ? 'update' : 'install';
    steps.push(step('claude', ['plugin', verb, id, '--scope', 'project', '--json'], cwd, `${verb} ${id}`, 'M4'));
  }
  if (steps.some((s) => ['install', 'update'].includes(s.args[1]))) {
    manual.push({ host: 'claude', what: 'Restart Claude Code or run /reload-plugins to load installed or updated plugins', fix: '/reload-plugins' });
  }
  return { status: 'ready', reason: '', fix: '', steps };
}

function planCodex(env, decl, manual) {
  const steps = [];
  for (const [name, entry] of decl.marketplaces) {
    if (entry.raw?.source !== 'git') continue;
    steps.push(step('codex', ['plugin', 'marketplace', 'upgrade', name, '--json'], env.projectDir, `install and refresh the plugins of marketplace ${name}`, 'M4'));
  }
  if (steps.length > 0) manual.push({ host: 'codex', what: 'Start a new Codex session in the project to load the plugins', fix: 'codex' });
  return { status: 'ready', reason: '', fix: '', steps };
}

export async function planSetup(env, request = {}) {
  const hosts = await detectHosts(env);
  let decls = loadDeclarations(env.projectDir);
  let projectEdits = [];
  if (request.add || request.pin !== undefined || request.unpin !== undefined) {
    const files = { claude: readIfExists(env.projectDir, CLAUDE_SETTINGS), codex: readIfExists(env.projectDir, CODEX_CONFIG) };
    const proposal = await (request.add ? proposeAdd : proposePin)(env, files, request);
    if (proposal.refused) return finish({ request, projectEdits: [], hosts: {}, manual: [], notes: [], refused: proposal.refused });
    projectEdits = proposal.edits;
    // Machine steps follow the declarations as they will be after the edits.
    decls = parseDeclarations({ claudeText: textAfter(files.claude, projectEdits, CLAUDE_SETTINGS), codexText: textAfter(files.codex, projectEdits, CODEX_CONFIG) });
  }
  const manual = [];
  const notes = [];
  const out = {};
  for (const host of HOSTS) {
    const info = hosts[host];
    const blocked = await guard(env, host, info, decls[host], hosts);
    if (blocked) {
      out[host] = { ...blocked, steps: [] };
      if (blocked.status === 'stopped') manual.push({ host, what: blocked.reason, fix: blocked.fix });
      continue;
    }
    if (info.version && compareVersions(info.version, HOST[host].testedVersion) < 0) {
      notes.push(`${HOST[host].label} ${info.version} is older than the tested version ${HOST[host].testedVersion}`);
    }
    out[host] = host === 'claude' ? await planClaude(env, decls.claude, manual) : planCodex(env, decls.codex, manual);
  }
  return finish({ request, projectEdits, hosts: out, manual, notes });
}

const finish = (plan) => ({ digest: createHash('sha256').update(JSON.stringify(plan)).digest('hex'), ...plan });
const readIfExists = (dir, rel) => (existsSync(join(dir, rel)) ? readFileSync(join(dir, rel), 'utf8') : null);
const textAfter = (before, edits, file) => edits.find((e) => e.file === file)?.after ?? before;

// ---------------------------------------------------------------- apply

function parseJson(text) {
  const t = String(text ?? '').trim();
  for (const candidate of [t, t.split(/\r?\n/).filter(Boolean).at(-1) ?? '']) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next form
    }
  }
  return null;
}

/** Run one step; { ...step, status: 'ok' | 'failed', message }. A step fails on exit != 0 or the Host's failure field. */
async function runStep(env, s) {
  const r = await env.runCommand(s.cmd, s.args, { cwd: s.cwd, timeout: STEP_TIMEOUT });
  const json = parseJson(r.stdout);
  const errors = Array.isArray(json?.errors) ? json.errors : [];
  const failed = !r.ok || json?.outcome === 'failed' || errors.length > 0;
  const message = errors.length > 0 ? errors.join('; ') : (json?.message ?? r.error ?? '');
  return { cmd: s.cmd, args: s.args, why: s.why, status: failed ? 'failed' : 'ok', message, ...(json?.failureCode ? { failureCode: json.failureCode } : {}) };
}

async function runSteps(env, steps) {
  const done = [];
  for (const s of steps) {
    done.push(await runStep(env, s));
    if (done.at(-1).status === 'failed') break;
  }
  return done;
}

/** Version of each plugin before and after the steps: versions = [{ id, before, after, changed }], changes = the changed ones. */
function versionReport(before, after, ids) {
  const at = (r, id) => (r.ok ? r.plugins : []).find((p) => p.id === id)?.version ?? null;
  const versions = (ids ?? (after.ok ? after.plugins.map((p) => p.id) : [])).map((id) => {
    const [b, a] = [at(before, id), at(after, id)];
    return { id, before: b, after: a, changed: b !== a };
  });
  return { versions, changes: versions.filter((v) => v.changed).map(({ id, before: b, after: a }) => ({ id, before: b, after: a })) };
}

async function applyClaude(env, plan) {
  const file = join(env.projectDir, CLAUDE_SETTINGS);
  const snapshot = existsSync(file) ? readFileSync(file) : null;
  const before = await listInstalledPlugins('claude', env);
  const steps = await runSteps(env, plan.steps);
  if (snapshot && Buffer.compare(readFileSync(file), snapshot) !== 0) env.writeFile(file, snapshot);
  const ids = plan.steps.filter((s) => ['install', 'update'].includes(s.args[1])).map((s) => s.args[2]);
  const after = await listInstalledPlugins('claude', env);
  return { status: steps.some((s) => s.status === 'failed') ? 'failed' : 'done', steps, ...versionReport(before, after, ids) };
}

async function applyCodex(env, plan) {
  const before = await listInstalledPlugins('codex', env);
  const steps = await runSteps(env, plan.steps);
  const after = await listInstalledPlugins('codex', env);
  // Before the first upgrade Codex's list can fail (declared marketplaces not cloned yet): nothing was installed.
  return { status: steps.some((s) => s.status === 'failed') ? 'failed' : 'done', steps, ...versionReport(before, after) };
}

export async function applySetup(env, plan) {
  if (plan.refused) return { exit: 2, refused: plan.refused, hosts: {}, manual: [], notes: [], findings: [], responsible: [] };
  for (const e of plan.projectEdits) {
    mkdirSync(dirname(join(env.projectDir, e.file)), { recursive: true });
    env.writeFile(join(env.projectDir, e.file), e.after);
  }
  const hosts = {};
  for (const host of HOSTS) {
    const hp = plan.hosts[host];
    if (hp.status !== 'ready') {
      hosts[host] = { status: hp.status, reason: hp.reason, fix: hp.fix, steps: [] };
    } else {
      hosts[host] = host === 'claude' ? await applyClaude(env, hp) : await applyCodex(env, hp);
    }
  }
  const findings = await runChecks({ ...env, live: false });
  const ran = HOSTS.filter((h) => plan.hosts[h].status === 'ready');
  const edited = plan.projectEdits.length > 0;
  const responsible = findings.filter((f) => (['M3', 'M4'].includes(f.id) && ran.includes(f.host)) || (edited && /^P[3-9]$/.test(f.id)));
  const stepFailed = HOSTS.some((h) => hosts[h].status === 'failed');
  const exit = stepFailed || responsible.some((f) => f.status === 'fail') ? 1 : 0;
  return { exit, hosts, manual: plan.manual, notes: plan.notes, findings, responsible: responsible.map((f) => f.id + ':' + f.host) };
}

// ---------------------------------------------------------------- CLI

const USAGE = 'usage: setup.mjs plan [--add <plugin>@<marketplace> [--source <owner/repo | URL>] | --pin <marketplace> --ref <tag-or-branch> | --unpin <marketplace>] [--project <dir>] | setup.mjs apply [same flags] --expect <digest>';

export async function runCli(argv, env) {
  const [sub, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!['--expect', '--project', '--add', '--source', '--pin', '--ref', '--unpin'].includes(rest[i]) || rest[i + 1] === undefined) {
      return { code: 2, json: { error: `unsupported argument ${rest[i]}`, usage: USAGE } };
    }
    flags[rest[i]] = rest[i + 1];
  }
  if (sub !== 'plan' && sub !== 'apply') return { code: 2, json: { error: 'unknown subcommand', usage: USAGE } };
  const request = {};
  if (flags['--add']) request.add = flags['--add'];
  if (flags['--source']) {
    if (!request.add) return { code: 2, json: { error: '--source needs --add', usage: USAGE } };
    request.source = flags['--source'];
  }
  if (flags['--pin'] !== undefined) request.pin = flags['--pin'];
  if (flags['--unpin'] !== undefined) request.unpin = flags['--unpin'];
  if (flags['--ref'] !== undefined) {
    if (request.pin === undefined) return { code: 2, json: { error: '--ref needs --pin', usage: USAGE } };
    request.ref = flags['--ref'];
  }
  if (['add', 'pin', 'unpin'].filter((k) => request[k] !== undefined).length > 1) {
    return { code: 2, json: { error: 'use only one of --add, --pin, --unpin', usage: USAGE } };
  }
  if (sub === 'plan') {
    const plan = await planSetup(env, request);
    return { code: plan.refused ? 2 : 0, json: plan };
  }
  if (!flags['--expect']) return { code: 2, json: { error: 'apply needs --expect <digest>', usage: USAGE } };
  const plan = await planSetup(env, request);
  if (plan.refused) return { code: 2, json: plan };
  if (plan.digest !== flags['--expect']) return { code: 2, json: { planChanged: true, plan } };
  const report = await applySetup(env, plan);
  return { code: report.exit, json: report };
}

export async function main(argv) {
  const i = argv.indexOf('--project');
  const start = resolve(i >= 0 && argv[i + 1] ? argv[i + 1] : process.cwd());
  const projectDir = i >= 0 ? start : await gitTopLevel(start);
  const args = i >= 0 ? [...argv.slice(0, i), ...argv.slice(i + 2)] : argv;
  const env = {
    projectDir,
    homeDir: homedir(),
    codexHome: process.env.CODEX_HOME ? resolve(process.env.CODEX_HOME) : undefined,
    platform: process.platform,
    runCommand: defaultRunCommand,
    fetchJson: defaultFetchJson,
    writeFile: (file, data) => writeFileSync(file, data),
  };
  const { code, json } = await runCli(args, env);
  process.stdout.write(JSON.stringify(json, null, 2) + '\n');
  return code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
