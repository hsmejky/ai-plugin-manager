import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runChecks } from '../check-setup.mjs';
import { fixture, envFor, find } from './helpers.mjs';

const run = async (files) => runChecks(envFor(fixture(files)));
const claude = (obj) => ({ '.claude/settings.json': typeof obj === 'string' ? obj : JSON.stringify(obj) });
const ghMkt = (repo) => ({ source: { source: 'github', repo } });

test('P3 fails on invalid Claude settings JSON instead of crashing', async () => {
  const [p3] = find(await run(claude('{ "enabledPlugins": ')), 'P3');
  assert.equal(p3.status, 'fail');
  assert.equal(p3.host, 'claude');
  assert.equal(p3.layer, 'project');
  assert.match(p3.message, /not valid JSON/);
  assert.match(p3.fix, /settings\.json/);
});

test('P3 passes when every enabled plugin marketplace is declared', async () => {
  const [p3] = find(
    await run(claude({ enabledPlugins: { 'a@m': true }, extraKnownMarketplaces: { m: ghMkt('o/m') } })),
    'P3',
  );
  assert.equal(p3.status, 'pass');
});

test('P3 fails with an exact fix when a marketplace is not declared', async () => {
  const [p3] = find(await run(claude({ enabledPlugins: { 'a@m': true } })), 'P3');
  assert.equal(p3.status, 'fail');
  assert.match(p3.message, /a@m/);
  assert.match(p3.fix, /extraKnownMarketplaces/);
  assert.match(p3.fix, /"m"/);
});

test('P3 ignores disabled plugins and the built-in official marketplace', async () => {
  const [p3] = find(
    await run(claude({ enabledPlugins: { 'a@m': false, 'b@claude-plugins-official': true } })),
    'P3',
  );
  assert.equal(p3.status, 'pass');
});

test('P3 is skipped when the project has no Claude settings', async () => {
  const [p3] = find(await run({}), 'P3');
  assert.equal(p3.status, 'skip');
});

test('P3 fix snippet includes "autoUpdate": true', async () => {
  const [p3] = find(await run(claude({ enabledPlugins: { 'a@m': true } })), 'P3');
  assert.match(p3.fix, /"autoUpdate": true/);
});

const mkt = (extra) => ({ ...ghMkt('o/m'), ...extra });

test('P7 passes when every declared marketplace has "autoUpdate": true', async () => {
  const [p7] = find(await run(claude({ extraKnownMarketplaces: { m: mkt({ autoUpdate: true }) } })), 'P7');
  assert.equal(p7.status, 'pass');
  assert.equal(p7.host, 'claude');
  assert.equal(p7.layer, 'project');
});

test('P7 warns with an exact fix when "autoUpdate" is missing', async () => {
  const [p7] = find(await run(claude({ extraKnownMarketplaces: { m: mkt() } })), 'P7');
  assert.equal(p7.status, 'warn');
  assert.match(p7.message, /"m"/);
  assert.match(p7.fix, /"autoUpdate": true/);
  assert.match(p7.fix, /extraKnownMarketplaces/);
  assert.match(p7.fix, /"m"/);
});

test('P7 warns when "autoUpdate" is false', async () => {
  const [p7] = find(await run(claude({ extraKnownMarketplaces: { m: mkt({ autoUpdate: false }) } })), 'P7');
  assert.equal(p7.status, 'warn');
});

test('P7 names only the marketplaces that lack it', async () => {
  const [p7] = find(
    await run(claude({ extraKnownMarketplaces: { ok: mkt({ autoUpdate: true }), bad: mkt() } })),
    'P7',
  );
  assert.equal(p7.status, 'warn');
  assert.match(p7.message, /"bad"/);
  assert.doesNotMatch(p7.message, /"ok"/);
});

test('P7 does not warn for default-on official names sourced from github.com/anthropics/', async () => {
  for (const name of ['claude-plugins-official', 'anthropic-agent-skills']) {
    const [p7] = find(
      await run(claude({ extraKnownMarketplaces: { [name]: ghMkt('anthropics/some-repo') } })),
      'P7',
    );
    assert.equal(p7.status, 'skip', name);
  }
});

