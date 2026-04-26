# Entity-color theming migration — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move entity colors out of `entityColors.ts` (JS hex literals applied via inline `:style` on BaseSubPanel) into CSS tokens with dark + high-contrast variants, an attribute-selector consumption mechanism (`[data-entity="…"]`), and ~198 new WCAG assertions covering all 11 entities × 9 (theme × mode) combos.

**Architecture:** Light entity colors live in `tokens.css :root` as theme-invariant baselines. Dark and HC baselines live in `shared.css` under `html.dark` / `html.high-contrast`. Per-theme entity overrides (`html.dark.theme-X` etc.) are added one at a time only when WCAG tests fail on a specific combo — start with zero. BaseSubPanel sets `data-entity="<type>"` on its root; one CSS rule per entity in `shared.css` remaps element-scoped aliases (`--entity-text` / `--entity-bg` / `--entity-border`) for the subtree, so BaseSubPanel internals consume one set of names regardless of entity. The `.ep-*` chrome in `shared.css:1049-1213` migrates to existing surface/text/accent tokens with no new tokens introduced.

**Tech Stack:** Vue 3 SFC + scoped CSS, plain CSS custom properties, Vitest for WCAG contrast tests, Electron Forge build.

**Spec:** [`docs/plans/2026-04-25-entity-token-theming-design.md`](2026-04-25-entity-token-theming-design.md) (read this for the full design rationale before starting).

---

## File Structure

| File | Role | Lines touched |
|------|------|---------------|
| `src/renderer/styles/tokens.css` | Holds all CSS custom properties. Light entity tokens added to the existing theme-invariant `:root` block (around line 110, alongside `--sex-*` and `--error-*`). | +35 |
| `src/renderer/styles/shared.css` | Holds mode/theme overrides + the new `[data-entity]` remap block + the existing `.ep-*` chrome being migrated. Three new sections: data-entity remaps; dark entity tokens; HC entity tokens. `.ep-*` block (1049–1213) gets its hex literals translated to existing tokens. | ≈ +90 (new tokens + remaps), ~30 hex→token translations |
| `src/renderer/components/modals/BaseSubPanel.vue` | Root element gains `:data-entity="entityType"`. Inline `:style` bindings deleted. Scoped CSS uses `var(--entity-text/bg/border)`. Save button uses `var(--surface-bg)` in place of `'#fff'`. | ~30 |
| `src/renderer/constants/entityColors.ts` → `entityMeta.ts` | Rename + drop `fg/hd/border` fields from interface (rename to `EntityMeta`). Keep `EntityType`, `icon`, `labelKey`. Remove deprecated `ENTITY_COLORS` alias. | full file rewrite |
| 7 modal importers (`PersonModal`, `EventModal`, `SourceModal`, `CitationModal`, `PlaceModal`, `GroupModal`, `RelationshipModal`) | Update import path. Most just import `EntityType`/`ENTITY_VISUALS` and pass through; verify each. | 1 line per file |
| `tests/unit/wcagContrast.test.ts` | Add `ENTITIES` constant + `ENTITY_TEXT_PAIRS` + `ENTITY_UI_PAIRS`; loop them inside existing `describe` blocks. | +30 |

---

## Task 1: Add the failing WCAG assertions for entity tokens

**Files:**
- Modify: `tests/unit/wcagContrast.test.ts`

This is the TDD scaffold. The test asserts tokens that don't exist yet — it will fail with "missing --entity-…". Tasks 2 and 3 make it pass.

- [ ] **Step 1: Read the existing test file**

Run: `cat tests/unit/wcagContrast.test.ts | head -160`

Note the structure: `TEXT_PAIRS` array drives text-on-bg assertions, `UI_PAIRS` drives border-on-surface assertions. Two `describe` blocks loop themes and modes.

- [ ] **Step 2: Add `ENTITIES` + entity pair arrays**

Insert after the existing `UI_PAIRS` constant (around line 133):

```ts
const ENTITIES = [
  'person', 'event', 'source', 'citation', 'place',
  'relationship', 'task', 'group', 'name', 'identifier', 'neutral',
] as const;

const ENTITY_TEXT_PAIRS: TextPair[] = ENTITIES.map(e => ({
  label: `entity-${e}-text on entity-${e}-bg`,
  fg: `entity-${e}-text`,
  bg: `entity-${e}-bg`,
}));

const ENTITY_UI_PAIRS: UiPair[] = ENTITIES.map(e => ({
  label: `entity-${e}-border on surface-bg`,
  fg: `entity-${e}-border`,
  bg: 'surface-bg',
}));
```

