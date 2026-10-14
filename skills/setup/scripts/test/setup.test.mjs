// The setup skill through its seams: planSetup / applySetup / runCli, against the fake Hosts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { planSetup, applySetup, runCli } from '../setup.mjs';
import { runChecks } from '../../../check-setup/scripts/check-setup.mjs';
import { machine, writeCalls, CATALOG } from './fake-host.mjs';

const find = (findings, id, host) => findings.filter((f) => f.id === id && (!host || f.host === host));
const cmds = (plan, host) => plan.hosts[host].steps.map((s) => [s.cmd, ...s.args].join(' '));

const CLAUDE_FRESH = [
  'claude plugin marketplace add mattpocock/skills --scope project --json',
  'claude plugin marketplace add hsmejky/ai-plugin-manager --scope project --json',
  'claude plugin install mattpocock-skills@mattpocock --scope project --json',
  'claude plugin install ai-plugin-manager@ai-plugin-manager --scope project --json',
];
const CODEX_FRESH = [
  'codex plugin marketplace upgrade mattpocock --json',
  'codex plugin marketplace upgrade ai-plugin-manager --json',
];

test('plan on a fresh machine lists each command per Host, Claude Code steps first', async () => {
  const m = machine();
  const plan = await planSetup(m.env);
  assert.equal(plan.hosts.claude.status, 'ready');
  assert.equal(plan.hosts.codex.status, 'ready');
  assert.deepEqual(cmds(plan, 'claude'), CLAUDE_FRESH);
  assert.deepEqual(cmds(plan, 'codex'), CODEX_FRESH);
  assert.ok(plan.hosts.codex.steps.every((s) => s.cwd === m.projectDir));
  assert.match(plan.digest, /^[0-9a-f]{64}$/);
  assert.ok(plan.manual.some((x) => x.host === 'claude') && plan.manual.some((x) => x.host === 'codex'));
});

test('plan is read-only: no write command, no file change', async () => {
  const m = machine();
  const before = readFileSync(m.settingsPath, 'utf8');
  await planSetup(m.env);
  assert.deepEqual(writeCalls(m.calls), []);
  assert.deepEqual(m.writes, []);
  assert.equal(readFileSync(m.settingsPath, 'utf8'), before);
});

test('apply on a fresh machine leaves no M3/M4 fail and a second plan has no install step', async () => {
  const m = machine();
  const report = await applySetup(m.env, await planSetup(m.env));
  assert.equal(report.exit, 0);
  const findings = await runChecks(m.env);
  assert.deepEqual(find(findings, 'M3').concat(find(findings, 'M4')).filter((f) => f.status === 'fail'), []);
  const again = await planSetup(m.env);
  const all = [...cmds(again, 'claude'), ...cmds(again, 'codex')];
  assert.deepEqual(all.filter((c) => /marketplace add| install /.test(c)), []);
  assert.ok(cmds(again, 'claude').some((c) => c.startsWith('claude plugin update ')));
  assert.ok(cmds(again, 'claude').some((c) => c.startsWith('claude plugin marketplace update ')));
});

test('.claude/settings.json is byte-identical after the machine steps, CRLF and autoUpdate included', async () => {
  const text = JSON.stringify({
    enabledPlugins: { 'mattpocock-skills@mattpocock': true },
    extraKnownMarketplaces: { mattpocock: { source: { source: 'github', repo: 'mattpocock/skills' }, autoUpdate: true } },
  }, null, 2).replace(/\n/g, '\r\n') + '\r\n';
  const m = machine({ claudeSettings: text });
  const before = readFileSync(m.settingsPath);
  const report = await applySetup(m.env, await planSetup(m.env));
  assert.equal(report.hosts.claude.status, 'done');
  assert.ok(Buffer.compare(readFileSync(m.settingsPath), before) === 0);
  assert.ok(m.writes.includes(m.settingsPath), 'the restore went through env.writeFile');
});