test('P7 treats a git URL under github.com/anthropics/ as an official source', async () => {
  const [p7] = find(
    await run(
      claude({
        extraKnownMarketplaces: {
          'claude-code-plugins': { source: { source: 'git', url: 'https://github.com/anthropics/x.git' } },
        },
      }),
    ),
    'P7',
  );
  assert.equal(p7.status, 'skip');
});

test('P7 still warns for the official names that do not auto-update by default', async () => {
  for (const name of ['knowledge-work-plugins', 'first-party-plugins']) {
    const [p7] = find(
      await run(claude({ extraKnownMarketplaces: { [name]: ghMkt('anthropics/some-repo') } })),
      'P7',
    );
    assert.equal(p7.status, 'warn', name);
    assert.match(p7.message, new RegExp(name));
  }
});

test('P7 still warns for the community name', async () => {
  const [p7] = find(
    await run(claude({ extraKnownMarketplaces: { 'claude-community': ghMkt('anthropics/some-repo') } })),
    'P7',
  );
  assert.equal(p7.status, 'warn');
});

test('P7 skips a reserved name from a non-Anthropic source, P3 fails it instead', async () => {
  const [p7] = find(
    await run(claude({ extraKnownMarketplaces: { 'claude-plugins-official': ghMkt('evil/anthropics') } })),
    'P7',
  );
  assert.equal(p7.status, 'skip');
});

