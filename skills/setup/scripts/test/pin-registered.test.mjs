// Pin, unpin and the digest on a machine where Claude Code already has the marketplace registered (#71 review H1, M1).
// Claude Code 2.1.299, run live: `marketplace update` keeps the registered ref, `marketplace list --json` shows it,
// and `marketplace add <src>#<ref> --scope project` again moves it (no removal needed); without `#<ref>` it clears it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { planSetup, applySetup, runCli } from '../setup.mjs';
import { machine, writeCalls } from './fake-host.mjs';

const CODEX = '.codex/config.toml';
const steps = (plan) => plan.hosts.claude.steps.map((s) => s.args.slice(0, 4).join(' '));
const registered = (ref) => machine({ registered: { claude: ['mattpocock'] }, registeredRefs: { claude: ref ? { mattpocock: ref } : {} } });
const PINNED = {
  claudeSettings: JSON.stringify({
    enabledPlugins: { 'mattpocock-skills@mattpocock': true },
    extraKnownMarketplaces: { mattpocock: { source: { source: 'github', repo: 'mattpocock/skills', ref: 'v1.3.1' } } },
  }, null, 2) + '\n',
  codexConfig: '[marketplaces.mattpocock]\nsource_type = "git"\nsource = "https://github.com/mattpocock/skills.git"\nref = "v1.3.1"\n\n[plugins."mattpocock-skills@mattpocock"]\nenabled = true\n',
};

test('pin on a registered marketplace re-adds it at the new ref instead of only refreshing it', async () => {
  const m = registered('v1.0.0');
  const plan = await planSetup(m.env, { pin: 'mattpocock', ref: 'v1.3.1' });
  assert.ok(steps(plan).includes('plugin marketplace add mattpocock/skills#v1.3.1'));
  assert.ok(!steps(plan).includes('plugin marketplace update mattpocock'));
  const report = await applySetup(m.env, plan);
  assert.equal(report.exit, 0);
  assert.equal(m.state.claude.refs.mattpocock, 'v1.3.1');
});

test('pin on a registered marketplace that was added without a ref re-adds it too', async () => {
  const m = registered(null);
  const plan = await planSetup(m.env, { pin: 'mattpocock', ref: 'v1.3.1' });
  assert.ok(steps(plan).includes('plugin marketplace add mattpocock/skills#v1.3.1'));
});

test('unpin on a registered marketplace re-adds it without a ref', async () => {
  const m = machine({ ...PINNED, registered: { claude: ['mattpocock'] }, registeredRefs: { claude: { mattpocock: 'v1.3.1' } } });
  const plan = await planSetup(m.env, { unpin: 'mattpocock' });
  assert.ok(steps(plan).includes('plugin marketplace add mattpocock/skills'));
  await applySetup(m.env, plan);
  assert.equal(m.state.claude.refs.mattpocock, undefined);
});

test('a registered marketplace already at the declared ref is only refreshed', async () => {
  const m = machine({ ...PINNED, registered: { claude: ['mattpocock'] }, registeredRefs: { claude: { mattpocock: 'v1.3.1' } } });
  const plan = await planSetup(m.env, {});
  assert.ok(steps(plan).includes('plugin marketplace update mattpocock'));
  assert.ok(!steps(plan).some((s) => s.startsWith('plugin marketplace add')));
});

test('the digest covers the request and the project edits, not only the Host steps', async () => {
  const m = registered('v1.3.1');
  const { json: plan } = await runCli(['plan', '--pin', 'mattpocock', '--ref', 'v2'], m.env);
  const { json: other } = await runCli(['plan', '--pin', 'mattpocock', '--ref', 'v3'], m.env);
  assert.notEqual(plan.digest, other.digest);
  const { code } = await runCli(['apply', '--pin', 'mattpocock', '--ref', 'v3', '--expect', plan.digest], m.env);
  assert.equal(code, 2);
  assert.deepEqual(m.writes, []);
  assert.deepEqual(writeCalls(m.calls), []);
});

test('apply exits 2 and writes nothing when a project file changed after the plan', async () => {
  const m = machine();
  const { json: plan } = await runCli(['plan', '--pin', 'mattpocock', '--ref', 'v1.3.1'], m.env);
  const file = join(m.projectDir, CODEX);
  writeFileSync(file, readFileSync(file, 'utf8') + '\n# edited after the plan\n');
  const { code } = await runCli(['apply', '--pin', 'mattpocock', '--ref', 'v1.3.1', '--expect', plan.digest], m.env);
  assert.equal(code, 2);
  assert.deepEqual(m.writes, []);
});
