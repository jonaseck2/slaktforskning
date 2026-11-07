# Incomplete & Edge-Case Date Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A date recorded at any precision, in any year GEDCOM can express, sorts to the right place on the Timeline, and a future year warns without blocking.

**Architecture:** One pure sort-key function turns a `date_value` into a totally ordered string, computed on demand and never persisted. One shared timeline comparator uses that key plus a biological-order rule for death and burial, and replaces the two diverging sort sites. `parseGedcomDate` / `formatGedcomDate` are widened to the full GEDCOM year grammar.

**Tech Stack:** TypeScript, Vue 3, Vitest (unit + happy-dom components), Playwright.

**Spec:** [2026-06-18-incomplete-date-handling-design.md](2026-06-18-incomplete-date-handling-design.md). Referent for every decision below. Section numbers (§) refer to it.

## Global Constraints

- **Prime Directive:** the sort key is computed on read and never written to `events`. No new column, so no new fidelity-registry entry.
- **GEDCOM-first (§3, user directive):** the year range is what the GEDCOM grammar expresses, with no invented cutoff. 5.5.1 BCE is `B.C.`, 7.0 BCE is `BCE`.
- Future year: warn, never block the save (§4 Q1).
- `date_original` stays authoritative on export. `formatGedcomDate` still returns it first (`src/gedcom/date.ts:120`).
- The three fidelity tests stay green: `gedcom-fidelity-registry-coverage`, `gedcom-fidelity-per-field`, `gedcom-fidelity-golden`.
- User-visible strings go through i18n, both `src/renderer/i18n/en.ts` and `sv.ts`.
- Work on `main` (docs-adjacent, no schema change). Stage by explicit path. `git add -A` is blocked by a hook.

## Decisions this plan fixes (the spec leaves them open)

| Decision | Value | Reason |
|---|---|---|
| `date_value` for a year under 1000 | the authored digits, unpadded: `"999"`, `"44"` | Padding is the sort key's job (§A2). A stored pad is a second authored form. |
| `date_value` for BCE | leading minus: `"-44"`, `"-44-03"`, `"-44-03-15"` | Mirrors ISO 8601 expanded years. `date_original` keeps the GEDCOM text. |
| Sort-key home | `src/shared/date-sort-key.ts` | Used by `src/api/` and `src/renderer/`. `src/shared/` is the cross-runtime folder. |
| Comparator home | `src/shared/timeline-order.ts` | Same reason. The API and `PersonTimeline.vue` both import it. |
| Year-only death | sorts after every event of that year | §B2. |
| Burial/cremation | sort key is `max(own key, own person's death key)`, then type rank | §B3. |

## User goal

A researcher enters a date at the precision they know: a year, a year and month, or a full date. The year can be before 1000 or BCE. The Timeline places the event correctly against dated neighbours. A year-only death falls after that year's dated events. A burial or cremation never precedes the death. A future year shows a gentle warning and the save still succeeds.

## Scope

Every site that compares or slices `date_value` as a fixed-width string, enumerated by grep on 2026-11-07 (`date_value *(<|>|localeCompare)`, `substr`, `SUBSTR`, `extractYear`):

| # | Site | Disposition |
|---|---|---|
| 1 | `src/api/report_data/timeline.ts:464` (`entries.sort`) | **T03** |
| 2 | `src/renderer/components/PersonTimeline.vue:~292` (`dated.sort`) | **T03** |
| 3 | `src/renderer/components/PersonTimeline.vue:183` (`extractYear`, `^\d{4}`) | **T04** |
| 4 | `src/renderer/utils/chartData.ts:53` (birth pick, `localeCompare`) | **T04** |
| 5 | `src/renderer/utils/nameUtils.ts:35` (birth pick, `localeCompare`) | **T04** |
| 6 | `src/api/report_data/alive-in-year.ts:93` (`r.date_value > cur.date_value`) | **T04** |
| 7 | `src/api/checks/checks-relationships.ts:403-404`, `433-434` (`substring(0,4)`, string `>`/`<`) | **T04** |
| 8 | `src/renderer/components/DateInput.vue` (`sanitize` strips a leading `-`, `slice(0,10)`) | **T05** |
| 9 | `src/gedcom/date.ts` `parseDate` (`\d{4}` only), `isoToGedcom` | **T02** |
| 10 | `src/gedcom/exporter.ts:308` (`emitDate` omits `version` from `formatGedcomDate`) | **T02** |

### Scope deviations

