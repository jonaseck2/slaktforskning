# Birth-Name Display + Quality Check

## User goal

Four user-observable outcomes:

1. **Display.** When a person has both a current name (e.g. married) and a separate birth name with a different surname, every name-rendering surface in the app shows them together as `Anna Andersson (f. Svensson)` in Swedish or `Anna Andersson (b. Svensson)` in English. The user never has to click into the name table to see what someone was born as — it's part of how their name reads.

2. **Configurable.** A global per-database toggle in Settings ("Show birth-name parenthetical in name displays") controls the default for every in-app surface. A per-report toggle in each keepsake report's option panel inherits the global default and lets the user override per print/export. Defaults to **on**.

3. **Inline-string detection.** When a user has typed `"Anna Andersson (f. Svensson)"` (or any equivalent — `(born …)`, `(b. …)`, `(född …)`, `(f. …)`) into a single given-name or surname field, a low-importance quality notice surfaces in `/quality` saying "This name appears to contain an inline birth name — consider splitting into separate name records." The user fixes it by hand via the existing name-edit modal. Nothing splits automatically.

4. **Round-trip.** A person with multiple `person_names` rows (birth + married, birth + alias, …) survives every export → re-import path with all rows intact. We verify with regression tests; we do not introduce any export that flattens the parenthetical `(f. ...)` form into a single string and then loses the structure on re-import.

## Scope

### Pattern 0 — option layer (Configurable goal)

The display behavior in Pattern 1 is **toggleable**, not hard-coded. Two layers, with the report layer inheriting from the global layer at mount time but free to override.

| Layer | Storage | Default | Where it's read |
|---|---|---|---|
| Global per-DB | `db_settings` key `display_birth_name_parenthetical` (`'1'` / `'0'`, treated as boolean) | `true` (i.e. row absent → on) | A `usePersonNameOptions()` composable backed by a Pinia store (`personNameOptions`) — initialized once on app boot via `window.api.db.getSetting`. Settings view writes via `window.api.db.setSetting` and updates the store synchronously. |
| Per-report | `reportConfig` Pinia store: one ref per keepsake report (`aLifeShowBirthNameParenthetical`, `aMarriageShowBirthNameParenthetical`, `lifeOnOnePageShowBirthNameParenthetical`, `photoAlbumShowBirthNameParenthetical`, `yourAncestorsShowBirthNameParenthetical`, `placeChronicleShowBirthNameParenthetical`, `familyInYearShowBirthNameParenthetical`) | Initialized to the global default at store creation; user overrides per report session | Each report's option panel; passed into `formatFullNameWithBirthName(...)` / `<PersonName>` as a prop in the report's templates. |

The name util signature accepts an explicit boolean — never reaches into a store itself:

```ts
formatFullNameWithBirthName(
  displayed: NameData,
  allNames: NameData[],
  options: { showBirthNameParenthetical: boolean; bornAbbrev: string }
): string
```

`<PersonName>` accepts `showBirthNameParenthetical?: boolean` (default `true`); it reads the i18n `bornAbbrev` itself via `useI18n`.

Settings UI: one checkbox row in `SettingsView.vue`'s "Defaults" tab labeled `settings.display.showBirthNameParenthetical` (sv: "Visa födelsenamn i parentes vid namn", en: "Show birth name in parenthesis after current name"). One sentence of helper text.

### Pattern 1 — name-display surfaces (Display goal)

Every call site that renders a person's full name today switches to a birth-name-aware variant when that person has a separate `birth` record with a different surname **and** the active option (global or per-report, per Pattern 0) is on. Full enumeration based on `grep formatFullName | formatPersonName | <PersonName`:

