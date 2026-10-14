// M6: Codex plugin support is not switched off by `[features] plugins = false`.
// Observed on codex-cli 0.162.1: with the flag off, `codex plugin list --json` and
// `codex plugin marketplace list --json` report nothing and no plugin skill loads. A trusted
// project's `.codex/config.toml` overrides the user config; an untrusted project's is ignored.
import { join } from 'node:path';
import { parseToml } from '../toml.mjs';
import { readText, codexHome, codexConfigLabel } from '../files.mjs';
import { CODEX_CONFIG } from '../declarations.mjs';
import { fail, pass, skip } from '../findings.mjs';
import { codexTrust } from '../trust.mjs';

/** { value } with the file's `features.plugins` (undefined when unset or no file), or { error }. */
function pluginsFlag(label, file) {
  const text = readText(file);
  try {
    return { value: text === null ? undefined : parseToml(text).features?.plugins };
  } catch (e) {
    return { error: `${label} could not be parsed (${e.message}), so the plugins feature flag cannot be checked` };
  }
}

const disabled = (base, file, scope) =>
  fail(
    base,
    `${file} sets [features] plugins = false, so Codex loads no plugin ${scope}`,
    `Remove \`plugins = false\` from the [features] table of ${file} (or set it to true).` +
      (file !== CODEX_CONFIG ? ' `codex features enable plugins` does the same.' : ''),
  );

export async function checkCodexFeatures(env, { hosts }) {
  const base = { id: 'M6', host: 'codex', layer: 'machine' };
  if (!hosts.codex.installed) return [skip(base, 'Codex CLI is not installed (see M1)')];
  const project = pluginsFlag(CODEX_CONFIG, join(env.projectDir, CODEX_CONFIG));
  const userLabel = codexConfigLabel(env);
  const user = pluginsFlag(userLabel, join(codexHome(env), 'config.toml'));
  const error = project.error ?? user.error;
  if (error) return [skip(base, error)];
  if (project.value === false) return [disabled(base, CODEX_CONFIG, 'in this project once it is trusted')];
  const overridden = project.value === true && codexTrust(env).status === 'pass';
  if (user.value === false && !overridden) return [disabled(base, userLabel, 'on this machine')];
  return [pass(base, 'Codex plugins are enabled (no config sets [features] plugins = false)')];
}
