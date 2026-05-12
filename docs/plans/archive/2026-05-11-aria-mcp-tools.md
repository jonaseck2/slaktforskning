# ARIA-driven dev MCP tools — TTS-parity surface

> Subagent dispatch: see `.claude/skills/subagent-handoff/SKILL.md`.

> **Scope expansion 2026-05-11 (mid-execution).** The original plan (`ui_aria_list` + `ui_aria_invoke` only) shipped via subagent + parent live-smoke on the same day. During the smoke the user observed that the surface was "screen-reader-inspired CSS selectors" — useful for navigation, but not actually parity with what a TTS user experiences. Three real a11y bugs in the app (Settings chip strip lacking `role="tab"`, modal form inputs without label associations, unnamed `<main>` landmark) surfaced only because the tool was incomplete and failed to find what the user expected. The user picked option 2 ("Expand the surface before shipping") and we widened scope from 2 tools → 7 tools + state surface + a11y audit. The text below is the expanded plan; the v1 work (resolver + name priority + region + invoke) is preserved and stays in scope.

## User goal

When I (or any agent) drive the running app via the dev MCP, I experience it the way a screen-reader user does — tab through focusables in tab order, navigate by landmark and heading, read a section's prose, hear element state ("pressed", "expanded", "selected") — and the same surface doubles as a systematic a11y audit because every gap the tool hits is a gap a real user would hit too. CSS selectors describe layout; accessible names + roles + states + landmark structure describe what the user (sighted or not) thinks they're interacting with. The original two-tool surface (`ui_aria_list` + `ui_aria_invoke`) is one slice of that; the rest of this plan adds the slices that make the agent's experience of the app a faithful mirror of what a real TTS user gets.

We saw the value of the half-measure on day one: three real a11y bugs in the app caught by `ui_aria_list` *failing to find things by their user-facing names*. That's the right way to find a11y bugs — reactive, but the gap was made of the tool not modelling the right primitives. Headings, landmarks, tab order, and live state turn that reactive discovery into a proactive one: `ui_aria_audit(view)` lists every gap in one call.

## Scope

**Seven tools**, all in `src/mcp/tools/dev/ui.ts`, all routing through the existing `runScript` → `POST /eval` flow. **No Tauri Rust changes.** No new HTTP endpoints. The accessible-name + region + state computation lives in renderer-side JS injected via `runScript` — one big function with a mode switch (`'list' | 'invoke' | 'tab_order' | 'landmarks' | 'headings' | 'read' | 'audit'`) whose `.toString()` body ships to the renderer.