| Surface | File | Migrate? |
|---|---|---|
| Person panel header | `src/renderer/components/PersonPanel.vue` | Yes |
| Persons list (table) | `src/renderer/views/PersonsListTab.vue` | Yes |
| Search results | `src/renderer/views/SearchView.vue` | Yes |
| Linked persons section (events, citations, etc.) | `src/renderer/components/LinkedPersonsSection.vue` | Yes |
| Person relationships section | `src/renderer/components/PersonRelationshipsSection.vue` | Yes |
| Relationships list | `src/renderer/components/RelationshipsList.vue` | Yes |
| Person timeline | `src/renderer/components/PersonTimeline.vue` | Yes |
| Person picker (combobox) | `src/renderer/components/PersonPicker.vue` | Yes |
| HTML site export (renders) | `src/api/html_site/snapshot.ts` | Yes — driven by global toggle (HTML site export has no per-export form yet) |
| Reports — A Life, A Marriage, Life on One Page, Photo Album, Your Ancestors, Place Chronicle, Family in Year | `src/renderer/components/reports/*.vue` | Yes — each gets its own per-report toggle inherited from the global default (Pattern 0) |
| `<PersonName>` component | `src/renderer/components/PersonName.vue` | Yes — extend with optional `birthSurname` prop |
| Person names table (edit grid) | `src/renderer/components/PersonNamesTable.vue` | **No.** This view IS the per-record table; it must show each name verbatim, never compose them. |
| Chart boxes | `src/renderer/utils/chart-layout/measure.ts` | **No.** Space-constrained; `formatChartName` stays single-line. |
| `persons.ts` API (sort/normalize) | `src/api/persons.ts` | **No.** Server-side sort uses raw fields; rendering is client-side. |
| `undo_wrappers.ts` audit strings | `src/api/undo_wrappers.ts` | **No.** Audit log captures the raw record at mutation time, not a presentation form. |

**Scope deviations (the four "No"s above):** PersonNamesTable would corrupt its purpose if it composed names. Chart boxes have no room. `persons.ts` and `undo_wrappers.ts` are non-display contexts. Each is documented with a code comment at the call site.

### Pattern 2 — quality check (Inline-string goal)

One new check function in `src/api/checks/checks-quality.ts`, severity `notice`, code `LIKELY_INLINE_BIRTH_NAME`. Detects a `given_name` or `surname` value matching:

```
/(?:^|\s)\(\s*(?:born|b\.|född|f\.)\s+\S+/i
```

Returns one row per offending `person_names.id`. Surfaces in `/quality`; clicking the row routes to the person panel with the names section expanded. The user fixes by hand using the existing name-edit modal — no new "Split" affordance in this plan.

### Pattern 3 — export round-trip (Round-trip goal)

The four export paths and their expected behavior:

| Export | Multi-name handling today | Action |
|---|---|---|
| GEDCOM (`src/gedcom/exporter.ts`) | Iterates `getPersonNames(db, id)`, emits one `1 NAME` per record with `2 TYPE` for non-birth | Already correct. Add regression test: round-trip a person with `birth` + `married` records via exporter → importer, assert both rows exist. Also assert `name_change` round-trips (importer currently maps only `MARRIED|AKA|ALIAS|BIRTH` — extend mapping to include `NAME_CHANGE` if found missing). |
| Archive `.zip` (`src/api/archive_export.ts`) | Wraps GEDCOM exporter | Inherits GEDCOM fix. No separate test needed once GEDCOM round-trip test passes. |
| CSV (`src/api/csv_export.ts`) | Emits one row per person via `displayedNameIdSql` (single-row-flat by format) | **No change.** CSV is lossy by design. Document in a comment that CSV intentionally exports only the displayed name and re-importing CSV does not reconstruct multi-name history. Critically: do **not** bake the `(f. …)` parenthetical into the CSV cell — that would round-trip as a literal string back into a single-record name and trip our own quality check. |
| HTML site (`src/api/html_site/snapshot.ts` + renderer reports) | Renders via Vue components | Inherits Pattern 1. No-op for the snapshot itself; the rendering inherits the new display helper. |