test('P3 fails a reserved official or community name sourced outside github.com/anthropics/', async () => {
  for (const name of ['claude-plugins-official', 'knowledge-work-plugins', 'claude-community', 'healthcare']) {
    const [p3] = find(await run(claude({ extraKnownMarketplaces: { [name]: ghMkt('evil/anthropics') } })), 'P3');
    assert.equal(p3.status, 'fail', name);
    assert.match(p3.message, new RegExp(name));
    assert.match(p3.message, /untrusted source/);
    assert.match(p3.fix, /[Rr]ename/);
    assert.match(p3.fix, /github\.com\/anthropics\//);
    assert.doesNotMatch(p3.fix, /autoUpdate/);
  }
});

test('P3 passes a reserved name sourced from github.com/anthropics/', async () => {
  const [p3] = find(
    await run(claude({ extraKnownMarketplaces: { 'claude-community': ghMkt('anthropics/x') } })),
    'P3',
  );
  assert.equal(p3.status, 'pass');
});

test('P3 fails a reserved name from a url-type source under github.com/anthropics/ (#56)', async () => {
  const mkt = { source: { source: 'url', url: 'https://github.com/anthropics/some-repo.git' } };
  const [p3] = find(await run(claude({ extraKnownMarketplaces: { 'claude-plugins-official': mkt } })), 'P3');
  assert.equal(p3.status, 'fail');
  assert.match(p3.message, /untrusted source/);
  assert.match(p3.fix, /[Rr]ename/);
});

test('P7 is skipped when there is no Claude settings file or it is unreadable', async () => {
  assert.equal(find(await run({}), 'P7')[0].status, 'skip');
  assert.equal(find(await run(claude('{ "x": ')), 'P7')[0].status, 'skip');
});

test('P7 is skipped when no marketplace is declared', async () => {
  assert.equal(find(await run(claude({ enabledPlugins: {} })), 'P7')[0].status, 'skip');
});

test('P3 passes a reserved name for every spelling of a github.com/anthropics/ source (#50)', async () => {
  const sources = [
    { source: 'github', repo: 'anthropics/some-repo' },
    { source: 'github', repo: 'Anthropics/Some-Repo' },
    { source: 'git', url: 'https://github.com/anthropics/some-repo' },
    { source: 'git', url: 'https://github.com/anthropics/some-repo.git' },
    { source: 'git', url: 'https://github.com/anthropics/some-repo/' },
    { source: 'git', url: 'git@github.com:anthropics/some-repo.git' },
    { source: 'git', url: 'git@github.com:anthropics/some-repo' },
    { source: 'git', url: 'ssh://git@github.com/anthropics/some-repo.git' },
    { source: 'git', url: 'https://user@github.com/anthropics/some-repo.git' },
  ];
  for (const source of sources) {
    const [p3] = find(await run(claude({ extraKnownMarketplaces: { 'claude-plugins-official': { source } } })), 'P3');
    assert.equal(p3.status, 'pass', JSON.stringify(source));
  }
});

// #54: reserved-name classes of https://code.claude.com/docs/en/plugins/marketplace-reference
test('P3 fails the plugin directory names from a non-Anthropic source, passes them from github.com/anthropics/ (#54)', async () => {
  for (const name of ['anthropic-plugin-directory', 'claude-plugin-directory']) {
    const [bad] = find(await run(claude({ extraKnownMarketplaces: { [name]: ghMkt('evil/x') } })), 'P3');
    assert.equal(bad.status, 'fail', name);
    assert.match(bad.message, new RegExp(name));
    assert.match(bad.message, /untrusted source/);
    const [ok] = find(await run(claude({ extraKnownMarketplaces: { [name]: ghMkt('anthropics/x') } })), 'P3');
    assert.equal(ok.status, 'pass', name);
  }
});

test('P3 fails another spelling of a reserved name: trailing dot or a symbol other than _ for - (#54)', async () => {
  for (const name of ['claude.code.plugins', 'claude-code-plugins.', 'claude-plugins-official..', 'anthropic.plugin-directory', 'agent.skills']) {
    const [p3] = find(await run(claude({ extraKnownMarketplaces: { [name]: ghMkt('o/m') } })), 'P3');
    assert.equal(p3.status, 'fail', name);
    assert.match(p3.message, new RegExp(name.replace(/\./g, '\\.')));
    assert.match(p3.message, /another spelling/);
    assert.match(p3.fix, /[Rr]ename/);
  }
});

test('P3 does not treat an underscore, or an unrelated dotted name, as a spelling of a reserved name (#54)', async () => {
  for (const name of ['claude_code_plugins', 'my.plugins', 'claude-code-plugins-extra']) {
    const [p3] = find(await run(claude({ extraKnownMarketplaces: { [name]: ghMkt('o/m') } })), 'P3');
    assert.equal(p3.status, 'pass', name);
  }
});

test('P3 fails a name with a non-ASCII character (#54)', async () => {
  for (const name of ['clаude-plugins', 'café-plugins']) {
    const [p3] = find(await run(claude({ extraKnownMarketplaces: { [name]: ghMkt('o/m') } })), 'P3');
    assert.equal(p3.status, 'fail', name);
    assert.match(p3.message, /non-ASCII/);
    assert.match(p3.fix, /[Rr]ename/);
  }
});

test('P3 still passes a legitimate name (#54)', async () => {
  const [p3] = find(await run(claude({ extraKnownMarketplaces: { 'acme-tools': ghMkt('acme/tools') } })), 'P3');
  assert.equal(p3.status, 'pass');
});

// #56: the remaining offline-decidable classes of the "Reserved names" section, whatever the source
const failsFor = async (name, source = ghMkt('o/m')) =>
  find(await run(claude({ extraKnownMarketplaces: { [name]: source } })), 'P3')[0];

test('P3 fails the names Claude Code uses for plugins without a marketplace, even from github.com/anthropics/ (#56)', async () => {
  for (const name of ['inline', 'builtin', 'skills-dir', 'synced', 'claude-plugin-test']) {
    for (const source of [ghMkt('o/m'), ghMkt('anthropics/x')]) {
      const p3 = await failsFor(name, source);
      assert.equal(p3.status, 'fail', name);
      assert.match(p3.message, new RegExp(`"${name}"`));
      assert.match(p3.message, /without a marketplace/);
      assert.match(p3.fix, /[Rr]ename/);
    }
  }
});

test('P3 fails npm, pip, uv, cargo, github and gh in any casing (#56)', async () => {
  for (const name of ['npm', 'pip', 'uv', 'cargo', 'github', 'gh', 'NPM', 'Pip', 'GitHub', 'GH', 'Cargo']) {
    const p3 = await failsFor(name, ghMkt('anthropics/x'));
    assert.equal(p3.status, 'fail', name);
    assert.match(p3.message, new RegExp(`"${name}"`));
    assert.match(p3.message, /package manager or code host/);
  }
});

test('P3 fails the member names every JavaScript object has (#56)', async () => {
  for (const name of ['constructor', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString', 'toString', 'valueOf']) {
    const p3 = await failsFor(name);
    assert.equal(p3.status, 'fail', name);
    assert.match(p3.message, new RegExp(`"${name}"`));
    assert.match(p3.message, /JavaScript object member/);
  }
});

test('P3 does not fail names that only resemble the exact-name classes (#56)', async () => {
  for (const name of ['inline-tools', 'npm-tools', 'github-tools', 'Constructor', 'tostring', 'claudeai', 'my-claudeai-x']) {
    assert.equal((await failsFor(name)).status, 'pass', name);
  }
});

test('P3 fails a name starting with claudeai- (#56)', async () => {
  for (const name of ['claudeai-tools', 'claudeai-']) {
    const p3 = await failsFor(name, ghMkt('anthropics/x'));
    assert.equal(p3.status, 'fail', name);
    assert.match(p3.message, /claudeai-/);
    assert.match(p3.message, /hosted on claude\.ai/);
  }
});

test('P3 fails a name with a control or bidirectional-formatting character (#56)', async () => {
  for (const name of ['a\nb', 'a\u001bb', 'a\u0000b', 'a\u007fb', 'a‮b', 'a⁦b', 'a‏b']) {
    const p3 = await failsFor(name);
    assert.equal(p3.status, 'fail', JSON.stringify(name));
    assert.match(p3.message, /control or bidirectional-formatting/);
  }
});

test('P3 fails another spelling of a name from the always-reserved classes (#56)', async () => {
  for (const [name, reserved] of [['skills.dir', 'skills-dir'], ['inline.', 'inline'], ['GH.', 'GH']]) {
    const p3 = await failsFor(name);
    assert.equal(p3.status, 'fail', name);
    assert.match(p3.message, new RegExp(`another spelling of the reserved name "${reserved}"`));
  }
});

test('P3 reports every bad name in one result, whatever its class (#56)', async () => {
  const p3 = (
    await run(
      claude({
        extraKnownMarketplaces: {
          'claude-plugins-official': ghMkt('evil/x'),
          'claude.code.plugins': ghMkt('o/m'),
          'café': ghMkt('o/m'),
          inline: ghMkt('o/m'),
          toString: ghMkt('o/m'),
          'claudeai-x': ghMkt('o/m'),
          'a\nb': ghMkt('o/m'),
          NPM: ghMkt('o/m'),
          'acme-tools': ghMkt('acme/tools'),
        },
      }),
    )
  ).find((f) => f.id === 'P3');
  assert.equal(p3.status, 'fail');
  for (const re of [/claude-plugins-official/, /untrusted source/, /another spelling/, /non-ASCII/, /without a marketplace/, /JavaScript object member/, /claudeai-x/, /control or bidirectional/, /package manager or code host/]) {
    assert.match(p3.message, re);
  }
  assert.doesNotMatch(p3.message, /acme-tools/);
  assert.equal(p3.fix.match(/"enabledPlugins"/g).length, 1, 'one shared rename fix');
  assert.match(p3.fix, /github\.com\/anthropics\//);
});

test('P7 skips every marketplace that P3 fails (#56)', async () => {
  for (const name of ['inline', 'NPM', 'toString', 'claudeai-x', 'claude.code.plugins', 'café', 'anthropic-plugin-directory']) {
    const [p7] = find(await run(claude({ extraKnownMarketplaces: { [name]: ghMkt('o/m') } })), 'P7');
    assert.equal(p7.status, 'skip', name);
  }
  const [p7] = find(
    await run(claude({ extraKnownMarketplaces: { inline: ghMkt('o/m'), 'acme-tools': ghMkt('acme/tools') } })),
    'P7',
  );
  assert.equal(p7.status, 'warn');
  assert.match(p7.message, /acme-tools/);
  assert.doesNotMatch(p7.message, /inline/);
});
