# Panel CTA Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

## User goal

When I click anything inside a side panel, the result is what the affordance promised — and what the affordance promises is consistent across panels. No row that looks clickable does nothing. No `✕` that means "close" in one place means "delete this person from the database" in another. No "Add relationship" button that secretly always picks spouse. And the glyph for *unlink* (severs the relationship, keeps the entity) is never the same as the glyph for *delete* (destroys the row).

I want to land this once, then have a test that fails the next time the conventions drift.

## Scope (full)

Every panel and shared section file that participates in panel CTAs. Eight issues from the [`2026-05-02 audit`](#failure-modes--rca-reference):

| # | File | Issue |
|---|---|---|
| 1 | [PersonPanel.vue:144](src/renderer/components/PersonPanel.vue#L144) | Groups row: `GroupsTable` emits `@select` but PersonPanel does not listen → dead click |
| 2 | [EntityMediaSection.vue:36-40](src/renderer/components/EntityMediaSection.vue#L36-L40) | Unlink button uses `&#10005;` glyph + `btn-delete` class + `aria-label=deleteItem`, handler is `removeLink` |
| 3 | [MediaPanel.vue:97,177,194](src/renderer/components/MediaPanel.vue) | Three unlink buttons use raw `&#10005;` glyph (should be `IconUnlink`) |
| 4 | [MediaPanel.vue:154](src/renderer/components/MediaPanel.vue#L154) | Face-tag delete button uses `&#10005;` glyph; handler is destructive `mediaRegions.delete` (should be `IconTrash`) |
| 5 | [PersonPanel.vue:109](src/renderer/components/PersonPanel.vue#L109) | "+ Add relationship" header button silently hardcodes `openAddRelative('spouse')` |
| 6 | [GroupPanel.vue:225](src/renderer/components/GroupPanel.vue#L225) + [ResearchTaskPanel.vue:272](src/renderer/components/ResearchTaskPanel.vue#L272) | Unlink calls `removeLink` directly with no confirm modal; PersonPanel confirms the same verb |
| 7 | [PlacePersonsSection.vue:14,17](src/renderer/components/PlacePersonsSection.vue#L14-L17) | Row has `@click` AND nested `<router-link>` → same destination, redundant `@click.stop` |
| 8 | [MediaPanel.vue:144](src/renderer/components/MediaPanel.vue#L144) | Face-tag row name-click reassigns the person; affordance gives no hint |

Plus drift prevention:

| # | File | Purpose |
|---|---|---|
| 9 | [tests/components/panel-cta-conventions.test.ts](tests/components/panel-cta-conventions.test.ts) (NEW) | Source-level scan: no raw `&#10005;` in `*Panel.vue` / `*Section.vue`; every `GroupsTable` / `ResearchTasksTable` / `PersonNamesTable` mount has `@select=` wired |
| 10 | [.claude/skills/ux-intent-mapping/SKILL.md](.claude/skills/ux-intent-mapping/SKILL.md) | Add a "CTA conventions" section that codifies: glyph→verb mapping, dead-click prohibition, hardcoded-mode prohibition, confirm-modal symmetry |
| 11 | [docs/UX_INVENTORY.md](docs/UX_INVENTORY.md) | Remove or close every finding fixed by this plan |

### Scope deviations

- **Audit issue dropped: "Research tasks row → router.push"** ([PersonPanel.vue:667-670](src/renderer/components/PersonPanel.vue#L667-L670), [PlacePanel.vue:574-577](src/renderer/components/PlacePanel.vue#L574-L577)). The function name `goToTask` is misleading, but the body already calls `openTaskForm(task)` — the modal opens in place. The audit read the function name without reading the body. **No code change.** As a courtesy cleanup we will rename `goToTask` → `openTaskFromRow` in both panels (Task 8.5) but it is not a behaviour fix.
- **No new ESLint rule.** A custom Vue/template ESLint rule for "no raw `&#10005;`" is overkill for two glyph patterns. A vitest source-scan covers it with zero new tooling.
- **No confirm modals added to MediaPanel or PersonMediaSection.** They already use `useDeleteConfirm` + `ConfirmModal`. Issue 6 only affects GroupPanel and ResearchTaskPanel.

## Verification

For each issue, the user-observable check that proves it:

| # | User-observable check |
|---|---|
| 1 | Open a person in PersonsView, expand the Groups section, click a group row → navigates to `/groups/<that-group-id>` with that group selected. |
| 2 | Open a place's Media section, hover the unlink icon → `IconUnlink` (chain-broken icon), tooltip says "Unlink". Click → confirm dialog says "Unlink", entity remains in MediaView. |
| 3 | Open a media item's panel, three unlink buttons in Linked Persons, Linked Places, Linked Events → all show `IconUnlink`. |
| 4 | Open a media item's panel, face-tag delete button → shows `IconTrash`. Tooltip says "Delete tag". |
| 5 | Click "+ Add relationship" button at top of Relations section → opens the relative-role picker (or removed entirely; choose at task time). Never silently picks spouse. |
| 6 | In GroupPanel, click unlink on a person → confirm modal appears. Same in ResearchTaskPanel. |
| 7 | In PlacesView, expand a place's Persons section, click a row → navigates exactly once. View the source: row has one click handler, not two. |
| 8 | In MediaPanel, hover a face-tag row name → cursor + visual hint shows "click to reassign". A small ✎ pencil icon next to the name is the affordance. |
| 9 | The new test `panel-cta-conventions.test.ts` passes on `main` after the fixes; if any of the seven regressions is reintroduced, the relevant assertion fails with a clear message. |

End-to-end smoke: open the running app, walk every panel, click every CTA listed in [`docs/UX_INVENTORY.md`](docs/UX_INVENTORY.md), confirm each does what its label claims.

## Failure modes / RCA reference

This plan follows [`docs/plans/archive/2026-05-02-panel-cta-audit.md`](docs/plans/archive/) — wait, that doesn't exist; the audit was a transcript exchange today (2026-05-02). The findings are the audit report from the `ux-reviewer` subagent in the same session. The known UX inconsistencies it surfaced were already partially documented in [`docs/UX_INVENTORY.md`](docs/UX_INVENTORY.md) (cross-cutting findings #2 — "✕ means delete in one section and unlink in another", #10 — "research-task row click should open modal"). UX_INVENTORY identified the symptoms; this plan fixes them and adds a regression test so the next refactor cannot quietly reintroduce them.

The earlier `panel-composables` refactor (v0.190.x) is the reference failure mode. It shipped half-consistent panels because verification was lint + vitest only and scope was implicit. The CTA conventions in this plan are exactly the kind of detail that escapes structural lint and structural tests — they are user-observable, glyph-and-verb level, only catchable by a source-level grep test or by clicking every button. We add the source-level test.

---

# Tasks

## Task 1: Drift-prevention test (write first, fails on current code)

**Files:**
- Create: `tests/components/panel-cta-conventions.test.ts`

The test reads source files directly (no Vue mounting needed) and asserts two conventions:
1. No raw `&#10005;` glyph appears inside a button/AppButton element in any `*Panel.vue` or `*Section.vue` under `src/renderer/components/`. (BaseSubPanel modal close is allowed; it lives in `src/renderer/components/modals/`.)
2. Every `<GroupsTable`, `<ResearchTasksTable`, `<PersonNamesTable` mount has a `@select=` listener attribute on the same element. (These tables emit `select` on row click; mounting one without `@select` is a dead-click row.)

- [x] **Step 1: Write the test**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const COMPONENTS_DIR = resolve(__dirname, '../../src/renderer/components');

function listFiles(dir: string, suffix: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isFile() && d.name.endsWith(suffix))
    .map(d => join(dir, d.name));
}

const panelFiles = [
  ...listFiles(COMPONENTS_DIR, 'Panel.vue'),
  ...listFiles(COMPONENTS_DIR, 'Section.vue'),
];

// Convention 1: no raw &#10005; (✕) glyph inside a button/AppButton in
// non-modal panel/section files. ✕ is reserved for modal close affordance,
// which lives in src/renderer/components/modals/.
describe('panel CTA conventions: no raw ✕ glyph in panels/sections', () => {
  it.each(panelFiles)('%s does not use raw &#10005; in a button', (file) => {
    const src = readFileSync(file, 'utf8');
    // Match the literal HTML entity inside any tag that looks like a button.
    // Pattern: <button ...>&#10005;</button> or <AppButton ...>&#10005;</AppButton>
    // (allowing whitespace and attributes between tag start and content)
    const buttonGlyph = /<(button|AppButton)\b[^>]*>\s*&#10005;\s*<\/(button|AppButton)>/;
    expect(
      buttonGlyph.test(src),
      `${file} contains a raw &#10005; glyph inside a button. Use <IconUnlink /> for unlink (severs link, keeps entity) or <IconTrash /> for delete (destroys row). The ✕ glyph is reserved for modal close affordances in src/renderer/components/modals/.`,
    ).toBe(false);
  });
});

// Convention 2: tables that emit `select` on row click must have a parent
// `@select` listener wherever they are mounted in a Panel.vue. Otherwise
// the row is a dead click — it announces itself as role="button" and does
// nothing.
const SELECT_EMITTING_TABLES = ['GroupsTable', 'ResearchTasksTable', 'PersonNamesTable'] as const;

describe('panel CTA conventions: select-emitting tables are wired', () => {
  for (const table of SELECT_EMITTING_TABLES) {
    it.each(listFiles(COMPONENTS_DIR, 'Panel.vue'))(`%s wires @select when mounting <${table}>`, (file) => {
      const src = readFileSync(file, 'utf8');
      // Find every <TableName ... /> or <TableName ... > opening tag in src.
      const mountRegex = new RegExp(`<${table}\\b([^>]*?)/?>`, 'g');
      const mounts = [...src.matchAll(mountRegex)];
      for (const m of mounts) {
        const attrs = m[1];
        expect(
          /@select=/.test(attrs),
          `${file} mounts <${table}> without @select. Rows in ${table} announce role="button" and emit 'select' on click; without @select they are dead. Wire @select="(id) => router.push(...)" or open a modal.`,
        ).toBe(true);
      }
    });
  }
});
```

- [x] **Step 2: Run test, confirm it fails on current code**

Run: `npx vitest run tests/components/panel-cta-conventions.test.ts`

Expected:
- `EntityMediaSection.vue does not use raw &#10005;` → FAIL
- `MediaPanel.vue does not use raw &#10005;` → FAIL (multiple matches)
- `PersonPanel.vue wires @select when mounting <GroupsTable>` → FAIL

If the test passes, the regex is wrong; debug before continuing.

- [x] **Step 3: Commit the failing test**

```bash
git add tests/components/panel-cta-conventions.test.ts
git commit -m "test(panel-cta): add convention scan (failing on current code)"
```

This is the regression net. Every subsequent task drives an assertion green.

---

## Task 2: Wire Groups row in PersonPanel

**Files:**
- Modify: `src/renderer/components/PersonPanel.vue:144`

PersonPanel currently mounts `GroupsTable` with `:groups`, `:readonly`, and conditionally `onRemove` — but no `@select` listener. `GroupsTable` rows have `role="button"`, `tabindex="0"`, `cursor: pointer`, `aria-label="editItem"` and emit `select` on click. With no listener the click does nothing.

The renderer rule (`renderer.md` → "Cross-entity navigation: clicking a related entity inside a panel routes to that entity's list view") means the click should navigate to `/groups/<id>`, where the group panel will auto-open.

- [x] **Step 1: Read the current line**

Confirm line 144 reads:
```vue
<GroupsTable v-else :groups="groups" :readonly="props.readonly" v-bind="props.readonly ? {} : { onRemove: removeFromGroup }" />
```

- [x] **Step 2: Add `@select` listener**

Use Edit. Replace the line with:
```vue
<GroupsTable v-else :groups="groups" :readonly="props.readonly" v-bind="props.readonly ? {} : { onRemove: removeFromGroup }" @select="(id) => router.push('/groups/' + id)" />
```

`router` is already imported at the top of `<script setup>` (used by `goToTask`); confirm before editing.

- [x] **Step 3: Run the convention test**

Run: `npx vitest run tests/components/panel-cta-conventions.test.ts -t "GroupsTable"`

Expected: `PersonPanel.vue wires @select when mounting <GroupsTable>` → PASS

- [x] **Step 4: Manual smoke**

Run: `npm start`. Navigate to Persons, select a person with at least one group, expand Groups section, click a group row. The address bar should change to `#/groups/<id>` and GroupPanel should open with that group selected.

- [x] **Step 5: Commit**

```bash
git add src/renderer/components/PersonPanel.vue
git commit -m "fix(person-panel): wire Groups row click to /groups/:id"
```

---

## Task 3: Fix EntityMediaSection unlink semantics

**Files:**
- Modify: `src/renderer/components/EntityMediaSection.vue:34-40`

The button currently:
- Uses raw `&#10005;` glyph
- Has class `btn-sm btn-delete` (destructive styling)
- Has `aria-label="$t('a11y.deleteItem', ...)"` (delete semantics)
- Calls `unlink(m.link_id)` (unlink semantics — preserves the media row)

`PersonMediaSection.vue:42-49` is the correct pattern; mirror it.

- [x] **Step 1: Read the current code**

Confirm lines 34-40 of `EntityMediaSection.vue`:
```vue
<td v-if="!props.readonly" class="actions-cell">
  <button v-if="m.file_ref" class="btn-sm" @click.stop="openFile(m.id)">{{ $t('media.open') }}</button>
  <button
    class="btn-sm btn-delete"
    :aria-label="$t('a11y.deleteItem', { item: mediaDisplayName(m.title, m.file_ref) })"
    @click.stop="unlink(m.link_id)"
  >&#10005;</button>
</td>
```

- [x] **Step 2: Replace with IconUnlink + unlink semantics**

Edit the unlink button to:
```vue
<button
  class="btn-sm btn-delete"
  :aria-label="$t('a11y.unlinkItem', { item: mediaDisplayName(m.title, m.file_ref) })"
  :title="$t('common.unlinkTooltip')"
  @click.stop="unlink(m.link_id)"
>
  <IconUnlink :size="14" />
</button>
```

(Keep `btn-delete` class — it is the project's shared destructive-button style and is appropriate for a destructive verb. Only the glyph + aria + title change.)

- [x] **Step 3: Add IconUnlink import**

In the `<script setup lang="ts">` block of `EntityMediaSection.vue`, add to existing imports:
```ts
import IconUnlink from './ui/IconUnlink.vue';
```

(If imports are already alphabetised, slot it in alphabetically.)

- [x] **Step 4: Verify the i18n keys exist**

Run:
```bash
grep -n "unlinkItem\|unlinkTooltip" src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
```

Both `a11y.unlinkItem` and `common.unlinkTooltip` must exist in both `sv.ts` and `en.ts`. If either is missing, add it (mirroring the deleteItem / deleteTooltip neighbour).

- [x] **Step 5: Run the convention test**

Run: `npx vitest run tests/components/panel-cta-conventions.test.ts -t "EntityMediaSection"`

Expected: PASS.

- [x] **Step 6: Manual smoke**

`npm start`, navigate to Places, pick a place with media, expand Media section, click the unlink icon. Confirm modal title says "Unlink". Confirm the media row remains in MediaView after unlinking.

- [x] **Step 7: Commit**

```bash
git add src/renderer/components/EntityMediaSection.vue src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "fix(entity-media): use IconUnlink + unlink semantics for unlink button"
```

(Drop i18n files from the add list if they didn't change.)

---

## Task 4: Fix MediaPanel raw ✕ glyphs (3 unlinks + 1 delete)

**Files:**
- Modify: `src/renderer/components/MediaPanel.vue` lines 97, 154, 177, 194

Three buttons unlink (Linked Persons, Linked Places, Linked Events). One button deletes (Face Tags — calls `mediaRegions.delete`, destroys the region row). Glyph mapping:
- Unlink → `IconUnlink`
- Delete → `IconTrash`

- [x] **Step 1: Replace line 97 (Linked Persons unlink)**

Currently:
```vue
<AppButton v-if="!props.readonly" variant="ghost" size="sm" class="unlink-btn" :aria-label="$t('common.remove')" @click="unlinkEntity(lp.linkId)">&#10005;</AppButton>
```

Change to:
```vue
<AppButton v-if="!props.readonly" variant="ghost" size="sm" class="unlink-btn" :aria-label="$t('a11y.unlinkItem', { item: lp.label })" :title="$t('common.unlinkTooltip')" @click="unlinkEntity(lp.linkId)">
  <IconUnlink :size="14" />
</AppButton>
```

(Use whatever name field `lp` exposes — verify by reading the section's template above the button. If no name is available, fall back to `$t('common.unlink')` for the aria-label.)

- [x] **Step 2: Replace line 154 (Face Tags delete — destructive)**

Currently:
```vue
<AppButton v-if="!props.readonly" variant="ghost" size="sm" class="unlink-btn" :aria-label="$t('common.remove')" @click="deleteRegion(r.id)">&#10005;</AppButton>
```

Change to (note: `IconTrash` because this destroys the region row):
```vue
<AppButton v-if="!props.readonly" variant="ghost" size="sm" class="delete-btn" :aria-label="$t('a11y.deleteItem', { item: $t('media.faceTag') })" :title="$t('common.deleteTooltip')" @click="deleteRegion(r.id)">
  <IconTrash :size="14" />
</AppButton>
```

- [x] **Step 3: Replace line 177 (Linked Places unlink)**

Mirror the pattern from Step 1 — `IconUnlink`, `unlinkItem` aria-label with `lp.label`, `unlinkTooltip` title.

- [x] **Step 4: Replace line 194 (Linked Events unlink)**

Mirror the pattern from Step 1 — `IconUnlink`, `unlinkItem` aria-label with `le.label` (or whatever the event-link object exposes), `unlinkTooltip` title.

- [x] **Step 5: Add icon imports**

In MediaPanel's `<script setup>`, add:
```ts
import IconUnlink from './ui/IconUnlink.vue';
import IconTrash from './ui/IconTrash.vue';
```

(Slot into existing import block.)

- [x] **Step 6: Verify CSS for `.delete-btn` exists or add it**

Run:
```bash
grep -n "\.delete-btn\b\|\.unlink-btn\b" src/renderer/styles/shared.css src/renderer/components/MediaPanel.vue
```

If `.delete-btn` is not defined globally and not present in MediaPanel's `<style scoped>`, copy the existing `.unlink-btn` style block in MediaPanel and rename it `.delete-btn` (same rules — only the class name changes for clarity of intent).

- [x] **Step 7: Run the convention test**

Run: `npx vitest run tests/components/panel-cta-conventions.test.ts -t "MediaPanel"`

Expected: PASS.

- [x] **Step 8: Manual smoke**

`npm start`, open a media item with face tags + linked persons + linked places + linked events. Hover each action button, confirm:
- Linked Persons unlink → chain-broken icon, "Unlink" tooltip
- Linked Places unlink → chain-broken icon, "Unlink" tooltip
- Linked Events unlink → chain-broken icon, "Unlink" tooltip
- Face Tags delete → trash icon, "Delete" tooltip

- [x] **Step 9: Commit**

```bash
git add src/renderer/components/MediaPanel.vue
git commit -m "fix(media-panel): replace raw ✕ glyph with IconUnlink/IconTrash per verb"
```

---

## Task 5: Fix PersonPanel "Add relationship" header button

**Files:**
- Modify: `src/renderer/components/PersonPanel.vue:109`

Current:
```vue
<SectionHeader ... actionLabel="+ ' + $t('relationships.addRelationship')" ... @action="openAddRelative('spouse')" />
```

The header button reads "+ Add relationship" but always opens AddRelativeModal preset to spouse. Two acceptable fixes; pick one at task time:

**Option A (preferred, lower-risk):** Remove the section-header `actionLabel` for the Relations section. The five role-specific buttons (Father / Mother / Spouse / Son / Daughter) at line 58-62 already cover every add path. The section-header button is redundant and misleading.

**Option B:** Open `AddRelativeModal` with no preset role (let the user pick). Requires a new "no role chosen" mode in AddRelativeModal — wider blast radius.

Default to Option A unless a stakeholder asks otherwise.

- [x] **Step 1: Apply Option A**

Edit line 109. Remove the `actionLabel` binding and the `@action` handler:

Before:
```vue
<SectionHeader :title="$t('personDetail.relationships')" :count="relationshipCount" :collapsed="!sections.relationships" v-bind="props.readonly ? {} : { actionLabel: '+ ' + $t('relationships.addRelationship') }" @toggle="toggleSection('relationships')" @action="openAddRelative('spouse')" />
```

After:
```vue
<SectionHeader :title="$t('personDetail.relationships')" :count="relationshipCount" :collapsed="!sections.relationships" @toggle="toggleSection('relationships')" />
```

- [x] **Step 2: Manual smoke**

`npm start`, navigate to a person, expand Relations section. Confirm:
- No "+ Add relationship" button in the section header.
- The five role buttons (Father / Mother / Spouse / Son / Daughter) are still present at the top of the panel and each opens AddRelativeModal preset to its role.

- [x] **Step 3: Run all tests**

Run: `npx vitest run tests/components/panel-layout-consistency.test.ts tests/components/PersonChecksSection.test.ts tests/components/AddRelatedPersonModal.test.ts`

Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add src/renderer/components/PersonPanel.vue
git commit -m "fix(person-panel): remove misleading "Add relationship" header button"
```

---

## Task 6: Add confirm modals to GroupPanel + ResearchTaskPanel unlinks

**Files:**
- Modify: `src/renderer/components/GroupPanel.vue:225-234`
- Modify: `src/renderer/components/ResearchTaskPanel.vue:272-...`

Both panels call `removeLink` directly, no confirm. PersonPanel (line 196-206) wraps the same verb in `useDeleteConfirm` + `ConfirmModal`. We pick the PersonPanel pattern as canonical and apply it to both.

- [x] **Step 1: Read PersonPanel's useDeleteConfirm + ConfirmModal pattern**

Read [PersonPanel.vue:196-206](src/renderer/components/PersonPanel.vue#L196-L206) and the corresponding `<ConfirmModal>` mounting (search for `useDeleteConfirm` and `ConfirmModal` in PersonPanel). Note:
- `useDeleteConfirm()` composable returns `{ visible, request, confirm, cancel }` (or similar — read the actual API in `src/renderer/composables/useDeleteConfirm.ts`).
- `ConfirmModal` is mounted once per panel; the click handler calls `del.request(linkId)` instead of removing directly.

- [x] **Step 2: Refactor GroupPanel.removeLink**

In `GroupPanel.vue`:
1. Import the composable and ConfirmModal.
2. Create a `del = useDeleteConfirm(...)` per linked-entity type, OR a single instance that takes the linkId and entityType. Match what PersonPanel does for groups (PersonPanel.vue line 196-206 — copy the shape).
3. Change the `LinkedPersonsSection` / `LinkedPlacesSection` / `LinkedMediaSection` `@unlink` listeners to call `del.request(linkId)` instead of `removeLink(linkId)` directly.
4. The `del.confirm` handler calls the existing `removeLink(linkId)` body (which does the actual `window.api.groups.removeLink` call).
5. Mount `<ConfirmModal :visible="del.visible.value" :title="$t('groups.unlinkConfirmTitle')" :message="$t('groups.confirmUnlink')" tone="danger" :confirm-label="$t('common.remove')" @cancel="del.cancel" @confirm="del.confirm" />` near the bottom of GroupPanel's template, before `</template>`.

- [x] **Step 3: Add i18n keys**

If `groups.unlinkConfirmTitle` and `groups.confirmUnlink` do not exist in `src/renderer/i18n/sv.ts` and `src/renderer/i18n/en.ts`, add them:

```ts
// sv.ts
groups: {
  // ... existing keys
  unlinkConfirmTitle: 'Ta bort koppling',
  confirmUnlink: 'Vill du ta bort denna koppling?',
}
// en.ts
groups: {
  // ... existing keys
  unlinkConfirmTitle: 'Remove link',
  confirmUnlink: 'Remove this link?',
}
```

- [x] **Step 4: Repeat for ResearchTaskPanel**

Apply the same pattern in `ResearchTaskPanel.vue`. Use keys `researchTasks.unlinkConfirmTitle` and `researchTasks.confirmUnlink` (add to both i18n files).

- [x] **Step 5: Manual smoke**

`npm start`. In GroupPanel, click unlink on a linked person → confirm dialog appears, "Cancel" cancels, "Remove" removes. Repeat for places + media. Repeat the whole flow in ResearchTaskPanel.

- [x] **Step 6: Commit**

```bash
git add src/renderer/components/GroupPanel.vue src/renderer/components/ResearchTaskPanel.vue src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "fix(panels): add confirm modal for unlink in GroupPanel + ResearchTaskPanel"
```

---

## Task 7: Drop redundant click handler in PlacePersonsSection

**Files:**
- Modify: `src/renderer/components/PlacePersonsSection.vue:14-19`

Currently:
```vue
<tr v-for="p in persons" :key="p.id" class="clickable-row" @click="$router.push('/persons/' + p.id)">
  <td class="person-cell">
    <AppAvatar ... />
    <router-link :to="'/persons/' + p.id" class="person-link" @click.stop>
      {{ ... }}
    </router-link>
  </td>
```

Both the `@click` on the row and the `<router-link>` inside the cell go to the same destination. The `@click.stop` on the link suggests the row was meant to do something different — but it doesn't. Two consistent options:

- **Option A:** Drop the row-level `@click`. Keep the `<router-link>`. Remove the now-pointless `@click.stop`. Row hover styling stays (clickable-row class), but the click semantics live in the link itself.
- **Option B:** Drop the `<router-link>` wrapper, render plain text inside the cell, keep the row-level `@click`. Drop the `@click.stop` (no nested handler to stop).

Per the renderer rule: "Clickable rows, no Edit buttons — all list/table rows are clickable (`@click`, `cursor: pointer`)." That favours Option B. Other place sections (verify by grep) follow this pattern.

- [x] **Step 1: Verify other panels use Option B**

Run:
```bash
grep -rn "clickable-row" src/renderer/components/*Section.vue | head -20
```

Note which sections use row-level `@click` (Option B) vs `<router-link>` (Option A). If Option B dominates, apply it.

- [x] **Step 2: Apply Option B to PlacePersonsSection**

Replace the cell + link block with plain text:
```vue
<tr v-for="p in persons" :key="p.id" class="clickable-row" @click="$router.push('/persons/' + p.id)">
  <td class="person-cell">
    <AppAvatar :person-id="p.id" :given-name="p.given_name" :surname="p.surname" :sex="p.sex" size="sm" />
    <span class="person-link">{{ [p.given_name, p.surname].filter(Boolean).join(' ') || '—' }}</span>
  </td>
```

(Keep `class="person-link"` on the span for shared styling.)

- [x] **Step 3: Manual smoke**

`npm start`, Places → pick a place with persons → expand Persons section. Click a row → navigates to `/persons/<id>`. Click should fire from anywhere in the row, not just the name.

- [x] **Step 4: Commit**

```bash
git add src/renderer/components/PlacePersonsSection.vue
git commit -m "fix(place-persons): drop redundant inner router-link, keep row click"
```

---

## Task 8: Surface MediaPanel face-tag name-click verb

**Files:**
- Modify: `src/renderer/components/MediaPanel.vue:140-148` (face-tag name span)

Current behaviour (line 144): clicking the name span opens the inline person picker to reassign. The affordance is `cursor: pointer` on hover when the row is in editable mode — easy to miss. Add an explicit pencil affordance.

- [x] **Step 1: Read the current face-tag row template**

Confirm the editable-mode name span sits at MediaPanel.vue line 141-144 (approximately, may have shifted after Task 4). The block looks like:
```vue
<span v-else class="face-tag-name face-tag-clickable" @click="editingTagId = r.id">
  {{ r.label }}
</span>
```

- [x] **Step 2: Add an inline ✎ pencil button**

Replace the span with the name + a small adjacent pencil button:
```vue
<span class="face-tag-name">{{ r.label }}</span>
<button v-if="!props.readonly" class="btn-sm face-tag-edit-btn" :aria-label="$t('a11y.editItem', { item: r.label })" :title="$t('media.reassignTag')" @click="editingTagId = r.id">
  <IconPencil :size="12" />
</button>
```

- [x] **Step 3: Add IconPencil**

`src/renderer/components/ui/IconPencil.vue` does not exist as of this plan. Create it with the following content (feather-icons "edit-2" path, mirrors `IconUnlink.vue`'s shape):

```vue
<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
  </svg>
</template>

<script setup lang="ts">
defineProps<{ size?: number | string }>();
</script>
```

Add the import to MediaPanel's `<script setup>`:
```ts
import IconPencil from './ui/IconPencil.vue';
```

- [x] **Step 4: Add the i18n key**

Add `media.reassignTag` to both `sv.ts` and `en.ts`:
- sv: `reassignTag: 'Tilldela om person',`
- en: `reassignTag: 'Reassign person',`

- [x] **Step 5: Style the new button**

In MediaPanel's `<style scoped>`, add:
```css
.face-tag-edit-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 4px;
  margin-left: var(--space-xs);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  cursor: pointer;
}
.face-tag-edit-btn:hover {
  background: var(--surface-hover);
  border-color: var(--surface-border);
  color: var(--text-primary);
}
```

- [x] **Step 6: Manual smoke**

`npm start`, open a media item with face tags. Hover a tag row → pencil icon visible next to the name. Click the pencil → person picker opens. Click outside the picker → closes. Confirm clicking the name itself no longer opens the picker (the click is now intentional via the pencil).

- [x] **Step 7: Commit**

```bash
git add src/renderer/components/MediaPanel.vue src/renderer/components/ui/IconPencil.vue src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "fix(media-panel): explicit pencil affordance for face-tag reassignment"
```

---

## Task 8.5: Rename misleading goToTask → openTaskFromRow

Pure cleanup. The audit suggested this navigated out of the panel; the body actually opens the modal. Rename to match.

**Files:**
- Modify: `src/renderer/components/PersonPanel.vue:153,667-670`
- Modify: `src/renderer/components/PlacePanel.vue:574-577` and the `<ResearchTasksTable @select="goToTask"` mounting

- [x] **Step 1: Rename in PersonPanel**

In `PersonPanel.vue`, replace `goToTask` with `openTaskFromRow` (use Edit `replace_all` on the file). Two occurrences: the `<ResearchTasksTable @select="goToTask"` (line 153) and the function definition (line 667).

- [x] **Step 2: Rename in PlacePanel**

Same in `PlacePanel.vue`. Two occurrences: the table mount and the function definition.

- [x] **Step 3: Run convention + layout tests**

Run: `npx vitest run tests/components/panel-cta-conventions.test.ts tests/components/panel-layout-consistency.test.ts`

Expected: PASS (the convention test cares only that `@select=` is present, not the handler name).

- [x] **Step 4: Commit**

```bash
git add src/renderer/components/PersonPanel.vue src/renderer/components/PlacePanel.vue
git commit -m "refactor: rename goToTask → openTaskFromRow (opens modal in panel)"
```

---

## Task 9: Update ux-intent-mapping skill

**Files:**
- Modify: `.claude/skills/ux-intent-mapping/SKILL.md`

Add a "CTA conventions" section that codifies the rules from this plan, so the next plan that touches a panel inherits them.

- [x] **Step 1: Read the current skill**

Read `.claude/skills/ux-intent-mapping/SKILL.md`. Identify where the "CTA inventory" guidance lives.

- [x] **Step 2: Append a "CTA conventions" section**

Append (or insert into the existing CTA section) the following block:

```markdown
## CTA conventions (must verify when adding/editing any panel CTA)

These conventions are enforced by `tests/components/panel-cta-conventions.test.ts`. If you add a new pattern, extend the test.

### Glyph → verb mapping (panels and sections, NOT modal close)

| Glyph / icon | Verb | Use when |
|---|---|---|
| `<IconUnlink :size="14" />` | unlink | Action severs a link/relationship; the entity stays in its own list |
| `<IconTrash :size="14" />` | delete | Action removes the row from the database |
| Raw `&#10005;` (✕) | **modal close only** | Only allowed inside `src/renderer/components/modals/` for the close affordance. Forbidden in `*Panel.vue` and `*Section.vue`. |

`aria-label` and `:title` must match the verb: `a11y.unlinkItem` + `common.unlinkTooltip` for unlink, `a11y.deleteItem` + `common.deleteTooltip` for delete.

### No dead clicks

If a row has `cursor: pointer`, `role="button"`, `tabindex="0"`, or `class="clickable-row"`, it must have a wired click handler that does something user-visible. Tables that emit `select` (`GroupsTable`, `ResearchTasksTable`, `PersonNamesTable`) require a `@select=` listener at every mount site. The convention test enforces this for the three known tables; if you add a new select-emitting table, add it to `SELECT_EMITTING_TABLES` in the test.

### No hardcoded mode in section-header buttons

A section-header `actionLabel` of "+ Add X" must open a picker for X, not preset to a sub-mode. PersonPanel's old "+ Add relationship" button silently picked spouse — that pattern is forbidden. If a header button needs to open a multi-mode flow, either drop the header button (rely on per-mode buttons) or open a role/type picker first.

### Confirm-modal symmetry

The same verb (e.g. unlink-from-group) must use the same confirmation flow across panels. If PersonPanel confirms group unlink with `useDeleteConfirm` + `ConfirmModal`, GroupPanel's person-from-group unlink must too. Asymmetric flows for the same verb are a CTA bug.

### Cross-entity navigation IS allowed; same-entity navigation is NOT

Per `.claude/rules/renderer.md`: clicking a related entity inside a panel routes to that entity's list view (which auto-opens its panel). This is the canonical pattern.

But: clicking a sub-entity that lives in *the panel's own context* (e.g. a research task on a person panel, a face tag on a media panel) must open in-place — modal or inline edit — not navigate the user away. The test for "is this same-entity?": if the sub-entity is created via this panel's own "+ Add X" button, its row click should open the same modal that "+ Add X" opens, in edit mode.
```

- [x] **Step 3: Commit**

```bash
git add .claude/skills/ux-intent-mapping/SKILL.md
git commit -m "docs(skill): codify panel CTA conventions in ux-intent-mapping"
```

---

## Task 10: Update UX_INVENTORY.md

**Files:**
- Modify: `docs/UX_INVENTORY.md`

Remove or close every finding fixed by this plan.

- [x] **Step 1: Read UX_INVENTORY.md**

Identify findings that this plan resolves. At minimum the cross-cutting findings that mention:
- Mixed `✕` semantics
- Research-task row click (still cosmetic — only the rename, not behaviour)
- Dead Groups row in PersonPanel
- Hardcoded "Add relationship" → spouse

- [x] **Step 2: Move resolved findings to a "Resolved" section**

Add (or append to) a section at the bottom titled `## Resolved` with each finding's original text + a one-line "Resolved by `2026-05-02-panel-cta-cleanup` plan" footer + commit SHAs once known.

- [x] **Step 3: Commit**

```bash
git add docs/UX_INVENTORY.md
git commit -m "docs(ux-inventory): close findings resolved by panel CTA cleanup"
```

---

## Task 11: Self-review checklist + plan close-out

- [x] **Step 1: Re-run all tests**

```bash
npm run lint && npx vitest run
```

Expected: 0 lint errors, all tests pass including the new convention test.

- [x] **Step 2: Walk every panel in the running app**

`npm start`. For each of PersonPanel, PlacePanel, SourcePanel, GroupPanel, ResearchTaskPanel, MediaPanel: open it, click every action button and every clickable row, confirm each does what its label/icon claims. Cross-reference against `docs/UX_INVENTORY.md` CTA grids.

- [x] **Step 3: Tick every checkbox in this plan file**

Every `- [x]` becomes `- [x]`.

- [x] **Step 4: Move the plan to archive**

```bash
git mv docs/plans/2026-05-02-panel-cta-cleanup.md docs/plans/archive/
```

- [x] **Step 5: Bump version + changelog**

In `package.json`, bump the patch version (this plan adds a regression test + a small face-tag affordance — patch is appropriate; if Task 8 added a meaningfully new UI affordance, bump minor instead).

In `CHANGELOG.md`, add under `## Unreleased`:
```markdown
- Panel CTA cleanup: consistent unlink/delete glyphs, wired Groups row in PersonPanel, confirm modals on GroupPanel/ResearchTaskPanel unlinks, removed misleading "Add relationship" button, explicit reassign affordance on face tags, regression test for panel CTA conventions.
```

- [x] **Step 6: Update docs/PLAN.md**

If this plan was listed as `[planned]` or `[in-progress]` in `docs/PLAN.md`, remove that block. Append a one-paragraph entry to `docs/plans/archive/PLAN.md` matching the existing format.

- [x] **Step 7: Final commit**

```bash
git add docs/plans/archive/2026-05-02-panel-cta-cleanup.md package.json CHANGELOG.md docs/PLAN.md docs/plans/archive/PLAN.md
git commit -m "chore: archive completed panel-cta-cleanup + bump <new-version>"
```

- [x] **Step 8: Hand off to `superpowers:finishing-a-development-branch`**

Per CLAUDE.md project workflow: merge worktree → main, delete branch, remove worktree.
