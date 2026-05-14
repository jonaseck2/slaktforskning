---
name: a11y
description: ARIA accessibility patterns for the Släktforskning codebase — modals, combobox pickers, keyboard navigation, focus management, TTS, WCAG contrast enforcement. Use when adding or modifying any interactive UI component, and when changing any color token.
---

# Accessibility Patterns

Reference for maintaining WCAG 2.1 compliance in this codebase.
**Contrast targets:** light + dark modes target **WCAG 2.1 AA** (≥4.5:1 body / ≥3:1 large / ≥3:1 non-text UI); high-contrast mode targets **WCAG 2.1 AAA** (≥7:1 body / ≥4.5:1 large / ≥3:1 non-text UI).

## Contrast Enforcement (Color Tokens)

**Any change to color tokens must pass `tests/unit/wcagContrast.test.ts`.** The test parses `tokens.css` + `shared.css`, builds the effective palette for every (theme × appearance) combination (3 × 3 = 9 palettes), and asserts every text/background pair and non-text UI pair against the appropriate WCAG threshold. Failure messages print the exact ratio and the threshold it needs to clear.

- Math utility: `src/renderer/utils/wcag.ts` — `contrastRatio(fg, bg)`, `relativeLuminance(hex)`, `wcagThreshold(level, size)`, `meetsWcag(ratio, level, size)`, `NON_TEXT_THRESHOLD`.
- Math tests: `tests/unit/wcag.test.ts` — guards the utility itself against W3C reference values.
- Palette tests: `tests/unit/wcagContrast.test.ts` — guards the CSS tokens.

**Workflow when editing a color token:**
1. Make the change in `tokens.css` (base themes) or `shared.css` (dark/high-contrast overrides).
2. Run `npx vitest run tests/unit/wcagContrast.test.ts`.
3. If a pair fails, the failure message tells you the exact ratio — adjust the token or the partner token it's paired with until the ratio clears the threshold.

**High-contrast mode is theme-tinted.** `html.high-contrast.theme-forest`, `.theme-nordic`, `.theme-twilight` each have their own palette (deep green/navy/indigo bg + high-luminance tinted text). Mirrors the `html.dark.theme-*` pattern. Never collapse back to a single theme-invariant HC block — each theme must preserve its color identity in HC mode.

**Never hardcode hex colors** — always use token variables. Hardcoded colors bypass the test and break theme switching.

## Modal Pattern (BaseModal)

All modals use `BaseModal.vue` which provides:
- `role="dialog"`, `aria-modal="true"`, `:aria-labelledby="titleId"`
- Focus trap via `useFocusTrap` composable (auto-activates on mount)
- Escape key closes

**Consumer checklist:**
1. Pass `:title-id="'modal-title-xxx'"` to BaseModal
2. Add `id="modal-title-xxx"` to the `<h3>` inside the modal
3. Use unique id per modal type

## Combobox Picker Pattern

PersonPicker, PlacePicker, GroupPicker all follow WAI-ARIA combobox:

**Input:** `role="combobox"`, `:aria-expanded`, `aria-autocomplete="list"`, `:aria-controls`, `:aria-activedescendant`
**List:** `role="listbox"`, each item `role="option"` with unique `id` and `:aria-selected`
**Keyboard:** ArrowDown/Up navigate, Enter selects, Escape closes
**Live region:** `aria-live="polite"` for result count

**Instance uniqueness:** Use `Math.random().toString(36).slice(2, 8)` prefix for all DOM ids (multiple pickers can coexist on one page).

## Clickable Row Pattern

Any `<tr class="clickable-row">` must have:
- `tabindex="0"`
- `role="button"`
- `:aria-label` describing the action
- `@keydown.enter` and `@keydown.space.prevent` mirroring the click handler
- If expandable: `:aria-expanded`

## Detail View Sections

Each `<section class="detail-section">` needs:
- `aria-labelledby="section-xxx"` pointing to the section's heading
- Unique `id` on the `<h4>` heading

Back buttons: always add `:aria-label="$t('a11y.goBack')"`.

## Chart Accessibility

SVG charts use ARIA tree roles:
- Container: `role="tree"`, `:aria-label`
- Nodes: `role="treeitem"`, `:aria-label`, `tabindex="0"`
- Keyboard: ArrowUp/Down/Left/Right navigate between nodes, Enter/Space activates
- Focus ring: `.person-box.focused` class + `:focus-visible` CSS
- Always provide a list view alternative (PedigreeListView)

## Toast Notifications

`ToastNotification.vue`:
- Container: `aria-live="assertive"`, `aria-atomic="true"`
- Each toast: `role="alert"`, `tabindex="0"`, keyboard dismiss

