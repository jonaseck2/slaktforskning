# Plan: Tree Sanity Checks (Data Quality)

## Background

Genealogy databases accumulate errors: wrong centuries, impossible parent ages, events after death, duplicate relationships. Professional tools (Gramps, MyHeritage with 36 checks, Geni with 28 checks) all include a dedicated validation pass. This plan adds a systematic check engine to Släktforskning.

## Check Result Type

```typescript
// src/api/checks.ts
export type CheckSeverity = 'error' | 'warning' | 'notice';

export interface CheckResult {
  code: string;                    // e.g. 'BIRTH_AFTER_DEATH'
  severity: CheckSeverity;
  message: string;                 // Human-readable, Swedish preferred
  personIds: string[];             // persons involved
  eventIds?: string[];             // events involved (if applicable)
  relationshipIds?: string[];      // relationships involved (if applicable)
}
```

Errors = logical impossibilities. Warnings = statistically very unusual but not impossible. Notices = missing data or suspicious patterns worth reviewing.

---

## Check Categories

### A. Chronological — Person

| Code | Severity | Rule |
|------|----------|------|
| `BIRTH_AFTER_DEATH` | error | birth date_value > death date_value |
| `EVENT_AFTER_DEATH` | error | any non-burial event (census, residence, marriage, occupation…) after death date |
| `BURIAL_BEFORE_DEATH` | error | burial date < death date |
| `LIFESPAN_OVER_120` | warning | death year − birth year > 120 |
| `LIFESPAN_OVER_105` | notice | death year − birth year > 105 |
| `FUTURE_BIRTH` | error | birth date_value > today |
| `FUTURE_DEATH` | error | death date_value > today |
| `BAPTISM_LATE` | notice | baptism date > birth date + 10 years |
| `DEATH_WITHOUT_BIRTH` | notice | has a death event but no birth event |
| `NO_BIRTH_EVENT` | notice | person has no birth event at all |

### B. Parenthood Age

| Code | Severity | Rule | Threshold |
|------|----------|------|-----------|
| `PARENT_TOO_YOUNG` | error | parent age at child birth < 10 | hard impossibility |
| `PARENT_VERY_YOUNG` | warning | parent age at child birth < 15 | extremely unusual |
| `PARENT_YOUNG` | notice | parent age at child birth < 18 | noteworthy |
| `MOTHER_TOO_OLD` | warning | mother (sex=F) age at child birth > 58 | post-menopause |
| `FATHER_TOO_OLD` | warning | father (sex=M) age at child birth > 90 | exceptional |
| `PARENT_BORN_AFTER_CHILD` | error | parent birth year ≥ child birth year |
| `CHILD_BORN_AFTER_PARENT_DEATH` | warning | child born > 9 months after parent death (note: fathers can die before child birth — apply only for mothers) |

### C. Sibling & Family Structure

| Code | Severity | Rule |
|------|----------|------|
| `SIBLING_AGE_GAP_LARGE` | notice | sibling age gap > 50 years (possible duplicate/error) |
| `TWINS_DIFFERENT_YEAR` | warning | two children in same parent_child relationship with birth years > 1 year apart but same parents |
| `DUPLICATE_PARENT_CHILD` | error | same person appears as parent AND child in the same parent_child relationship |
| `MULTIPLE_BIRTH_PARENTS` | warning | person has more than 2 biological parents (subtype = 'biological') |
| `NO_PARENTS` | notice | person has no parent_child relationships at all |

### D. Relationship Integrity

| Code | Severity | Rule |
|------|----------|------|
| `CIRCULAR_ANCESTRY` | error | person appears as their own ancestor (cycle detection) |
| `DUPLICATE_RELATIONSHIP` | warning | two relationships of the same type between the same pair of persons |
| `MARRIED_BEFORE_12` | error | marriage event when either spouse was < 12 years old |
| `MARRIED_BEFORE_16` | warning | marriage event when either spouse was < 16 years old |
| `MARRIAGE_AFTER_DEATH` | error | marriage date after either spouse's death date |
| `MARRIAGE_BEFORE_BIRTH` | error | marriage date before either spouse's birth date |
| `COUPLE_WITH_SELF` | error | person1_id = person2_id on a couple relationship |

### E. Geographic (requires lat/lon on places)

| Code | Severity | Rule |
|------|----------|------|
| `SIMULTANEOUS_DISTANT_LOCATIONS` | warning | two events for the same person on the same date (exact) in places > 500 km apart |
| `RESIDENCE_AFTER_EMIGRATION` | notice | residence event in country A after emigration event from country A, with no return immigration |

Geographic checks only fire when both places have lat/lon populated. Distance calculated via Haversine formula.

### F. Data Completeness (Notices only)

