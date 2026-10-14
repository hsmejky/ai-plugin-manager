import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runChecks } from '../check-setup.mjs';
import { fixture, envFor, find } from './helpers.mjs';

const PLUGIN = 'tools@m';
const skillMd = (name) => `---\nname: ${name}\ndescription: d\n---\n`;
const pluginFiles = (prefix, names) =>
  Object.fromEntries(names.map((n) => [`${prefix}/skills/${n}/SKILL.md`, skillMd(n)]));

const projectFiles = {
  '.claude/settings.json': JSON.stringify({
    enabledPlugins: { [PLUGIN]: true },
    extraKnownMarketplaces: { m: { source: { source: 'github', repo: 'o/m' } } },
  }),
  '.codex/config.toml': `[marketplaces.m]\nsource_type = "git"\nsource = "https://github.com/o/m.git"\n\n[plugins."${PLUGIN}"]\nenabled = true\n`,
};

/**
 * Environment with both Hosts installed and the plugin on disk (Claude installPath in a fixture dir,
 * Codex cache under the fake home). `answers` maps host -> model reply ({ok,stdout}|{ok:false,error}).
 */
function setup({ names = ['alpha', 'beta'], answers = {}, claudeInstalled = true, codexInstalled = true } = {}) {
  const claudeDir = fixture(pluginFiles('.', names));
  const homeDir = fixture(pluginFiles('.codex/plugins/cache/m/tools/1.0.0', names));
  const calls = [];
  const out = (v) => ({ ok: true, stdout: JSON.stringify(v) });
  const runCommand = async (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    if (args[0] === '--version') return { ok: true, stdout: cmd === 'claude' ? '2.1.296' : 'codex-cli 0.160.1' };
    if (args[0] === 'plugin' && args[1] === 'list') {
      if (cmd === 'claude') {
        return out(claudeInstalled ? [{ id: PLUGIN, version: '1.0.0', scope: 'project', enabled: false, installPath: claudeDir }] : []);
      }
      return out({ installed: codexInstalled ? [{ pluginId: PLUGIN, version: '1.0.0', installed: true, enabled: true, source: { source: 'local' } }] : [], available: [] });
    }
    if (args[0] === 'plugin') return out([]);
    return answers[cmd] ?? { ok: true, stdout: names.join('\n') };
  };
  const projectDir = fixture(projectFiles);
  return { calls, projectDir, run: (live = true) => runChecks(envFor(projectDir, { homeDir, runCommand, live })) };
}

const l1 = (findings, host) => find(findings, 'L1').find((f) => f.host === host);
const promptCalls = (calls) => calls.filter((c) => c.args[0] !== '--version' && c.args[0] !== 'plugin');

test('L1: without --live no L1 finding and no model call', async () => {
  const s = setup();
  const findings = await s.run(false);
  assert.equal(find(findings, 'L1').length, 0);
  assert.equal(promptCalls(s.calls).length, 0);
});

test('L1: passes per Host when every expected skill is listed', async () => {
  const s = setup({ answers: { claude: { ok: true, stdout: 'tools:alpha\nbeta\n' }, codex: { ok: true, stdout: '- alpha\n- beta\n- extra\n' } } });
  const findings = await s.run();
  assert.equal(l1(findings, 'claude').status, 'pass');
  assert.equal(l1(findings, 'codex').status, 'pass');
  assert.equal(l1(findings, 'claude').layer, 'machine');
});

test('L1: fails naming the missing skill, with a fix', async () => {
  const s = setup({ answers: { codex: { ok: true, stdout: 'alpha\n' } } });
  const f = l1(await s.run(), 'codex');
  assert.equal(f.status, 'fail');
  assert.match(f.message, /beta/);
  assert.match(f.message, new RegExp(PLUGIN));
  assert.notEqual(f.fix, '');
});

test('L1: NONE is a fail', async () => {
  const s = setup({ answers: { claude: { ok: true, stdout: 'NONE\n' } } });
  assert.equal(l1(await s.run(), 'claude').status, 'fail');
});

test('L1: a failing command (network, auth, CLI) is a skip with the reason', async () => {
  const s = setup({ answers: { codex: { ok: false, error: 'stream error: dns error: failed to lookup address' } } });
  const f = l1(await s.run(), 'codex');
  assert.equal(f.status, 'skip');
  assert.match(f.message, /dns error/);
  assert.equal(l1(await s.run(), 'claude').status, 'pass');
});

test('L1: output without any skill name is a skip, not a fail', async () => {
  const s = setup({ answers: { claude: { ok: true, stdout: '' } } });
  assert.equal(l1(await s.run(), 'claude').status, 'skip');
});

