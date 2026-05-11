# ARIA-driven dev MCP tools (`ui_aria_list` + `ui_aria_invoke`)

> Subagent dispatch: see `.claude/skills/subagent-handoff/SKILL.md`.

## User goal

When I (or any agent) drive the running app via the dev MCP, I find and click things the same way a screen-reader user does — by accessible name, not by guessing CSS selectors. Today the dev MCP's `ui_click` / `ui_fill` / `ui_get_dom` all take a CSS selector. That works until the selector goes stale, the class name changes, or two elements share the same shape and we have to fall back to `[...nodeList].find(n => n.textContent === '...')` scaffolding. We hit this twice in the 2026-05-11 shakedown — finding the "Länkregler" Settings tab needed text-match scaffolding, and the "click the name row in PersonPanel" attempt clicked the right CSS class but the wrong behavior (the row's handler wasn't what the agent thought it was).

The Vue app already curates accessibility metadata via the `v-narrate` directive (consumed by the screen-reader mode) and standard `aria-label` / `aria-labelledby` / `<label for>` attributes. The agent should be able to read that surface directly: "list every interactable in the current view with its accessible name and role", "click the one named 'Länkregler'", "fill the input labelled 'E-post'". When two elements share a name (multiple "Spara" buttons, one per nested modal level), the tool reports the ambiguity and demands disambiguation rather than silently picking the first match — that silent-first-match behavior is exactly the bug class CSS selectors keep producing.

## Scope

Two new tools in `src/mcp/tools/dev/ui.ts`:

- `ui_aria_list` — returns every interactable in the renderer with its computed accessible name, ARIA role, surrounding region (the named region or modal it belongs to), and a small set of state flags (disabled, hidden). Optional `region` filter scopes to one region/modal. Optional `role` filter (`'button' | 'link' | 'tab' | 'textbox' | 'searchbox' | 'checkbox' | 'combobox' | 'radio' | 'menuitem'`). Optional `limit` (default 100, max 500).
- `ui_aria_invoke` — invokes an element by accessible name. `name` is required; `role` and `region` are optional disambiguators. For `textbox` / `searchbox` / `combobox` roles, accepts an additional `value` argument and sets the input value with the same native-setter + `input`/`change`-event dance `ui_fill` already uses. Returns the invoked element's pre-invoke state for the agent to confirm.

Both tools route through the existing `runScript` → `POST /eval` flow — same pattern as every other `dev/ui.ts` tool. **No Tauri Rust changes.** No new HTTP endpoints. The accessible-name computation lives in renderer-side JS injected via `runScript`.

Accessible-name resolution priority (in renderer-side JS, first match wins):

1. The text the app authored via `v-narrate` — the directive stores narration text on a WeakMap; read directly from that source so we're consistent with what the screen-reader mode would announce. This is the app's curated truth.
2. `aria-label` attribute.
3. `aria-labelledby` referent's `textContent`.
4. Associated `<label for>` text (for inputs with an `id`).
5. The element's own visible `textContent` (trimmed).
6. `placeholder` (for inputs without any of the above).
7. `title` attribute.

If none of the seven produce a non-empty string, the element is omitted from `ui_aria_list` (not invocable by name — the agent would have to fall back to `ui_click` with a selector, by design).

Region resolution: walk ancestors looking for `[role="dialog"]` (modal), `[role="region"][aria-label]`, `<section aria-label="...">`, `<header>`, `<aside>`, `<main>`. First hit wins; `region` is its accessible name (computed via the same priority).

Both tools are additive — they live alongside `ui_click`, `ui_fill`, `ui_get_dom`, `ui_eval`. The CSS-selector tools stay; some debugging (computed styles, raw DOM inspection, layout sanity) is genuinely selector-shaped and not about user-facing affordances.

### Scope deviations