- `ui_aria_list` — interactables only, with name + role + region + state. Optional `region` / `role` / `limit` / `include_disabled` / `include_hidden` filters. (v1 — keep.)
- `ui_aria_invoke` — click or fill by accessible name; ambiguity errors out with full candidate list. (v1 — keep.)
- `ui_aria_tab_order` — sequential walk of focusable elements in tab order (resolved `tabindex` ascending, then DOM order for `tabindex=0` / natively focusable). What pressing Tab repeatedly would visit. Each entry carries the same shape as `ui_aria_list` plus a `tab_index` field and the resolved focus order.
- `ui_aria_landmarks` — every landmark in the document: `<main>`, `<nav>`, `<header>`, `<footer>`, `<aside>`, `<section>`, `[role="region"]`, `[role="dialog"]`, `[role="search"]`, `[role="form"]`. Each entry: `{ role, name, has_name, tag, child_interactable_count, region (parent landmark name) }`. Surfaces unnamed landmarks (`has_name: false`) so the agent + audit can spot them.
- `ui_aria_headings` — every `<h1>`–`<h6>` and `[role="heading"][aria-level]`. Each entry: `{ level, text, region }`. The H-key navigation a TTS user has.
- `ui_aria_read` — given a region (by accessible name) or the document if no region passed, returns the ordered stream of reading-units a screen reader would announce: heading / paragraph / list-item / interactable, in DOM order. Each unit carries its kind + text + (for interactables) role + state. Useful when the agent needs to "read the screen" rather than enumerate clickables.
- `ui_aria_audit` — scoped a11y audit. Reports findings, severity ranked:
  - `unnamed_interactable` — interactable with no name from any of the seven sources (must be clicked via CSS selector — agent can't get there by name).
  - `unnamed_landmark` — `<main>`/`<nav>`/`<aside>`/`<section>` without `aria-label`. Means screen-reader users can't jump to it by landmark name.
  - `input_without_label` — `<input>` / `<textarea>` / `<select>` whose name is empty OR derived only from placeholder/title (not a real label).
  - `tab_strip_without_role` — heuristic: 3+ adjacent buttons inside one container, all visible at once, no `role="tab"` / `role="tablist"`. Likely a chip strip masquerading as tabs.
  - `positive_tabindex` — any `tabindex >= 1` (anti-pattern — overrides natural tab order in ways no one tests).
  - `disabled_focusable` — element has `aria-disabled="true"` but is still in the tab order (real disabled removes from tab order; aria-disabled alone doesn't).
  Each finding: `{ kind, severity: 'low'|'medium'|'high', tag, role?, region?, hint }`. The `hint` field is a one-liner like the user-friendly bug descriptions in the plan's failure-modes section, so the agent knows what to do without re-deriving.

**Element state on every result** — added to every match in every mode where the element is interactable. Optional fields, only emitted when truthy:
- `pressed: true` (aria-pressed="true")
- `expanded: true|false` (aria-expanded set)
- `selected: true` (aria-selected="true")
- `checked: true|false|'mixed'` (aria-checked or `<input type=checkbox/radio>.checked`)
- `current: '...'` (aria-current value)
- `busy: true`
- `invalid: true`
- `required: true`

Both `ui_aria_list` and `ui_aria_tab_order` results carry state; `ui_aria_landmarks` carries `busy` only (the only state meaningful on a landmark). `ui_aria_read` carries state on interactable items.

### Scope deviations

- **Don't implement the W3C accessible-name-computation spec end-to-end.** The 7-step priority covers every interactable in this app today. Corner cases (`<fieldset><legend>`, `<table><caption>`, `<svg><title>`) extend the priority list when they come up.
- **Don't ship a tree-shape `ui_aria_tree` tool.** Tab order, landmarks, headings, and the read mode together are richer than a single tree dump.
- **Don't silently pick the first match on ambiguity in `ui_aria_invoke`.** The user-goal-defining behavior of v1 stays.
- **Don't try to mimic verbose TTS verbalization.** `ui_aria_read` returns the *content* a TTS would announce, not the literal "Länkregler comma tab comma 3 of 4 comma collapsed" string. Roles + state are returned as structured fields the agent can format itself.
- **Don't migrate existing agents/skills off `ui_click`.** Additive. The skill update (Task 5) shifts the *preference* without deprecating anything.
- **Don't add a Tauri Rust command.** Accessible-name + region + state computation is renderer-side JS by design — it can see the live DOM, the `v-narrate` WeakMap, computed styles, and inherited aria-hidden. Doing it Rust-side would mean serializing the entire AX tree across the bridge.

## Verification

User-observable outcome: an agent can do the Settings → Länkregler → +Regel flow from v1 *plus* enumerate the page's landmarks and headings, read the prose of the active region, hear which chip is "selected" in a tab strip, and run a one-shot a11y audit that lists every place the tool can't address an element by name. The agent's tool log uses only `ui_aria_*` tools — zero CSS selectors.

1. **Live smoke** (goal-anchor). In a session against the running app with the dev MCP restarted:
   1. `ui_aria_landmarks()` — returns the document's landmarks. Note any with `has_name: false`.
   2. `ui_aria_headings()` — returns every heading. Levels visible.
   3. `ui_aria_tab_order({ region: '<some named region>' })` — sequential focus order matches what pressing Tab would visit.
   4. `ui_aria_list({ role: 'button' })` — every button now carries state (pressed/expanded if any apply).
   5. `ui_aria_read({ region: '<the open settings tab content region>' })` — returns headings + paragraphs + interactables in DOM order.
   6. `ui_aria_audit()` — surfaces (at minimum) the three real bugs the day-one smoke caught: the Settings chip strip without `role="tab"`, the modal form inputs without label associations, and the unnamed `<main>`.
   7. The v1 flow (Settings → Länkregler → +Regel → fill → ambiguity-check on "Spara" if/when one exists at the page level) still works.
   8. Tool log contains zero CSS selectors for steps 1–7.

2. **Unit tests** in `tests/unit/components/mcp-aria.test.ts`. The v1 25 tests stay. New tests:
   - `tab_order` returns elements in resolved tabindex order (positive first ascending, then 0 + native focusables in DOM order).
   - `landmarks` returns every landmark with `has_name` correctly set; `child_interactable_count` matches the count of interactables `ui_aria_list({ region: name })` would return.
   - `headings` returns levels for `<h1>`–`<h6>` and `[role="heading"][aria-level]`.
   - `read` returns reading-units in DOM order; headings carry level; interactables carry role + state.
   - `audit` produces findings for fixture pages embedding each of the six finding-kinds (one per kind); ranks severity correctly.
   - State surface: `aria-pressed="true"` → `pressed: true`; `aria-expanded="false"` → `expanded: false`; `aria-checked="mixed"` → `checked: 'mixed'`; `<input required>` → `required: true`. Each tested on a fixture element.

3. **Serialization round-trip test** (the gap the v1 smoke exposed). A new test that takes the output of `buildAria*Script(opts)` and evaluates it against a fixture document via the test environment's JS evaluator, then asserts equivalence with calling `runAriaQuery(...)` directly. Catches the class-of-bug that bit v1 twice (esbuild's `__name` helper, the `<main>` region-flooding) — anywhere the serialized form drifts from the directly-called form. Every mode gets a round-trip case.

4. **Skill + docs update.** `.claude/skills/slaktforskning-mcp-dev/SKILL.md` gains an "ARIA-first navigation" section covering the seven tools, when to prefer each, and the seven-step accessible-name priority. `docs/MCP.md` adds seven dev-tool rows.

## Failure modes / RCA reference

Day-one shakedown (2026-05-11) and the v1 ship of this plan together produced four classes of bug worth not repeating:

1. **CSS-selector navigation is brittle.** Settled by the v1 ship — `ui_aria_invoke` exists, ambiguity-with-candidates errors are the norm.
2. **The app's own a11y has real gaps the tool surfaces *only because the tool fails*.** Settings chip strip uses `role="button"` instead of `role="tab"`; modal form inputs aren't `<label for=>`-bound; `<main>` has no `aria-label`. Each becomes invisible until someone asks the tool for it. v2's `ui_aria_audit` is the proactive surface for this — and a separate plan file (`docs/plans/2026-05-11-app-a11y-gaps.md`) tracks the app-side fixes after this lands.
3. **Tests can pass while production fails.** v1's 25 unit tests exercised `runAriaQuery` *directly*; the production path is `.toString() → /eval`. Two bugs (esbuild's `__name` helper added inside the function body, the `<main>` region-flooding) only manifested in the serialized form. v2 adds a serialization round-trip test that evaluates `buildAria*Script(opts)` output against JSDOM — any drift between direct-call and serialized form fails the test.
4. **Region resolution was over-eager.** v1's `regionFor` returned `<main>`/`<header>`/`<aside>` even without `aria-label`, falling back through the accessible-name priority to the entire landmark's text content. The fix (only count a landmark as a *named* region when it has an explicit name) lives in v2's region-resolution refactor and is the basis for `ui_aria_landmarks`' `has_name` field.

