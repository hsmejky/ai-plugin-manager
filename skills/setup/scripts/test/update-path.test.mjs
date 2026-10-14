// The update path of the setup skill (#66): plugins already installed in one or both Hosts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { planSetup, applySetup } from '../setup.mjs';
import { machine } from './fake-host.mjs';

const cmds = (plan, host) => plan.hosts[host].steps.map((s) => [s.cmd, ...s.args].join(' '));
const ID = 'ai-plugin-manager@ai-plugin-manager';
const MP = 'mattpocock-skills@mattpocock';
const both = ['mattpocock', 'ai-plugin-manager'];
const installedBoth = (extra = {}) => machine({
  registered: { claude: both, codex: both },
  installed: { claude: { [ID]: '0.5.0', [MP]: '1.3.0' }, codex: { [ID]: '0.5.0', [MP]: '1.3.0' } },
  ...extra,
});

test('already-installed plugins in both Hosts: update steps only, no add or install', async () => {
  const plan = await planSetup(installedBoth().env);
  assert.deepEqual(cmds(plan, 'claude'), [
    'claude plugin marketplace update mattpocock --json',
    'claude plugin marketplace update ai-plugin-manager --json',
    `claude plugin update ${MP} --scope project --json`,
    `claude plugin update ${ID} --scope project --json`,
  ]);
  assert.deepEqual(cmds(plan, 'codex'), [
    'codex plugin marketplace upgrade mattpocock --json',
    'codex plugin marketplace upgrade ai-plugin-manager --json',
  ]);
  assert.deepEqual([...cmds(plan, 'claude'), ...cmds(plan, 'codex')].filter((c) => /marketplace add| install /.test(c)), []);
  assert.deepEqual(plan.manual.map((x) => x.host).sort(), ['claude', 'codex']);
});

test('the report gives the version change per plugin in both Hosts, unchanged plugins marked', async () => {
  const m = installedBoth();
  m.state.claude.plugins[MP] = '1.3.1'; // already current
  const report = await applySetup(m.env, await planSetup(m.env));
  assert.equal(report.exit, 0);
  const row = (host, id) => {
    const v = report.hosts[host].versions.find((x) => x.id === id);
    return [v.before, v.after, v.changed];
  };
  assert.deepEqual(row('claude', ID), ['0.5.0', '0.6.0', true]);
  assert.deepEqual(row('claude', MP), ['1.3.1', '1.3.1', false]);
  assert.deepEqual(row('codex', ID), ['0.5.0', '0.6.0', true]);
  assert.deepEqual(report.hosts.claude.changes.map((c) => c.id), [ID]);
  assert.deepEqual(report.hosts.codex.changes.map((c) => c.id).sort(), [ID, MP].sort());
  assert.ok(report.manual.some((x) => x.host === 'claude' && /reload-plugins/.test(x.what)));
  assert.ok(report.manual.some((x) => x.host === 'codex' && /new Codex session/.test(x.what)));
});

test('a pinned marketplace: add args carry #ref, Codex args carry no ref, committed files stay byte-identical', async () => {
  const claudeSettings = JSON.stringify({
    enabledPlugins: { [ID]: true },
    extraKnownMarketplaces: { 'ai-plugin-manager': { source: { source: 'github', repo: 'hsmejky/ai-plugin-manager', ref: 'v0.5.0' }, autoUpdate: true } },
  }, null, 2) + '\n';
  const codexConfig = `[marketplaces.ai-plugin-manager]\nsource_type = "git"\nsource = "https://github.com/hsmejky/ai-plugin-manager.git"\nref = "v0.5.0"\n\n[plugins."${ID}"]\nenabled = true\n`;
  const check = (m) => {
    assert.equal(readFileSync(m.settingsPath, 'utf8'), claudeSettings);
    assert.equal(readFileSync(join(m.projectDir, '.codex', 'config.toml'), 'utf8'), codexConfig);
  };
  const fresh = machine({ claudeSettings, codexConfig });
  const plan = await planSetup(fresh.env);
  assert.equal(cmds(plan, 'claude')[0], 'claude plugin marketplace add hsmejky/ai-plugin-manager#v0.5.0 --scope project --json');
  assert.ok(plan.hosts.codex.steps.every((s) => !s.args.some((a) => a.includes('v0.5.0'))));
  await applySetup(fresh.env, plan);
  check(fresh);

  const done = machine({
    claudeSettings, codexConfig,
    registered: { claude: ['ai-plugin-manager'], codex: ['ai-plugin-manager'] },
    registeredRefs: { claude: { 'ai-plugin-manager': 'v0.5.0' } },
    installed: { claude: { [ID]: '0.5.0' }, codex: { [ID]: '0.5.0' } },
  });
  const updatePlan = await planSetup(done.env);
  assert.ok(cmds(updatePlan, 'claude').every((c) => !c.includes('v0.5.0') && !/ add | install /.test(c)));
  await applySetup(done.env, updatePlan);
  check(done);
});

test('a failed update step stops only that Host; the other Host still reports its versions', async () => {
  const m = installedBoth({ failClaude: (args) => args[1] === 'update' });
  const report = await applySetup(m.env, await planSetup(m.env));
  assert.equal(report.hosts.claude.status, 'failed');
  assert.equal(report.hosts.claude.steps.filter((s) => s.status === 'failed').length, 1);
  assert.equal(report.hosts.claude.steps.length, 3);
  assert.ok(Array.isArray(report.hosts.claude.versions));
  assert.equal(report.hosts.codex.status, 'done');
  assert.ok(report.hosts.codex.versions.some((v) => v.changed));
  assert.equal(report.exit, 1);
});
