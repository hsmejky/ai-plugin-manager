// The one REST-only GitHub access layer through `gh api` (ADR 0006: the cloud proxy rejects
// GraphQL-based gh subcommands). Shared by the gate, the guard and the Home repo scripts.
// `gh` is called through a shell so a `gh` found on the PATH resolves on Windows too, which is why
// every path is checked against SAFE_PATH before it is put into the command string.
import { spawnSync } from "node:child_process";

const SAFE_PATH = /^[A-Za-z0-9_.\/:?&=,%-]+$/;
const SAFE_METHOD = /^[A-Z]+$/;

export class GhError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/**
 * `gh api <path>`; a JSON body (if any) is sent on stdin. Returns the parsed response (null when
 * empty). `cwd` is the directory gh runs in. Throws GhError on a failed call, Error on an unsafe path.
 */
export function ghApi(path, { method = "GET", body, cwd } = {}) {
  if (!SAFE_PATH.test(path)) throw new Error(`unsafe gh api path: ${path}`);
  if (!SAFE_METHOD.test(method)) throw new Error(`unsafe gh api method: ${method}`);
  const cmd = `gh api -X ${method} "${path}"${body === undefined ? "" : " --input -"}`;
  const r = spawnSync(cmd, { shell: true, cwd, encoding: "utf8", input: body === undefined ? undefined : JSON.stringify(body) });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    const status = /\(HTTP (\d+)\)/.exec(r.stderr ?? "")?.[1];
    throw new GhError(`gh api ${method} ${path} failed (${r.status}): ${(r.stderr || r.stdout || "").trim()}`, status ? Number(status) : undefined);
  }
  const text = (r.stdout ?? "").trim();
  return text ? JSON.parse(text) : null;
}

/** GET every page of a list endpoint. */
export function ghList(path, opts = {}) {
  const all = [];
  for (let page = 1; ; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const items = ghApi(`${path}${sep}per_page=100&page=${page}`, opts);
    if (!Array.isArray(items)) throw new Error(`unexpected response from gh api ${path}`);
    all.push(...items);
    if (items.length < 100) return all;
  }
}
