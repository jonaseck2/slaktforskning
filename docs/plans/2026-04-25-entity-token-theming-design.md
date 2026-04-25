# Entity-color theming migration — design

## Problem

Entity colors (person/event/source/citation/place/relationship/task/group/name/identifier/neutral) are hardcoded as JS hex literals in `src/renderer/constants/entityColors.ts:27-40` and applied via inline `:style` in `src/renderer/components/modals/BaseSubPanel.vue:131-147`. Consequences:

- **Light-only.** No dark or high-contrast variants exist.
- **Theme-blind.** They don't respond to `html.theme-forest|nordic|twilight`.
- **Out-of-spec chrome.** `.ep-*` rules in `src/renderer/styles/shared.css:1049-1213` use hardcoded `#fff`, `#111827`, `#9ca3af`, `#3b82f6`, etc. — light-only.
- **Unverified.** `tests/unit/wcagContrast.test.ts` covers 22 pairs but zero entity colors. The regression silently passes CI.
- **Hardcoded text on save button.** `BaseSubPanel.vue:35,81` writes `color: '#fff'` directly.

Source of this design: appearance audit on 2026-04-25; small fixes shipped in commit `afd0a37`.

## Goal

Move entity colors into CSS custom properties so:
1. Each entity has a defined color in light, dark, and high-contrast modes.
2. The chrome around entities (`BaseSubPanel`, `.ep-*` rules) flips automatically with `html.dark` / `html.high-contrast`.
3. The WCAG contrast test covers every entity × theme × mode combination, so future regressions fail CI.
4. The pattern is reusable: badges, charts, or any future surface that wants entity-coloring can opt in by setting a single attribute.

## Decisions (from brainstorming)

| # | Question | Decision |
|---|----------|----------|
| Q1 | Per-theme variation? | **Hybrid.** Light: theme-invariant baseline. Dark + HC: theme-invariant baseline; per-theme overrides only where WCAG fails on a specific combo. Start with zero overrides — let the new tests force them. |
| Q2 | Token naming | **`--entity-{name}-text` / `-bg` / `-border`** — matches existing `--surface-bg` / `--text-primary` vocabulary. |
| Q3 | BaseSubPanel consumption | **Attribute selector with element-scoped aliases.** `data-entity="person"` on the modal root; one CSS rule per entity remaps `--entity-text` / `--entity-bg` / `--entity-border` for the subtree. |
| Q4 | Where do overrides live | **Existing pattern.** Light defaults in `tokens.css :root`; dark/HC theme-invariant baselines in `shared.css` under `html.dark` / `html.high-contrast`; per-theme tweaks under `html.dark.theme-X` / `html.high-contrast.theme-X` only as needed. |
| Q5 | WCAG test extension | **Programmatic.** `const ENTITIES = [...] as const`, loop the 11 entities × 9 (theme × mode) combos, reuse existing `buildPalette` + `contrastRatio` helpers. |
| Q6 | Cleanup of entityColors.ts | **Rename → `entityMeta.ts`, drop color fields.** Keep `EntityType` enum + `icon` + `labelKey`. Update 7 importers + BaseSubPanel. |

## Token inventory

11 entities, 3 fields each → **33 light tokens** in `:root`, **33 dark tokens** in `html.dark`, **33 HC tokens** in `html.high-contrast`. Per-theme overrides are added one at a time only when the new WCAG tests fail on that combo.

```css
/* tokens.css :root — light defaults (theme-invariant) */
--entity-person-text: #4f46e5;       --entity-person-bg: #f5f3ff;       --entity-person-border: #c7d2fe;
--entity-event-text: #c2410c;        --entity-event-bg: #fff3e8;        --entity-event-border: #fed7aa;
--entity-source-text: #7e22ce;       --entity-source-bg: #faf5ff;       --entity-source-border: #e9d5ff;
--entity-citation-text: #166534;     --entity-citation-bg: #f0fdf4;     --entity-citation-border: #bbf7d0;
--entity-place-text: #0e7490;        --entity-place-bg: #ecfeff;        --entity-place-border: #a5f3fc;
--entity-relationship-text: #475569; --entity-relationship-bg: #f1f5f9; --entity-relationship-border: #cbd5e1;
--entity-task-text: #92400e;         --entity-task-bg: #fffbeb;         --entity-task-border: #fde68a;
--entity-group-text: #0369a1;        --entity-group-bg: #f0f9ff;        --entity-group-border: #bae6fd;
--entity-name-text: #475569;         --entity-name-bg: #f9fafb;         --entity-name-border: #e5e7eb;
--entity-identifier-text: #475569;   --entity-identifier-bg: #f9fafb;   --entity-identifier-border: #e5e7eb;
--entity-neutral-text: #374151;      --entity-neutral-bg: #f9fafb;      --entity-neutral-border: #e5e7eb;
```

