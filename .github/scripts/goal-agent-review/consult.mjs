// The Consultation fire (R54): a question comment from the user's session fires the named agent's routine
// with the comment URL as the only payload text. Reads only the event file; writes nothing to the tracker.
// Environment: GITHUB_EVENT_NAME, GITHUB_EVENT_PATH, GOAL_AGENT_<NAME>_FIRE_TOKEN and _TRIGGER_ID (see fire.mjs).
// The comment body is untrusted: it is matched here and never reaches a shell.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { credentialsFor, fireRoutine } from "./fire.mjs";

const TRUSTED = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
// The comment must open with the marker (R53); agent names are [a-z0-9-]+ (R37).
const QUESTION = /^> \*Question for ([a-z0-9-]+) Goal agent\.\*/;

/** The agent a comment event asks, or null when it asks nobody. */
export function questionedAgent(name, payload) {
  if (name !== "issue_comment" || !["created", "edited"].includes(payload.action)) return null;
  if (payload.issue?.pull_request) return null;
  if (!TRUSTED.has(payload.comment?.author_association)) return null;
  return QUESTION.exec(String(payload.comment?.body ?? ""))?.[1] ?? null;
}

/** Fire the questioned agent once. Throws FireError on a rejected fire; returns the agent fired, or null. */
export function main(env = process.env) {
  const payload = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
  const agent = questionedAgent(env.GITHUB_EVENT_NAME, payload);
  if (!agent) return null;
  const creds = credentialsFor(agent, env);
  if (!creds || !payload.comment.html_url) return null; // unknown or uncredentialed name: never fired
  fireRoutine({ ...creds, text: payload.comment.html_url });
  return agent;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.error(`goal-agent-consult: ${e.message}`);
    process.exitCode = 1;
  }
}
