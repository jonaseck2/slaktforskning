# Birth-Name Display + Quality Check

## User goal

Two user-observable outcomes:

1. **Display.** When a person has both a current name (e.g. married) and a separate birth name with a different surname, every name-rendering surface in the app shows them together as `Anna Andersson (f. Svensson)` in Swedish or `Anna Andersson (b. Svensson)` in English. The user never has to click into the name table to see what someone was born as — it's part of how their name reads.

2. **Inline-string detection.** When a user has typed `"Anna Andersson (f. Svensson)"` (or any equivalent — `(born …)`, `(b. …)`, `(född …)`, `(f. …)`) into a single given-name or surname field, a low-importance quality notice surfaces in `/quality` saying "This name appears to contain an inline birth name — consider splitting into separate name records." The user fixes it by hand via the existing name-edit modal. Nothing splits automatically.

3. **Round-trip.** A person with multiple `person_names` rows (birth + married, birth + alias, …) survives every export → re-import path with all rows intact. We verify with regression tests; we do not introduce any export that flattens the parenthetical `(f. ...)` form into a single string and then loses the structure on re-import.

## Scope

### Pattern 1 — name-display surfaces (Display goal)

Every call site that renders a person's full name today switches to a birth-name-aware variant when that person has a separate `birth` record with a different surname. Full enumeration based on `grep formatFullName | formatPersonName | <PersonName`:

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
| HTML site export (renders) | `src/api/html_site/snapshot.ts` | Yes |
| Reports — A Life, A Marriage, Life on One Page, Photo Album, Your Ancestors | `src/renderer/components/reports/*.vue` | Yes |
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

1. **Display, smoke-check by user.** Open a database with a person who has separate birth + married names with different surnames. Confirm in: persons list, person panel header, relationships list, person picker, search results, a generated A-Life report, and a generated HTML site preview — all render `Anna Andersson (f. Svensson)` in Swedish, `Anna Andersson (b. Svensson)` in English. Person names table still shows two separate rows.
2. **Quality check, smoke-check by user.** Create or import a person whose `surname` is literally `"Andersson (f. Svensson)"`. Open `/quality` — see one notice-severity row with the new code. Click it — lands on the person panel with the names section expanded. Edit the name through the modal — notice clears.
3. **Round-trip regression test.** New unit test in `tests/unit/`: create a person with birth + married name records, export to GEDCOM, parse back through the importer into a fresh DB, assert both `person_names` rows are present with correct `name_type` and `surname`. Same person via archive export (`.zip` round-trip) covered transitively.
4. **Class-name collision check.** Per `.claude/rules/renderer.md`, grep `shared.css` for any new class names introduced in this plan before merge. (Likely no new classes — we only extend the existing `<PersonName>` template.)
5. **Lint, type-check, vitest, panel-layout-consistency** — hygiene only, do not count toward the user goal.

## Failure modes / RCA reference

- **Prime Directive trap:** the obvious wrong design here is parsing `"Anna (f. Svensson)"` into two `person_names` rows on save. We are **not** doing that. The check flags; the user splits. Any subagent that introduces auto-split logic — even behind a "is enabled" flag — has violated the directive. Reviewers must reject it.
- **CSV round-trip trap:** if anyone is tempted to render the parenthetical into the CSV cell ("for completeness"), they will create a new class of bug where CSV → re-import → quality flags the name we just wrote. Don't do it.
- **Half-migration trap (per `.claude/rules/plans.md` Pattern Migrations):** Pattern 1's enumeration is exhaustive on purpose. If during execution another name-display surface is discovered, the plan was wrong — pause, edit the plan, then continue. Don't ship "we did 12 of 13 surfaces."
- **Reports ignored trap:** `src/renderer/components/reports/*.vue` are frequently overlooked in name-rendering changes because they live behind an export flow rather than being on a navigable route. Pattern 1 lists them explicitly so they don't get skipped.

## Tasks

- [ ] **T1 — i18n keys.** Add `common.bornAbbrev` (sv: `f.`, en: `b.`) and `checks.LIKELY_INLINE_BIRTH_NAME` (sv + en) to `src/renderer/i18n/sv.ts` and `src/renderer/i18n/en.ts`.
- [ ] **T2 — name-display helper.** Add `formatFullNameWithBirthName(displayed, allNames, t)` to `src/renderer/utils/nameUtils.ts`. Returns the existing `formatFullName(displayed)` plus, when applicable, a trailing ` (${t('common.bornAbbrev')} ${birth.surname})`. Pure function. Unit-tested for: same surname (no parenthetical), different surname (parenthetical), no birth record (no parenthetical), displayed name IS the birth name (no parenthetical), Swedish vs English locale.
- [ ] **T3 — `<PersonName>` extension.** Add an optional `birthSurname?: string | null` prop. When set and different from the displayed surname, append a non-underlined ` (f. <birthSurname>)` suffix using the i18n key.
- [ ] **T4 — Migrate Pattern 1 surfaces.** For each of the 13 "Yes" rows in Pattern 1, swap `formatFullName` / `<PersonName>` for the new variant. The call site needs the displayed name AND the full names array — expand the prop interface where missing. Add a `/* Display only — see plan birth-name-display-and-quality-check */` comment at non-obvious sites.
- [ ] **T5 — Quality check.** Add `checkLikelyInlineBirthName` in `src/api/checks/checks-quality.ts`, register it in `checks/index.ts`. Severity `notice`. Returns one row per offending `person_names.id`. Unit-test against fixtures: `"Andersson (f. Svensson)"`, `"Andersson (b. Svensson)"`, `"Anna (född Svensson)"`, `"Anderson"` (no match), `"O'Connor (Boston)"` (no match — parenthetical without trigger word).
- [ ] **T6 — Quality row routing.** Verify clicking the new check row in `/quality` opens the person panel with names section expanded (existing behavior should already cover this; smoke-check only).
- [ ] **T7 — GEDCOM importer `name_change` mapping.** In `src/import/gedcom/phases.ts`, extend the rawType mapping to include `NAME_CHANGE → 'name_change'`. (Currently falls back to `'birth'`, which would lose the type on re-import.)
- [ ] **T8 — Round-trip test.** Add `tests/unit/gedcomMultiNameRoundTrip.test.ts`. Build a person with two `person_names` rows in an in-memory DB, run the GEDCOM exporter, parse the output through the importer into a second in-memory DB, assert both rows reappear with matching `name_type` and `surname`. Cover all five `name_type` values.
- [ ] **T9 — CSV intent comment.** Add a one-line comment near the top of `src/api/csv_export.ts` documenting that CSV emits only the displayed name by design, and that the parenthetical birth-name form must NOT be baked into the CSV cell.
- [ ] **T10 — Self-review checklist.**
  - [ ] All 13 Pattern 1 surfaces migrated; the four "No" surfaces have explanatory comments.
  - [ ] No new `class=` names in `shared.css`'s reserved namespace.
  - [ ] No code path writes the parenthetical form back to `person_names.given_name` or `person_names.surname`.
  - [ ] No code path auto-splits a name on save or import.
  - [ ] `npm run lint`, `npm test`, `tests/components/panel-layout-consistency.test.ts`, and the new `gedcomMultiNameRoundTrip.test.ts` pass.
  - [ ] Smoke-checks 1, 2 above performed in the running app.