Light values transcribed verbatim from current `ENTITY_VISUALS` (no visual change in light mode).

Dark and HC values are derived to satisfy:
- Text-on-bg ≥ 4.5:1 (dark, AA) / ≥ 7:1 (HC, AAA)
- Border-on-surface ≥ 3:1 (UI affordance)

A simple rule of thumb the implementation can follow: in dark mode invert the lightness — `text` becomes a pale tint of the same hue (≈ L 75%), `bg` becomes a deep tint (≈ L 18%, with low chroma so it sits well on `--surface-bg`), `border` sits between (≈ L 38%). In HC, push `text` to L ≥ 90% and `bg` to L ≤ 12%. The new test enforces the actual contrast; the implementation can iterate values until it passes.

## Element-scoped aliases

In `shared.css` (theme-invariant, near other shared rules):

```css
/* Entity color aliases — set --entity-text/-bg/-border for any subtree
 * that declares its entity via data-entity="…". BaseSubPanel uses this;
 * future surfaces (badges, chart hover, list rows) can opt in the same way. */
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

## BaseSubPanel changes

Today (`BaseSubPanel.vue:131-147`):

```vue
<div class="entity-panel" :style="{ borderColor: visual.border }">
  <div class="ep-header" :style="{ background: visual.hd, color: visual.fg }">
    ...
  </div>
  <button :style="{ background: saveBg, color: '#fff' }">Save</button>
</div>
```

After:

```vue
<div class="entity-panel" :data-entity="entityType">
  <div class="ep-header">...</div>
  <button class="ep-save-btn">Save</button>
</div>
```

Scoped CSS:

```css
.entity-panel { border-color: var(--entity-border); }
.ep-header { background: var(--entity-bg); color: var(--entity-text); }
.ep-save-btn { background: var(--entity-text); color: var(--surface-bg); }
.ep-save-btn--danger { background: var(--error-text); color: var(--surface-bg); }
```

The save button's `color: '#fff'` becomes `var(--surface-bg)` — surface-bg is white in every light theme and a dark color in dark mode, giving correct contrast in both. If the new WCAG test rejects this for any (entity × mode) combo, the fix is per-entity `--entity-{name}-on-text` tokens; we treat that as a fallback contingency, not the default plan.

The `visual` computed property (currently returning hex via `ENTITY_VISUALS[entityType]`) reduces to `entityMeta[entityType]` returning only `{ icon, labelKey }`. The header still renders `{{ icon }}` and `{{ $t(labelKey) }}`.

## `.ep-*` chrome migration

`src/renderer/styles/shared.css:1049-1213` has ~165 lines of light-only rules. Migration is mechanical:

| Hardcoded | Token |
|-----------|-------|
| `background: #fff` | `var(--surface)` |
| `background: #f9fafb` | `var(--surface-bg)` |
| `color: #111827` | `var(--text-primary)` |
| `color: #6b7280`, `#9ca3af` | `var(--text-muted)` |
| `color: #374151` | `var(--text-secondary)` |
| `border-color: #e5e7eb`, `#d1d5db` | `var(--surface-border)` |
| `border-color: #3b82f6` (focus) | `var(--accent)` |
| `box-shadow: 0 0 0 3px rgba(59,130,246,0.15)` (focus ring) | `0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent)` |

No new tokens required for chrome; everything maps to existing surface/text/accent tokens that already have dark/HC variants. The migration is "translate each literal to its already-existing token."

## WCAG test extension

Append to `tests/unit/wcagContrast.test.ts`:

```ts
const ENTITIES = ['person', 'event', 'source', 'citation', 'place',
  'relationship', 'task', 'group', 'name', 'identifier', 'neutral'] as const;

const ENTITY_TEXT_PAIRS = ENTITIES.map(e => ({
  label: `entity-${e}-text on entity-${e}-bg`,
  fg: `entity-${e}-text`,
  bg: `entity-${e}-bg`,
}));

const ENTITY_UI_PAIRS = ENTITIES.map(e => ({
  label: `entity-${e}-border on surface-bg`,
  fg: `entity-${e}-border`,
  bg: 'surface-bg',
}));
```

