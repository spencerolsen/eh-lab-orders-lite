// The shared styles that carry the polish fixes (LAB-25). jsdom does no
// layout, so these check that the rules are written; the look is checked by
// eye on /styles.
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const css = readFileSync(new URL('./base.css', import.meta.url), 'utf8');

// The declarations of the rule whose selector is exactly `selector`.
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const found = new RegExp(
    `(?:^|[}/])\\s*${escaped}\\s*\\{([^}]*)\\}`,
    'm',
  ).exec(css);
  if (!found) throw new Error(`no rule for ${selector}`);
  return found[1]!;
}

it('draws the select arrow in the shared style, inset like the text, in the text colour', () => {
  const select = rule('select');
  expect(select).toContain('appearance: none');
  expect(select).toContain('currentColor');
  expect(select).toContain('var(--space-3)');
  expect(select).not.toMatch(/#[0-9a-f]{3,8}\b/i);
});

it('wraps long unbroken text everywhere, from the body', () => {
  expect(rule('body')).toContain('overflow-wrap: anywhere');
});

it('keeps a date cell on one line', () => {
  expect(rule('.table .nowrap')).toContain('white-space: nowrap');
});

it('anchors the New order dialog near the top and scrolls only the test list', () => {
  expect(rule('.dialog-wide')).toMatch(/margin: var\(--space-4\) auto auto/);
  expect(rule('.dialog-wide')).toContain('max-height');
  expect(rule('.scroll')).toContain('overflow-y: auto');
});
