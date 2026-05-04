import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Structural enforcement for the foster-terminology fix.
 *
 * Background: the renderer used to compose the parent_child relationship
 * label from two i18n lookups — `relTypes.parent` + `parentChildSubtypes.foster`
 * — rendered as two adjacent badges. In Swedish that produced "Förälder Foster"
 * (literally "parent fetus") and in dropdowns the bare key surfaced as
 * "Foster" (= fetus). The fix introduces a single `relationshipRoles.<dir>_<subtype>`
 * key per role and bans direct `parentChildSubtypes.*` references in renderer
 * templates.
 *
 * This test fails if any .vue file under src/renderer/ references
 * `parentChildSubtypes.` directly (string literal). The i18n source files in
 * src/renderer/i18n/ are NOT scanned (they DEFINE the keys; other consumers
 * such as scripts or tests may legitimately read them). The renderer's
 * `utils/relationshipLabels.ts` is the only sanctioned consumer of the
 * underlying subtype values, and it composes through the new role keys.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (full.endsWith('.vue')) out.push(full);
  }
  return out;
}

describe('parentChildSubtypes sweep', () => {
  it('no Vue template under src/renderer/components/ references parentChildSubtypes. directly', () => {
    const root = resolve(__dirname, '..', '..', 'src', 'renderer', 'components');
    const files = walk(root);
    const offenders: string[] = [];
    for (const f of files) {
      const content = readFileSync(f, 'utf8');
      // Match $t('parentChildSubtypes.…') or t('parentChildSubtypes.…')
      // Both single-quoted and double-quoted forms.
      if (/\$?t\(\s*['"]parentChildSubtypes\./.test(content)) {
        offenders.push(f);
      }
    }
    expect(offenders, `Found composition-bug-prone references — route through getParentChildRoleLabel():\n${offenders.join('\n')}`).toEqual([]);
  });
});
