// P1, P2: project instruction files.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pass, fail } from '../findings.mjs';

export async function checkProjectInstructions(env) {
  const out = [];

  const p1 = { id: 'P1', host: 'both', layer: 'project' };
  out.push(
    existsSync(join(env.projectDir, 'AGENTS.md'))
      ? pass(p1, 'AGENTS.md exists')
      : fail(p1, 'AGENTS.md is missing', 'Create AGENTS.md in the project root with the shared agent instructions.'),
  );

  const p2 = { id: 'P2', host: 'claude', layer: 'project' };
  const importFix = 'Create CLAUDE.md in the project root containing the line: @AGENTS.md';
  const claudePath = join(env.projectDir, 'CLAUDE.md');
  if (!existsSync(claudePath)) {
    out.push(fail(p2, 'CLAUDE.md is missing', importFix));
  } else {
    const imports = readFileSync(claudePath, 'utf8')
      .split(/\r?\n/)
      .some((line) => line.trim() === '@AGENTS.md');
    out.push(
      imports
        ? pass(p2, 'CLAUDE.md imports @AGENTS.md')
        : fail(p2, 'CLAUDE.md does not import @AGENTS.md', 'Add the line @AGENTS.md to CLAUDE.md.'),
    );
  }
  return out;
}