Add to the existing `WCAG AAA — high-contrast mode (theme-tinted)` block: assert each `ENTITY_TEXT_PAIRS` pair at AAA and each `ENTITY_UI_PAIRS` at the UI threshold (3:1) for all three themes.

Add to the existing `WCAG AA — light and dark base themes (regression)` block: assert each `ENTITY_TEXT_PAIRS` pair at AA and each `ENTITY_UI_PAIRS` at the UI threshold for all 6 (theme × {light, dark}) combos.

Total new assertions: 11 entities × 2 pair-types × 9 (theme × mode) = **198 assertions**, mostly satisfied by the theme-invariant baselines. Per-theme override blocks get added only for the failing combos.

## Save-button contrast — known risk

Some entity text colors are mid-tone (e.g. `relationship: #475569` slate-500) and `--surface-bg` is light. `#475569` on white is 7.6:1 — fine. But against the dark-mode `--surface-bg` (typically `#1f2937`-ish), `#475569` text would fail. The mitigation is in the dark-mode entity tokens themselves: `--entity-relationship-text` in dark mode becomes a paler tint (e.g. `#94a3b8`), which against the dark `--surface-bg` would also fail.

Resolution path:
1. Implement with `color: var(--surface-bg)` first.
2. Run the new WCAG tests.
3. For each failing (entity × mode) combo, **introduce a per-entity `--entity-{name}-on-text` token** (the contrasting foreground for the save button) only for that entity, only for that mode. Keep this list minimal — the design preference is the simple `var(--surface-bg)` rule.

## Files changed

| File | Change |
|------|--------|
| `src/renderer/styles/tokens.css` | Add 33 light entity tokens to existing `:root` block; add `--entity-*` section comment. |
| `src/renderer/styles/shared.css` | Add 11 attribute-selector remap rules; add 33 dark + 33 HC theme-invariant entity tokens under `html.dark` / `html.high-contrast`; migrate `.ep-*` literals to existing tokens; add per-theme entity overrides only as needed to satisfy new WCAG tests. |
| `src/renderer/components/modals/BaseSubPanel.vue` | Drop inline `:style`; add `:data-entity="entityType"`; replace `color: '#fff'` with `var(--surface-bg)`; consume `var(--entity-text/bg/border)` in scoped CSS. |
| `src/renderer/constants/entityColors.ts` | Rename file → `entityMeta.ts`; drop `fg`/`hd`/`border` from `EntityVisual` interface (rename to `EntityMeta`); remove deprecated `ENTITY_COLORS` alias. |
| `src/renderer/components/modals/{Person,Event,Source,Citation,Place,Group,Relationship}Modal.vue` | Update import path (`entityColors` → `entityMeta`) and any field references (some may pass `entityType` through to BaseSubPanel — those don't change). |
| `tests/unit/wcagContrast.test.ts` | Add `ENTITIES` array + `ENTITY_TEXT_PAIRS` + `ENTITY_UI_PAIRS`; loop them inside existing `describe` blocks. |

## Out of scope

- Per-theme entity color *visual* variation (one entity, three brand colors). Themes still affect surface/sidebar/accent only.
- Migrating badges, chart hover tints, list-row indicators to entity tokens. The `data-entity` mechanism makes this trivial later, but no consumer is asked for it now.
- Modifying or recoloring the entity icons themselves.
- The static-website-export bundle (export-scope already pins values; entity-coloring inside reports stays neutral).

## Acceptance

- All 181 existing WCAG tests continue to pass.
- ~198 new entity-coverage assertions pass on commit.
- BaseSubPanel.vue contains no hex literals or inline `:style="{ background/color/border ... }"`.
- `.ep-*` block in shared.css contains no hex literals; all colors come from existing or new tokens.
- `entityMeta.ts` exports only metadata (`EntityType`, `icon`, `labelKey`); no color fields.
- All 7 modal importers + BaseSubPanel compile cleanly with the renamed import.
- Manual smoke test: open one of each entity modal in Forest light, Forest dark, Forest HC, Twilight HC; header colors and save buttons remain readable.
