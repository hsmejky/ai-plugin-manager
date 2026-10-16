// Pure decision logic of the gate (R37 logic steps 1-4). No I/O.
export const CONTEXT = "goal-agent-review";
export const NO_AGENT = "No goal-agent issue closed";
const TRUSTED = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const LABEL = /^goal-agent:([a-z0-9-]+)$/;

/** Agent names from a list of label names; `state` is reserved (R15) and names outside [a-z0-9-]+ are ignored. */
export function agentNames(labelNames) {
  const names = [];
  for (const l of labelNames) {
    const name = LABEL.exec(l)?.[1];
    if (name && name !== "state" && !names.includes(name)) names.push(name);
  }
  return names;
}

/**
 * The verdict of an agent's latest trusted marker for `sha`, or null when there is none.
 * Only the first line of a comment is read; the marker is an HTML comment (R34).
 */
export function latestVerdict(comments, name, sha) {
  let verdict = null;
  for (const c of comments) {
    if (!TRUSTED.has(c.author_association)) continue;
    const first = String(c.body ?? "").split(/\r?\n/, 1)[0];
    const m = /^<!--\s*goal-agent-review:([a-z0-9-]+)\s+sha=([0-9a-f]+)\b(.*?)-->\s*$/.exec(first);
    if (!m || m[1] !== name || m[2] !== sha) continue;
    verdict = /\bverdict=(pass|blocked)\b/.exec(m[3])?.[1] ?? null; // a marker without a valid verdict still supersedes older ones
  }
  return verdict;
}

/**
 * @param {string[]} agents gating agent names
 * @param {(name: string) => ("pass"|"blocked"|null)} verdictOf
 * @returns {{state: "success"|"failure"|"pending", description: string, missing: string[]}}
 */
export function decide(agents, verdictOf) {
  if (agents.length === 0) return { state: "success", description: NO_AGENT, missing: [] };
  const verdicts = agents.map((a) => [a, verdictOf(a)]);
  const blocked = verdicts.filter(([, v]) => v === "blocked").map(([a]) => a);
  const missing = verdicts.filter(([, v]) => v === null).map(([a]) => a);
  if (blocked.length) return { state: "failure", description: `Goal review blocked by: ${blocked.join(", ")}`, missing };
  if (missing.length) return { state: "pending", description: `Waiting for Goal review from: ${missing.join(", ")}`, missing };
  return { state: "success", description: `Goal review passed: ${agents.join(", ")}`, missing };
}