- **A4 (month/day without a year, signposted to the note field).** Spec §5 marks it droppable. It changes no sort and no stored value, so no verb of the user goal depends on it. Separate polish item.
- **SQL sites that order or slice `date_value`:** `src/api/persons.ts:37`, `:422`, `:432` (`ORDER BY e.date_value`, `SUBSTR(e.date_value,1,4)`) and the `CAST(substr(e.date_value,1,4) AS INTEGER)` filter in `alive-in-year.ts:87`. SQL cannot call the JS key. Effect for a pre-1000 or BCE person: the person-list `birth_year` / `death_year` column and the alive-in-year report read the year wrongly. The Timeline, which the goal names, is unaffected. A SQL-side key (a generated expression or a view) is a schema decision and needs its own plan.
- **Dual-year `1699/00` (5.5.1).** `parseDate` keeps returning `null`. The verbatim text round-trips through `date_original`, which is the same state as today.
- **Calendars other than Gregorian (7.0 `@#DJULIAN@` etc.).** Same: `date_original` carries it, `date_value` stays `null`.

## Verification

1. **User-observable:** on a person page, {death `1936`, residence `1936-02-15`, burial `1936-10-02`} reads residence → death → burial. A `999` event sorts before a `1000` event. A `BCE 44` event sorts before year 1. A future year shows a warning and saves.
2. **Proving checks:**
   - T01 unit tests pin the key order for every precision and for BCE.
   - T03 unit tests pin the rapport-109 ordering through `getTimeline` (API) and through `sortTimelineEntries` (renderer path) and assert the two agree on the same input.
   - T02 round-trip test: UI-authored `999` and BCE dates, **no** `date_original`, export under 5.5.1 and 7.0, re-import, `date_value` equal.
   - T05 component test: a future year renders the warning and the `update:dateValue` event still fires.
   - T06 e2e on a real person page (`[panels]`).
3. **Falsifiability:** if all of the above pass, the goal can still be unmet only through Scope deviation 2 (SQL list columns) and A4. Both are named above.

## Review Focus

Failure modes the spec implies and no verification line exercises. Each has a pinning test in the owning task.

1. **Bare 1–4 digit text in a DATE line** (`DATE 12`, a typo, a page number) now parses as year 12, `exact`, where it was `unknown`. Expected: still exports byte-identical via `date_original`. Pinned in T02.
2. **BCE with month and day** (`15 MAR 44 B.C.`, `15 MAR 44 BCE`). The minus sign collides with the `-` field separator in `date_value`. Expected: `"-44-03-15"` splits to year `-44`, month `03`, day `15`. Pinned in T01 and T02.
3. **BCE range** (`BET 44 B.C. AND 40 B.C.`). Expected: both ends parse and re-emit with the version's epoch keyword. Pinned in T02.
4. **Burial or cremation with no death on the page, or a death with no date.** Expected: the event keeps its own date and is not moved. Pinned in T03.
5. **Death on the day-precision date equal to a same-day residence.** Expected: residence first by the existing type rank, death after. Pinned in T03.

---

### Task 1: Sort key and year helpers (Tier 1)

**Files:**
- Create: `src/shared/date-sort-key.ts`
- Test: `tests/unit/date-sort-key.test.ts`

**Interfaces:**
- Produces:
  - `splitDateValue(v: string): { year: number; month: string | null; day: string | null }` — handles a leading `-` (BCE).
  - `dateYear(v: string | null): number | null` — signed year, `null` for `null`/`''`/unparseable.
  - `dateSortKey(v: string | null): string` — `''` for `null`/`''`. Otherwise a string whose plain `<` order is chronological across CE and BCE and across precisions, where a shorter (less precise) value sorts before a longer value of the same year (`"1936" < "1936-02" < "1936-02-15"`).
  - `datePrecision(v: string | null): 'year' | 'month' | 'day' | null`
  - `endOfPeriodKey(v: string): string` — the key of `v` with a suffix that sorts after every more-precise value inside the same period. Used by T03 for a year-only death.

