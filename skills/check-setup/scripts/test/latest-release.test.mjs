import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runChecks } from '../check-setup.mjs';
import { fixture, envFor, find } from './helpers.mjs';

// Stubs match real output captured 2026-10-14 with npm 11.12.1, Claude Code 2.1.299, codex-cli 0.162.1.
const CLAUDE_TAGS = '{\n  "stable": "2.1.287",\n  "latest": "2.1.299",\n  "next": "2.1.299"\n}\n';
// Codex output truncated to the first tags plus latest (the real object has about 50 tags).
const CODEX_TAGS = JSON.stringify({ beta: '0.1.2505172116', 'release-0.159.0-alpha.12.1-alpha': '0.159.0-alpha.12.1', latest: '0.162.1' }, null, 2) + '\n';

function setup({ claude = '2.1.299', codex = '0.162.1', npm, userSettings, projectSettings, claudeInstalled = true, codexInstalled = true } = {}) {
  const calls = [];
  const runCommand = async (cmd, args) => {
    calls.push({ cmd, args });
    if (args[0] === '--version') {
      if (cmd === 'claude' && claudeInstalled) return { ok: true, stdout: `${claude} (Claude Code)` };
      if (cmd === 'codex' && codexInstalled) return { ok: true, stdout: `codex-cli ${codex}` };
      return { ok: false, error: 'command not found' };
    }
    if (cmd === 'npm') {
      if (npm) return npm(args);
      return { ok: true, stdout: args.includes('@openai/codex') ? CODEX_TAGS : CLAUDE_TAGS };
    }
    return { ok: false, error: 'unexpected' };
  };
  const homeDir = fixture(userSettings ? { '.claude/settings.json': JSON.stringify(userSettings) } : {});
  const projectDir = fixture(projectSettings ? { '.claude/settings.json': JSON.stringify(projectSettings) } : {});
  return { calls, run: (live = true) => runChecks(envFor(projectDir, { homeDir, runCommand, live })) };
}
const l2 = (findings, host) => find(findings, 'L2').find((f) => f.host === host);

test('L2: without --live no L2 finding and no npm call', async () => {
  const s = setup();
  assert.equal(find(await s.run(false), 'L2').length, 0);
  assert.equal(s.calls.filter((c) => c.cmd === 'npm').length, 0);
});

test('L2: passes when both Hosts are on their Latest release', async () => {
  const f = await setup().run();
  assert.equal(l2(f, 'claude').status, 'pass');
  assert.equal(l2(f, 'codex').status, 'pass');
  assert.equal(l2(f, 'claude').layer, 'machine');
});

test('L2: warns when behind, naming versions, channel and update command', async () => {
  const f = await setup({ claude: '2.1.290', codex: '0.160.1' }).run();
  const c = l2(f, 'claude');
  assert.equal(c.status, 'warn');
  for (const t of ['2.1.290', '2.1.299', 'latest']) assert.match(c.message, new RegExp(t));
  assert.match(c.fix, /claude update/);
  const x = l2(f, 'codex');
  assert.equal(x.status, 'warn');
  assert.match(x.message, /0\.160\.1/);
  assert.match(x.message, /0\.162\.1/);
  assert.match(x.fix, /codex update/);
});

test('L2: an unset channel is compared against latest and the message says so', async () => {
  const c = l2(await setup({ claude: '2.1.287' }).run(), 'claude');
  assert.equal(c.status, 'warn');
  assert.match(c.message, /not set/);
  assert.match(c.message, /latest/);
});

test('L2: autoUpdatesChannel "stable" in user settings compares against stable', async () => {
  const f = await setup({ claude: '2.1.287', userSettings: { autoUpdatesChannel: 'stable' } }).run();
  const c = l2(f, 'claude');
  assert.equal(c.status, 'pass');
  assert.match(c.message, /stable/);
});

test('L2: project settings override user settings for the channel', async () => {
  const f = await setup({ claude: '2.1.287', userSettings: { autoUpdatesChannel: 'latest' }, projectSettings: { autoUpdatesChannel: 'stable' } }).run();
  assert.equal(l2(f, 'claude').status, 'pass');
});

test('L2: a Host newer than the channel (stable user on a latest build) is not behind', async () => {
  const f = await setup({ claude: '2.1.299', userSettings: { autoUpdatesChannel: 'stable' } }).run();
  assert.equal(l2(f, 'claude').status, 'pass');
});

test('L2: lookup failure is a skip, not pass or warn', async () => {
  const f = await setup({ claude: '2.1.1', npm: async () => ({ ok: false, error: 'command not found' }) }).run();
  for (const h of ['claude', 'codex']) {
    assert.equal(l2(f, h).status, 'skip');
    assert.match(l2(f, h).message, /command not found/);
  }
});

test('L2: unexpected npm output is a skip', async () => {
  const f = await setup({ claude: '2.1.1', npm: async () => ({ ok: true, stdout: 'garbage' }) }).run();
  assert.equal(l2(f, 'claude').status, 'skip');
  assert.equal(l2(f, 'codex').status, 'skip');
});

test('L2: an unknown channel value is a skip', async () => {
  const f = await setup({ claude: '2.1.1', userSettings: { autoUpdatesChannel: 'beta' } }).run();
  assert.equal(l2(f, 'claude').status, 'skip');
});

test('L2: a Host that is not installed is skipped without an npm lookup for it', async () => {
  const s = setup({ codexInstalled: false });
  const f = await s.run();
  assert.equal(l2(f, 'codex').status, 'skip');
  assert.equal(s.calls.some((c) => c.cmd === 'npm' && c.args.includes('@openai/codex')), false);
});

test('L2: a Host whose version cannot be parsed is skipped', async () => {
  const f = await setup({ claude: 'weird' }).run();
  assert.equal(l2(f, 'claude').status, 'skip');
});