- [ ] **Step 3: Add entity assertions to the AAA (high-contrast) describe block**

Inside the existing `for (const theme of themes)` → `describe(theme: ${theme})` block in `WCAG AAA — high-contrast mode (theme-tinted)`, append after the existing `UI_PAIRS` loop:

```ts
for (const pair of ENTITY_TEXT_PAIRS) {
  it(`${pair.label} ≥ AAA (high-contrast)`, () => {
    assertPair(palette, pair, 'AAA');
  });
}

for (const pair of ENTITY_UI_PAIRS) {
  it(`${pair.label} ≥ 3:1 (UI)`, () => {
    assertUiPair(palette, pair);
  });
}
```

- [ ] **Step 4: Add entity assertions to the AA (light + dark) describe block**

Inside the existing `for (const { theme, appearance } of combos)` → `describe(${theme} / ${appearance})` block in `WCAG AA — light and dark base themes (regression)`, append after the existing `TEXT_PAIRS` loop:

```ts
for (const pair of ENTITY_TEXT_PAIRS) {
  it(`${pair.label} ≥ AA (${appearance})`, () => {
    assertPair(palette, pair, 'AA');
  });
}

for (const pair of ENTITY_UI_PAIRS) {
  it(`${pair.label} ≥ 3:1 (UI)`, () => {
    assertUiPair(palette, pair);
  });
}
```

- [ ] **Step 5: Run the test and confirm it fails with the expected error shape**

Run: `npx vitest run tests/unit/wcagContrast.test.ts`

Expected: many failures, all of the form `missing --entity-person-text` / `missing --entity-event-bg` etc. The 181 pre-existing assertions still pass; only the new entity assertions fail.

- [ ] **Step 6: Commit the failing test**

```bash
git add tests/unit/wcagContrast.test.ts
git commit -m "test(wcag): add failing entity-color contrast assertions

11 entities x 9 theme-mode combos x 2 pair types = ~198 assertions that
fail because the entity tokens don't exist yet. Tasks 2 and 3 add them.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: Add light entity tokens

**Files:**
- Modify: `src/renderer/styles/tokens.css`

After this task, all 6 light × theme combinations (forest/nordic/twilight × light) of the new entity assertions pass. Dark and HC still fail.

- [ ] **Step 1: Locate the theme-invariant `:root` block in tokens.css**

Run: `grep -n "Semantic colors (theme-invariant)" src/renderer/styles/tokens.css`

The block starts around line 109. Entity tokens go inside it, after the `--sex-*` group and before the `--error-*` group.

- [ ] **Step 2: Insert the 33 light entity tokens**

Inside that `:root` block, after `--sex-u-text: #666666;` and before the timeline section, add:

```css
  /* Entity colors — theme-invariant light defaults.
   * Dark + high-contrast overrides live in shared.css.
   * Element consumption: set data-entity="<name>" on a container; the
   * remap rules in shared.css alias these to --entity-text/-bg/-border. */
  --entity-person-text:       #4f46e5;
  --entity-person-bg:         #f5f3ff;
  --entity-person-border:     #c7d2fe;

  --entity-event-text:        #c2410c;
  --entity-event-bg:          #fff3e8;
  --entity-event-border:      #fed7aa;

  --entity-source-text:       #7e22ce;
  --entity-source-bg:         #faf5ff;
  --entity-source-border:     #e9d5ff;

  --entity-citation-text:     #166534;
  --entity-citation-bg:       #f0fdf4;
  --entity-citation-border:   #bbf7d0;

  --entity-place-text:        #0e7490;
  --entity-place-bg:          #ecfeff;
  --entity-place-border:      #a5f3fc;

  --entity-relationship-text: #475569;
  --entity-relationship-bg:   #f1f5f9;
  --entity-relationship-border: #cbd5e1;

  --entity-task-text:         #92400e;
  --entity-task-bg:           #fffbeb;
  --entity-task-border:       #fde68a;

  --entity-group-text:        #0369a1;
  --entity-group-bg:          #f0f9ff;
  --entity-group-border:      #bae6fd;

  --entity-name-text:         #475569;
  --entity-name-bg:           #f9fafb;
  --entity-name-border:       #e5e7eb;

  --entity-identifier-text:   #475569;
  --entity-identifier-bg:     #f9fafb;
  --entity-identifier-border: #e5e7eb;

  --entity-neutral-text:      #374151;
  --entity-neutral-bg:        #f9fafb;
  --entity-neutral-border:    #e5e7eb;
```