- **Don't reimplement the W3C accessible-name-computation spec end-to-end.** The 7-step priority above covers every interactable in this app today. The spec has corner cases (e.g. `<fieldset><legend>` for grouped inputs, `<table><caption>`, `<svg><title>`) we don't currently use. If a corner case shows up, extend the priority list; don't ship the whole algorithm preemptively.
- **Don't add an ARIA tree-shape tool.** A flat list with a `region` field gives the agent enough context. A tree would expose the implementation hierarchy, not the user's mental model.
- **Don't silently pick the first match on ambiguity.** Ambiguity is real signal — two buttons named "Spara" on screen means the agent has to think about which one. Silent first-match would re-introduce the exact bug class CSS selectors caused.
- **Don't migrate existing agents/skills off `ui_click`.** Additive. Agents pick the tool that fits the task. The skill update (Task 3) sets the preference; it doesn't deprecate anything.
- **Don't add a Tauri Rust command.** The accessible-name computation is renderer-side JS by design — it can see the live DOM, the WeakMap on the `v-narrate` directive, and computed `display: none` / `visibility: hidden` / `aria-hidden` state. Doing it Rust-side would mean serializing the entire AX tree across the bridge, which is exactly what we don't want.

## Verification

User-observable outcome (matches §1): an agent can walk through the four-tab Settings view, open the Länkregler tab, open `+ Regel`, fill the rule's fields, and save — using only `ui_aria_list` + `ui_aria_invoke` calls. No CSS selectors anywhere in the agent's tool log for that flow.

1. **Live smoke (goal-anchor).** In a fresh session against the running app, with the dev MCP restarted to pick up the new tools, an agent reproduces the shakedown flow that was brittle before:
   1. `ui_aria_list({ role: 'tab' })` → confirm "Länkregler" appears.
   2. `ui_aria_invoke({ name: 'Länkregler', role: 'tab' })` → tab switches.
   3. `ui_aria_list({ region: 'Länkregler' })` → confirm "+ Regel" appears with role `'button'`.
   4. `ui_aria_invoke({ name: '+ Regel' })` → modal opens.
   5. `ui_aria_list({ region: '<modal aria-label or title>' })` → confirm the form's inputs by their labels.
   6. `ui_aria_invoke({ name: 'Namn', role: 'textbox', value: 'Wikipedia (sv)' })` → input receives an `input` event, Vue picks up the value.
   7. `ui_aria_invoke({ name: 'Spara' })` — but two "Spara" buttons exist (the modal and the page footer). The tool errors with the documented ambiguity shape, listing both candidates with their regions.
   8. `ui_aria_invoke({ name: 'Spara', region: '<modal name>' })` → modal closes, the new rule appears in the Länkregler table.

   The tool log for this flow contains zero CSS selectors and zero `document.querySelector` calls.

2. **Unit test** in `tests/unit/mcp.test.ts` mounting a fixture page with curated `v-narrate` / `aria-label` / `<label>` shapes, asserting:
   - `ui_aria_list` returns every interactable with the expected accessible name.
   - The priority order is honored (v-narrate beats `aria-label`, which beats `aria-labelledby`, which beats `label[for]`, which beats text content, which beats placeholder, which beats `title`).
   - `role` filter narrows the result set.
   - `region` filter narrows the result set.
   - Disabled and `aria-hidden` elements are omitted by default; included when `include_disabled: true` / `include_hidden: true`.
   - `ui_aria_invoke` clicks the single match; fills `textbox` roles when `value` is given; errors on ambiguous and missing matches with the documented shape (lists candidates on ambiguity).

3. **Skill update.** `.claude/skills/slaktforskning-mcp-dev/SKILL.md` gains a "ARIA-first navigation" section (2–3 paragraphs): when to reach for these tools, why they're preferred over CSS-selector tools, the seven-step accessible-name priority. Future agents reach for ARIA tools first.

## Failure modes / RCA reference

Two specific incidents from the 2026-05-11 shakedown are the proximate cause for this plan:

- **Länkregler tab.** The agent tried `[...document.querySelectorAll('button, [role="tab"], .tab-btn')].find(...)` — the actual chip was a `button.chip-btn`, not in any of those three selectors. The agent eventually found it via a broader search, but only after two failed attempts. With `ui_aria_invoke({ name: 'Länkregler', role: 'tab' })` it would have hit first try, *and* it would have hit even after a future refactor renames `chip-btn` to anything else (because the accessible name and role are CSS-class-agnostic).
- **PersonPanel name row.** The agent succeeded at "click a `.clickable-row` containing 'Bengt Gunnar Persson'" but the click did not open the name-edit modal — the row's actual handler was a selection toggle, not a modal opener. The CSS class said "clickable" but the behavior said "select". With `ui_aria_invoke({ name: 'Bengt Gunnar Persson, bytt t Sareld' })` the tool would have either succeeded against the modal-opener (if one existed) or returned `No interactable named "…"` against the row (because a row that only toggles selection probably doesn't have a button-shaped accessible role).

The class-of-bug both share: **CSS selectors describe layout; they don't describe the user-facing affordance.** Accessible names describe what the user thinks they're clicking. That's what the agent actually means when it says "click the Länkregler tab" — not "click the third child of the `.tab-bar` div".

This plan does not promise to eliminate every CSS-selector failure (some debugging is selector-shaped by design — checking computed styles, inspecting layout). It promises that for *agent navigation tasks*, accessible name is the right primitive, and the dev MCP exposes it.

## Tasks

### Task 1: Implement `ui_aria_list` and `ui_aria_invoke`

- [ ] Write the accessible-name resolution function in renderer-side JS (the seven-step priority list above). Embed as a string template in `src/mcp/tools/dev/ui.ts` — same shape as `ui_get_dom`'s extraction body. Cover the `v-narrate` WeakMap lookup explicitly (read the directive's storage key; default to empty string if unmounted).
- [ ] Write the region-resolution helper (ancestor walk for `[role="dialog"]`, `[role="region"][aria-label]`, `<section aria-label>`, `<header>`, `<aside>`, `<main>` — first hit wins, region name computed via the same accessible-name priority).
- [ ] Register `ui_aria_list` with parameters:
  - `region?: string` — scopes to one region by accessible name.
  - `role?: string` — filter by ARIA role.
  - `limit?: number` — default 100, max 500.
  - `include_disabled?: boolean` — default `false`.
  - `include_hidden?: boolean` — default `false` (excludes `aria-hidden`, `display: none`, `visibility: hidden`).
  Returns `{ matches: Array<{ index, name, role, region?, tag, disabled, hidden }>, total }`.
- [ ] Register `ui_aria_invoke` with parameters:
  - `name: string` — required.
  - `role?: string` — disambiguator.
  - `region?: string` — disambiguator.
  - `value?: string` — only valid for `textbox` / `searchbox` / `combobox` roles; throws on others.
  Returns `{ invoked: { name, role, region?, tag }, value_set?: string }`.
- [ ] On ambiguity: `throw new Error('Multiple matches for "<name>" — disambiguate with role or region. Candidates: [{name, role, region, tag}, ...]')`. The candidates list is serialized into the error message so the agent sees it directly (MCP tool errors are surfaced to the agent verbatim).
- [ ] On no match: `throw new Error('No interactable named "<name>" in <region|"current view">. Try ui_aria_list to see what is available.')`.
- [ ] On `value` passed for a non-input role: `throw new Error('value is only valid for textbox, searchbox, or combobox roles; got <role>.')`.
- [ ] Tool descriptions follow the prose style of the other `dev/ui.ts` tools (sentence-form, one paragraph max, no emojis, explicit about when to prefer the ARIA tools over CSS-selector tools).

### Task 2: Unit tests in `tests/unit/mcp.test.ts`

