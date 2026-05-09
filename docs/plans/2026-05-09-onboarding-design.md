# Design: First-time onboarding (empty-state coaching + first-encounter coachmarks)

**Date:** 2026-05-09
**Status:** design — pending implementation plan
**Source:** Bengt Sareld feedback corpus (`docs/plans/BENGT.md` archived; recovered from commit `beb318be`); 7 Ben-named plans in `docs/plans/archive/`
**Effort:** M — large mechanical surface area (every section in every panel) + a small enumerated set of coachmarks

---

## User goal

A first-time genealogist opening Släktforskning understands what each panel section, list, and chart is *for* without having to ask, and discovers the non-obvious primary action for the few surfaces where the gesture isn't visible.

In Bengt's words ("hur byter jag fokus?", "kan man lägga till mediatext? Jag hittar inte den möjligheten", "är det meningen att appen ska skapa en kopia... jag hittar ingen sådan mapp"), this is the difference between an app that explains itself in place and one the user has to email the developer to learn.

Concretely, after this lands:
- Empty sections never show only a blank rectangle. Each empty section says, in one sentence, *what it is for* and offers its primary action.
- Four named first-encounter blockers (chart focus switch, media reorder, face tagging, media file storage) auto-explain themselves the first time they're relevant.
- The user can leave a populated app without having seen any coaching they no longer need.

---

## Scope

### Empty-state coaching — full pattern scope

Every section, list, and table in the renderer that can be empty receives a Purpose-stated empty-state component. **Default = all of them.** The mechanism is a small upgrade to the existing `src/renderer/components/ui/SectionEmpty.vue` (which already takes `message` + optional `actionLabel`) so it accepts a Purpose-style sentence and renders a primary CTA.

Surfaces in scope (enumerated to satisfy Rule A2 in `.claude/rules/plans.md`):

**Per-panel sections** (10 panels × multiple sections):
1. `PersonPanel` — Names, Identifiers, Relationships, Events, Timeline, Life Map, Media, Sources, Notes, Groups, Research Tasks, Quality Checks
2. `PlacePanel` — Persons (derived), Events (derived), Place History, Children Places, Media, Quality Checks
3. `SourcePanel` — Citations (derived), Repositories, Media, Notes
4. `RelationshipPanel` — Events, Notes (relationship panels are accessed from PersonPanel → Relations row)
5. `GroupPanel` — Members, Linked Persons, Linked Sources, Notes
6. `ResearchTaskPanel` — Linked Persons, Notes
7. `MediaPanel` — Linked Persons, Linked Places, Linked Events, Face Tags, Notes
8. `ReportPanel`, `WebsitePanel`, `ExportOptionsPanel` — these are forms/configuration, not lists; **see deviations below**

**List views** (every paginated list):
- `PersonsView` (when total = 0) → "Lägg till din första person" CTA
- `PlacesView` → CTA-less coaching (places are derived from events)
- `SourcesView`, `MediaView`, `GroupsView`, `ResearchTasksView`, `RepositoriesView` (if exists) → primary CTA
- `QualityView`, `DuplicatesView`, `SearchView` → "no issues found" / "no duplicates found" / "type a query to search" framing
- Map (`PlacesView` map tab, `PersonPanel` Life Map) — already has a floating pill overlay per `renderer.md`; align its copy with the Purpose statement

**Pickers** (when their data set is genuinely empty on a fresh DB):
- `PersonPicker`, `PlacePicker`, `SourcePicker`, `GroupPicker` — empty-state inside the picker dropdown when the DB has zero of the entity. Coaching here is "this DB has no <entity> yet — pick + Skapa to add the first one."

### Coachmarks — enumerated short list

Coachmarks are precise, anchored hints that fire once per installation. The list is intentionally small; new coachmarks only enter scope after a user-confirmed need.

