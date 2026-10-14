// Shared finding helpers. A finding is { id, host, layer, status, message, fix }.
// host: 'claude' | 'codex' | 'both'; layer: 'project' | 'machine';
// status: 'pass' | 'warn' | 'fail' | 'skip'. fix is '' for pass and skip.

export function finding({ id, host, layer, status, message, fix = '' }) {
  return { id, host, layer, status, message, fix };
}

export const pass = (base, message) => finding({ ...base, status: 'pass', message });
export const warn = (base, message, fix) => finding({ ...base, status: 'warn', message, fix });
export const fail = (base, message, fix) => finding({ ...base, status: 'fail', message, fix });
export const skip = (base, message) => finding({ ...base, status: 'skip', message });
