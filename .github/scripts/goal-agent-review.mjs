// Merge gate for Goal reviews: sets the commit status `goal-agent-review` on a PR's head SHA.
// Design: docs/agents/goal-agents.md, section "Goal review". Run in CI by .github/workflows/goal-agent-review.yml.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const CONTEXT = 'goal-agent-review';
const TRUSTED = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
const MARKER = /^<!-- goal-agent-review:([A-Za-z0-9._-]+) sha=([0-9a-f]{40}) verdict=(pass|blocked) -->/;

const AGENT_NAME = /^[A-Za-z0-9._-]+$/;

/**
 * Agent names required by the `goal-agent:<name>` labels of the closing issues (`goal-agent:state` excluded).
 * Returns { agents, invalid }: `invalid` lists labels whose name the marker could never carry.
 */
export function requiredAgentsChecked(closingIssues) {
  const names = new Set();
  const invalid = new Set();
  for (const issue of closingIssues) {
    for (const label of issue.labels) {
      const m = /^goal-agent:(.+)$/.exec(label);
      if (!m || m[1] === 'state') continue;
      if (AGENT_NAME.test(m[1])) names.add(m[1]);
      else invalid.add(label);
    }
  }
  return { agents: [...names].sort(), invalid: [...invalid].sort() };
}

/** Valid agent names required by the closing issues. */
export function requiredAgents(closingIssues) {
  return requiredAgentsChecked(closingIssues).agents;
}

/** Open PR numbers from a GraphQL `closedByPullRequestsReferences` node list. */
export function openPrNumbers(nodes) {
  return [...new Set(nodes.filter((n) => n && n.state === 'OPEN').map((n) => n.number))].sort((a, b) => a - b);
}

/**
 * Pure decision. `comments` are in chronological order, shaped { body, authorAssociation }.
 * Returns { state: 'success' | 'failure' | 'pending', description }.
 */
export function decide({ closingIssues, comments, headSha, prNumber }) {
  const { agents, invalid } = requiredAgentsChecked(closingIssues);
  if (invalid.length) {
    return { state: 'failure', description: `Invalid agent label (name must match [A-Za-z0-9._-]+): ${invalid.join(', ')}` };
  }
  if (agents.length === 0) return { state: 'success', description: 'No goal-agent issue closed' };

  const verdicts = new Map();
  for (const c of comments) {
    if (!TRUSTED.has(c.authorAssociation)) continue;
    const m = MARKER.exec(c.body ?? '');
    if (!m || m[2] !== headSha || !agents.includes(m[1])) continue;
    verdicts.set(m[1], m[3]); // later comments override earlier ones
  }

  const blocked = agents.filter((a) => verdicts.get(a) === 'blocked');
  const missing = agents.filter((a) => !verdicts.has(a));
  if (blocked.length) return { state: 'failure', description: `Goal review blocked: ${blocked.join(', ')}` };
  if (missing.length) return { state: 'pending', description: `Run /goal-review ${prNumber} (${missing.join(', ')})` };
  return { state: 'success', description: `Goal review passed: ${agents.join(', ')}` };
}

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

function fetchInputs(repo, prNumber) {
  const [owner, name] = repo.split('/');
  const pr = JSON.parse(gh('api', `repos/${repo}/pulls/${prNumber}`));
  const query = `query($owner:String!,$name:String!,$n:Int!){repository(owner:$owner,name:$name){pullRequest(number:$n){
    closingIssuesReferences(first:50){nodes{number labels(first:50){nodes{name}}}}}}}`;
  const gql = JSON.parse(gh('api', 'graphql', '-f', `query=${query}`, '-f', `owner=${owner}`, '-f', `name=${name}`, '-F', `n=${prNumber}`));
  const nodes = gql.data.repository.pullRequest.closingIssuesReferences.nodes;
  const closingIssues = nodes.map((n) => ({ number: n.number, labels: n.labels.nodes.map((l) => l.name) }));
  // --paginate with --slurp yields an array of pages
  const pages = JSON.parse(gh('api', '--paginate', '--slurp', `repos/${repo}/issues/${prNumber}/comments?per_page=100`));
  const comments = pages.flat().map((c) => ({ body: c.body, authorAssociation: c.author_association }));
  return { closingIssues, comments, headSha: pr.head.sha, prNumber };
}

function setStatus(repo, sha, state, description) {
  gh('api', `repos/${repo}/statuses/${sha}`, '-f', `state=${state}`, '-f', `context=${CONTEXT}`, '-f', `description=${description.slice(0, 140)}`);
}

function evaluate(repo, prNumber, ctx) {
  ctx.prNumber = prNumber;
  ctx.headSha = undefined;
  const inputs = fetchInputs(repo, prNumber);
  ctx.headSha = inputs.headSha;
  const { state, description } = decide(inputs);
  console.log(`PR #${prNumber} @ ${inputs.headSha}: ${state} (${description})`);
  setStatus(repo, inputs.headSha, state, description);
}

/** Open PRs that close the issue (a label change on the issue can change their status). */
function prsClosing(repo, issueNumber) {
  const [owner, name] = repo.split('/');
  const query = `query($owner:String!,$name:String!,$n:Int!){repository(owner:$owner,name:$name){issue(number:$n){
    closedByPullRequestsReferences(first:50,includeClosedPrs:false){nodes{number state}}}}}`;
  const gql = JSON.parse(gh('api', 'graphql', '-f', `query=${query}`, '-f', `owner=${owner}`, '-f', `name=${name}`, '-F', `n=${issueNumber}`));
  return openPrNumbers(gql.data.repository.issue.closedByPullRequestsReferences.nodes);
}

function main(ctx) {
  const repo = process.env.GITHUB_REPOSITORY;
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const name = process.env.GITHUB_EVENT_NAME;
  if (name === 'issues') {
    for (const n of prsClosing(repo, event.issue.number)) evaluate(repo, n, ctx);
  } else if (name === 'issue_comment') {
    if (!event.issue?.pull_request) {
      console.log('Comment is not on a pull request; nothing to do.');
      return;
    }
    evaluate(repo, event.issue.number, ctx);
  } else {
    evaluate(repo, event.pull_request.number, ctx);
  }
}

function run() {
  const ctx = {};
  try {
    main(ctx);
  } catch (err) {
    console.error(err);
    if (ctx.headSha) {
      try {
        setStatus(process.env.GITHUB_REPOSITORY, ctx.headSha, 'error', 'Goal review gate error, see run');
      } catch (e) {
        console.error(e);
      }
    }
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run();