- [ ] **Step 1: Write the failing tests** in `tests/unit/date-sort-key.test.ts`. Assertions, each as `expect(dateSortKey(a) < dateSortKey(b)).toBe(true)`:
  - `"999" < "1000"`
  - `"1936" < "1936-02-15"`
  - `"1936-02" < "1936-03"`
  - `"1936-02" < "1936-02-15"`
  - `"-44" < "1"` and `"-44" < "999"`
  - `"-100" < "-44"` (earlier BCE year sorts first)
  - `"-44-03-15" < "-44-04"`
  - `dateSortKey(null) === ''` and `dateSortKey('') === ''`
  - `dateYear("-44-03-15") === -44`, `dateYear("999-05") === 999`, `dateYear("1936") === 1936`, `dateYear("junk") === null`
  - `endOfPeriodKey("1936") > dateSortKey("1936-12-31")` and `endOfPeriodKey("1936") < dateSortKey("1937")`
  - `endOfPeriodKey("1936-10") > dateSortKey("1936-10-31")` and `< dateSortKey("1936-11")`
- [ ] **Step 2: Run to verify failure**

  Run: `npx vitest run tests/unit/date-sort-key.test.ts`
  Expected: FAIL, module not found.
- [ ] **Step 3: Implement the five functions** in `src/shared/date-sort-key.ts`. Approach: encode the year as a sign class plus a fixed-width digit field (for BCE, invert the digits so a larger BCE year sorts first), then append `-MM` and `-DD` verbatim. `endOfPeriodKey` appends a character that sorts above `'9'` (for example `'~'`).
- [ ] **Step 4: Run to verify pass**

  Run: `npx vitest run tests/unit/date-sort-key.test.ts`
  Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/shared/date-sort-key.ts tests/unit/date-sort-key.test.ts