## Tasks

### Task 1 (v1 — shipped): `ui_aria_list` and `ui_aria_invoke`

- [x] Resolver function in `src/mcp/tools/dev/ui-aria-script.ts` with 7-step accessible-name priority.
- [x] Region-resolution helper.
- [x] `ui_aria_list` + `ui_aria_invoke` registered in `src/mcp/tools/dev/ui.ts`.
- [x] Ambiguity / no-match / value-for-non-input error shapes.
- [x] 25 unit tests in `tests/unit/components/mcp-aria.test.ts`.
- [x] `__name` shim in the serialized script (esbuild interaction caught at smoke time).
- [x] Live smoke validated `ui_aria_list({ role: 'link' })` + `ui_aria_invoke({ name: 'Inställningar', role: 'link' })` + ambiguity error against the running app.

### Task 2 (v2): Expand the resolver to TTS parity

- [x] **Refactor region resolution** — only `[role="dialog"]`, `[role="region"][aria-label]`, `<section aria-label>`, and any landmark with `aria-label` count as a *named* region. Bare `<main>`/`<header>`/`<aside>`/`<section>` without a name = not a region.
- [x] **Add `state` to every result** — emit `pressed` / `expanded` / `selected` / `checked` / `current` / `busy` / `invalid` / `required` as optional fields when their ARIA attributes are set or when the native HTML state is truthy.
- [x] **Add mode `'tab_order'`** — walk focusables (`a[href]`, `button`, `input`, `select`, `textarea`, `[tabindex]:not([tabindex="-1"])`, `[role][tabindex]`); resolve order (positive `tabindex` first ascending, then `tabindex=0` + natively focusable in DOM order); return each with name + role + region + state + `tab_index`. Optional `region` filter.
- [x] **Add mode `'landmarks'`** — collect `<main>`, `<nav>`, `<header>`, `<footer>`, `<aside>`, `<section>`, `[role="region"|"main"|"navigation"|"banner"|"complementary"|"contentinfo"|"search"|"form"|"dialog"]`. Return `{ role, name, has_name, tag, child_interactable_count, region (parent landmark name) }` per landmark.
- [x] **Add mode `'headings'`** — `<h1>`–`<h6>` + `[role="heading"][aria-level]`. Return `{ level, text, region, tag }` per heading.
- [x] **Add mode `'read'`** — given `opts.region`, walk that region's descendants in DOM order; emit `{ kind: 'heading', level, text }` / `{ kind: 'paragraph', text }` / `{ kind: 'list_item', text }` / `{ kind: 'interactable', name, role, state }` units. If no region given, read from `<body>` (the whole document).
- [x] **Add mode `'audit'`** — walk the view (or scoped region), produce an array of `{ kind, severity, tag, role?, region?, hint }` findings for each of the six finding-kinds. Hints are static strings keyed by `kind`.