These values are transcribed verbatim from the current `ENTITY_VISUALS` in `entityColors.ts` so light mode is visually unchanged.

- [ ] **Step 3: Run WCAG test, confirm light combos now pass**

Run: `npx vitest run tests/unit/wcagContrast.test.ts 2>&1 | tail -40`

Expected: the 3 `forest/nordic/twilight × light` describe blocks now pass all entity assertions. The high-contrast and dark describe blocks still fail with `missing --entity-…`. Approximately 66 light assertions pass; ~132 dark/HC assertions still fail.

If any **light** assertion fails (e.g. `entity-name-border on surface-bg: 1.05:1 — need ≥3:1`), it means a verbatim color is too pale against `surface-bg` in some theme. Adjust just that token's light value (slightly darken the border) and re-run. The fix is small — these are well-known palettes — but the test is the authority.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/styles/tokens.css
git commit -m "feat(theming): add 33 light entity color tokens

Theme-invariant baselines for person/event/source/citation/place/
relationship/task/group/name/identifier/neutral. Values transcribed
from the existing ENTITY_VISUALS JS map (no visual change in light
mode). Dark + HC overrides land in the next task.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: Add dark + HC entity tokens with iteration loop

**Files:**
- Modify: `src/renderer/styles/shared.css`

This task has an inner loop because dark and HC values must be derived to satisfy WCAG. Add starting values, run the test, adjust tokens that fail, repeat. Treat it as a single deliverable; commit only when all dark + HC assertions pass.

- [ ] **Step 1: Locate the `html.dark` block**

Run: `grep -n "^  html.dark {" src/renderer/styles/shared.css`

The first `html.dark` rule is around line 586 in shared.css. Entity dark tokens go in a new `html.dark` block appended after the existing dark-mode rules but before any `html.dark.theme-X` per-theme blocks.

- [ ] **Step 2: Add dark mode entity tokens (initial guesses)**

Append a new `html.dark` rule (theme-invariant) after the last `html.dark.theme-X` block (around line 720, before the `html.dark body { … }` rules). Use these starting values — they may need adjustment in step 4:

```css
  /* Entity colors — dark mode (theme-invariant baseline).
   * Per-theme overrides only added if the WCAG test fails on a specific combo. */
  html.dark {
    --entity-person-text:       #c4b5fd;
    --entity-person-bg:         #1e1b3a;
    --entity-person-border:     #6d5fdb;

    --entity-event-text:        #fdba74;
    --entity-event-bg:          #3a1e0a;
    --entity-event-border:      #c2410c;

    --entity-source-text:       #d8b4fe;
    --entity-source-bg:         #2e0a3a;
    --entity-source-border:     #a855f7;

    --entity-citation-text:     #86efac;
    --entity-citation-bg:       #0a2e16;
    --entity-citation-border:   #22c55e;

    --entity-place-text:        #67e8f9;
    --entity-place-bg:          #0a2a30;
    --entity-place-border:      #06b6d4;

    --entity-relationship-text: #cbd5e1;
    --entity-relationship-bg:   #1e2533;
    --entity-relationship-border: #64748b;

    --entity-task-text:         #fcd34d;
    --entity-task-bg:           #2e1d05;
    --entity-task-border:       #d97706;

    --entity-group-text:        #7dd3fc;
    --entity-group-bg:          #082030;
    --entity-group-border:      #0284c7;

    --entity-name-text:         #cbd5e1;
    --entity-name-bg:           #1a1f2a;
    --entity-name-border:       #475569;

    --entity-identifier-text:   #cbd5e1;
    --entity-identifier-bg:     #1a1f2a;
    --entity-identifier-border: #475569;

    --entity-neutral-text:      #d1d5db;
    --entity-neutral-bg:        #1a1f2a;
    --entity-neutral-border:    #4b5563;
  }
```

- [ ] **Step 3: Add HC mode entity tokens (initial guesses)**

Find the existing `html.high-contrast` block in shared.css (`grep -n "^  html.high-contrast {" src/renderer/styles/shared.css`). Append a new theme-invariant `html.high-contrast` rule after the last `html.high-contrast.theme-X` block. HC tokens push toward extreme contrast — text near-white, bg near-black, border bright:

```css
  /* Entity colors — high-contrast mode (theme-invariant baseline). */
  html.high-contrast {
    --entity-person-text:       #e8e4ff;
    --entity-person-bg:         #14102e;
    --entity-person-border:     #a89dff;

    --entity-event-text:        #ffe0c2;
    --entity-event-bg:          #2e1505;
    --entity-event-border:      #ffaa66;

    --entity-source-text:       #f0d8ff;
    --entity-source-bg:         #220630;
    --entity-source-border:     #d18bff;

    --entity-citation-text:     #c8ffd0;
    --entity-citation-bg:       #062012;
    --entity-citation-border:   #6dffa0;

    --entity-place-text:        #c8f8ff;
    --entity-place-bg:          #061f25;
    --entity-place-border:      #6deeff;

    --entity-relationship-text: #e6ecf5;
    --entity-relationship-bg:   #15192a;
    --entity-relationship-border: #98a8c0;

    --entity-task-text:         #ffeeb8;
    --entity-task-bg:           #251604;
    --entity-task-border:       #ffc940;

    --entity-group-text:        #c8eeff;
    --entity-group-bg:          #051825;
    --entity-group-border:      #6dc8ff;

    --entity-name-text:         #e6ecf5;
    --entity-name-bg:           #14182a;
    --entity-name-border:       #8aa0c0;

    --entity-identifier-text:   #e6ecf5;
    --entity-identifier-bg:     #14182a;
    --entity-identifier-border: #8aa0c0;

    --entity-neutral-text:      #e8eaee;
    --entity-neutral-bg:        #15171f;
    --entity-neutral-border:    #98a0b0;
  }
```

- [ ] **Step 4: Iteration loop — run test, fix failures, repeat**

Run: `npx vitest run tests/unit/wcagContrast.test.ts 2>&1 | grep -E "FAIL|need ≥" | head -40`

For each failure, the message tells you the exact ratio achieved vs needed:
```
entity-task-bg on surface-bg: 2.41:1 (#2e1d05 on #1a1f2a) — need ≥3:1 for non-text UI
```

Adjustment rules:
- **Text-on-bg too low (< AA 4.5 / AAA 7):** lighten the text by 5–10% L (toward white) OR darken the bg by 5–10% L (toward black). Prefer adjusting the bg since it's the larger surface.
- **Border-on-surface too low (< 3):** push the border further from `--surface-bg` (use the actual surface-bg value visible in the failure message). Brighter saturation usually works.

Re-run after each batch of edits. **Stop only when the WCAG test reports 0 failures across all three themes for both dark and HC.**

If a specific (entity × theme × mode) stubbornly resists adjustment with shared values, you may add a per-theme override block — but only as a last resort, and only for the offending combo. Example:
```css
  html.high-contrast.theme-twilight {
    --entity-task-bg: #1a0f02;  /* twilight surface is purple-tinted; needs darker task-bg */
  }
```

- [ ] **Step 5: Verify all 181 pre-existing tests still pass**

Run: `npx vitest run tests/unit/wcagContrast.test.ts 2>&1 | tail -5`

Expected: `Tests <N> passed (<N>)` where N ≈ 181 + ~198 = ~379. No failures.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/styles/shared.css
git commit -m "feat(theming): add dark + HC entity color tokens, all WCAG-verified

Theme-invariant dark baselines under html.dark; HC baselines under
html.high-contrast. Per-theme overrides added under html.dark.theme-X /
html.high-contrast.theme-X only where required to satisfy the WCAG
test. The full ~379-assertion contrast suite is now green.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: Add `[data-entity]` remap rules in shared.css

**Files:**
- Modify: `src/renderer/styles/shared.css`

This is the consumption mechanism. After this task, any element with `data-entity="person"` (or any other entity) inside it makes `var(--entity-text)`, `var(--entity-bg)`, `var(--entity-border)` resolve to that entity's colors. BaseSubPanel uses this in Task 5.

- [ ] **Step 1: Choose insertion point**