git commit -m "feat(dates): render-time sort key for any GEDCOM year"
```

---

### Task 2: Parse and format the full GEDCOM year range (Tier 1)

**Files:**
- Modify: `src/gedcom/date.ts:6-18` (`parseDate`), `:88-102` (`isoToGedcom`), `:104` (`formatGedcomDate`)
- Modify: `src/gedcom/exporter.ts:308` (pass `version`)
- Modify: `src/api/gedcom_fidelity_registry.ts:543-544` (mechanism text, only if the parse rule wording changes)
- Modify: `tests/unit/gedcom-fidelity-per-field.test.ts` (near lines 115 and 133, the seeded events)
- Test: `tests/unit/gedcom-date-range.test.ts` (create)

**Interfaces:**
- Consumes: `splitDateValue` from T01.
- Produces:
  - `parseDate` accepts a year of 1–4 digits and an optional epoch suffix `B.C.` or `BCE`, in all three shapes (`YYYY`, `MON YYYY`, `DD MON YYYY`). BCE yields a leading-minus `date_value`.
  - `formatGedcomDate(date_type, date_value, date_value_end, date_original, version: '5.5.1' | '7.0' = '5.5.1'): string`. For a BCE `date_value` with no `date_original` it emits `B.C.` under `'5.5.1'` and `BCE` under `'7.0'`.
  - `emitDate` in `exporter.ts` passes its existing `version` argument through.

- [ ] **Step 1: Write the failing tests** in `tests/unit/gedcom-date-range.test.ts`:
  - `parseGedcomDate('999')` → `{ date_type: 'exact', date_value: '999' }`
  - `parseGedcomDate('44 B.C.')` and `parseGedcomDate('44 BCE')` → `date_value: '-44'`
  - `parseGedcomDate('15 MAR 44 BCE').date_value === '-44-03-15'`
  - `parseGedcomDate('BET 44 B.C. AND 40 B.C.')` → `between`, `'-44'`, `'-40'`
  - `parseGedcomDate('1850').date_value === '1850'` (unchanged), `parseGedcomDate('1699/00').date_value === null` (deviation), `parseGedcomDate('1850-1860').date_type === 'between'` (unchanged)
  - `formatGedcomDate('exact', '-44', null, '', '5.5.1') === '44 B.C.'`, `'7.0'` → `'44 BCE'`, `formatGedcomDate('exact', '999', null, '') === '999'`
  - `formatGedcomDate('exact', '-44-03-15', null, '', '7.0') === '15 MAR 44 BCE'`
  - Review Focus 1: `parseGedcomDate('12')` gives `date_original === '12'` and `formatGedcomDate(...)` of that result returns `'12'`.
  - Round trip through the DB, no `date_original`: seed an event with `date_value: '999'` and one with `date_value: '-44'`, `date_type: 'exact'`; `exportGedcom(db, '5.5.1')` and `exportGedcom(db, '7.0')`; re-import with `importGedcom`; assert `date_value` equals the seeded value in all four cases. Follow the harness in `tests/unit/gedcom-date-qualifiers.test.ts` (`seedPersonWithEvent`, `reimportAndGetAliceEvents`).
- [ ] **Step 2: Run to verify failure**

  Run: `npx vitest run tests/unit/gedcom-date-range.test.ts`
  Expected: FAIL on the parse and format assertions.
- [ ] **Step 3: Implement.** Widen the three `parseDate` regexes to `\d{1,4}` with an optional `\s+(B\.?C\.?|BCE)` suffix. Make `isoToGedcom` use `splitDateValue` so a leading `-` is not read as a separator, and append the epoch keyword per `version`. Add the `version` parameter to `formatGedcomDate` and thread it to every `isoToGedcom` call. Pass `version` at `exporter.ts:308`. Leave the `slashRange` regex at four digits.
- [ ] **Step 4: Extend the per-field fidelity test.** Read how `gedcom-fidelity-per-field.test.ts` seeds the two events at lines ~115 and ~133. Add one event with `date_value: '999'` and one with `date_value: '-44'` to the seed, in the same style, so `events.date_value` is asserted for both.
- [ ] **Step 5: Run to verify pass, including the three fidelity tests and the date tests that already exist**

  Run: `npx vitest run tests/unit/gedcom-date-range.test.ts tests/unit/gedcom-date-qualifiers.test.ts tests/unit/import-date-text.test.ts tests/unit/gedcom-fidelity-registry-coverage.test.ts tests/unit/gedcom-fidelity-per-field.test.ts tests/unit/gedcom-fidelity-golden.test.ts`
  Expected: all PASS, 0 failed.
- [ ] **Step 6: Commit**

```bash
git add src/gedcom/date.ts src/gedcom/exporter.ts tests/unit/gedcom-date-range.test.ts tests/unit/gedcom-fidelity-per-field.test.ts
git commit -m "feat(gedcom): parse and emit years under 1000 and BCE"
```

---

### Task 3: One timeline comparator, death and burial rules (Tier 1)

**Files:**
- Create: `src/shared/timeline-order.ts`
- Modify: `src/api/report_data/timeline.ts:464-470`
- Modify: `src/renderer/components/PersonTimeline.vue` (the `TYPE_PRIORITY` table at `:176-181` and the `dated.sort` at `:~292-300`)
- Test: `tests/unit/timeline-order.test.ts` (create)

**Interfaces:**
- Consumes: `dateSortKey`, `datePrecision`, `endOfPeriodKey` from T01.
- Produces:
  - `type TimelineSortView = { personId: string; eventType: string; dateValue: string | null }`
  - `sortTimelineEntries<T>(items: T[], view: (item: T) => TimelineSortView): T[]` — returns a new sorted array. Stable.
  - `TIMELINE_TYPE_RANK: Record<string, number>` — `birth 0`, `baptism 1`, default `50`, `death 98`, `burial 99`, `cremation 99`. Moved from `PersonTimeline.vue`.
  - Rule 1: key = `dateSortKey(dateValue)`, except a `death` whose precision is `year` or `month`, whose key is `endOfPeriodKey(dateValue)`.
  - Rule 2: a `burial` or `cremation` key is `max(own key, key of the same personId's death)`. A person with no dated death leaves the event unchanged.
  - Ties break by `TIMELINE_TYPE_RANK`, then input order. Items with an empty key sort first, as today.

- [ ] **Step 1: Write the failing tests** in `tests/unit/timeline-order.test.ts`:
  - Rapport 109: {death `1936`, residence `1936-02-15`, burial `1936-10-02`} in any input order sorts to residence → death → burial.
  - Birth-first and incomplete-before-complete still hold: {residence `1936-02-15`, residence `1936`} sorts `1936` first.
  - `999` event sorts before a `1000` event. BCE event sorts before a `1` event.
  - Review Focus 4: a burial for a person with no death, and a burial for a person whose death has `dateValue: null`, keep their own position.
  - Review Focus 5: death `1936-02-15` and residence `1936-02-15` sort residence → death.
  - Burial of person A is not moved by the death of person B (different `personId`).
  - Agreement test: build timeline entries for the rapport-109 example, run them once through `getTimeline` (seed with `createEvent`, `addEventParticipant`, as in `tests/unit/timeline-foster-and-partner.test.ts`) and once through `sortTimelineEntries` with a shuffled input. Assert both yield the same event-type order.
- [ ] **Step 2: Run to verify failure**

  Run: `npx vitest run tests/unit/timeline-order.test.ts`
  Expected: FAIL, module not found.
- [ ] **Step 3: Implement `sortTimelineEntries`** per the rules above in `src/shared/timeline-order.ts`. Build a `Map<personId, deathKey>` once before sorting (`.claude/rules/performance.md`: no scan inside the comparator).
- [ ] **Step 4: Wire both sites.** `timeline.ts:464`: replace the raw comparison with `sortTimelineEntries(entries, e => ({ personId: e.person_id, eventType: e.event.event_type, dateValue: e.event.date_value ?? null }))`. `PersonTimeline.vue`: delete the local `TYPE_PRIORITY`, sort `dated` through `sortTimelineEntries` with `item.personId`, `item.event.event_type`, `item.event.date_value`.
- [ ] **Step 5: Run to verify pass, plus the existing timeline and component tests**

  Run: `npx vitest run tests/unit/timeline-order.test.ts tests/unit/timeline-foster-and-partner.test.ts tests/unit/timeline-name-changes.test.ts tests/unit/timelineLabel.test.ts tests/components/PersonTimeline.test.ts`
  Expected: all PASS, 0 failed.
- [ ] **Step 6: Commit**

```bash
git add src/shared/timeline-order.ts src/api/report_data/timeline.ts src/renderer/components/PersonTimeline.vue tests/unit/timeline-order.test.ts
git commit -m "fix(timeline): one comparator; year-only death after its year, burial after death"
```

---

### Task 4: Move the remaining fixed-width date sites onto the key (Tier 1)

**Files:**
- Modify: `src/renderer/components/PersonTimeline.vue:183-187` (`extractYear`)
- Modify: `src/renderer/utils/chartData.ts:53`
- Modify: `src/renderer/utils/nameUtils.ts:35`
- Modify: `src/api/report_data/alive-in-year.ts:93`
- Modify: `src/api/checks/checks-relationships.ts:403-404`, `:433-434`
- Test: `tests/unit/date-sites-pre1000.test.ts` (create)

**Interfaces:**
- Consumes: `dateYear`, `dateSortKey` from T01.
- Produces: no new exports. Behaviour change only.

- [ ] **Step 1: Write the failing tests** in `tests/unit/date-sites-pre1000.test.ts`. Each pins one site with a pre-1000 or BCE value:
  - `extractYear` replacement: a timeline entry dated `"999-05"` yields year `999` (renderer path through `dateYear`).
  - `pickDisplayedNameLocal` (`nameUtils.ts`): of two births `"999"` and `"1000"`, the earlier is `"999"`.
  - alive-in-year latest-place pick: of `"999-05"` and `"1000"`, the later is `"1000"`.
  - `checks-relationships` marriage-after-death check: marriage `"999-06-01"` and death `"1000"` is **not** flagged. Marriage `"1000-06-01"` and death `"999"` **is** flagged.
- [ ] **Step 2: Run to verify failure**

  Run: `npx vitest run tests/unit/date-sites-pre1000.test.ts`
  Expected: FAIL on at least the `999`/`1000` comparisons.
- [ ] **Step 3: Replace each site.** `^\d{4}` and `substring(0,4)` become `dateYear(...)`. String `<`, `>` and `localeCompare` on `date_value` become comparisons of `dateSortKey(...)`. Keep the day-precision guard (`length >= 10`) in `checks-relationships.ts` by using `datePrecision(...) === 'day'`.
- [ ] **Step 4: Run to verify pass, with the neighbouring suites**

  Run: `npx vitest run tests/unit/date-sites-pre1000.test.ts tests/components/PersonTimeline.test.ts`
  Then: `npm test`
  Expected: PASS, 0 failed. Record the summary line.
- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/PersonTimeline.vue src/renderer/utils/chartData.ts src/renderer/utils/nameUtils.ts src/api/report_data/alive-in-year.ts src/api/checks/checks-relationships.ts tests/unit/date-sites-pre1000.test.ts
git commit -m "fix(dates): year and order reads handle pre-1000 and BCE"
```

---

### Task 5: DateInput accepts BCE and warns on a future year (Tier 1)

**Files:**
- Modify: `src/renderer/components/DateInput.vue` (`sanitize` at `:~125`, the two text inputs, template for the warning)
- Modify: `src/renderer/i18n/en.ts:552`, `src/renderer/i18n/sv.ts:552` (add `dateInput.futureYear`)
- Test: `tests/components/DateInput.test.ts` (extend)

**Interfaces:**
- Consumes: `dateYear` from T01.
- Produces: i18n key `dateInput.futureYear` (en: "This year is in the future. Check it, or keep it if it is expected."; sv: matching Swedish). A `<p role="status" class="ep-field-hint date-future-warning">` under the date row, rendered only while the start or end year is greater than the current year.

- [ ] **Step 1: Write the failing tests** in `tests/components/DateInput.test.ts`:
  - Typing `-44` into `.date-field .date-text` emits `update:dateValue` with `-44` (the leading `-` survives `sanitize`).
  - Typing `999` emits `999`.
  - Mounting with `dateValue` of `new Date().getFullYear() + 1` shows `.date-future-warning`. Mounting with the current year does not.
  - With the future year, typing it still emits `update:dateValue` (the save is not blocked). The component never calls `preventDefault` and has no disabled state.
  - A BCE value (`-44`) never triggers the warning.
- [ ] **Step 2: Run to verify failure**

  Run: `npx vitest run tests/components/DateInput.test.ts`
  Expected: FAIL on the new cases.
- [ ] **Step 3: Implement.** `sanitize`: allow one leading `-`, raise the cap to 11 characters, keep stripping other non-digit, non-dash characters and collapsing `--`. Add a computed `futureYear` from `dateYear(props.dateValue)` and `dateYear(props.dateValueEnd)` against `new Date().getFullYear()`. Add the two i18n strings.
- [ ] **Step 4: Run to verify pass**

  Run: `npx vitest run tests/components/DateInput.test.ts`
  Expected: PASS, including the existing cases.
- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/DateInput.vue src/renderer/i18n/en.ts src/renderer/i18n/sv.ts tests/components/DateInput.test.ts
git commit -m "feat(dates): DateInput takes BCE years and warns on a future year"
```

---

### Task 6: Timeline order on a real person page (Tier 1)

**Files:**
- Modify: `tests/e2e/panel-surface.spec.ts` (or the nearest `[panels]` spec that already opens a person page; read it first and follow its `AppDriver` pattern from `tests/e2e/fixture.ts`)

**Interfaces:**
- Consumes: the running app with T01–T05 built in.

- [ ] **Step 1: Write the e2e test.** Seed one person with death `1936`, residence `1936-02-15`, burial `1936-10-02` through the same seeding path the neighbouring spec uses. Open the person's Timeline. Assert the three rows' text order is residence, death, burial.
- [ ] **Step 2: Run it**

  Run: `npx playwright test --project=panels -g "<new test name>"`
  Expected: 1 passed. Capture the line.
- [ ] **Step 3: Run the full e2e tier.** Panels and list views are touched, so `test:e2e:full` is required (CLAUDE.md "Finishing a plan").

  Run: `npm run test:e2e:full`
  Expected: all 8 projects pass. Capture per-project counts.
- [ ] **Step 4: Commit**

```bash
git add tests/e2e/panel-surface.spec.ts
git commit -m "test(e2e): timeline orders residence, death, burial by precision"
```

---

### Task 7: Close out (Tier 1)

- [ ] **T-final (Tier 1)** — Invoke `/close-out` skill. The skill walks the 6+1 steps, refuses partial, captures evidence.

---

## Failure modes / RCA reference

- **Two sort sites, five more nobody listed.** The spec names two comparators. Grep on 2026-11-07 finds six JS sites and four SQL sites reading `date_value` as fixed-width. Fixing the two named sites would leave `"999" > "1000"` in chart birth picks, name display, the alive-in-year report and a relationship check. Scope above is the grep, not the spec's list.
- **Mechanism copied from the report.** Bengt's rapport 107 proposes fixed-width storage. The spec rejects it because `date_original` ÷ `date_value` already separates authored text from sortable form. T01 keeps the pad in a computed key, which is the same decision applied to the pre-1000 case.
- **Round-trip break by widening the parser.** `parseDate` is the importer's single date reader. Review Focus 1 and the T02 DB round-trip test exist because a wider parse turns formerly `unknown` text into `exact`.

## Self-review record

- **Spec coverage:** A1 → T02. A2 → T01, T03, T04. A3 → T05. A4 → deviation. B1 → T03. B2, B3 → T03. §6 round-trip → T02 (parse, format, per-field, fidelity tests). §7 verification 1–5 → T01, T03, T02, T05, T06.
- **Type consistency:** `dateSortKey`, `dateYear`, `datePrecision`, `endOfPeriodKey`, `splitDateValue` are defined in T01 and used under those names in T02–T05. `sortTimelineEntries` and `TIMELINE_TYPE_RANK` are defined in T03 only.
- **Proportion:** the plan is about twice the length of the spec. Code blocks hold no function bodies.