test('L1: skips a Host whose CLI is missing', async () => {
  const projectDir = fixture(projectFiles);
  const findings = await runChecks(envFor(projectDir, { live: true }));
  const f = l1(findings, 'claude');
  assert.equal(f.status, 'skip');
  assert.match(f.message, /not installed/);
});

test('L1: skips when the plugin is not installed (M4 reports it)', async () => {
  const s = setup({ codexInstalled: false });
  const f = l1(await s.run(), 'codex');
  assert.equal(f.status, 'skip');
  assert.match(f.message, /M4/);
});

test('L1: skips when the project enables no plugin for the Host', async () => {
  const projectDir = fixture({ 'AGENTS.md': 'x' });
  const runCommand = async (cmd, args) =>
    args[0] === '--version' ? { ok: true, stdout: '2.1.296' } : { ok: false, error: 'x' };
  const f = l1(await runChecks(envFor(projectDir, { live: true, runCommand })), 'claude');
  assert.equal(f.status, 'skip');
});

test('L1: calls each Host in the project directory, never with --bare, and names the plugin', async () => {
  const s = setup();
  await s.run();
  const [claude, codex] = ['claude', 'codex'].map((h) => promptCalls(s.calls).find((c) => c.cmd === h));
  assert.equal(claude.args[0], '-p');
  assert.ok(!claude.args.includes('--bare'));
  assert.match(claude.args.at(-1), /tools/);
  assert.deepEqual(codex.args.slice(0, 2), ['exec', '--skip-git-repo-check']);
  assert.equal(claude.opts.cwd, s.projectDir);
  assert.equal(codex.opts.cwd, s.projectDir);
  assert.ok(claude.opts.timeout > 30000);
});

// Real stderr of `claude -p` 2.1.299 for a schema-invalid but well-formed .claude/settings.json.
const SETTINGS_STDERR = `These settings files did not load, so nothing in them is in effect, including hooks and permission rules. Each loads again once the problem listed for it is fixed:
  C:\\proj\\.claude\\settings.json (permissions.allow): Expected array, but received number
  C:\\proj\\.claude\\settings.json (enabledPlugins): Expected record, but received string
`;

test('L1: Claude Code settings validation errors on stderr become a fail naming file and entry', async () => {
  const s = setup({ answers: { claude: { ok: true, stdout: 'NONE\n', stderr: SETTINGS_STDERR } } });
  const f = l1(await s.run(), 'claude');
  assert.equal(f.status, 'fail');
  const text = `${f.message} ${f.fix}`;
  assert.match(text, /settings\.json/);
  assert.match(text, /enabledPlugins/);
  assert.match(text, /permissions\.allow/);
  assert.equal(l1(await s.run(), 'codex').status, 'pass');
});

test('L1: settings errors are reported even when the reply lists every skill', async () => {
  const s = setup({ answers: { claude: { ok: true, stdout: 'alpha\nbeta\n', stderr: SETTINGS_STDERR } } });
  const f = l1(await s.run(), 'claude');
  assert.equal(f.status, 'fail');
  assert.match(f.message, /enabledPlugins/);
});

test('L1: unrelated stderr output does not change the result', async () => {
  const s = setup({ answers: { claude: { ok: true, stdout: 'alpha\nbeta\n', stderr: 'warning: something\n' } } });
  assert.equal(l1(await s.run(), 'claude').status, 'pass');
});

test('L1: a missing plugin directory is a skip', async () => {
  const s = setup();
  const homeDir = fixture();
  const projectDir = s.projectDir;
  const runCommand = async (cmd, args) => {
    if (args[0] === '--version') return { ok: true, stdout: '0.160.1' };
    if (args[1] === 'list') return { ok: true, stdout: JSON.stringify({ installed: [{ pluginId: PLUGIN, version: '1.0.0', installed: true, enabled: true }] }) };
    return { ok: true, stdout: 'alpha' };
  };
  const f = l1(await runChecks(envFor(projectDir, { homeDir, runCommand, live: true })), 'codex');
  assert.equal(f.status, 'skip');
  assert.match(f.message, /cache/);
});

// ---- per-Host visibility: Claude Code reads disable-model-invocation, Codex reads agents/openai.yaml ----

const OPENAI_HIDDEN = 'policy:\n  allow_implicit_invocation: false\n';

