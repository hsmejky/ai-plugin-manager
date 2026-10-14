import { test } from 'node:test';
import assert from 'node:assert/strict';
import { implicitInvocationDisabled } from '../openai-yaml.mjs';

const cases = [
  // [description, yaml, expected: true (hidden) | false (visible) | null (cannot tell)]
  ['block false', 'policy:\n  allow_implicit_invocation: false\n', true],
  ['CRLF', 'policy:\r\n  allow_implicit_invocation: false\r\n', true],
  ['False', 'policy:\n  allow_implicit_invocation: False\n', true],
  ['FALSE with comment', 'policy:\n  allow_implicit_invocation: FALSE # c\n', true],
  ['true', 'policy:\n  allow_implicit_invocation: true\n', false],
  ['quoted value is a string', 'policy:\n  allow_implicit_invocation: "false"\n', false],
  ['no policy', 'interface:\n  display_name: X\n', false],
  ['column-0 comment inside policy', 'policy:\n# note\n  allow_implicit_invocation: false\n', true],
  ['comment between keys', 'policy:\n  other: 1\n# note\n  allow_implicit_invocation: false\n', true],
  ['nested key under another policy key is not the policy key', 'policy:\n  other:\n    allow_implicit_invocation: false\n', false],
  ['nested key, then real key true', 'policy:\n  other:\n    allow_implicit_invocation: false\n  allow_implicit_invocation: true\n', false],
  ['double-quoted key', 'policy:\n  "allow_implicit_invocation": false\n', true],
  ['single-quoted key', "policy:\n  'allow_implicit_invocation': false\n", true],
  ['quoted policy key', '"policy":\n  allow_implicit_invocation: false\n', true],
  ['BOM', '\uFEFFpolicy:\n  allow_implicit_invocation: false\n', true],
  ['flow map', 'policy: {allow_implicit_invocation: false}\n', true],
  ['flow map split over lines', 'policy: {\n  other: 1,\n  allow_implicit_invocation: false\n}\n', true],
  ['flow map split, true', 'policy: {\n  allow_implicit_invocation: true\n}\n', false],
  ['flow map with quoted key', 'policy: {"allow_implicit_invocation": false}\n', true],
  ['flow map with other keys only', 'policy: { other: 1 } # c\n', false],
  ['sibling key after block', 'policy:\n  other: 1\nnext:\n  allow_implicit_invocation: false\n', false],
  ['indented policy is not top-level', 'x:\n  policy:\n    allow_implicit_invocation: false\n', false],
  ['empty file', '', false],
  // Cannot be judged by the line reader: unknown, never visible or hidden.
  ['duplicate key', 'policy:\n  allow_implicit_invocation: false\n  allow_implicit_invocation: true\n', null],
  ['duplicate policy', 'policy:\n  a: 1\npolicy:\n  allow_implicit_invocation: false\n', null],
  ['alias value', 'policy:\n  allow_implicit_invocation: *flag\n', null],
  ['policy is an alias', 'policy: *p\n', null],
  ['policy is a scalar', 'policy: false\n', null],
  ['tab indentation', 'policy:\n\tallow_implicit_invocation: false\n', null],
  ['unterminated flow map', 'policy: {allow_implicit_invocation: false\n', null],
  ['value on the next line', 'policy:\n  allow_implicit_invocation:\n    false\n', null],
  ['merge key', 'policy:\n  <<: *base\n', null],
  ['multiple documents', 'policy:\n  a: 1\n---\npolicy:\n  allow_implicit_invocation: false\n', null],
];
for (const [name, yaml, expected] of cases) {
  test(`openai.yaml: ${name}`, () => assert.equal(implicitInvocationDisabled(yaml), expected));
}
