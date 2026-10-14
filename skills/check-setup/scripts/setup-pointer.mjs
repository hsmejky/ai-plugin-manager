// The line a check-setup fix adds when the setup skill can apply the fix (spec #71).
// Each flag set is one call of the skill; an empty string is the call without flags.
export function setupPointer(...flagSets) {
  return flagSets
    .map((flags) => {
      const call = (prefix) => `\`${prefix}ai-plugin-manager:setup${flags ? ` ${flags}` : ''}\``;
      return `Or run ${call('/')} (Claude Code) or ${call('$')} (Codex).`;
    })
    .join('\n');
}
