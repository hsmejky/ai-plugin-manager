// M1, M2: Host presence and project trust (machine layer, both Hosts).
import { pass, warn, skip } from '../findings.mjs';
import { HOST, HOSTS, compareVersions } from '../hosts.mjs';

function presence(host, info) {
  const base = { id: 'M1', host, layer: 'machine' };
  const { label, testedVersion: tested } = HOST[host];
  if (!info.installed) {
    return warn(
      base,
      `${label} CLI (\`${host}\`) is not installed or not on PATH`,
      `Install ${label} (tested with ${tested}) and make \`${host}\` available on PATH.`,
    );
  }
  if (!info.version) {
    return warn(base, `${label} version could not be determined`, `Run \`${host} --version\` and make sure it is at least ${tested}.`);
  }
  if (compareVersions(info.version, tested) < 0) {
    return warn(
      base,
      `${label} ${info.version} is older than the tested version ${tested}`,
      `Update ${label} to ${tested} or newer.`,
    );
  }
  return pass(base, `${label} ${info.version} is installed (tested version ${tested})`);
}

export async function checkHostTrust(env, { hosts }) {
  const out = [];
  for (const host of HOSTS) out.push(presence(host, hosts[host]));
  for (const host of HOSTS) {
    out.push(
      hosts[host].installed
        ? HOST[host].checkTrust(env)
        : skip({ id: 'M2', host, layer: 'machine' }, `${HOST[host].label} is not installed; trust check skipped`),
    );
  }
  return out;
}