/** Both Hosts with one plugin whose skill `gate` has the given settings in both plugin copies. */
function setupGate({ flag, yaml, answers = {} }) {
  const fm = `---\nname: gate\ndescription: d\n${flag ? 'disable-model-invocation: true\n' : ''}---\n`;
  const files = (prefix) => ({
    [`${prefix}/skills/gate/SKILL.md`]: fm,
    ...(yaml === undefined ? {} : { [`${prefix}/skills/gate/agents/openai.yaml`]: yaml }),
  });
  const claudeDir = fixture(files('.'));
  const homeDir = fixture(files('.codex/plugins/cache/m/tools/1.0.0'));
  const out = (v) => ({ ok: true, stdout: JSON.stringify(v) });
  const runCommand = async (cmd, args) => {
    if (args[0] === '--version') return { ok: true, stdout: cmd === 'claude' ? '2.1.296' : 'codex-cli 0.160.1' };
    if (args[0] === 'plugin' && args[1] === 'list') {
      return cmd === 'claude'
        ? out([{ id: PLUGIN, version: '1.0.0', scope: 'project', enabled: false, installPath: claudeDir }])
        : out({ installed: [{ pluginId: PLUGIN, version: '1.0.0', installed: true, enabled: true }], available: [] });
    }
    if (args[0] === 'plugin') return out([]);
    return answers[cmd] ?? { ok: true, stdout: 'gate\n' };
  };
  return runChecks(envFor(fixture(projectFiles), { homeDir, runCommand, live: true }));
}
const l1All = (findings, host) => find(findings, 'L1').filter((f) => f.host === host);
const l1Main = (findings, host) => l1All(findings, host).find((f) => f.status !== 'warn');
const l1Warns = (findings) => find(findings, 'L1').filter((f) => f.status === 'warn');

test('L1 visibility: both settings set hides the skill in both Hosts, no warning', async () => {
  const fs = await setupGate({ flag: true, yaml: OPENAI_HIDDEN });
  assert.equal(l1Warns(fs).length, 0);
  for (const h of ['claude', 'codex']) {
    assert.equal(l1Main(fs, h).status, 'skip');
    assert.match(l1Main(fs, h).message, /no model-invocable skill/);
  }
});

test('L1 visibility: neither setting set expects the skill in both Hosts, no warning', async () => {
  const fs = await setupGate({ flag: false, yaml: undefined, answers: { claude: { ok: true, stdout: 'NONE\n' } } });
  assert.equal(l1Warns(fs).length, 0);
  assert.equal(l1Main(fs, 'claude').status, 'fail');
  assert.equal(l1Main(fs, 'codex').status, 'pass');
});

test('L1 visibility: only disable-model-invocation warns that Claude Code hides it while Codex offers it', async () => {
  const fs = await setupGate({ flag: true, yaml: undefined });
  const warns = l1Warns(fs);
  assert.equal(warns.length, 1);
  assert.equal(warns[0].host, 'claude');
  assert.match(warns[0].message, /gate/);
  assert.match(`${warns[0].message} ${warns[0].fix}`, /allow_implicit_invocation/);
  assert.notEqual(warns[0].fix, '');
  assert.equal(l1Main(fs, 'codex').status, 'pass');
  assert.equal(l1Main(fs, 'claude').status, 'skip');
});

test('L1 visibility: only allow_implicit_invocation false warns that Codex hides it, and Codex need not list it', async () => {
  const fs = await setupGate({ flag: false, yaml: OPENAI_HIDDEN, answers: { codex: { ok: true, stdout: 'NONE\n' } } });
  const warns = l1Warns(fs);
  assert.equal(warns.length, 1);
  assert.equal(warns[0].host, 'codex');
  assert.match(warns[0].message, /gate/);
  assert.match(`${warns[0].message} ${warns[0].fix}`, /disable-model-invocation/);
  assert.equal(l1Main(fs, 'codex').status, 'skip');
  assert.equal(l1Main(fs, 'claude').status, 'pass');
});

test('L1 visibility: Codex hides only when allow_implicit_invocation is exactly false', async () => {
  for (const yaml of ['policy:\n  allow_implicit_invocation: true\n', 'policy:\n  allow_implicit_invocation: "false"\n', 'interface:\n  display_name: X\n']) {
    const fs = await setupGate({ flag: false, yaml });
    assert.equal(l1Warns(fs).length, 0, yaml);
    assert.equal(l1Main(fs, 'codex').status, 'pass', yaml);
  }
});

test('L1: settings errors are the cause when claude -p exits non-zero', async () => {
  const s = setup({ answers: { claude: { ok: false, error: 'exit 1', stdout: '', stderr: SETTINGS_STDERR } } });
  const f = l1(await s.run(), 'claude');
  assert.equal(f.status, 'fail');
  assert.match(f.message, /enabledPlugins/);
});

