// Tolerant file reads: a missing or unreadable file is `null`, never an exception.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Where Codex keeps its user config and plugin cache: `$CODEX_HOME` when set (env.codexHome, read by
 * the CLI entry point), else `~/.codex`. Source: codex-rs/utils/home-dir `find_codex_home`, rust-v0.162.1.
 */
export const codexHome = (env) => env.codexHome ?? join(env.homeDir, '.codex');

/** The user's Codex config as shown in messages: `~/.codex/config.toml` by default, else the real path. */
export const codexConfigLabel = (env) => (env.codexHome ? join(env.codexHome, 'config.toml') : '~/.codex/config.toml');

export function readText(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/** Parsed JSON, or null when the file is missing, unreadable or not valid JSON. */
export function readJson(file) {
  const text = readText(file);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