### Task 3: Wire each mode as its own MCP tool

- [x] Register `ui_aria_tab_order` in `src/mcp/tools/dev/ui.ts` — params: optional `region`, optional `limit` (default 100, max 500).
- [x] Register `ui_aria_landmarks` — no params. Returns every landmark.
- [x] Register `ui_aria_headings` — optional `region`. Returns every heading (in region if given).
- [x] Register `ui_aria_read` — optional `region`. Returns reading-units in DOM order.
- [x] Register `ui_aria_audit` — optional `region` to scope. Returns findings.
- [x] Each tool's description follows the prose style of the existing `dev/ui.ts` tools (sentence-form, one paragraph max, no emojis, explicit on when to prefer this tool over the alternatives).

### Task 4: Tests

- [x] **Serialization round-trip test scaffolding.** Add a helper that takes a `buildAria*Script(opts)` output, evaluates it against a JSDOM document, and returns the result. Use it to assert *the serialized form* produces the same output as the directly-called function for every mode. This is the test class that would have caught both v1 production bugs.
- [x] **Per-mode tests.** One test block per mode covering happy path + at least one edge case. Spec coverage matches Verification §2.
- [x] **State surface tests** on a fixture with mixed `aria-pressed` / `aria-expanded` / `aria-checked="mixed"` / `<input required>` elements.
- [x] **Audit-finding tests** — one fixture per finding-kind, asserting the audit surfaces exactly that finding with the right severity + hint.
- [x] `npx vitest run` passes with no regression vs floor (3950 passed / 112 skipped before this Task; expect +30–50 new tests).

### Task 5: Live smoke + skill + docs/MCP.md

- [x] Restart the dev MCP. Run the seven-step Verification §1 flow. Tool log captured; assert zero CSS selectors.
- [x] `ui_aria_audit()` against the running app surfaces (at minimum) the three real bugs the v1 smoke caught: Settings chip strip without `role="tab"`, modal inputs without label associations, unnamed `<main>`.
- [x] Update `.claude/skills/slaktforskning-mcp-dev/SKILL.md` with the "ARIA-first navigation" section covering the seven tools.
- [x] Add seven dev-tool rows to `docs/MCP.md`, each one paragraph with cross-link to the others (e.g. "see `ui_aria_audit` for finding things this tool can't address").
- [x] Write a small follow-up plan file `docs/plans/2026-05-11-app-a11y-gaps.md` capturing the three app-side a11y findings as a separate work-stream.

## Self-review checklist

- [x] Plan opens with user goal in user-recognizable language.
- [x] Scope enumerates every same-shaped surface (the resolver and all seven tool registrations are in `src/mcp/tools/dev/ui.ts` + `src/mcp/tools/dev/ui-aria-script.ts`).
- [x] Verification observes user-observable behavior — an agent walks the app the way a TTS user does.
- [x] Failure-modes section cites the four specific bug classes the smoke exposed.
- [x] All Task 2–5 checkboxes ticked; Task 1 already ticked from v1.
- [x] Live smoke ran end-to-end; tool log free of CSS selectors.
- [x] Plan `git mv` to `docs/plans/archive/`.
- [x] Minor version bump in `package.json` — `0.252.0 → 0.253.0` (new agent-facing capability, even though dev-only).
- [x] `## Unreleased` entry in `CHANGELOG.md` summarising the seven tools and the audit's role.
- [x] Append archive entry to `docs/plans/archive/PLAN.md`.
- [x] Follow-up plan `docs/plans/2026-05-11-app-a11y-gaps.md` exists and is in `docs/PLAN.md` as `[planned]`.
- [x] Commit `chore: archive completed aria-mcp-tools`.

## Tasks discovered during execution

- v1 → v2 scope expansion mid-execution: user observed that "screen-reader-inspired CSS selectors" wasn't enough; moved to TTS-parity surface. Plan rewritten in place 2026-05-11 to reflect new scope. Existing v1 work preserved as Task 1.
- Serialization round-trip test class added to Task 4 — would have caught the two v1 production-only bugs (`__name` undefined, `<main>` region-flooding) before live smoke.
- Region resolution refactored mid-execution — bare `<main>`/`<header>` without `aria-label` no longer counts as a named region. Same change underpins `ui_aria_landmarks`' `has_name` field.
