// Regression tests for the review findings of spec #71 (H2, M2 to M4, L3 to L7, L9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { planSetup, runCli } from '../setup.mjs';
import { setTomlKey } from '../project-edits.mjs';
import { machine, CATALOG } from './fake-host.mjs';

CATALOG.extra = { claudeArg: 'acme/extra', plugins: { tool: '1.0.0' } };

const read = (m, rel) => readFileSync(join(m.projectDir, rel), 'utf8');
const cmds = (plan, host) => plan.hosts[host].steps.map((s) => [s.cmd, ...s.args].join(' '));

test('H2: a P-check that already fails still refuses a new failure of the same check', async () => {
  const claude = JSON.stringify({ enabledPlugins: { 'a@undecl': true }, extraKnownMarketplaces: {} }, null, 2) + '\n';
  const m = machine({ claudeSettings: claude, codexConfig: '' });
  const plan = await planSetup(m.env, { add: 'p@claude-plugins-official', source: 'foo/bar' });
  assert.match(plan.refused?.message ?? '', /P3/);
  assert.deepEqual(plan.projectEdits, []);
});

test('H2: an edit that fixes one of two failures of a check is not refused', async () => {
  const claude = JSON.stringify({
    enabledPlugins: { 'a@undecl': true, 'b@extra': true },
    extraKnownMarketplaces: {},
  }, null, 2) + '\n';
  const m = machine({ claudeSettings: claude, codexConfig: '' });
  const plan = await planSetup(m.env, { add: 'tool@extra', source: 'acme/extra' });
  assert.equal(plan.refused, undefined, plan.refused?.message);
});

test('M2: --add never moves or removes a pin the marketplace already has in either Host', async () => {
  const claude = JSON.stringify({
    enabledPlugins: { 'a@m': true },
    extraKnownMarketplaces: { m: { source: { source: 'github', repo: 'acme/m', ref: 'v1.0.0' }, autoUpdate: true } },
  }, null, 2) + '\n';
  const codex = '[marketplaces.m]\nsource_type = "git"\nsource = "https://github.com/acme/m.git"\nref = "v1.0.0"\n\n[plugins."a@m"]\nenabled = true\n';
  const m = machine({ claudeSettings: claude, codexConfig: codex });
  const plan = await planSetup(m.env, { add: 'b@m' });
  assert.equal(plan.refused, undefined, plan.refused?.message);
  const [c, x] = plan.projectEdits.map((e) => e.after);
  assert.equal(JSON.parse(c).extraKnownMarketplaces.m.source.ref, 'v1.0.0');
  assert.ok(x.startsWith(codex), 'the existing Codex text, ref line included, is kept byte for byte');
  assert.match(x, /\[plugins\."b@m"\]\nenabled = true\n$/);
});

test('M3: a quoted "ref" key is replaced or removed, never duplicated', () => {
  const text = '[marketplaces.m]\nsource_type = "git"\n"ref" = "v1" # pin\n\n[plugins."a@m"]\nenabled = true\n';
  assert.equal(setTomlKey(text, ['marketplaces', 'm'], 'ref', '"v2"'), text.replace('"ref" = "v1"', 'ref = "v2"'));
  assert.equal(setTomlKey(text, ['marketplaces', 'm'], 'ref', null), text.replace('"ref" = "v1" # pin\n', ''));
  const single = "[marketplaces.m]\n'ref' = \"v1\"\n";
  assert.equal(setTomlKey(single, ['marketplaces', 'm'], 'ref', '"v2"'), '[marketplaces.m]\nref = "v2"\n');
});

test('M4: a plugin installed only at user scope is installed at project scope, not updated', async () => {
  const m = machine({ registered: { claude: ['mattpocock'] }, installed: { claude: { 'mattpocock-skills@mattpocock': '1.0.0' } } });
  // The fake lists every install as project scope; replace its list with a user-scope entry.
  const real = m.env.runCommand;
  m.env.runCommand = async (cmd, args, o) => {
    if (cmd === 'claude' && args[1] === 'list') {
      return { ok: true, stdout: JSON.stringify([{ id: 'mattpocock-skills@mattpocock', version: '1.0.0', scope: 'user', enabled: true, installPath: '/x' }]) };
    }
    return real(cmd, args, o);
  };
  const plan = await planSetup(m.env, {});
  assert.ok(cmds(plan, 'claude').includes('claude plugin install mattpocock-skills@mattpocock --scope project --json'));
  assert.ok(!cmds(plan, 'claude').some((c) => c.startsWith('claude plugin update mattpocock-skills')));
});

test('L3: the manual fix for a source setup does not add keeps the ref and the scope', async () => {
  const claude = JSON.stringify({
    enabledPlugins: { 'p@local': true },
    extraKnownMarketplaces: { local: { source: { source: 'directory', path: '/x/y', ref: 'v3' } } },
  });
  const plan = await planSetup(machine({ claudeSettings: claude }).env, {});
  const item = plan.manual.find((x) => /local/.test(x.what));
  assert.match(item.fix, /#v3/);
});

test('L4: --source with a relative path or dot segments is refused', async () => {
  const m = machine();
  for (const source of ['./mkt', '../x', '.hidden/repo', 'owner/..', './']) {
    const plan = await planSetup(m.env, { add: 'tool@extra', source });
    assert.match(plan.refused?.message ?? '', /--source/, source);
  }
  assert.equal((await planSetup(m.env, { add: 'tool@extra', source: 'acme/my.repo' })).refused, undefined);
});

test('L5: pin refs are refused with their own message', async () => {
  const m = machine();
  const why = async (ref) => (await planSetup(m.env, { pin: 'mattpocock', ref })).refused?.message;
  assert.match(await why(''), /must not be empty/);
  assert.match(await why(' v1'), /whitespace/);
  assert.match(await why('v1 '), /whitespace/);
  assert.match(await why('a'.repeat(40)), /full commit SHA/);
  assert.match(await why('ABCDEF1234567890ABCDEF1234567890ABCDEF12'), /full commit SHA/);
  assert.match(await why('abc1234'), /all hex/);
  assert.match(await why('ABC1234'), /all hex/);
});

test('L6: a pin plan lists the restart to-dos and the before text of each edit', async () => {
  const m = machine();
  const plan = await planSetup(m.env, { pin: 'mattpocock', ref: 'v1.3.1' });
  assert.deepEqual(plan.projectEdits.map((e) => e.before), [read(m, '.claude/settings.json'), read(m, '.codex/config.toml')]);
  assert.ok(plan.manual.some((x) => x.host === 'claude' && /reload-plugins/.test(x.fix)));
  assert.ok(plan.manual.some((x) => x.host === 'codex' && /new Codex session/.test(x.what)));
});

test('L7: an empty --add or --source value is a usage error, not a plain sync', async () => {
  const m = machine();
  assert.equal((await runCli(['plan', '--add', ''], m.env)).code, 2);
  assert.equal((await runCli(['plan', '--add', 'tool@extra', '--source', ''], m.env)).code, 2);
});

test('L9: a Codex marketplace with a non-git source gets no upgrade step', async () => {
  const codex = '[marketplaces.loc]\nsource_type = "local"\nsource = "/x/y"\n\n[plugins."p@loc"]\nenabled = true\n';
  const plan = await planSetup(machine({ codexConfig: codex }).env, {});
  assert.ok(!cmds(plan, 'codex').some((c) => c.includes(' loc ')));
});