test('a missing Host is skipped and the other proceeds', async () => {
  for (const [missing, other] of [['claude', 'codex'], ['codex', 'claude']]) {
    const m = machine({ [missing]: false });
    const plan = await planSetup(m.env);
    assert.equal(plan.hosts[missing].status, 'skipped');
    assert.match(plan.hosts[missing].reason, /not installed/);
    assert.equal(plan.hosts[other].status, 'ready');
    const report = await applySetup(m.env, plan);
    assert.equal(report.hosts[missing].status, 'skipped');
    assert.equal(report.hosts[other].status, 'done');
    assert.equal(report.exit, 0);
  }
});

test('an untrusted project stops that Host with check-setup M2 fix, Windows and POSIX path forms', async () => {
  for (const platform of ['linux', 'win32']) {
    for (const host of ['claude', 'codex']) {
      const m = machine({ platform, trusted: { [host]: false } });
      const plan = await planSetup(m.env);
      const other = host === 'claude' ? 'codex' : 'claude';
      assert.equal(plan.hosts[host].status, 'stopped', `${platform} ${host}`);
      assert.deepEqual(plan.hosts[host].steps, []);
      assert.match(plan.hosts[host].fix, host === 'claude' ? /accept the workspace trust dialog/ : /trust_level = "trusted"/);
      assert.equal(plan.hosts[other].status, 'ready', `${platform} ${other}`);
    }
    const trusted = await planSetup(machine({ platform }).env);
    assert.equal(trusted.hosts.claude.status, 'ready', `${platform} trusted`);
    assert.equal(trusted.hosts.codex.status, 'ready', `${platform} trusted`);
  }
});

test('Codex plugins switched off (M6) stop Codex with the M6 fix and leave [features] alone', async () => {
  const m = machine({ codexFeaturesOff: true });
  const plan = await planSetup(m.env);
  assert.equal(plan.hosts.codex.status, 'stopped');
  assert.match(plan.hosts.codex.fix, /plugins = false/);
  assert.equal(plan.hosts.claude.status, 'ready');
  await applySetup(m.env, plan);
  assert.equal(readFileSync(join(m.homeDir, '.codex', 'config.toml'), 'utf8').includes('plugins = false'), true);
});

test('with CODEX_HOME set, Codex trust and features are read from there', async () => {
  const m = machine({ codexEnv: true });
  assert.ok(m.env.codexHome);
  assert.equal((await planSetup(m.env)).hosts.codex.status, 'ready');
  const bad = machine({ codexEnv: true, trusted: { codex: false } });
  assert.equal((await planSetup(bad.env)).hosts.codex.status, 'stopped');
  const off = machine({ codexEnv: true, codexFeaturesOff: true });
  assert.equal((await planSetup(off.env)).hosts.codex.status, 'stopped');
});

test('installed plugins get update steps; a pinned ref is passed to add and never touched', async () => {
  const claudeSettings = JSON.stringify({
    enabledPlugins: { 'ai-plugin-manager@ai-plugin-manager': true },
    extraKnownMarketplaces: { 'ai-plugin-manager': { source: { source: 'github', repo: 'hsmejky/ai-plugin-manager', ref: 'v0.5.0' }, autoUpdate: true } },
  }, null, 2) + '\n';
  const fresh = await planSetup(machine({ claudeSettings }).env);
  assert.equal(cmds(fresh, 'claude')[0], 'claude plugin marketplace add hsmejky/ai-plugin-manager#v0.5.0 --scope project --json');
  const done = machine({
    claudeSettings,
    registered: { claude: ['ai-plugin-manager'] },
    registeredRefs: { claude: { 'ai-plugin-manager': 'v0.5.0' } },
    installed: { claude: { 'ai-plugin-manager@ai-plugin-manager': '0.5.0' } },
  });
  assert.deepEqual(cmds(await planSetup(done.env), 'claude'), [
    'claude plugin marketplace update ai-plugin-manager --json',
    'claude plugin update ai-plugin-manager@ai-plugin-manager --scope project --json',
  ]);
});

