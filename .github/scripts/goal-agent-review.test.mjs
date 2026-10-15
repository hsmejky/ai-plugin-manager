// Unit tests for the pure decision logic. Run: node --test .github/scripts/goal-agent-review.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, requiredAgents, openPrNumbers } from './goal-agent-review.mjs';

const SHA = 'a'.repeat(40);
const OLD = 'b'.repeat(40);
const marker = (agent, verdict, sha = SHA) => `<!-- goal-agent-review:${agent} sha=${sha} verdict=${verdict} -->\nbody`;
const comment = (body, authorAssociation = 'OWNER') => ({ body, authorAssociation });
const issue = (...labels) => ({ number: 1, labels });
const run = (closingIssues, comments) => decide({ closingIssues, comments, headSha: SHA, prNumber: 7 });

test('no closing issue: success', () => {
  assert.equal(run([], []).state, 'success');
});

test('closing issue without goal-agent label: success', () => {
  assert.deepEqual(run([issue('bug')], []), { state: 'success', description: 'No goal-agent issue closed' });
});

test('goal-agent:state is not a reviewing agent', () => {
  assert.deepEqual(requiredAgents([issue('goal-agent:state')]), []);
  assert.equal(run([issue('goal-agent:state')], []).state, 'success');
});

test('required agent without a comment: pending with the review hint', () => {
  const r = run([issue('goal-agent:plugin-maintainer')], []);
  assert.equal(r.state, 'pending');
  assert.match(r.description, /^Run \/goal-review 7/);
});

test('pass on the head SHA: success', () => {
  assert.equal(run([issue('goal-agent:a')], [comment(marker('a', 'pass'))]).state, 'success');
});

test('blocked on the head SHA: failure', () => {
  assert.equal(run([issue('goal-agent:a')], [comment(marker('a', 'blocked'))]).state, 'failure');
});

test('marker for an older SHA does not count: pending', () => {
  assert.equal(run([issue('goal-agent:a')], [comment(marker('a', 'pass', OLD))]).state, 'pending');
});

test('latest marker for the SHA wins', () => {
  const issues = [issue('goal-agent:a')];
  assert.equal(run(issues, [comment(marker('a', 'blocked')), comment(marker('a', 'pass'))]).state, 'success');
  assert.equal(run(issues, [comment(marker('a', 'pass')), comment(marker('a', 'blocked'))]).state, 'failure');
});

test('untrusted author_association is ignored', () => {
  for (const assoc of ['NONE', 'CONTRIBUTOR', 'FIRST_TIME_CONTRIBUTOR']) {
    assert.equal(run([issue('goal-agent:a')], [comment(marker('a', 'pass'), assoc)]).state, 'pending', assoc);
  }
  for (const assoc of ['OWNER', 'MEMBER', 'COLLABORATOR']) {
    assert.equal(run([issue('goal-agent:a')], [comment(marker('a', 'pass'), assoc)]).state, 'success', assoc);
  }
});

test('marker must be the start of the comment', () => {
  assert.equal(run([issue('goal-agent:a')], [comment(`quote: ${marker('a', 'pass')}`)]).state, 'pending');
});

test('marker for another agent does not count', () => {
  assert.equal(run([issue('goal-agent:a')], [comment(marker('b', 'pass'))]).state, 'pending');
});

test('several agents: all must pass; blocked beats missing', () => {
  const issues = [issue('goal-agent:a'), issue('goal-agent:b')];
  assert.equal(run(issues, [comment(marker('a', 'pass')), comment(marker('b', 'pass'))]).state, 'success');
  assert.equal(run(issues, [comment(marker('a', 'pass'))]).state, 'pending');
  assert.equal(run(issues, [comment(marker('a', 'blocked'))]).state, 'failure');
});

test('label with a name the marker cannot carry: failure, never satisfiable', () => {
  const r = run([issue('goal-agent:bad name')], [comment(marker('a', 'pass'))]);
  assert.equal(r.state, 'failure');
  assert.match(r.description, /goal-agent:bad name/);
  assert.deepEqual(requiredAgents([issue('goal-agent:bad name', 'goal-agent:ok')]), ['ok']);
  assert.equal(run([issue('goal-agent:a/b')], []).state, 'failure');
});

test('openPrNumbers keeps only open PRs, unique and sorted', () => {
  const nodes = [{ number: 9, state: 'OPEN' }, { number: 3, state: 'MERGED' }, { number: 5, state: 'OPEN' }, { number: 9, state: 'OPEN' }, null];
  assert.deepEqual(openPrNumbers(nodes), [5, 9]);
});
