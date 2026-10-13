// Host detection, reusable by any check group that must skip a missing Host.
//   detectHosts(env) -> { claude: { installed, version }, codex: { installed, version } }
// version is a "x.y.z" string, or null when the CLI is missing or prints no parseable version.

export const HOSTS = ['claude', 'codex'];
export const HOST_LABELS = { claude: 'Claude Code', codex: 'Codex' };
export const TESTED_VERSIONS = { claude: '2.1.296', codex: '0.160.1' };

export function parseVersion(text) {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(text ?? '');
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null;
}

/** Numeric semver compare: negative when a < b, 0 when equal, positive when a > b. */
export function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

export async function detectHosts(env) {
  const out = {};
  for (const host of HOSTS) {
    const r = await env.runCommand(host, ['--version']);
    out[host] = r.ok
      ? { installed: true, version: parseVersion(r.stdout) }
      : { installed: false, version: null };
  }
  return out;
}