| Code | Severity | Rule |
|------|----------|------|
| `NO_NAME` | notice | person has no entries in person_names |
| `LIVING_WITH_DEATH_EVENT` | warning | `persons.living = 1` but person has a death event |
| `NOT_LIVING_WITHOUT_DEATH` | notice | `persons.living = 0` but no death event |
| `UNSOURCED_BIRTH` | notice | birth event exists but has no citation |
| `UNSOURCED_DEATH` | notice | death event exists but has no citation |

---

## Implementation

### 1. `src/api/checks.ts`

```
runAllChecks(db) → CheckResult[]
runChecksForPerson(db, personId) → CheckResult[]
```

Each check is a named function returning `CheckResult[]`. The module calls them all and merges results. Date comparisons use ISO string comparison (works for YYYY-MM-DD). For checks that only need year precision, parse the year from `date_value` (first 4 chars).

Haversine helper:
```
distanceKm(lat1, lon1, lat2, lon2) → number
```

Circular ancestry detection uses iterative DFS over `parent_child` relationships.

### 2. IPC

```
checks:runAll   → CheckResult[]
checks:forPerson(personId) → CheckResult[]
```

### 3. Preload

```
window.api.checks.runAll()
window.api.checks.forPerson(id)
```

### 4. MCP Tools

```
run_checks()                  → full tree CheckResult[]
run_checks_for_person(id)     → per-person CheckResult[]
```

### 5. Vue — Data Quality View

New route `/quality` → `QualityView.vue`:
- Runs `window.api.checks.runAll()` on mount
- Groups results by severity (errors first, then warnings, then notices)
- Each result row: severity badge, message, clickable person/relationship link
- Filter chips: All / Errors / Warnings / Notices
- Re-run button (checks are not live — run on demand)
- Summary header: "3 errors · 7 warnings · 12 notices"

### 6. Inline Warnings in PersonDetailView

After loading, run `checks.forPerson(id)`. If errors or warnings exist, show a yellow/red banner at the top of the detail view: "2 issues found" with an expand toggle listing them inline.

### 7. Sidebar Entry

Add "Datakvalitet" to sidebar with a badge showing error count (red) if any errors exist. Badge is computed once at app start and after any IPC mutation.

---

## Implementation Steps

- [ ] **1. `src/api/checks.ts`** — CheckResult type + all check functions + `runAllChecks` + `runChecksForPerson`; Haversine helper; circular ancestry DFS
- [ ] **2. IPC** — `checks:runAll` and `checks:forPerson` handlers in `src/main/ipc.ts`
- [ ] **3. Preload** — expose `window.api.checks.*`
- [ ] **4. MCP** — `run_checks` and `run_checks_for_person` tools in `createServer.ts`
- [ ] **5. QualityView** — new `/quality` route, sidebar entry "Datakvalitet", grouped results with severity badges
- [ ] **6. PersonDetailView inline banner** — yellow/red issue banner if `checks.forPerson` returns errors/warnings
- [ ] **7. Sidebar badge** — error count badge on "Datakvalitet" sidebar link
- [ ] **8. Unit tests** — `tests/unit/checks.test.ts`: seed a DB with known bad data, assert each check fires; seed with clean data, assert no false positives
- [ ] **9. MCP tests** — add `run_checks` and `run_checks_for_person` to `tests/unit/mcp.test.ts`
- [ ] **10. Docs** — update `CLAUDE.md`, `MCP.md`, `PLAN.md`

---

## Thresholds Reference (research-backed)

| Parameter | Hard Error | Warning | Notice | Source |
|-----------|-----------|---------|--------|--------|
| Min parent age | < 10 | < 15 | < 18 | Historical records |
| Max mother age at birth | — | > 58 | > 50 | Physiology |
| Max father age at birth | — | > 90 | > 75 | Historical outliers exist |
| Max human lifespan | — | > 120 | > 105 | Jeanne Calment 122.4 yrs |
| Min marriage age | < 12 | < 16 | — | Historical/legal |
| Max sibling gap | — | — | > 50 yrs | Data quality signal |
| Geographic simultaneity | — | > 500 km same day | — | Travel limits |

---

## Skills to Update

- **`add-feature`** — after this milestone, any new entity or event type added to the app should consider whether it introduces new check opportunities. Add a note to the docs step: "if adding a new event type or relationship type, check whether `src/api/checks.ts` needs a new rule."
- **`mcp-dev`** — add `run_checks` and `run_checks_for_person` to the MCP tool reference table with their input/output shapes.
- **`data-modeling`** — add a section "Data Quality / Sanity Checks" noting the CheckResult type and the check categories; link to this plan file.

## What is NOT Checked

- Same-sex couples (valid, not an error)
- Remarriage after widowing (valid)
- Very short marriages (valid, e.g. spouse died)
- Religion-specific naming patterns
- Record-specific oddities (census ages are notoriously imprecise — avoid flagging census age vs. birth year mismatches as errors)