- [ ] Mount a JSDOM fixture page covering:
  - An element with `v-narrate` text only.
  - An element with `aria-label` only.
  - An element with `aria-labelledby` pointing to a sibling.
  - An `<input>` with an associated `<label for>`.
  - A `<button>` with text content only.
  - An `<input>` with `placeholder` only.
  - An element with `title` only.
  - A "mixed" element with all seven sources populated — used to assert priority order.
  - Two buttons with the same accessible name "Spara" but different regions.
  - A button inside a `[role="dialog"]` modal.
  - A `disabled` button.
  - An `aria-hidden="true"` button.
  - A `display: none` button.
- [ ] Assertions:
  - `ui_aria_list` returns every visible-and-enabled interactable with its expected name and role.
  - Priority order on the mixed element resolves to the v-narrate text.
  - `role: 'button'` filter excludes inputs and links.
  - `region: '<modal name>'` filter returns only the modal's children.
  - `include_disabled: false` excludes the disabled button; `: true` includes it.
  - `include_hidden: false` excludes the aria-hidden and display-none buttons; `: true` includes them.
  - `ui_aria_invoke({ name: '<unique button name>' })` dispatches a `click` event the test observes.
  - `ui_aria_invoke({ name: 'Spara' })` throws the documented ambiguity error containing both candidates.
  - `ui_aria_invoke({ name: 'Spara', region: '<modal name>' })` clicks the modal's button.
  - `ui_aria_invoke({ name: 'Search', role: 'textbox', value: 'Sareld' })` sets the input's value and fires `input` + `change` events.
  - `ui_aria_invoke({ name: 'Nonexistent' })` throws the documented no-match error.
- [ ] `npx vitest run tests/unit/mcp.test.ts` passes; no regression in the rest of the suite.

### Task 3: Live smoke + skill update + docs

- [ ] Restart the dev MCP. Run the eight-step flow from Verification §1 against the running app. Confirm the tool log contains zero CSS selectors for the entire flow. If any step fails, fix it in Task 1 — don't paper over with a CSS fallback.
- [ ] Add an "ARIA-first navigation" section to `.claude/skills/slaktforskning-mcp-dev/SKILL.md`. Three short paragraphs: (a) when to reach for `ui_aria_list` / `ui_aria_invoke` (any task that says "click X" / "fill Y by what the user sees"); (b) the seven-step accessible-name priority and how to think about it; (c) when the CSS-selector tools are still right (computed styles, layout debugging, the `ui_get_dom` raw-shape probe).
- [ ] Add two rows to `docs/MCP.md` under the dev-tools table; one for each new tool, citing the shakedown incidents the tools exist to prevent.

## Self-review checklist

- [ ] Plan opens with user goal in user-recognizable language (no mechanism-first phrasing).
- [ ] Scope enumerates every same-shaped surface — `src/mcp/tools/dev/ui.ts` is the full set (no other dev MCP tool files).
- [ ] Verification observes user-observable behavior (an agent walks the running app without CSS selectors), not just `vitest` green.
- [ ] Failure-modes section cites the specific shakedown incidents this plan exists to prevent.
- [ ] Live smoke ran end-to-end against the running app; tool log captured and free of CSS selectors.
- [ ] All checkboxes in this plan ticked.
- [ ] Plan `git mv` to `docs/plans/archive/`.
- [ ] Patch version bump in `package.json` (`0.252.x → 0.252.(x+1)`) — dev-only new tools, no user-visible behavior.
- [ ] `## Unreleased` entry in `CHANGELOG.md` summarising the new tools and the failure modes they retire.
- [ ] Append a Tauri-style archive entry to `docs/plans/archive/PLAN.md`.
- [ ] Commit `chore: archive completed aria-mcp-tools`.
- [ ] Merge to main. **Workflow note:** this is plan-driven by virtue of having a plan file, but it's a single-day three-task plan with no parallelism. Direct work on `main` is acceptable per the CLAUDE.md "small fixes → main is fine" provision; a worktree is allowed but adds friction without payoff here. Pick whichever fits the session.

## Tasks discovered during execution

(Empty until execution starts.)