test('L1: a non-zero exit without settings errors stays a skip', async () => {
  const s = setup({ answers: { claude: { ok: false, error: 'exit 1', stderr: 'not logged in' } } });
  assert.equal(l1(await s.run(), 'claude').status, 'skip');
});

test('L1 visibility: Codex flow-style policy is read too', async () => {
  const hidden = ['policy: {allow_implicit_invocation: false}\n', 'policy: { allow_implicit_invocation: false, other: 1 } # c\n'];
  for (const yaml of hidden) {
    const fs = await setupGate({ flag: false, yaml, answers: { codex: { ok: true, stdout: 'NONE\n' } } });
    assert.equal(l1Warns(fs).length, 1, yaml);
  }
  for (const yaml of ['policy: {allow_implicit_invocation: true}\n', 'policy: {allow_implicit_invocation: "false"}\n']) {
    const fs = await setupGate({ flag: false, yaml });
    assert.equal(l1Warns(fs).length, 0, yaml);
  }
});

// Two entries for the same plugin id (user scope and this project's scope): the chosen rule is that the
// project/local entry is used, whatever the CLI order. Which entry Claude Code itself loads is unverified.
for (const order of ['user first', 'project first']) {
  test(`L1: with a user and a project entry for one plugin, the project entry decides (${order})`, async () => {
    const projectDir = fixture(projectFiles);
    const userDir = fixture(pluginFiles('.', ['stale']));
    const projectPlugin = fixture(pluginFiles('.', ['alpha', 'beta']));
    const homeDir = fixture();
    const user = { id: PLUGIN, version: '1.0.0', scope: 'user', enabled: true, installPath: userDir };
    const project = { id: PLUGIN, version: '1.0.0', scope: 'project', projectPath: projectDir, enabled: true, installPath: projectPlugin };
    const runCommand = async (cmd, args) => {
      if (args[0] === '--version') return { ok: true, stdout: cmd === 'claude' ? '2.1.296' : 'codex-cli 0.160.1' };
      if (args[0] === 'plugin') return { ok: true, stdout: JSON.stringify(cmd === 'claude' ? (order === 'user first' ? [user, project] : [project, user]) : []) };
      return { ok: true, stdout: 'alpha\nbeta\n' };
    };
    const findings = await runChecks(envFor(projectDir, { homeDir, runCommand, live: true }));
    assert.equal(l1(findings, 'claude').status, 'pass');
  });
}

// ---- openai.yaml shapes the line reader used to misread (#44) ----

test('L1 visibility: valid YAML shapes of allow_implicit_invocation: false are all read as hidden', async () => {
  const hidden = [
    'policy:\n# note\n  allow_implicit_invocation: false\n',
    'policy:\n  "allow_implicit_invocation": false\n',
    'policy:\n  allow_implicit_invocation: False\n',
    '﻿policy:\n  allow_implicit_invocation: false\n',
    'policy: {\n  other: 1,\n  allow_implicit_invocation: false\n}\n',
  ];
  for (const yaml of hidden) {
    const fs = await setupGate({ flag: false, yaml, answers: { codex: { ok: true, stdout: 'NONE\n' } } });
    assert.equal(l1Warns(fs).length, 1, yaml);
    assert.equal(l1Warns(fs)[0].host, 'codex', yaml);
  }
});

test('L1 visibility: a deeper allow_implicit_invocation under another policy key is not the policy setting', async () => {
  const fs = await setupGate({ flag: false, yaml: 'policy:\n  other:\n    allow_implicit_invocation: false\n' });
  assert.equal(l1Warns(fs).length, 0);
  assert.equal(l1Main(fs, 'codex').status, 'pass');
});

test('L1 visibility: an openai.yaml the reader cannot judge is a note, never visible or hidden', async () => {
  const yaml = 'policy:\n  allow_implicit_invocation: *flag\n';
  const fs = await setupGate({ flag: false, yaml, answers: { codex: { ok: true, stdout: 'NONE\n' } } });
  const warns = l1Warns(fs);
  assert.equal(warns.length, 1);
  assert.equal(warns[0].host, 'codex');
  assert.match(warns[0].message, /cannot tell/);
  assert.match(warns[0].message, /gate/);
  assert.ok(warns[0].fix);
  assert.doesNotMatch(warns[0].message, /still offers/);
  // the skill is neither required from the model nor reported hidden
  assert.equal(l1Main(fs, 'codex').status, 'skip');
  assert.equal(l1Main(fs, 'claude').status, 'pass');
});
