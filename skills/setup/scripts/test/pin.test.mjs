// `--pin <m> --ref <r>` and `--unpin <m>`: move both Hosts' marketplace ref together (#68),
// through planSetup / applySetup / runCli against the fake Hosts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { planSetup, applySetup, runCli } from '../setup.mjs';
import { runChecks } from '../../../check-setup/scripts/check-setup.mjs';
import { machine, writeCalls } from './fake-host.mjs';

const CLAUDE = '.claude/settings.json';
const CODEX = '.codex/config.toml';
const read = (m, rel) => readFileSync(join(m.projectDir, rel), 'utf8');
const claudeRef = (m, name) => JSON.parse(read(m, CLAUDE)).extraKnownMarketplaces[name].source.ref;
const pOk = (findings) => findings.filter((f) => ['P8', 'P9'].includes(f.id) && f.status !== 'pass');

test('a pin is set in both files; P8 and P9 pass afterwards', async () => {
  const m = machine();
  const plan = await planSetup(m.env, { pin: 'mattpocock', ref: 'v1.3.1' });
  assert.equal(plan.refused, undefined);
  assert.deepEqual(plan.projectEdits.map((e) => e.file), [CLAUDE, CODEX]);
  const report = await applySetup(m.env, plan);
  assert.equal(report.exit, 0);
  assert.equal(claudeRef(m, 'mattpocock'), 'v1.3.1');
  assert.equal(claudeRef(m, 'ai-plugin-manager'), undefined);
  assert.match(read(m, CODEX), /\[marketplaces\.mattpocock\]\nsource_type = "git"\nsource = "https:\/\/github\.com\/mattpocock\/skills\.git"\nref = "v1\.3\.1"\n\n\[plugins/);
  assert.deepEqual(pOk(await runChecks(m.env)), []);
  assert.ok(report.responsible.some((r) => r.startsWith('P9:')));
});

test('a pin is moved: the old ref is replaced in both files, comments and other lines kept', async () => {
  const claude = JSON.stringify({
    enabledPlugins: { 'a@m': true },
    extraKnownMarketplaces: { m: { source: { source: 'github', repo: 'acme/m', ref: 'v1.0.0' }, autoUpdate: true } },
  }, null, 2) + '\n';
  const codex = '[marketplaces.m]\nsource_type = "git"\nsource = "https://github.com/acme/m.git"\nref = "v1.0.0" # release\n\n[plugins."a@m"]\nenabled = true\n';
  const m = machine({ claudeSettings: claude, codexConfig: codex });
  const plan = await planSetup(m.env, { pin: 'm', ref: 'v2.0.0' });
  const [c, x] = plan.projectEdits.map((e) => e.after);
  assert.equal(JSON.parse(c).extraKnownMarketplaces.m.source.ref, 'v2.0.0');
  assert.equal(JSON.parse(c).extraKnownMarketplaces.m.autoUpdate, true);
  assert.equal(x, codex.replace('ref = "v1.0.0"', 'ref = "v2.0.0"'));
});

test('a branch name is accepted as a ref', async () => {
  const m = machine();
  const plan = await planSetup(m.env, { pin: 'mattpocock', ref: 'release/1.x' });
  assert.equal(plan.refused, undefined);
});

test('unpin removes the ref from both files; a second unpin is a no-op', async () => {
  const m = machine();
  const original = machine();
  await applySetup(m.env, await planSetup(m.env, { pin: 'mattpocock', ref: 'v1.3.1' }));
  const plan = await planSetup(m.env, { unpin: 'mattpocock' });
  assert.deepEqual(plan.projectEdits.map((e) => e.file), [CLAUDE, CODEX]);
  const report = await applySetup(m.env, plan);
  assert.equal(report.exit, 0);
  assert.equal(claudeRef(m, 'mattpocock'), undefined);
  assert.equal(read(m, CODEX), read(original, CODEX));
  assert.deepEqual(pOk(await runChecks(m.env)), []);
  assert.deepEqual((await planSetup(m.env, { unpin: 'mattpocock' })).projectEdits, []);
});

test('a half-pinned marketplace is aligned by a pin and cleared by an unpin', async () => {
  const claude = JSON.stringify({
    extraKnownMarketplaces: { m: { source: { source: 'github', repo: 'acme/m' }, autoUpdate: true } },
    enabledPlugins: { 'a@m': true },
  }, null, 2) + '\n';
  const codex = '[marketplaces.m]\nsource_type = "git"\nsource = "https://github.com/acme/m.git"\nref = "v1"\n\n[plugins."a@m"]\nenabled = true\n';
  const m = machine({ claudeSettings: claude, codexConfig: codex });
  const un = await planSetup(m.env, { unpin: 'm' });
  assert.deepEqual(un.projectEdits.map((e) => e.file), [CODEX]);
  const pin = await planSetup(m.env, { pin: 'm', ref: 'v1' });
  assert.deepEqual(pin.projectEdits.map((e) => e.file), [CLAUDE]);
});

test('refusal: a full 40-hex SHA (P9) and a short hex ref (P8) write nothing and exit 2', async () => {
  const m = machine();
  const before = [read(m, CLAUDE), read(m, CODEX)];
  for (const ref of ['a'.repeat(40), 'ABCDEF1234567890ABCDEF1234567890ABCDEF12', 'abc1234', '1234567']) {
    const { code, json } = await runCli(['apply', '--pin', 'mattpocock', '--ref', ref, '--expect', 'x'], m.env);
    assert.equal(code, 2, ref);
    assert.match(json.refused.message, /SHA|hex/i, ref);
    assert.deepEqual(json.projectEdits, []);
  }
  assert.match((await planSetup(m.env, { pin: 'mattpocock', ref: 'a'.repeat(40) })).refused.message, /P9/);
  assert.match((await planSetup(m.env, { pin: 'mattpocock', ref: 'abc1234' })).refused.message, /P8/);
  assert.deepEqual(writeCalls(m.calls), []);
  assert.deepEqual([read(m, CLAUDE), read(m, CODEX)], before);
});

test('refusal: bad request shapes, unknown marketplace, one-Host declaration, unsupported TOML shape', async () => {
  const m = machine();
  assert.match((await planSetup(m.env, { pin: 'mattpocock' })).refused.message, /--ref/);
  assert.match((await planSetup(m.env, { pin: 'mattpocock', ref: ' v1' })).refused.message, /whitespace|empty/);
  assert.match((await planSetup(m.env, { pin: 'nope', ref: 'v1' })).refused.message, /not declared/);
  assert.match((await planSetup(m.env, { unpin: 'nope' })).refused.message, /not declared/);

  const half = machine({ codexConfig: '' });
  assert.match((await planSetup(half.env, { pin: 'mattpocock', ref: 'v1' })).refused.message, /both Hosts/);

  const inline = '[marketplaces]\nm = { source_type = "git", source = "https://github.com/acme/m.git" }\n';
  const claude = JSON.stringify({ extraKnownMarketplaces: { m: { source: { source: 'github', repo: 'acme/m' } } }, enabledPlugins: {} });
  const odd = machine({ claudeSettings: claude, codexConfig: inline });
  assert.match((await planSetup(odd.env, { pin: 'm', ref: 'v1' })).refused.message, /by hand/);
});

test('the CLI takes --pin/--ref and --unpin; a usage error exits 2; the digest covers the pin', async () => {
  const m = machine();
  const { json: plan, code } = await runCli(['plan', '--pin', 'mattpocock', '--ref', 'v1.3.1'], m.env);
  assert.equal(code, 0);
  assert.deepEqual(writeCalls(m.calls), []);
  assert.equal((await runCli(['apply', '--pin', 'mattpocock', '--ref', 'v9', '--expect', plan.digest], m.env)).code, 2);
  assert.equal((await runCli(['apply', '--pin', 'mattpocock', '--ref', 'v1.3.1', '--expect', plan.digest], m.env)).code, 0);
  assert.equal(claudeRef(m, 'mattpocock'), 'v1.3.1');
  assert.equal((await runCli(['plan', '--ref', 'v1'], m.env)).code, 2);
  assert.equal((await runCli(['plan', '--pin', 'mattpocock', '--unpin', 'mattpocock'], m.env)).code, 2);
  assert.equal((await runCli(['plan', '--pin', 'mattpocock', '--add', 'a@b'], m.env)).code, 2);
  assert.equal((await runCli(['apply', '--unpin', 'mattpocock', '--expect', 'x'], m.env)).code, 2);
});

test('a pinned marketplace is added with #ref and the pin survives the machine steps byte for byte', async () => {
  const m = machine({ registered: { claude: ['ai-plugin-manager'] } });
  const plan = await planSetup(m.env, { pin: 'mattpocock', ref: 'v1.3.1' });
  const args = plan.hosts.claude.steps.find((s) => s.args[2] === 'add').args;
  assert.equal(args[3], 'mattpocock/skills#v1.3.1');
  const edited = plan.projectEdits.find((e) => e.file === CLAUDE).after;
  await applySetup(m.env, plan);
  assert.equal(read(m, CLAUDE), edited);
});