## Settings ARIA

Button groups that are mutually exclusive:
- Container: `role="radiogroup"`, `:aria-label`
- Each button: `role="radio"`, `:aria-checked="String(isActive)"`

Settings toggle: `:aria-expanded` for collapsible panels.

## i18n Keys

All accessibility strings live under the `a11y` namespace in `src/renderer/i18n/en.ts` and `sv.ts`. Always use `$t('a11y.xxx')` for ARIA labels, never hardcode English strings.

## TTS (Text-to-Speech)

- Composable: `src/renderer/composables/useTTS.ts` — `speak(text, locale)`, `stop()`, `isSpeaking`, `isSupported`
- Narration builders: `src/renderer/utils/narration.ts` — `narratePerson()`, `narrateRelationship()`, `narrateSource()`, `narrateMedia()`, `narratePlace()`, `narrateEvent()`, `narrateCitation()`. Pure functions; each takes a typed data object + a `NarrationLabels` object (resolve i18n labels once per consumer via `narrationLabelsFromI18n(t)`).
- The `v-narrate` directive (`src/renderer/directives/narrate.ts`) writes to a WeakMap; `resolveNarration(el)` reads from there with fallback to `data-narrate` → `aria-label` → visible text. Use the function form `v-narrate="() => narrateX(item, labels)"` when the data is reactive.
- Sites already wired: PersonPicker / PlacePicker / SourcePicker / GroupPicker / MediaPicker option rows; BaseSubPanel `.ep-header` (announces `"{Entity} modal: {Title}"` via `narration.modal.header` i18n key); MediaViewer `<img>`; MediaCaption root; FaceTagOverlay regions (also `tabindex="0"` + `role="button"`).
- Modes: Off / Narrate (TTS via v-narrate) / Screen Reader (focus tracking + hotkeys via `useScreenReaderMode`, a global singleton — once enabled in Settings, it tracks focus everywhere including modals).

## Focus Management

- `useFocusTrap(containerRef)` — auto-activates on mount, traps Tab/Shift+Tab, restores focus on unmount
- Global `:focus-visible` outline in shared.css
- Skip link: `<a href="#main-content" class="skip-link">` in App.vue

## Checklist for New Components

When adding a new interactive component:
- [ ] All buttons have visible text or `aria-label`
- [ ] Form inputs have associated labels or `aria-label`
- [ ] Dynamic content updates use `aria-live` regions
- [ ] Clickable non-button elements have `role`, `tabindex`, keyboard handlers
- [ ] Modals use BaseSubPanel (gets dialog role + focus trap + entity-aware header narration for free; never use BaseModal directly — it's only the internal overlay/backdrop primitive used by BaseSubPanel)
- [ ] Pickers use the combobox pattern
- [ ] Decorative icons use `aria-hidden="true"`

## Verifying a11y against the running app (dev MCP)

After implementing or editing an interactive surface, verify it against the live app via the `slaktforskning-dev` MCP. The seven `ui_aria_*` tools mirror what a screen-reader user experiences — they walk the live ARIA tree, not the rendered DOM, so they catch the failures CSS-selector probes miss. Prefer them over `ui_get_dom` / `ui_query_styles` whenever the question is "can the user perceive / reach / operate this?":

| Question | Tool |
|---|---|
| What landmarks does this view expose? | `ui_aria_landmarks()` |
| What's the heading outline? | `ui_aria_headings({ region?: '…' })` |
| What does Tab navigation feel like? | `ui_aria_tab_order({ region?: '…' })` |
| What clickables/inputs exist (by name + role + state)? | `ui_aria_list({ role?: '…', region?: '…' })` |
| What does this section sound like to TTS? | `ui_aria_read({ region?: '…' })` |
| Click or fill by accessible name | `ui_aria_invoke({ name: '…', role?: '…', region?: '…', value?: '…' })` |
| Find every a11y gap in the current view | `ui_aria_audit({ region?: '…' })` |

**Mandatory verification step for any UI change:** before claiming done, navigate to the surface and run `ui_aria_audit()`. The findings name specific gaps (`unnamed_interactable`, `input_without_label`, `unnamed_landmark`, `missing_focus_indicator`, …). A finding that the change introduced is a regression; address it before commit.

**When `ui_aria_*` can't find what you want, that's data.** The accessible-name resolution is: `v-narrate` → `aria-label` → `aria-labelledby` → `<label for>` → visible textContent → `placeholder` → `title`. Unfindable = no accessible name = real a11y gap.

**Ambiguity is a signal, not a bug.** `ui_aria_invoke({ name: 'Spara' })` throws when two elements share that name and lists every candidate with its role + region. Disambiguate via the `role` / `region` arguments.