Pick a location in `shared.css` near the other shared design rules but outside any mode/theme block (so the remaps apply universally and inherit from the active mode's tokens). A good spot is right before the `.entity-panel` block (around line 1049, where `.ep-*` chrome lives).

Run: `grep -n ".entity-panel" src/renderer/styles/shared.css | head -3`

- [ ] **Step 2: Insert the 11 remap rules**

```css
/* Entity color aliases.
 * Set data-entity="<name>" on any container; descendants resolve
 * --entity-text / --entity-bg / --entity-border to that entity's tokens.
 * This is mode-aware automatically — the underlying --entity-*-text/bg/border
 * tokens flip with html.dark / html.high-contrast. */
[data-entity="person"]       { --entity-text: var(--entity-person-text);       --entity-bg: var(--entity-person-bg);       --entity-border: var(--entity-person-border); }
[data-entity="event"]        { --entity-text: var(--entity-event-text);        --entity-bg: var(--entity-event-bg);        --entity-border: var(--entity-event-border); }
[data-entity="source"]       { --entity-text: var(--entity-source-text);       --entity-bg: var(--entity-source-bg);       --entity-border: var(--entity-source-border); }
[data-entity="citation"]     { --entity-text: var(--entity-citation-text);     --entity-bg: var(--entity-citation-bg);     --entity-border: var(--entity-citation-border); }
[data-entity="place"]        { --entity-text: var(--entity-place-text);        --entity-bg: var(--entity-place-bg);        --entity-border: var(--entity-place-border); }
[data-entity="relationship"] { --entity-text: var(--entity-relationship-text); --entity-bg: var(--entity-relationship-bg); --entity-border: var(--entity-relationship-border); }
[data-entity="task"]         { --entity-text: var(--entity-task-text);         --entity-bg: var(--entity-task-bg);         --entity-border: var(--entity-task-border); }
[data-entity="group"]        { --entity-text: var(--entity-group-text);        --entity-bg: var(--entity-group-bg);        --entity-border: var(--entity-group-border); }
[data-entity="name"]         { --entity-text: var(--entity-name-text);         --entity-bg: var(--entity-name-bg);         --entity-border: var(--entity-name-border); }
[data-entity="identifier"]   { --entity-text: var(--entity-identifier-text);   --entity-bg: var(--entity-identifier-bg);   --entity-border: var(--entity-identifier-border); }
[data-entity="neutral"]      { --entity-text: var(--entity-neutral-text);      --entity-bg: var(--entity-neutral-bg);      --entity-border: var(--entity-neutral-border); }
```

- [ ] **Step 3: Verify lint + tests still pass**

Run: `npm run lint && npx vitest run tests/unit/wcagContrast.test.ts 2>&1 | tail -5`

Expected: lint clean, ~379 WCAG assertions passing. (No tests target the remap rules directly — they're verified indirectly when BaseSubPanel uses them in Task 5.)

- [ ] **Step 4: Commit**

```bash
git add src/renderer/styles/shared.css
git commit -m "feat(theming): add [data-entity] remap rules for entity color aliases

Element-scoped --entity-text/-bg/-border aliases that any container can
opt into via data-entity=<name>. Mode-aware automatically since the
remap reads the underlying mode-specific tokens.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: Migrate BaseSubPanel.vue to consume the entity tokens

**Files:**
- Modify: `src/renderer/components/modals/BaseSubPanel.vue`

After this task, BaseSubPanel contains zero hex literals and zero inline `:style="{ background/color/border ... }"` bindings. The header, save button, and chrome all flip with mode/theme automatically.

- [ ] **Step 1: Read the current BaseSubPanel.vue end-to-end**

Run: `cat src/renderer/components/modals/BaseSubPanel.vue`

Identify every `:style="{ ... }"` and every hex literal. The audit found inline styles around lines 35, 81, 131-147; verify the current state.

- [ ] **Step 2: Add `:data-entity` to the modal root, drop inline `:style`**

Find the root `<div class="entity-panel" ...>` (or equivalent) in the template. Replace its inline color-related `:style` with `:data-entity="entityType"`. Remove inline color/background/border `:style` bindings throughout the template (footer, header, save button). Leave non-color inline `:style` (geometry, focus management) intact if any.

Example transformation:
```vue
<!-- before -->
<div class="entity-panel" :style="{ borderColor: visual.border }">
  <div class="ep-header" :style="{ background: visual.hd, color: visual.fg }">

<!-- after -->
<div class="entity-panel" :data-entity="entityType">
  <div class="ep-header">
```

```vue
<!-- before -->
<button class="ep-save-btn" :style="{ background: saveBg, color: '#fff' }">

<!-- after -->
<button class="ep-save-btn" :class="{ 'ep-save-btn--danger': tone === 'danger' }">
```

- [ ] **Step 3: Add the matching scoped CSS rules**

In the `<style scoped>` block, add (or update) the rules so they read the new aliases:

```css
.entity-panel {
  border-color: var(--entity-border);
}

.ep-header {
  background: var(--entity-bg);
  color: var(--entity-text);
}

.ep-save-btn {
  background: var(--entity-text);
  color: var(--surface-bg);
  border: none;
  /* preserve existing padding/radius/font from prior rules */
}

.ep-save-btn--danger {
  background: var(--error-text);
  color: var(--surface-bg);
}

.ep-save-btn:hover:not(:disabled) {
  filter: brightness(1.05);
}
```

Remove any prior `.ep-header { background: #...; color: #...; }` literals that the inline `:style` was supplementing.

- [ ] **Step 4: Simplify the `visual` computed property in `<script setup>`**

The current computed returns the full `EntityVisual` (fg/hd/border/icon/labelKey). Reduce it to only what the template still reads — `icon` and the i18n label key. If the simpler shape no longer needs a computed, drop it and inline the read.

Example:
```ts
// before
const visual = computed(() => ENTITY_VISUALS[props.entityType]);
// template uses visual.fg, visual.hd, visual.border, visual.icon, visual.labelKey

// after (after Task 6 renames the file)
import { ENTITY_META } from '../../constants/entityMeta';
const meta = computed(() => ENTITY_META[props.entityType]);
// template uses meta.icon, meta.labelKey only
```

For Task 5, you can leave the import as `ENTITY_VISUALS` — Task 7 renames it. Just make sure no template references to `visual.fg/.hd/.border` remain.

- [ ] **Step 5: Manually verify no hex / inline color style remains**

Run:
```bash
grep -nE "#[0-9a-fA-F]{3,8}|:style=\"\{[^}]*(background|color|border)[^}]*\}\"" src/renderer/components/modals/BaseSubPanel.vue
```

Expected: no matches (or only matches inside CSS comments / unrelated geometry styles).

- [ ] **Step 6: Lint + verify the app still builds**

Run: `npm run lint`

Expected: 0 errors. (Pre-existing 7 import-order warnings are fine.)

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/modals/BaseSubPanel.vue
git commit -m "feat(theming): BaseSubPanel consumes entity tokens via [data-entity]

Drops all inline :style color bindings and the hardcoded color: '#fff'
on the save button. Modal root sets data-entity=<type>; the remap rules
in shared.css alias --entity-text/-bg/-border for the subtree, so
chrome flips with theme + mode automatically.

Save button now uses var(--entity-text) on var(--surface-bg) — works
in both light and dark since --surface-bg inverts with mode.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: Migrate `.ep-*` chrome literals to existing tokens

**Files:**
- Modify: `src/renderer/styles/shared.css` (lines ≈1049–1213)

This block is the modal's structural chrome — input borders, focus ring, scrollbar tint, etc. All hex literals translate to existing tokens; no new tokens needed.

- [ ] **Step 1: Read the current `.ep-*` block**

Run: `sed -n '1049,1213p' src/renderer/styles/shared.css`

(Or use `grep -n "^\.ep-" src/renderer/styles/shared.css | head -1` to locate exactly, then read 165 lines from there.)

- [ ] **Step 2: Translate each hex literal using this mapping**

| Hardcoded literal | Replace with |
|-------------------|---------------|
| `#fff`, `#ffffff` | `var(--surface)` |
| `#f9fafb`, `#fafafa` | `var(--surface-bg)` |
| `#111827`, `#1f2937` (dark text) | `var(--text-primary)` |
| `#374151`, `#4b5563` | `var(--text-secondary)` |
| `#6b7280`, `#9ca3af` | `var(--text-muted)` |
| `#e5e7eb`, `#d1d5db` (light borders) | `var(--surface-border)` |
| `#f3f4f6` (subtle border tint) | `var(--surface-border-subtle)` |
| `#3b82f6` (focus accent) | `var(--accent)` |
| `rgba(59, 130, 246, 0.15)` (focus ring) | `color-mix(in srgb, var(--accent) 20%, transparent)` |

For any hex you encounter not in the table, choose the nearest semantic token (same role) — never invent a new entity token here, those are only for entity-themed surfaces.

- [ ] **Step 3: Verify no hex literals remain in the `.ep-*` block**

Run:
```bash
sed -n '1049,1213p' src/renderer/styles/shared.css | grep -nE "#[0-9a-fA-F]{3,8}|rgba?\(" || echo "CLEAN"
```

Expected: `CLEAN`. (Adjust the line range if the block has shifted due to earlier insertions in this plan.)

- [ ] **Step 4: Lint + WCAG test**

Run: `npm run lint && npx vitest run tests/unit/wcagContrast.test.ts 2>&1 | tail -5`

Expected: lint clean, ~379 assertions passing.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/styles/shared.css
git commit -m "fix(theming): migrate .ep-* chrome literals to existing tokens

Modal chrome (entity-panel, ep-input, ep-textarea, ep-close, focus ring,
etc.) now uses surface/text/accent tokens that already have dark + HC
variants. No new tokens introduced.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: Rename `entityColors.ts` → `entityMeta.ts`, drop color fields

**Files:**
- Delete: `src/renderer/constants/entityColors.ts`
- Create: `src/renderer/constants/entityMeta.ts`
- Modify: `src/renderer/components/modals/BaseSubPanel.vue` + 7 modal importers (`PersonModal`, `EventModal`, `SourceModal`, `CitationModal`, `PlaceModal`, `GroupModal`, `RelationshipModal`)

- [ ] **Step 1: Inventory the importers and their field reads**

Run:
```bash
grep -rn "ENTITY_VISUALS\|ENTITY_COLORS\|EntityVisual\|EntityType\|from.*entityColors" src/renderer/ 2>/dev/null
```

For each match, note whether it reads color fields (`.fg/.hd/.border`) or only metadata (`EntityType` enum, `.icon`, `.labelKey`). Color reads should already be gone after Task 5; flag any that remain — they need updating before this task can complete.

- [ ] **Step 2: Create the new `entityMeta.ts`**

Write to `src/renderer/constants/entityMeta.ts`:

```ts
export interface EntityMeta {
  /** Emoji icon shown in the modal header next to the label */
  icon: string;
  /** i18n key for the entity label (small caps text above the title) */
  labelKey: string;
}

export type EntityType =
  | 'person'
  | 'event'
  | 'source'
  | 'citation'
  | 'place'
  | 'relationship'
  | 'task'
  | 'group'
  | 'name'
  | 'identifier'
  | 'neutral';

export const ENTITY_META: Record<EntityType, EntityMeta> = {
  person:       { icon: '👤', labelKey: 'persons.entity' },
  event:        { icon: '📅', labelKey: 'events.entity' },
  source:       { icon: '📚', labelKey: 'sources.entity' },
  citation:     { icon: '📖', labelKey: 'citations.entity' },
  place:        { icon: '📍', labelKey: 'places.entity' },
  relationship: { icon: '🔗', labelKey: 'relationships.entity' },
  task:         { icon: '📋', labelKey: 'researchTasks.entity' },
  group:        { icon: '👥', labelKey: 'groups.entity' },
  name:         { icon: '🏷️', labelKey: 'persons.nameEntity' },
  identifier:   { icon: '🪪', labelKey: 'persons.identifierEntity' },
  neutral:      { icon: '',   labelKey: '' },
};
```

- [ ] **Step 3: Delete the old file**

```bash
git rm src/renderer/constants/entityColors.ts
```

- [ ] **Step 4: Update every importer**

For each file the inventory in Step 1 surfaced, update:
- `from '../../constants/entityColors'` → `from '../../constants/entityMeta'`
- `ENTITY_VISUALS` → `ENTITY_META`
- `ENTITY_COLORS` → `ENTITY_META`
- `EntityVisual` → `EntityMeta`
- `.fg`, `.hd`, `.border` reads → must already be removed in Task 5; if any survive, replace with the appropriate `var(--entity-*)` CSS token (and complain in the commit message — that's a Task-5 miss).

- [ ] **Step 5: Lint + WCAG test**

Run: `npm run lint && npx vitest run tests/unit/wcagContrast.test.ts 2>&1 | tail -5`

Expected: lint clean, ~379 assertions passing.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(theming): rename entityColors.ts -> entityMeta.ts

Drops fg/hd/border color fields (now in CSS tokens) and the deprecated
ENTITY_COLORS alias. Keeps EntityType enum + icon + labelKey. All 8
importers updated to ENTITY_META / EntityMeta.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8: Manual smoke test in Electron

**No file changes** — this is a verification-before-commit gate.

The WCAG suite proves the tokens have correct contrast. It does NOT prove BaseSubPanel actually applies them, that the icon still renders, or that the modal looks coherent in each theme. Smoke-test that.

- [ ] **Step 1: Launch the app**

Run: `./.devcontainer/dev-debug.sh` (or `npm start` if not in devcontainer).

The app should open in the default Forest light theme.

- [ ] **Step 2: Walk through each modal type once in Forest light**

Open one instance of each entity modal (Person, Event, Source, Citation, Place, Group, Relationship, plus a Name and Identifier sub-panel from inside PersonPanel; ConfirmModal counts as `neutral`). For each:
- Header background, label color, and icon visible and readable
- Save button readable (text not lost on its background)
- Cancel button readable
- Input fields legible

- [ ] **Step 3: Switch to Forest dark, repeat**

Settings → Appearance → Dark. Re-open one of each modal. Same checks. Pay particular attention to any entity that uses a light background in light mode — the inversion should make it a dark surface in dark mode without looking like a light box dropped onto a dark page.

- [ ] **Step 4: Switch to Forest high-contrast, repeat**

Settings → Appearance → High Contrast. Same checks. Headers should be near-white text on near-black bg, borders should be vivid and distinct against `--surface-bg`.

- [ ] **Step 5: Switch to Twilight high-contrast, repeat**

Settings → Theme → Twilight. (Mode stays HC.) Repeat the modal sweep. This is the combination most likely to expose a needed per-theme override (Twilight's purple-tinted surface mixes oddly with some entity hues).

If any modal looks wrong (illegible, washed out, "wrong" color identity for the entity), record the (entity × theme × mode) combo and add a per-theme override in `shared.css` — same pattern as Task 3 step 4. Re-run WCAG to confirm the override didn't break a passing combo. Commit any such fixes individually:

```bash
git add src/renderer/styles/shared.css
git commit -m "fix(theming): per-theme entity override for <entity> in <theme> <mode>

Visual smoke test showed <description>. Override pulls --entity-<name>-<field>
to <new-value> for this combo only; WCAG still passes.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

If the sweep is clean, no commit needed in this task.

---

## Task 9: Release — version, CHANGELOG, archive, merge

**Files:**
- Modify: `package.json`, `CHANGELOG.md`, `docs/PLAN.md`
- Move: `docs/plans/2026-04-25-entity-token-theming-design.md` → `docs/plans/archive/`
- Move: `docs/plans/2026-04-25-entity-token-theming.md` → `docs/plans/archive/`

- [ ] **Step 1: Bump minor version**

Read current version: `grep '"version"' package.json`

This work is a **feat** (new `data-entity` mechanism is reusable infrastructure). Increment the minor segment, reset patch to 0. Example: `0.150.1` → `0.151.0`.

Edit `package.json`:
```json
  "version": "0.151.0",
```

(Use whatever the actual next minor is — read the current value first.)

- [ ] **Step 2: Add CHANGELOG entry under `## Unreleased`**

Insert at the top of the `## Unreleased` section in `CHANGELOG.md`:

```markdown
- feat(theming): entity colors are now CSS tokens with dark + high-contrast variants. Per-entity tokens (`--entity-{person,event,source,…}-text/-bg/-border`) live in `tokens.css` (light) and `shared.css` (dark + HC); `BaseSubPanel` consumes them via a `data-entity="<type>"` attribute selector that aliases `--entity-text/-bg/-border` for the modal subtree, so headers and save buttons flip with mode + theme automatically. `entityColors.ts` renamed to `entityMeta.ts` with color fields removed (icon + labelKey only). The WCAG contrast test gained ~198 assertions covering all 11 entities × 9 (theme × mode) combinations — entity-color regressions now fail CI.
```

- [ ] **Step 3: Archive the spec and plan**

```bash
git mv docs/plans/2026-04-25-entity-token-theming-design.md docs/plans/archive/
git mv docs/plans/2026-04-25-entity-token-theming.md docs/plans/archive/
```

- [ ] **Step 4: Remove the milestone from `docs/PLAN.md` Roadmap**

Open `docs/PLAN.md`, find the `#### Entity-color Theming Migration [planned]` heading + spec link, and delete that block entirely. The CHANGELOG entry is the permanent record.

- [ ] **Step 5: Verify everything still passes**

Run: `npm run lint && npx vitest run tests/unit/wcagContrast.test.ts 2>&1 | tail -5`

Expected: 0 errors, all assertions passing.

- [ ] **Step 6: Commit the release**

```bash
git add -A
git commit -m "chore(release): v0.151.0 — entity-color theming migration

Bumps minor for the new --entity-*-text/-bg/-border tokens and the
[data-entity] consumption mechanism. Archives the spec and plan;
removes the milestone from the Roadmap. CHANGELOG updated.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

(Adjust version number in the message to match the actual bump.)

---

## Worktree merge-back (executed by the controller, not inside the worktree)

After Task 9 commits cleanly inside the worktree, the controller (parent agent) merges back to main per the `commit` skill's "Merging a long-running feature branch back to main" guidance:

```bash
# from main repo cwd, NOT the worktree
git -C /Users/jonasahnstedt/git/slaktforskning fetch
git -C /Users/jonasahnstedt/git/slaktforskning merge --no-ff <worktree-branch>
git -C /Users/jonasahnstedt/git/slaktforskning worktree remove <worktree-path>
```

Conflict expectations: `package.json` version (take the worktree's bump if higher than main's), `CHANGELOG.md` (place worktree's entry above main's new entries), `docs/PLAN.md` (worktree already removed the milestone — keep that). See the `commit` skill for the full conflict guide.
