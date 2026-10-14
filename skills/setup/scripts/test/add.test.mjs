// `--add <plugin>@<marketplace> [--source]`: declare a Shared plugin in both Hosts' Project setup (#67),
// through planSetup / applySetup / runCli against the fake Hosts, and the writers on their own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { planSetup, applySetup, runCli } from '../setup.mjs';
import { runChecks } from '../../../check-setup/scripts/check-setup.mjs';
import { editJson, appendTomlTables, setTomlKey } from '../project-edits.mjs';
import { machine, writeCalls, CATALOG, CODEX_CONFIG } from './fake-host.mjs';

CATALOG.extra = { claudeArg: 'acme/extra', plugins: { tool: '1.0.0' } };

const read = (m, rel) => readFileSync(join(m.projectDir, rel), 'utf8');
const CLAUDE = '.claude/settings.json';
const CODEX = '.codex/config.toml';
const pFails = (findings) => findings.filter((f) => /^P[3-9]$/.test(f.id) && f.status === 'fail');
const cmds = (plan, host) => plan.hosts[host].steps.map((s) => [s.cmd, ...s.args].join(' '));
const crlf = (t) => t.replace(/\r?\n/g, '\r\n');

test('a new add edits both files, then installs; the edited files pass P3 to P9', async () => {
  const m = machine();
  const plan = await planSetup(m.env, { add: 'tool@extra', source: 'acme/extra' });
  assert.equal(plan.refused, undefined);
  assert.deepEqual(plan.projectEdits.map((e) => e.file), [CLAUDE, CODEX]);
  assert.ok(cmds(plan, 'claude').includes('claude plugin marketplace add acme/extra --scope project --json'));
  assert.ok(cmds(plan, 'claude').includes('claude plugin install tool@extra --scope project --json'));
  assert.ok(cmds(plan, 'codex').includes('codex plugin marketplace upgrade extra --json'));

  const report = await applySetup(m.env, plan);
  assert.equal(report.exit, 0);
  const claude = JSON.parse(read(m, CLAUDE));
  assert.deepEqual(claude.extraKnownMarketplaces.extra, { source: { source: 'github', repo: 'acme/extra' }, autoUpdate: true });
  assert.equal(claude.enabledPlugins['tool@extra'], true);
  assert.deepEqual(Object.keys(claude.extraKnownMarketplaces), ['mattpocock', 'ai-plugin-manager', 'extra']);
  assert.match(read(m, CODEX), /\[marketplaces\.extra\]\nsource_type = "git"\nsource = "https:\/\/github\.com\/acme\/extra\.git"\n\n\[plugins\."tool@extra"\]\nenabled = true\n$/);
  assert.ok(read(m, CODEX).startsWith(CODEX_CONFIG), 'existing text is kept');
  assert.deepEqual(pFails(await runChecks(m.env)), []);
  assert.ok(report.responsible.some((r) => r.startsWith('P3:')), 'P3 to P9 are responsible checks after an edit');
});

test('a git URL source is declared as a git source in Claude and as is in Codex', async () => {
  const m = machine();
  const plan = await planSetup(m.env, { add: 'tool@extra', source: 'https://example.com/acme/extra.git' });
  const [claude, codex] = plan.projectEdits.map((e) => e.after);
  assert.deepEqual(JSON.parse(claude).extraKnownMarketplaces.extra.source, { source: 'git', url: 'https://example.com/acme/extra.git' });
  assert.match(codex, /source = "https:\/\/example\.com\/acme\/extra\.git"/);
});

test('an add mirrored from one Host copies the declared source and pin to the other', async () => {
  const claudeOnly = JSON.stringify({
    extraKnownMarketplaces: { extra: { source: { source: 'github', repo: 'acme/extra', ref: 'v1.2.0' }, autoUpdate: true } },
    enabledPlugins: {},
  }, null, 2) + '\n';
  const m = machine({ claudeSettings: claudeOnly, codexConfig: '' });
  const plan = await planSetup(m.env, { add: 'tool@extra' });
  assert.deepEqual(plan.projectEdits.map((e) => e.file), [CLAUDE, CODEX]);
  const claude = JSON.parse(plan.projectEdits[0].after);
  assert.equal(claude.enabledPlugins['tool@extra'], true);
  assert.deepEqual(claude.extraKnownMarketplaces.extra.source.ref, 'v1.2.0');
  assert.match(plan.projectEdits[1].after, /source = "https:\/\/github\.com\/acme\/extra\.git"\nref = "v1\.2\.0"\n/);
  await applySetup(m.env, plan);
  assert.deepEqual(pFails(await runChecks(m.env)).concat((await runChecks(m.env)).filter((f) => f.id === 'P9' && f.status !== 'pass')), []);

  // and the other way round: declared in Codex only
  const codexOnly = '[marketplaces.extra]\nsource_type = "git"\nsource = "https://github.com/acme/extra.git"\n';
  const m2 = machine({ claudeSettings: '{}\n', codexConfig: codexOnly });
  const plan2 = await planSetup(m2.env, { add: 'tool@extra' });
  const claude2 = JSON.parse(plan2.projectEdits.find((e) => e.file === CLAUDE).after);
  assert.deepEqual(claude2.extraKnownMarketplaces.extra.source, { source: 'github', repo: 'acme/extra' });
  assert.match(plan2.projectEdits.find((e) => e.file === CODEX).after, /\[plugins\."tool@extra"\]\nenabled = true\n$/);
});

