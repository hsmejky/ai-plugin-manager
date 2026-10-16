// The Goal review gate (R37): evaluates a PR and sets the commit status `goal-agent-review` on its head SHA.
// Runs from the default branch under `pull_request_target` / `issue_comment`; reads only the API.
// Environment: GITHUB_REPOSITORY, GITHUB_EVENT_NAME, GITHUB_EVENT_PATH (and gh's own GH_TOKEN).
//
// Structure (open for later tickets):
//   targetsFromEvent()  event -> PR numbers to evaluate        (label-change events add a mapping here)
//   evaluate()          PR -> { state, description, missing }
//   fireMissing()       fires the agents in `missing` once per head SHA (fire.mjs; record in the status description)
//   report()            posts the status
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseClosingRefs } from "./closing-refs.mjs";
import { agentNames, CONTEXT, decide, latestVerdict } from "./evaluate.mjs";
import { ghApi, ghList, GhError } from "./github.mjs";
import { credentialsFor, fireRoutine, secretsFromEnv } from "./fire.mjs";

const repoPath = (repo, path) => `repos/${repo}/${path}`;

/** PR numbers an event asks us to evaluate; throws on events the workflow should not deliver. */
export function targetsFromEvent(name, payload, repo) {
  if (name === "pull_request_target") {
    if (!payload.pull_request?.number) throw new Error("pull_request_target event without a pull request number");
    return [payload.pull_request.number];
  }
  if (name === "issue_comment") return payload.issue?.pull_request ? [payload.issue.number] : [];
  if (name === "issues") {
    const issue = payload.issue?.number;
    if (!issue) throw new Error("issues event without an issue number");
    if (payload.issue.pull_request) return []; // a PR's own label change arrives as a pull_request event
    return ghList(repoPath(repo, "pulls?state=open"))
      .filter((pr) => parseClosingRefs(pr.body).some((r) => r.number === issue && (r.repo ?? repo).toLowerCase() === repo.toLowerCase()))
      .map((pr) => pr.number);
  }
  throw new Error(`unsupported event "${name}"`);
}

/**
 * Labels of the issues the PR body closes, read in each issue's own repo. A missing issue in this
 * repo gates nothing (a typo'd number); a cross-repo issue that cannot be read fails closed (R37).
 */
function closingIssueLabels(repo, body) {
  const labels = [];
  for (const ref of parseClosingRefs(body)) {
    const sameRepo = (ref.repo ?? repo).toLowerCase() === repo.toLowerCase();
    try {
      const issue = ghApi(repoPath(ref.repo ?? repo, `issues/${ref.number}`));
      labels.push(...issue.labels.map((l) => (typeof l === "string" ? l : l.name)));
    } catch (e) {
      if (sameRepo && e instanceof GhError && e.status === 404) continue;
      throw e;
    }
  }
  return labels;
}

/** Everything the gate decides for one PR, without writing. */
export function evaluate(repo, pr) {
  const agents = agentNames(closingIssueLabels(repo, pr.body));
  if (agents.length === 0) return { agents, ...decide([], () => null) };
  const comments = ghList(repoPath(repo, `issues/${pr.number}/comments`));
  return { agents, ...decide(agents, (name) => latestVerdict(comments, name, pr.head.sha)) };
}

// The pending description records the agents already fired for the head SHA, e.g. "... | Fired: alpha, beta".
const FIRED = /\| Fired: ([a-z0-9, -]+)$/;
const ACTIONS_BOT = "github-actions[bot]";

/** Agents the latest status of this context on `sha` lists as fired. Only statuses posted by the Actions app count. */
export function firedAgents(repo, sha) {
  const latest = ghList(repoPath(repo, `commits/${sha}/statuses`)).find((s) => s.context === CONTEXT && s.creator?.login === ACTIONS_BOT);
  const m = FIRED.exec(latest?.description ?? "");
  return m ? m[1].split(",").map((n) => n.trim()).filter(Boolean) : [];
}

/** Description with the fired record appended; the base is shortened so the record always fits in 140 characters. */
export function withFired(description, fired) {
  if (fired.length === 0) return description.slice(0, 140);
  const suffix = ` | Fired: ${fired.join(", ")}`;
  return description.slice(0, Math.max(0, 140 - suffix.length)) + suffix;
}

/**
 * Fire each missing agent that has credentials and is not yet listed as fired for this SHA. A draft fires nothing.
 * @returns {{fired: string[], errors: string[]}} fired: everything now listed for this SHA; errors: rejected fires
 */
export function fireMissing(repo, pr, missing, env = process.env) {
  const fired = firedAgents(repo, pr.head.sha);
  const errors = [];
  if (pr.draft) return { fired, errors };
  const secrets = secretsFromEnv(env);
  const url = pr.html_url ?? `https://github.com/${repo}/pull/${pr.number}`;
  for (const name of missing) {
    if (fired.includes(name)) continue;
    const creds = credentialsFor(name, secrets);
    if (!creds) continue;
    try {
      fireRoutine({ ...creds, text: url });
      fired.push(name);
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
    }
  }
  return { fired, errors };
}

export function report(repo, sha, { state, description }) {
  ghApi(repoPath(repo, `statuses/${sha}`), { method: "POST", body: { state, context: CONTEXT, description: description.slice(0, 140) } });
}

export function main(env = process.env) {
  const repo = env.GITHUB_REPOSITORY;
  const payload = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
  let failed = false;
  for (const number of targetsFromEvent(env.GITHUB_EVENT_NAME, payload, repo)) {
    let sha = payload.pull_request?.head?.sha; // fallback for the error status only; the verdict uses the REST head
    try {
      const pr = ghApi(repoPath(repo, `pulls/${number}`));
      sha = pr.head.sha;
      const result = evaluate(repo, pr);
      const { fired, errors } = fireMissing(repo, pr, result.missing, env);
      if (errors.length) {
        failed = true; // fail closed: a PR stays blocked while an agent cannot be fired
        console.error(`goal-agent-review: PR #${number}: ${errors.join("; ")}`);
        report(repo, sha, { state: "error", description: withFired(`Goal review fire rejected for ${errors.map((x) => x.split(":")[0]).join(", ")}`, fired) });
      } else {
        report(repo, sha, { ...result, description: withFired(result.description, fired) });
      }
    } catch (e) {
      failed = true;
      console.error(`goal-agent-review: PR #${number}: ${e.message}`);
      try {
        // Keep the fired record: this status replaces the latest one, and losing it would refire agents.
        let fired = [];
        try { if (sha) fired = firedAgents(repo, sha); } catch { /* unreadable: post the error without it */ }
        if (sha) report(repo, sha, { state: "error", description: withFired("Goal review gate error: see the workflow run", fired) });
      } catch (e2) {
        console.error(`goal-agent-review: could not post the error status: ${e2.message}`);
      }
    }
  }
  return failed ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main();
  } catch (e) {
    console.error(`goal-agent-review: ${e.message}`);
    process.exitCode = 1;
  }
}