**Scope deviations:** CSV is intentionally untouched (its format can't represent multi-name records). Documented inline.

## Verification

User-observable verification, in this order. None of these are "vitest passes" alone.

1. **Display + global toggle, smoke-check by user.** Open a database with a person who has separate birth + married names with different surnames. With the global toggle on (default), confirm in: persons list, person panel header, relationships list, person picker, search results, and a generated HTML site preview — all render `Anna Andersson (f. Svensson)` in sv / `Anna Andersson (b. Svensson)` in en. Person names table still shows two separate rows. Open Settings → Defaults, turn the toggle off — every surface above re-renders without the parenthetical, immediately, without a view switch. Turn it back on — parenthetical reappears.
2. **Per-report toggle, smoke-check by user.** Open ReportsView → A Life Report. With the global toggle on, the report's own checkbox is on by default and the name in the report header reads with parenthetical. Toggle the report-local checkbox off — name re-renders without parenthetical, but Settings global toggle is unchanged. Switch to A Marriage Report — its toggle is independent, still inherits the global default.
3. **Quality check, smoke-check by user.** Create or import a person whose `surname` is literally `"Andersson (f. Svensson)"`. Open `/quality` — see one notice-severity row with the new code. Click it — lands on the person panel with the names section expanded. Edit the name through the modal — notice clears.
4. **Round-trip regression test.** New unit test in `tests/unit/`: create a person with birth + married name records, export to GEDCOM, parse back through the importer into a fresh DB, assert both `person_names` rows are present with correct `name_type` and `surname`. Same person via archive export (`.zip` round-trip) covered transitively.
5. **Class-name collision check.** Per `.claude/rules/renderer.md`, grep `shared.css` for any new class names introduced in this plan before merge. (Likely no new classes — we only extend the existing `<PersonName>` template.)
6. **Lint, type-check, vitest, panel-layout-consistency** — hygiene only, do not count toward the user goal.

## Failure modes / RCA reference

- **Prime Directive trap:** the obvious wrong design here is parsing `"Anna (f. Svensson)"` into two `person_names` rows on save. We are **not** doing that. The check flags; the user splits. Any subagent that introduces auto-split logic — even behind a "is enabled" flag — has violated the directive. Reviewers must reject it.
- **CSV round-trip trap:** if anyone is tempted to render the parenthetical into the CSV cell ("for completeness"), they will create a new class of bug where CSV → re-import → quality flags the name we just wrote. Don't do it.
- **Half-migration trap (per `.claude/rules/plans.md` Pattern Migrations):** Pattern 1's enumeration is exhaustive on purpose. If during execution another name-display surface is discovered, the plan was wrong — pause, edit the plan, then continue. Don't ship "we did 12 of 13 surfaces."
- **Reports ignored trap:** `src/renderer/components/reports/*.vue` are frequently overlooked in name-rendering changes because they live behind an export flow rather than being on a navigable route. Pattern 1 lists them explicitly so they don't get skipped.

## Tasks

- [x] **T1 — i18n keys.** Add `common.bornAbbrev` (sv: `f.`, en: `b.`), `settings.display.showBirthNameParenthetical` (label + helper text, sv + en), `reports.options.showBirthNameParenthetical` (sv + en — single shared key reused across keepsake reports), and `checks.LIKELY_INLINE_BIRTH_NAME` (sv + en).
- [x] **T2 — name-display helper.** Add `formatFullNameWithBirthName(displayed, allNames, options: { showBirthNameParenthetical: boolean; bornAbbrev: string })` to `src/renderer/utils/nameUtils.ts`. Returns the existing `formatFullName(displayed)` plus, when the toggle is on AND a separate `birth`-type record with a different non-empty surname exists, a trailing ` (${bornAbbrev} ${birth.surname})`. Pure function. Unit-tested for: toggle off (no parenthetical), same surname (no parenthetical), different surname + toggle on (parenthetical), no birth record (no parenthetical), displayed name IS the birth name (no parenthetical), sv vs en `bornAbbrev`.
- [x] **T3 — `<PersonName>` extension.** Add optional `birthSurname?: string | null` and `showBirthNameParenthetical?: boolean` (default `true`) props. When toggle is on, `birthSurname` is set, and differs from displayed surname, append a non-underlined ` (b./f. <birthSurname>)` suffix using the i18n `bornAbbrev` key resolved via `useI18n` inside the component.
- [x] **T4 — Pinia store `personNameOptions`.** New file `src/renderer/stores/personNameOptions.ts`. Holds `showBirthNameParenthetical: ref<boolean>(true)`. Exports an `init()` that reads `window.api.db.getSetting('display_birth_name_parenthetical')` once on app boot (default true if absent). Exports a `setShowBirthNameParenthetical(value)` that writes via `window.api.db.setSetting` AND updates the ref synchronously. Re-init on `db.onSwitched`. Wire `init()` into `src/renderer/main.ts` or `App.vue` `onMounted` (mirroring how other DB-scoped state is bootstrapped).
- [x] **T5 — Settings UI.** Add a checkbox row to `SettingsView.vue`'s "Defaults" tab using the store. Label and helper text use the i18n keys from T1. Acceptance: toggling instantly re-renders affected surfaces in other open views (verify via the smoke-check in Verification §1).
- [x] **T6 — Per-report toggles in `reportConfig.ts`.** Add one boolean ref per keepsake report (see Pattern 0 table). Initialize each from the `personNameOptions` store value at first read. Expose them in the store's return object. Add the corresponding option-panel checkbox (shared i18n key) to each keepsake report's option panel template, matching the existing `redactLiving`/`showHeaderFooter` pattern.
- [x] **T7 — Migrate Pattern 1 surfaces.** For each of the 13 "Yes" rows in Pattern 1, swap `formatFullName` / `<PersonName>` for the new variant. Call sites in non-report contexts pass `personNameOptions.showBirthNameParenthetical`. Call sites in reports pass the per-report ref from `reportConfig`. HTML site snapshot reads the global setting at render time. Expand component prop interfaces to receive the full `names` array where they currently only get the displayed name. Add `/* Display only — see plan birth-name-display-and-quality-check */` at non-obvious sites.
- [x] **T8 — Quality check.** Add `checkLikelyInlineBirthName` in `src/api/checks/checks-quality.ts`, register in `checks/index.ts`. Severity `notice`. Returns one row per offending `person_names.id`. Unit-test against: `"Andersson (f. Svensson)"`, `"Andersson (b. Svensson)"`, `"Anna (född Svensson)"`, `"Anna (born Svensson)"`, `"Anderson"` (no match), `"O'Connor (Boston)"` (no match — parenthetical without trigger word), `"(f. Svensson) Andersson"` (no match — trigger only valid when preceded by name token).
- [x] **T9 — Quality row routing.** Verify clicking the new check row in `/quality` opens the person panel with names section expanded (existing routing should already cover this; smoke-check only).
- [x] **T10 — GEDCOM importer `name_change` mapping.** In `src/import/gedcom/phases.ts`, extend rawType mapping to include `NAME_CHANGE → 'name_change'`. (Currently falls back to `'birth'`, which would lose the type on re-import.)
- [x] **T11 — Round-trip test.** Add `tests/unit/gedcomMultiNameRoundTrip.test.ts`. Build a person with two `person_names` rows in an in-memory DB, run the GEDCOM exporter, parse the output through the importer into a second in-memory DB, assert both rows reappear with matching `name_type` and `surname`. Cover all five `name_type` values.
- [x] **T12 — CSV intent comment.** Add a one-line comment near the top of `src/api/csv_export.ts` documenting that CSV emits only the displayed name by design, and that the parenthetical birth-name form must NOT be baked into the CSV cell.
- [x] **T13 — Self-review checklist.**
  - [x] All 13 Pattern 1 surfaces migrated; the four "No" surfaces have explanatory comments.
  - [x] Settings toggle flips behavior across all in-app surfaces immediately.
  - [x] Each keepsake report has its own toggle and inherits the global default at session start.
  - [x] No new `class=` names in `shared.css`'s reserved namespace.
  - [x] No code path writes the parenthetical form back to `person_names.given_name` or `person_names.surname`.
  - [x] No code path auto-splits a name on save or import.
  - [x] No store, composable, or util reads `db_settings` outside the dedicated `personNameOptions` store (no scattered `getSetting('display_birth_name_parenthetical')` calls).
  - [x] `npm run lint`, `npm test`, `tests/components/panel-layout-consistency.test.ts`, and the new `gedcomMultiNameRoundTrip.test.ts` pass.
  - [x] Smoke-checks 1, 2, 3 above performed in the running app.
