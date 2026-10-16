// The fire mechanism (R37 step 5, reused by the Consultation workflow, R54): POST an agent's routine
// fire endpoint with one text payload. No GitHub access and no gate logic here.
// Credentials are repo secrets `GOAL_AGENT_<NAME>_FIRE_TOKEN` and `GOAL_AGENT_<NAME>_TRIGGER_ID`; the
// workflow passes them by name in the step env (never `toJSON(secrets)`: GitHub holds such runs as action_required).
import { spawnSync } from "node:child_process";

const ENDPOINT = "https://api.anthropic.com/v1/claude_code/routines";
const BETA = "experimental-cc-routine-2026-04-01";
const VERSION = "2023-06-01";

export class FireError extends Error {
  constructor(message) {
    super(message);
  }
}

/** `GOAL_AGENT_<NAME>_<SUFFIX>`: the name upper-cased and `-` turned into `_` (R29; cannot collide). */
export function secretName(agent, suffix = "FIRE_TOKEN") {
  return `GOAL_AGENT_${agent.toUpperCase().replaceAll("-", "_")}_${suffix}`;
}

/** {token, triggerId} for an agent from `env`, or null when either is missing or empty (the agent is then never fired). */
export function credentialsFor(agent, env = process.env) {
  const token = env[secretName(agent, "FIRE_TOKEN")];
  const triggerId = env[secretName(agent, "TRIGGER_ID")];
  return token && triggerId ? { token: String(token), triggerId: String(triggerId).trim() } : null;
}

/**
 * Fire a routine with `text` as the only payload. Throws FireError on a non-2xx answer or a transport failure.
 * curl runs through a shell (so the PATH fakes resolve on Windows); the token travels in the environment.
 */
export function fireRoutine({ triggerId, token, text }) {
  if (!/^[A-Za-z0-9_-]+$/.test(triggerId)) throw new FireError("trigger id has unexpected characters");
  const win = process.platform === "win32";
  const auth = win ? "%GOAL_AGENT_FIRE_TOKEN%" : "$GOAL_AGENT_FIRE_TOKEN";
  // --fail-with-body: curl exits 22 on any HTTP status >= 400 (400 routine_paused, 429, ...). No `-w`: a `%` in
  // the command line is mangled by cmd.exe when the fake curl.cmd runs on Windows.
  const cmd = [
    "curl -sS --fail-with-body -X POST",
    `-H "Authorization: Bearer ${auth}"`,
    `-H "anthropic-beta: ${BETA}"`,
    `-H "anthropic-version: ${VERSION}"`,
    `-H "Content-Type: application/json"`,
    "--data-binary @-",
    `"${ENDPOINT}/${triggerId}/fire"`,
  ].join(" ");
  const r = spawnSync(cmd, { shell: true, encoding: "utf8", input: JSON.stringify({ text }), env: { ...process.env, GOAL_AGENT_FIRE_TOKEN: token } });
  if (r.error) throw new FireError(`curl failed: ${r.error.message}`);
  if (r.status === 22) throw new FireError(`fire rejected: ${`${r.stderr ?? ""} ${r.stdout ?? ""}`.replace(/\s+/g, " ").trim().slice(0, 300) || "HTTP error"}`);
  if (r.status !== 0) throw new FireError(`curl failed (${r.status}): ${(r.stderr || "").trim()}`);
}