test('claude-plugins-official is never added; an unsupported source becomes a manual step', async () => {
  const claudeSettings = JSON.stringify({
    enabledPlugins: { 'p@local': true },
    extraKnownMarketplaces: {
      local: { source: { source: 'directory', path: '/x/y' } },
      'claude-plugins-official': { source: { source: 'github', repo: 'anthropics/claude-plugins-official' } },
    },
  });
  const plan = await planSetup(machine({ claudeSettings }).env);
  assert.deepEqual(cmds(plan, 'claude'), []);
  assert.ok(plan.manual.some((x) => x.host === 'claude' && /local/.test(x.what)));
});

test('a failed Claude step stops the remaining Claude steps only; Codex still runs; exit 1', async () => {
  const m = machine({ failClaude: (args) => args[1] === 'install' });
  const report = await applySetup(m.env, await planSetup(m.env));
  assert.equal(report.hosts.claude.status, 'failed');
  const steps = report.hosts.claude.steps;
  assert.equal(steps.filter((s) => s.status === 'failed').length, 1);
  assert.equal(steps.length, 3);
  assert.equal(report.hosts.codex.status, 'done');
  assert.equal(report.exit, 1);
});

test('a Codex failure (exit 1, non-empty errors) fails Codex; Claude is unaffected', async () => {
  const m = machine({ failCodex: true });
  const report = await applySetup(m.env, await planSetup(m.env));
  assert.equal(report.hosts.codex.status, 'failed');
  assert.equal(report.hosts.codex.steps.length, 1);
  assert.equal(report.hosts.claude.status, 'done');
  assert.equal(report.exit, 1);
});

test('Codex reports version changes from list --json before and after', async () => {
  const m = machine({ installed: { codex: { 'ai-plugin-manager@ai-plugin-manager': '0.5.1' } }, registered: { codex: ['ai-plugin-manager'] } });
  const report = await applySetup(m.env, await planSetup(m.env));
  const change = report.hosts.codex.changes.find((c) => c.id === 'ai-plugin-manager@ai-plugin-manager');
  assert.deepEqual([change.before, change.after], ['0.5.1', CATALOG['ai-plugin-manager'].plugins['ai-plugin-manager']]);
});

test('on a fresh machine Codex lists nothing before the upgrade, so every plugin is reported as new', async () => {
  const m = machine();
  const report = await applySetup(m.env, await planSetup(m.env));
  const ids = report.hosts.codex.changes.map((c) => [c.id, c.before]);
  assert.deepEqual(ids.sort(), [['ai-plugin-manager@ai-plugin-manager', null], ['mattpocock-skills@mattpocock', null]]);
});

test('CLI: apply --expect with the plan digest runs; a changed plan exits 2 with the new plan and runs nothing', async () => {
  const m = machine();
  const plan = (await runCli(['plan'], m.env)).json;
  assert.equal((await runCli(['plan'], m.env)).code, 0);
  const stale = await runCli(['apply', '--expect', 'deadbeef'], m.env);
  assert.equal(stale.code, 2);
  assert.equal(stale.json.planChanged, true);
  assert.equal(stale.json.plan.digest, plan.digest);
  assert.deepEqual(writeCalls(m.calls), []);
  const ok = await runCli(['apply', '--expect', plan.digest], m.env);
  assert.equal(ok.code, 0);
  assert.ok(writeCalls(m.calls).length > 0);
});

test('CLI usage errors exit 2: unknown subcommand, apply without --expect, request flags not supported yet', async () => {
  const m = machine();
  for (const argv of [[], ['frobnicate'], ['apply'], ['plan', '--add', 'a@b']]) {
    assert.equal((await runCli(argv, m.env)).code, 2, argv.join(' '));
  }
  assert.deepEqual(writeCalls(m.calls), []);
});

test('apply runs only the confirmed plan: a state change in between makes the digest differ', async () => {
  const m = machine();
  const confirmed = (await runCli(['plan'], m.env)).json;
  m.state.claude.marketplaces.add('mattpocock');
  const r = await runCli(['apply', '--expect', confirmed.digest], m.env);
  assert.equal(r.code, 2);
  assert.deepEqual(writeCalls(m.calls), []);
});