test('an add that is already declared in both Hosts is a no-op: no edit, files untouched', async () => {
  const m = machine();
  const before = [read(m, CLAUDE), read(m, CODEX)];
  const plan = await planSetup(m.env, { add: 'mattpocock-skills@mattpocock' });
  assert.deepEqual(plan.projectEdits, []);
  assert.equal(plan.refused, undefined);
  const report = await applySetup(m.env, plan);
  assert.equal(report.exit, 0);
  assert.deepEqual([read(m, CLAUDE), read(m, CODEX)], before);
  assert.deepEqual(m.writes.filter((f) => f.endsWith('config.toml')), []);
});

test('a half-declared plugin is completed: a disabled plugin is switched on, an existing marketplace is kept', async () => {
  const codex = CODEX_CONFIG.replace('enabled = true\n\n[marketplaces.ai', 'enabled = false # off\n\n[marketplaces.ai');
  const m = machine({ codexConfig: codex });
  const plan = await planSetup(m.env, { add: 'mattpocock-skills@mattpocock' });
  assert.deepEqual(plan.projectEdits.map((e) => e.file), [CODEX]);
  assert.match(plan.projectEdits[0].after, /enabled = true # off\n/);
  assert.equal(plan.projectEdits[0].after.length, codex.length - 1);
});

test('refusal: a reserved marketplace name (P3) writes nothing and exits 2', async () => {
  const m = machine();
  const before = [read(m, CLAUDE), read(m, CODEX)];
  const { code, json } = await runCli(['apply', '--add', 'tool@npm', '--source', 'acme/extra', '--expect', 'x'], m.env);
  assert.equal(code, 2);
  assert.match(json.refused.message, /P3 \(fail\)/);
  assert.deepEqual(json.projectEdits, []);
  assert.deepEqual(writeCalls(m.calls), []);
  assert.deepEqual([read(m, CLAUDE), read(m, CODEX)], before);
  assert.equal((await runCli(['plan', '--add', 'tool@npm', '--source', 'acme/extra'], m.env)).code, 2);
});

test('refusal: --source that differs from the declared source, or Hosts that already differ (P6)', async () => {
  const m = machine();
  const plan = await planSetup(m.env, { add: 'x@mattpocock', source: 'acme/other' });
  assert.match(plan.refused.message, /different source/);
  assert.match(plan.refused.message, /P6/);

  const split = CODEX_CONFIG.replace('mattpocock/skills', 'acme/fork');
  const m2 = machine({ codexConfig: split });
  const plan2 = await planSetup(m2.env, { add: 'x@mattpocock' });
  assert.match(plan2.refused.message, /different sources/);
  assert.match(plan2.refused.message, /P6/);
});

test('refusal: an unsupported TOML shape is not rewritten', async () => {
  const inline = '[marketplaces]\nextra = { source_type = "git", source = "https://github.com/acme/extra.git" }\n';
  const m = machine({ claudeSettings: '{}\n', codexConfig: inline });
  const plan = await planSetup(m.env, { add: 'tool@extra', source: 'acme/extra' });
  assert.match(plan.refused.message, /by hand/);
  assert.deepEqual(plan.projectEdits, []);

  const dotted = '[marketplaces.extra]\nsource_type = "git"\nsource = "https://github.com/acme/extra.git"\n[plugins]\n"tool@extra".enabled = false\n';
  const m2 = machine({ codexConfig: dotted });
  assert.match((await planSetup(m2.env, { add: 'tool@extra', source: 'acme/extra' })).refused.message, /cannot be read|by hand/);
});

test('parseDeclarations reads text like loadDeclarations reads the files', async () => {
  const { parseDeclarations, loadDeclarations } = await import('../../../check-setup/scripts/declarations.mjs');
  const m = machine();
  assert.deepEqual(
    parseDeclarations({ claudeText: read(m, CLAUDE), codexText: read(m, CODEX) }),
    loadDeclarations(m.projectDir),
  );
  const none = parseDeclarations({});
  assert.equal(none.claude.state, 'missing');
  assert.equal(none.codex.state, 'missing');
  assert.equal(parseDeclarations({ claudeText: '{', codexText: '[' }).claude.state, 'invalid');
});

test('refusal: bad request shapes', async () => {
  const m = machine();
  assert.match((await planSetup(m.env, { add: 'tool' })).refused.message, /<plugin>@<marketplace>/);
  assert.match((await planSetup(m.env, { add: 'tool@extra' })).refused.message, /--source/);
  assert.match((await planSetup(m.env, { add: 'tool@extra', source: 'not a source' })).refused.message, /--source must be/);
  const cli = await runCli(['plan', '--source', 'acme/extra'], m.env);
  assert.equal(cli.code, 2);
});

test('a missing file is created; plan stays read-only', async () => {
  const m = machine({ claudeSettings: '{}\n' });
  rmSync(join(m.projectDir, CODEX));
  const plan = await planSetup(m.env, { add: 'tool@extra', source: 'acme/extra' });
  assert.equal(plan.projectEdits.find((e) => e.file === CODEX).before, null);
  assert.deepEqual(m.writes, []);
  await applySetup(m.env, plan);
  assert.match(read(m, CODEX), /^\[marketplaces\.extra\]/);
});

test('the digest covers the edits: apply with the planned digest writes them', async () => {
  const m = machine();
  const { json: plan } = await runCli(['plan', '--add', 'tool@extra', '--source', 'acme/extra'], m.env);
  const stale = await runCli(['apply', '--add', 'tool@extra', '--source', 'acme/other', '--expect', plan.digest], m.env);
  assert.equal(stale.code, 2);
  assert.ok(stale.json.planChanged);
  const done = await runCli(['apply', '--add', 'tool@extra', '--source', 'acme/extra', '--expect', plan.digest], m.env);
  assert.equal(done.code, 0);
  assert.ok(JSON.parse(read(m, CLAUDE)).enabledPlugins['tool@extra']);
});

test('the machine steps run on a Claude file whose edit is kept byte for byte after the fake drops autoUpdate', async () => {
  const m = machine();
  const plan = await planSetup(m.env, { add: 'tool@extra', source: 'acme/extra' });
  const edited = plan.projectEdits.find((e) => e.file === CLAUDE).after;
  await applySetup(m.env, plan);
  assert.equal(read(m, CLAUDE), edited);
});

// ---------------------------------------------------------------- writers

test('editJson keeps BOM, CRLF, tab or 4-space indentation, key order and the missing final newline', () => {
  for (const [indent, bom, eol, tail] of [['\t', '﻿', '\r\n', '\r\n'], [4, '', '\n', ''], [2, '', '\r\n', '\r\n']]) {
    const original = bom + JSON.stringify({ z: 1, a: { y: [1], b: 2 } }, null, indent).replace(/\n/g, eol) + tail;
    const out = editJson(original, (j) => { j.a.c = 3; });
    assert.equal(out, bom + JSON.stringify({ z: 1, a: { y: [1], b: 2, c: 3 } }, null, indent).replace(/\n/g, eol) + tail);
    assert.equal(editJson(original, () => {}), original, 'a no-op edit round-trips');
  }
});

test('appendTomlTables keeps CRLF and separates tables with one blank line', () => {
  const text = crlf('[a]\nx = 1');
  assert.equal(appendTomlTables(text, [['[b]', 'y = 2']]), crlf('[a]\nx = 1\n\n[b]\ny = 2\n'));
  assert.equal(appendTomlTables('', [['[b]', 'y = 2']]), '[b]\ny = 2\n');
  assert.equal(appendTomlTables(text, []), text);
});

test('setTomlKey replaces, inserts and removes a key inside one table only', () => {
  const t = '[m.a]\nref = "v1" # pin\nsource = "s"\n\n[m.b]\nsource = "t"\n';
  assert.equal(setTomlKey(t, ['m', 'a'], 'ref', '"v2"'), t.replace('"v1"', '"v2"'));
  assert.equal(setTomlKey(t, ['m', 'a'], 'ref', null), '[m.a]\nsource = "s"\n\n[m.b]\nsource = "t"\n');
  assert.equal(setTomlKey(t, ['m', 'b'], 'ref', '"v1"'), t.replace('source = "t"\n', 'source = "t"\nref = "v1"\n'));
  assert.equal(setTomlKey(crlf(t), ['m', 'a'], 'x', '1'), crlf(t.replace('source = "s"\n', 'source = "s"\nx = 1\n')));
  assert.equal(setTomlKey(t, ['m', 'zzz'], 'ref', '"v1"'), null);
  assert.equal(setTomlKey('[m.a]\nref = """x"""\n', ['m', 'a'], 'ref', '"v"') === undefined, false);
});