1. **Hourglass focus-switch** (Bengt #25) — anchor on the Hourglass focus box on first open. Copy: *"Klicka för att titta på en person. Dubbelklicka för att flytta fokus."* Auto-dismiss when the user double-clicks any person in the chart.
2. **MediaSection reorder** (Bengt media Round 1) — anchor on the drag-handle column when a `PersonMediaSection` (or `EntityMediaSection`) first renders with ≥2 media. Copy: *"Dra för att sortera om — t.ex. barnbilder först, äldre bilder sist."* Auto-dismiss on first reorder.
3. **MediaModal face-tagging** (Bengt "Re: Rapport your ancestors") — anchor on the image canvas inside `MediaModal` the first time the face-tag panel is active. Copy: *"Klicka och dra på bilden för att markera ett ansikte. Knyt sedan markeringen till en person."* Auto-dismiss on first marker drawn.
4. **First media attach** (Bengt #13b) — toast (not anchored coachmark) the first time `media:attach` succeeds. Copy: *"Filen kopieras in i mappen `<dbname>-media/` så att den följer med när du flyttar databasen."* Single show; no auto-dismiss needed.

### Scope deviations (explicit, per `.claude/rules/plans.md`)

- **`ReportPanel`, `WebsitePanel`, `ExportOptionsPanel`**: these are configuration forms, not lists. They do not receive `SectionEmpty` coaching. Reason: they cannot be "empty" in the sense the pattern targets — they're either valid (preview renders) or invalid (validation errors shown elsewhere). A different first-encounter affordance (a one-line description of what each report/export *produces*) is in scope for a sibling plan if needed; not pulled into this one to keep the plan focused.
- **Header sections of panels** (`PersonPanel` header, `PlacePanel` header — the strip showing name + sex + dates + portrait): not list-shaped; not in scope. The coachmark roster handles header-level discovery (chart focus).
- **Quality / Duplicates "no issues" states**: framed as success ("Inga problem hittade — bra jobbat!") rather than coaching ("This is what quality checks are for"). The Purpose framing applies *before* the user has any data; once they have data and zero issues, success framing is right.
- **Settings sub-pages**: settings panels (Theme, Database, Gazetteers, Link Rules) have their own first-time framing today and are out of scope. A future audit can fold them in.
- **Modals** (other than the four coachmarked above): not in scope as a class. Modal-level coaching tends to clutter modals that are already dense. The four named coachmarks address Bengt's concrete confusion in modals; the rest is left for follow-up if real need surfaces.

If a panel section in the renumerated list above genuinely cannot adopt the new pattern (e.g. its empty state is *already* a meaningful read-out, not a void), document it inline with `<!-- Empty-state coaching N/A: <specific reason> -->` and call it out in the plan. "Awkward" is not a reason.

---

## Architecture

### Composable: `useFirstEncounter(key: string)`

Pure renderer-side composable backed by `electron-settings` (the `settings.json` file written by `src/main/settings.ts`). Adds an `onboarding: { seen: Record<string, true> }` slice.

```ts
// src/renderer/composables/useFirstEncounter.ts
export function useFirstEncounter(key: string) {
  const seen = ref<boolean>(false);
  // load on mount, expose markSeen() that flips seen=true and persists
  // keys are namespaced: 'coach.hourglass.focus', 'toast.media.firstAttach', etc.
}
```

Rationale for `electron-settings` vs SQLite: Bengt's testing pattern was "tiny test DB → real DB". Per-DB persistence would re-fire every coachmark on database switch — wrong. Per-installation is the right scope. Static-SPA exports never see coaching (they're read-only), so the static build short-circuits `useFirstEncounter` to always-seen.

### Component: `SectionEmpty` (upgraded)

Existing `src/renderer/components/ui/SectionEmpty.vue` already accepts `message` and optional `actionLabel`. Extend with:
- `purposeKey?: string` — i18n key for the Purpose sentence (preferred over raw `message`); render as a slightly larger, more-visible block when present
- `secondaryHint?: string` — optional second line for context (e.g. "Birth name is added automatically when you set a birth date")
- `cta` slot — for cases where the primary action isn't a single button (e.g. an inline picker)

The default visual stays compact for sections that have many empties stacked; the Purpose-keyed variant is taller and more readable, used for the canonical empty-state of a section. Both routes through the same component.

### Component: `Coachmark`

New component `src/renderer/components/ui/Coachmark.vue`:

```vue
<Coachmark
  seen-key="coach.hourglass.focus"
  :anchor-el="focusBoxEl"
  placement="below"
  @dismiss="..."
>
  {{ $t('onboarding.hourglass.focus.tip') }}
</Coachmark>
```

- Renders `null` when `useFirstEncounter(seenKey).seen.value === true`
- Uses Floating UI (or plain absolute positioning relative to the anchor's bounding rect) to point at the anchor element
- Has a small "Förstått" / "Got it" button + an inconspicuous `×`
- Supports `auto-dismiss-on` prop — a function that returns true when the gestured action has happened, called on every relevant event (e.g. dblclick on chart node)
- Z-index above panel content but below modals (use `--z-coachmark` token)
- ARIA: `role="status"` + `aria-live="polite"` so screen readers announce it; per `a11y` skill conventions

### Component: `OnboardingToast`

For the "first media attach" message and any future single-shot info toast: reuse the existing toast plumbing (`src/renderer/composables/useToast.ts` — verify path during implementation) wrapped in `useFirstEncounter`. No new component needed.

### i18n keys

New namespace `onboarding.*`:
```
onboarding.empty.<surfaceKey>.purpose      # e.g. onboarding.empty.personEvents.purpose
onboarding.empty.<surfaceKey>.cta          # e.g. onboarding.empty.personEvents.cta
onboarding.coach.<key>.tip                 # e.g. onboarding.coach.hourglass.focus.tip
onboarding.coach.<key>.dismiss             # e.g. onboarding.coach.hourglass.focus.dismiss
onboarding.toast.<key>.body                # e.g. onboarding.toast.media.firstAttach.body
```

Source of empty-state copy: the **Purpose sentences already curated in `docs/UX_INVENTORY.md`** are the canonical English text. They are translated to Swedish at the same time the i18n key is added. For sections currently marked `Purpose: TBD` in the inventory, the Purpose is written first (per the `ux-intent-mapping` skill — Purpose comes from the user, not from inferred code reading); only then is the i18n key populated. This keeps the doc and the empty-state copy in lockstep.

### Settings file shape

```json
{
  "lastDatabase": "...",
  "recentDatabases": [],
  "onboarding": {
    "seen": {
      "coach.hourglass.focus": true,
      "toast.media.firstAttach": true
    }
  }
}
```

A "Reset onboarding" button under `SettingsView` → general lets a user clear `onboarding.seen` (useful for demoing the app, and for users who want a refresher).

---

## Verification (per `.claude/rules/plans.md`)

The user-observable outcome (matches §User goal):

1. **Manual smoke**: launch the app against a freshly-created empty database. Walk every paneled view and every list view. Every empty section shows a Purpose sentence + primary CTA matching its `UX_INVENTORY` entry. Add an item; the coaching disappears for that section. Delete the last item; the coaching returns.
2. **Coachmark walkthrough**: with a fresh `settings.json` (delete the `onboarding.seen` key, or use the "Reset onboarding" button), open the Hourglass — coachmark appears anchored on the focus box. Double-click any person — coachmark dismisses, focus moves. Coachmark stays dismissed across app restart.
3. **Test coverage**:
   - Unit tests for `useFirstEncounter` (persistence, in-memory state, reset)
   - Component tests for `SectionEmpty` Purpose-keyed mode (renders Purpose + CTA, emits action)
   - Component test for `Coachmark` (renders/hides on seen state, anchors to provided element, dismisses on auto-dismiss-on trigger)
   - One integration test per coachmark: mount the host view, assert coachmark visible, simulate the gestured action, assert dismissed
   - A `panel-empty-state-coverage.test.ts` that mounts each section component with empty data and asserts a `SectionEmpty` (or documented-deviation comment) is present — analogous to `panel-cta-conventions.test.ts`. **This test is the mechanical guard against a future panel section being added without empty-state coaching.**
4. **No regressions**: existing `panel-cta-conventions.test.ts`, `panel-layout-consistency.test.ts`, and the WCAG contrast tests stay green. Every new copy string lands in both `sv.ts` and `en.ts`.

Hygiene-only checks (lint, typecheck, "function exists") do **not** count toward §User-goal verification per `.claude/rules/plans.md`.

---

## Failure modes / RCA reference

This plan addresses confusion patterns that have already shipped to a beta tester (Bengt Sareld) and were not caught by tests, lint, or `panel-cta-conventions.test.ts`. Specific prior surfaces:

- **#25 chart focus** — shipped through every quality gate. The fix mechanism (double-click) was already in the code; the user simply could not discover it. Coachmark addresses discovery.
- **#12 media caption** — feature was present; the user could not find it. The current empty-state would have surfaced it via Purpose copy ("...write captions for media...").
- **#13b media file storage** — the side effect (file copy into `<dbname>-media/`) is invisible. The user reasonably feared the app was discarding the file. Toast addresses the invisibility.
- **"Re: Rapport your ancestors" face tagging** — the user clicked, saw an editable-looking row, typed nothing happened. The UI's mode (click on canvas to mark a region) was undiscoverable. Coachmark addresses it.

Rules this plan must respect during implementation:
- **`.claude/rules/plans.md`** — user goal first, full scope enumerated above, deviations explicit, verification by user-observable outcome.
- **`.claude/rules/renderer.md`** "CTA fulfillment check" — every CTA inside an empty-state must pass all five steps (promise, wiring, context lift, lifecycle parity, reactivity). The host entity ID flows into whatever modal/picker the CTA opens — this is the same regression that produced `PlacePanel + Add person` orphans.
- **`.claude/rules/renderer.md`** "Pattern migrations are all-or-nothing" — every section in §Scope ships with empty-state coaching (or a documented deviation). Half-migration is anti-consistency.
- **i18n strict**: every new string in both `sv.ts` and `en.ts`, no inline Swedish or English in templates.
- **Design tokens**: any new visual style uses tokens from `src/renderer/styles/tokens.css`. WCAG AAA in high-contrast mode is regression-tested.

---

## Out of scope

- Modal-level coaching beyond the four named coachmarks
- Settings page first-time hints (separate audit)
- An interactive guided tour ("step 1 of 7") — empty-state + coachmark is the contract; tours are a different product decision
- Localization beyond Swedish + English
- Per-user (multi-user installation) onboarding state — single-installation assumption matches today's app model
