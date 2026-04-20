# Quality Checks Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 18 quality checks across persons, places, media, sources, and cross-entity duplicates. Reorganise check files by entity where it clarifies ownership.

**Architecture:** New check functions live in entity-scoped files under `src/api/checks/`. All checks are registered through `getAllCheckFunctions()` in `src/api/checks/index.ts`; no schema changes. The only UI change is `QualityIssuesTable.vue`, which learns to render per-entity links for rows whose code starts with `DUPLICATE_` or equals `POSSIBLE_DUPLICATE_PERSON`.

**Tech Stack:** TypeScript · node-sqlite3-wasm · Vitest · Vue 3 Composition API.

**Spec:** [docs/plans/2026-04-19-quality-checks-expansion-design.md](../plans/2026-04-19-quality-checks-expansion-design.md)

---

## File Structure

**New files**

- `src/api/checks/checks-place.ts` — `checkOrphanedPlace`, `checkCircularPlaceHierarchy`, `checkPlaceCoordinatesInvalid`, `checkPlaceDatesInverted`
- `src/api/checks/checks-media.ts` — `checkOrphanedMedia`, `checkMediaRegionOutOfBounds`, `checkPhotoAfterSubjectDeath`, `checkPhotoBeforeSubjectBirth`, relocated `checkMediaFileMissing`
- `src/api/checks/checks-source.ts` — `checkSourceMissingTitle`, `checkOrphanedRepository`, relocated `checkOrphanedSource`
- `src/api/checks/checks-duplicates.ts` — `checkPossibleDuplicatePerson`, `checkDuplicateIdentifier`, `checkDuplicatePlace`, `checkDuplicateMedia`, `checkDuplicateSource`
- `tests/unit/checks-place.test.ts`
- `tests/unit/checks-media.test.ts`
- `tests/unit/checks-source.test.ts`
- `tests/unit/checks-duplicates.test.ts`

**Modified files**

- `src/api/checks/checks-quality.ts` — add 3 person checks (`checkMultipleBirthNames`, `checkPartialName`, `checkLivingOver120`); remove `checkOrphanedSource` (moves to `checks-source.ts`)
- `src/api/checks/checks-location.ts` — remove `checkMediaFileMissing` (moves to `checks-media.ts`)
- `src/api/checks/index.ts` — update imports and add new check registrations
- `src/renderer/components/QualityIssuesTable.vue` — render per-entity links for duplicate rows
- `src/renderer/i18n/sv.ts` · `src/renderer/i18n/en.ts` — 18 new `quality.checks.*` keys
- `tests/unit/checks.test.ts` — extend with person check tests

---

## Ground Rules

**TDD order is strict.** Each task writes the failing test first, runs it to confirm failure, then implements, then runs again to confirm pass. Do not write implementation code before the test exists.

**Registration is part of the task.** Every new check must appear in `getAllCheckFunctions()` in `src/api/checks/index.ts`. A check that works in its file but isn't registered is a dead check.

**i18n is part of the task.** Every new code must have a Swedish and English entry under `quality.checks.<CODE>` in `src/renderer/i18n/sv.ts` and `src/renderer/i18n/en.ts`. Messages mirror the tone of existing ones: brief, declarative, no trailing punctuation. Use placeholder interpolation (`{name}`, `{count}`, etc.) where the spec calls for it.

**Test helpers live in `tests/unit/helpers.ts`** (`createTestDb()`). Study an existing test file (e.g. `tests/unit/checks.test.ts`) before writing the first new test so the imports and helper patterns match.

**After every task, run the full test suite** (`npm test`) to confirm nothing regressed. If a previously passing test fails, fix it in the same commit.

**Commit message convention:** `feat(checks): add <CODE> quality check` for new checks. `refactor(checks): move <CODE> to checks-<file>` for relocations. `feat(ui): per-entity links for duplicate quality rows` for the UI task.

**Import placement:** when a task shows `import` statements, add them to the existing import block at the top of the target file — do not insert imports inside `describe` or function bodies. If the import already exists, merge the new named bindings into the existing line instead of duplicating.

---

## Phase A — Person checks (extend existing file)

### Task 1: `MULTIPLE_BIRTH_NAMES`

**Files:**
- Modify: `src/api/checks/checks-quality.ts`
- Modify: `src/api/checks/index.ts`
- Test: `tests/unit/checks.test.ts`
- Modify: `src/renderer/i18n/sv.ts`, `src/renderer/i18n/en.ts`

- [ ] **Step 1: Write the failing test** — append to `tests/unit/checks.test.ts`:

```typescript
describe('MULTIPLE_BIRTH_NAMES', () => {
  it('fires when a person has two name_type=birth entries', () => {
    const p = createPerson(db, {});
    addPersonName(db, p.id, { given_name: 'Anna', surname: 'Eriksson', name_type: 'birth' });
    addPersonName(db, p.id, { given_name: 'Anna Maria', surname: 'Eriksson', name_type: 'birth' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'MULTIPLE_BIRTH_NAMES' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('warning');
  });

  it('does not fire when person has one birth name and one married name', () => {
    const p = createPerson(db, {});
    addPersonName(db, p.id, { given_name: 'Anna', surname: 'Eriksson', name_type: 'birth' });
    addPersonName(db, p.id, { given_name: 'Anna', surname: 'Svensson', name_type: 'married' });
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'MULTIPLE_BIRTH_NAMES')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test — expect fail** — `npm test -- checks.test.ts -t MULTIPLE_BIRTH_NAMES` should fail with zero matches.

- [ ] **Step 3: Implement** — append to `src/api/checks/checks-quality.ts`:

```typescript
export function checkMultipleBirthNames(db: Database): CheckResult[] {
  const rows = queryAll<{ person_id: string; cnt: number }>(db, `
    SELECT person_id, COUNT(*) AS cnt
    FROM person_names
    WHERE name_type = 'birth'
    GROUP BY person_id
    HAVING COUNT(*) > 1
  `);
  return rows.map(r => ({
    code: 'MULTIPLE_BIRTH_NAMES',
    severity: 'warning' as CheckSeverity,
    message: `Person har ${r.cnt} födelsenamn registrerade (högst ett förväntas)`,
    messageParams: { count: r.cnt },
    personIds: [r.person_id],
  }));
}
```

- [ ] **Step 4: Register** — in `src/api/checks/index.ts`:
  - Add `checkMultipleBirthNames` to the import from `./checks-quality`.
  - Add `{ name: 'checkMultipleBirthNames', fn: (db) => checkMultipleBirthNames(db) },` to `getAllCheckFunctions()` under the "F. Data Completeness" section.

- [ ] **Step 5: Add i18n** — add `MULTIPLE_BIRTH_NAMES: 'Person har {count} födelsenamn registrerade (högst ett förväntas)'` to `quality.checks` in `src/renderer/i18n/sv.ts`, and `MULTIPLE_BIRTH_NAMES: 'Person has {count} birth names recorded (at most one expected)'` in `src/renderer/i18n/en.ts`.

- [ ] **Step 6: Run test — expect pass** — `npm test -- checks.test.ts -t MULTIPLE_BIRTH_NAMES` should pass. Then run `npm test` — everything else should still be green.

- [ ] **Step 7: Commit** —

```bash
git add src/api/checks/checks-quality.ts src/api/checks/index.ts tests/unit/checks.test.ts src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "feat(checks): add MULTIPLE_BIRTH_NAMES quality check"
```

### Task 2: `PARTIAL_NAME`

**Files:** same as Task 1.

- [ ] **Step 1: Write the failing test** — append to `tests/unit/checks.test.ts`:

```typescript
describe('PARTIAL_NAME', () => {
  it('fires when a person has only given_name', () => {
    const p = createPerson(db, { given_name: 'Solo' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'PARTIAL_NAME' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('notice');
  });

  it('fires when a person has only surname', () => {
    const p = createPerson(db, {});
    addPersonName(db, p.id, { given_name: '', surname: 'Nilsson', name_type: 'birth' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'PARTIAL_NAME' && r.personIds.includes(p.id));
    expect(hit).toHaveLength(1);
  });

  it('does not fire when both names present', () => {
    const p = createPerson(db, { given_name: 'Anna', surname: 'Eriksson' });
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'PARTIAL_NAME' && r.personIds.includes(p.id))).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test — expect fail** — `npm test -- checks.test.ts -t PARTIAL_NAME`.

- [ ] **Step 3: Implement** — append to `src/api/checks/checks-quality.ts`:

```typescript
export function checkPartialName(db: Database): CheckResult[] {
  const rows = queryAll<{ person_id: string; given_name: string | null; surname: string | null }>(db, `
    SELECT person_id, given_name, surname FROM person_names
  `);
  const results: CheckResult[] = [];
  for (const r of rows) {
    const hasGiven = !!r.given_name && r.given_name.trim() !== '';
    const hasSurname = !!r.surname && r.surname.trim() !== '';
    if (hasGiven !== hasSurname) {
      results.push({
        code: 'PARTIAL_NAME',
        severity: 'notice' as CheckSeverity,
        message: hasGiven
          ? 'Person saknar efternamn'
          : 'Person saknar förnamn',
        messageParams: {},
        personIds: [r.person_id],
      });
    }
  }
  return results;
}
```

- [ ] **Step 4: Register** — add `checkPartialName` to the import in `src/api/checks/index.ts` and register in `getAllCheckFunctions()` under "F. Data Completeness".

- [ ] **Step 5: i18n** — add to `quality.checks` in both locale files:
  - sv: `PARTIAL_NAME: 'Namn är ofullständigt (saknar förnamn eller efternamn)'`
  - en: `PARTIAL_NAME: 'Name is incomplete (missing given name or surname)'`

- [ ] **Step 6: Run test — expect pass** — `npm test -- checks.test.ts -t PARTIAL_NAME`. Then `npm test`.

- [ ] **Step 7: Commit** —

```bash
git add src/api/checks/checks-quality.ts src/api/checks/index.ts tests/unit/checks.test.ts src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "feat(checks): add PARTIAL_NAME quality check"
```

### Task 3: `LIVING_OVER_120`

**Files:** same as Task 1.

- [ ] **Step 1: Write the failing test** — append to `tests/unit/checks.test.ts`:

```typescript
describe('LIVING_OVER_120', () => {
  it('fires when a living person was born more than 120 years ago', () => {
    const ancientYear = new Date().getFullYear() - 121;
    const { person } = personWithBirth(db, `${ancientYear}-01-01`, { living: true });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'LIVING_OVER_120' && r.personIds.includes(person.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('warning');
  });

  it('does not fire when living person is within 120 years', () => {
    const recentYear = new Date().getFullYear() - 50;
    const { person } = personWithBirth(db, `${recentYear}-01-01`, { living: true });
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'LIVING_OVER_120' && r.personIds.includes(person.id))).toHaveLength(0);
  });

  it('does not fire when person is not living', () => {
    const ancientYear = new Date().getFullYear() - 130;
    const { person } = personWithBirth(db, `${ancientYear}-01-01`, { living: false });
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'LIVING_OVER_120' && r.personIds.includes(person.id))).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test — expect fail** — `npm test -- checks.test.ts -t LIVING_OVER_120`.

- [ ] **Step 3: Implement** — append to `src/api/checks/checks-quality.ts`:

```typescript
export function checkLivingOver120(db: Database): CheckResult[] {
  const currentYear = new Date().getFullYear();
  const rows = queryAll<{ person_id: string; date_value: string }>(db, `
    SELECT ep.person_id, e.date_value
    FROM persons p
    JOIN event_participants ep ON ep.person_id = p.id
    JOIN events e ON e.id = ep.event_id
      AND e.event_type = 'birth'
      AND e.date_value IS NOT NULL
      AND e.date_type IN ('exact', 'calculated')
    WHERE p.living = 1
  `);
  const results: CheckResult[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.person_id)) continue;
    const year = parseInt(r.date_value.substring(0, 4), 10);
    if (isNaN(year)) continue;
    const age = currentYear - year;
    if (age > 120) {
      seen.add(r.person_id);
      results.push({
        code: 'LIVING_OVER_120',
        severity: 'warning' as CheckSeverity,
        message: `Person är markerad som levande men skulle vara ${age} år gammal`,
        messageParams: { age },
        personIds: [r.person_id],
      });
    }
  }
  return results;
}
```

- [ ] **Step 4: Register** — add `checkLivingOver120` to the import in `src/api/checks/index.ts` and register in `getAllCheckFunctions()` under "F. Data Completeness".

- [ ] **Step 5: i18n** —
  - sv: `LIVING_OVER_120: 'Person är markerad som levande men skulle vara {age} år gammal'`
  - en: `LIVING_OVER_120: 'Person is marked as living but would be {age} years old'`

- [ ] **Step 6: Run test — expect pass** — `npm test -- checks.test.ts -t LIVING_OVER_120`. Then `npm test`.

- [ ] **Step 7: Commit** —

```bash
git add src/api/checks/checks-quality.ts src/api/checks/index.ts tests/unit/checks.test.ts src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "feat(checks): add LIVING_OVER_120 quality check"
```

---

## Phase B — Place checks (new file)

### Task 4: Scaffold `checks-place.ts` + `ORPHANED_PLACE`

**Files:**
- Create: `src/api/checks/checks-place.ts`
- Create: `tests/unit/checks-place.test.ts`
- Modify: `src/api/checks/index.ts`
- Modify: `src/renderer/i18n/sv.ts`, `src/renderer/i18n/en.ts`

- [ ] **Step 1: Write the failing test** — create `tests/unit/checks-place.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { runAllChecks } from '../../src/api/checks';
import { createPlace } from '../../src/api/places';
import { createPerson } from '../../src/api/persons';
import { createEvent } from '../../src/api/events';
import { addEventParticipant } from '../../src/api/relationships';
import { createTestDb } from './helpers';

let db: ReturnType<typeof createTestDb>;
beforeEach(() => { db = createTestDb(); });

describe('ORPHANED_PLACE', () => {
  it('fires for a place with no references', () => {
    const pl = createPlace(db, { name: 'Ingenstans' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'ORPHANED_PLACE' && r.placeIds?.includes(pl.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('notice');
  });

  it('does not fire when place is used by an event', () => {
    const pl = createPlace(db, { name: 'Använd plats' });
    const p = createPerson(db, {});
    const e = createEvent(db, { event_type: 'birth', place_id: pl.id });
    addEventParticipant(db, { event_id: e.id, person_id: p.id, role: 'primary' });
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'ORPHANED_PLACE' && r.placeIds?.includes(pl.id))).toHaveLength(0);
  });

  it('does not fire when place is a parent of another place', () => {
    const parent = createPlace(db, { name: 'Sverige' });
    createPlace(db, { name: 'Stockholm', parent_place_id: parent.id });
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'ORPHANED_PLACE' && r.placeIds?.includes(parent.id))).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test — expect fail** — `npm test -- checks-place.test.ts`.

- [ ] **Step 3: Implement** — create `src/api/checks/checks-place.ts`:

```typescript
import type { Database } from 'node-sqlite3-wasm';
import { queryAll } from '../db';
import type { CheckResult, CheckSeverity } from './check-utils';

export function checkOrphanedPlace(db: Database): CheckResult[] {
  const rows = queryAll<{ id: string; name: string }>(db, `
    SELECT p.id, p.name
    FROM places p
    WHERE NOT EXISTS (SELECT 1 FROM events e WHERE e.place_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM citations c WHERE c.place_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM places p2 WHERE p2.parent_place_id = p.id)
      AND NOT EXISTS (
        SELECT 1 FROM media_links ml
        WHERE ml.entity_type = 'place' AND ml.entity_id = p.id
      )
  `);
  return rows.map(r => ({
    code: 'ORPHANED_PLACE',
    severity: 'notice' as CheckSeverity,
    message: `Platsen "${r.name}" används inte någonstans`,
    messageParams: { name: r.name },
    personIds: [],
    placeIds: [r.id],
  }));
}
```

- [ ] **Step 4: Register** — in `src/api/checks/index.ts`:
  - Add `import { checkOrphanedPlace } from './checks-place';`
  - Add `{ name: 'checkOrphanedPlace', fn: (db) => checkOrphanedPlace(db) },` at the end of `getAllCheckFunctions()` (before the `]`).

- [ ] **Step 5: i18n** —
  - sv: `ORPHANED_PLACE: 'Platsen "{name}" används inte någonstans'`
  - en: `ORPHANED_PLACE: 'Place "{name}" is not used anywhere'`

- [ ] **Step 6: Run test — expect pass** — `npm test -- checks-place.test.ts`. Then `npm test`.

- [ ] **Step 7: Commit** —

```bash
git add src/api/checks/checks-place.ts src/api/checks/index.ts tests/unit/checks-place.test.ts src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "feat(checks): add ORPHANED_PLACE quality check"
```

### Task 5: `CIRCULAR_PLACE_HIERARCHY`

**Files:**
- Modify: `src/api/checks/checks-place.ts`
- Modify: `src/api/checks/index.ts`
- Modify: `tests/unit/checks-place.test.ts`
- Modify: `src/renderer/i18n/sv.ts`, `src/renderer/i18n/en.ts`

- [ ] **Step 1: Write the failing test** — append to `tests/unit/checks-place.test.ts`:

```typescript
import { queryRun } from '../../src/api/db';

describe('CIRCULAR_PLACE_HIERARCHY', () => {
  it('fires when three places form a cycle via parent_place_id', () => {
    const a = createPlace(db, { name: 'A' });
    const b = createPlace(db, { name: 'B', parent_place_id: a.id });
    const c = createPlace(db, { name: 'C', parent_place_id: b.id });
    // Force cycle: set A.parent = C. createPlace does not let us set parent to an
    // id that doesn't exist yet, but update directly is fine.
    queryRun(db, 'UPDATE places SET parent_place_id = ? WHERE id = ?', [c.id, a.id]);
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'CIRCULAR_PLACE_HIERARCHY');
    expect(hit.length).toBeGreaterThanOrEqual(1);
    expect(hit[0].severity).toBe('error');
    // Cycle nodes should all appear
    const ids = new Set(hit.flatMap(h => h.placeIds ?? []));
    expect(ids.has(a.id)).toBe(true);
    expect(ids.has(b.id)).toBe(true);
    expect(ids.has(c.id)).toBe(true);
  });

  it('does not fire for a straight chain', () => {
    const a = createPlace(db, { name: 'Country' });
    const b = createPlace(db, { name: 'Region', parent_place_id: a.id });
    createPlace(db, { name: 'Parish', parent_place_id: b.id });
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'CIRCULAR_PLACE_HIERARCHY')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test — expect fail** — `npm test -- checks-place.test.ts -t CIRCULAR_PLACE_HIERARCHY`.

- [ ] **Step 3: Implement** — append to `src/api/checks/checks-place.ts`:

```typescript
export function checkCircularPlaceHierarchy(db: Database): CheckResult[] {
  const rows = queryAll<{ id: string; parent_place_id: string | null; name: string }>(db,
    'SELECT id, parent_place_id, name FROM places'
  );
  const parentOf = new Map<string, string | null>();
  const nameOf = new Map<string, string>();
  for (const r of rows) {
    parentOf.set(r.id, r.parent_place_id);
    nameOf.set(r.id, r.name);
  }

  const results: CheckResult[] = [];
  const cleared = new Set<string>();          // known acyclic
  const reportedCycles = new Set<string>();   // canonical cycle fingerprints

  for (const start of parentOf.keys()) {
    if (cleared.has(start)) continue;
    const path: string[] = [];
    const onPath = new Set<string>();
    let current: string | null = start;
    while (current) {
      if (cleared.has(current)) break;
      if (onPath.has(current)) {
        // Cycle: slice the path from the revisit point
        const cycleStart = path.indexOf(current);
        const cycleNodes = path.slice(cycleStart);
        const key = [...cycleNodes].sort().join(',');
        if (!reportedCycles.has(key)) {
          reportedCycles.add(key);
          results.push({
            code: 'CIRCULAR_PLACE_HIERARCHY',
            severity: 'error' as CheckSeverity,
            message: `Platshierarkin innehåller en cykel: ${cycleNodes.map(id => nameOf.get(id) ?? id).join(' → ')}`,
            messageParams: { chain: cycleNodes.map(id => nameOf.get(id) ?? id).join(' → ') },
            personIds: [],
            placeIds: cycleNodes,
          });
        }
        break;
      }
      onPath.add(current);
      path.push(current);
      current = parentOf.get(current) ?? null;
    }
    if (!current || cleared.has(current)) {
      for (const id of path) cleared.add(id);
    }
  }

  return results;
}
```

- [ ] **Step 4: Register** — update the import in `src/api/checks/index.ts` to include `checkCircularPlaceHierarchy`; register it after `checkOrphanedPlace`.

- [ ] **Step 5: i18n** —
  - sv: `CIRCULAR_PLACE_HIERARCHY: 'Platshierarkin innehåller en cykel: {chain}'`
  - en: `CIRCULAR_PLACE_HIERARCHY: 'Place hierarchy contains a cycle: {chain}'`

- [ ] **Step 6: Run test — expect pass** — `npm test -- checks-place.test.ts`. Then `npm test`.

- [ ] **Step 7: Commit** —

```bash
git add src/api/checks/checks-place.ts src/api/checks/index.ts tests/unit/checks-place.test.ts src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "feat(checks): add CIRCULAR_PLACE_HIERARCHY quality check"
```

### Task 6: `PLACE_COORDINATES_INVALID`

Same file set as Task 5.

- [ ] **Step 1: Write the failing test** — append to `tests/unit/checks-place.test.ts`:

```typescript
describe('PLACE_COORDINATES_INVALID', () => {
  it('fires when latitude is out of range', () => {
    const pl = createPlace(db, { name: 'Mars', latitude: 200, longitude: 10 });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'PLACE_COORDINATES_INVALID' && r.placeIds?.includes(pl.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('warning');
  });

  it('fires for null-island (0, 0)', () => {
    const pl = createPlace(db, { name: 'NullIsland', latitude: 0, longitude: 0 });
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'PLACE_COORDINATES_INVALID' && r.placeIds?.includes(pl.id))).toHaveLength(1);
  });

  it('does not fire for valid coordinates', () => {
    const pl = createPlace(db, { name: 'Stockholm', latitude: 59.3, longitude: 18.1 });
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'PLACE_COORDINATES_INVALID' && r.placeIds?.includes(pl.id))).toHaveLength(0);
  });

  it('does not fire for missing coordinates', () => {
    const pl = createPlace(db, { name: 'NoCoords' });
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'PLACE_COORDINATES_INVALID' && r.placeIds?.includes(pl.id))).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test — expect fail** — `npm test -- checks-place.test.ts -t PLACE_COORDINATES_INVALID`.

- [ ] **Step 3: Implement** — append to `src/api/checks/checks-place.ts`:

```typescript
export function checkPlaceCoordinatesInvalid(db: Database): CheckResult[] {
  const rows = queryAll<{ id: string; name: string; latitude: number; longitude: number }>(db, `
    SELECT id, name, latitude, longitude FROM places
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL
  `);
  const results: CheckResult[] = [];
  for (const r of rows) {
    const outOfRange = r.latitude < -90 || r.latitude > 90 || r.longitude < -180 || r.longitude > 180;
    const nullIsland = r.latitude === 0 && r.longitude === 0;
    if (!outOfRange && !nullIsland) continue;
    const reason = outOfRange ? 'utanför giltigt intervall' : 'null-island (0, 0)';
    results.push({
      code: 'PLACE_COORDINATES_INVALID',
      severity: 'warning' as CheckSeverity,
      message: `Platsen "${r.name}" har ogiltiga koordinater (${r.latitude}, ${r.longitude}) — ${reason}`,
      messageParams: {
        name: r.name,
        lat: r.latitude,
        lon: r.longitude,
        reason,
      },
      personIds: [],
      placeIds: [r.id],
    });
  }
  return results;
}
```

- [ ] **Step 4: Register** — update import and register after `checkCircularPlaceHierarchy` in `src/api/checks/index.ts`.

- [ ] **Step 5: i18n** —
  - sv: `PLACE_COORDINATES_INVALID: 'Platsen "{name}" har ogiltiga koordinater ({lat}, {lon}) — {reason}'`
  - en: `PLACE_COORDINATES_INVALID: 'Place "{name}" has invalid coordinates ({lat}, {lon}) — {reason}'`

- [ ] **Step 6: Run test — expect pass** — `npm test -- checks-place.test.ts`. Then `npm test`.

- [ ] **Step 7: Commit** —

```bash
git add src/api/checks/checks-place.ts src/api/checks/index.ts tests/unit/checks-place.test.ts src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "feat(checks): add PLACE_COORDINATES_INVALID quality check"
```

### Task 7: `PLACE_DATES_INVERTED`

Same file set as Task 6.

- [ ] **Step 1: Write the failing test** — append to `tests/unit/checks-place.test.ts`:

```typescript
describe('PLACE_DATES_INVERTED', () => {
  it('fires when date_from is after date_to', () => {
    const pl = createPlace(db, { name: 'Bakvänd', date_from: '1900-01-01', date_to: '1850-01-01' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'PLACE_DATES_INVERTED' && r.placeIds?.includes(pl.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('error');
  });

  it('does not fire when only one date is set', () => {
    const pl = createPlace(db, { name: 'Bara från', date_from: '1900-01-01' });
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'PLACE_DATES_INVERTED' && r.placeIds?.includes(pl.id))).toHaveLength(0);
  });

  it('does not fire when dates are in order', () => {
    const pl = createPlace(db, { name: 'OK', date_from: '1850-01-01', date_to: '1900-01-01' });
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'PLACE_DATES_INVERTED' && r.placeIds?.includes(pl.id))).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test — expect fail** — `npm test -- checks-place.test.ts -t PLACE_DATES_INVERTED`.

- [ ] **Step 3: Implement** — append to `src/api/checks/checks-place.ts`:

```typescript
export function checkPlaceDatesInverted(db: Database): CheckResult[] {
  const rows = queryAll<{ id: string; name: string; date_from: string; date_to: string }>(db, `
    SELECT id, name, date_from, date_to FROM places
    WHERE date_from IS NOT NULL AND date_to IS NOT NULL AND date_from > date_to
  `);
  return rows.map(r => ({
    code: 'PLACE_DATES_INVERTED',
    severity: 'error' as CheckSeverity,
    message: `Platsen "${r.name}" har omvänt datumintervall (${r.date_from} → ${r.date_to})`,
    messageParams: { name: r.name, dateFrom: r.date_from, dateTo: r.date_to },
    personIds: [],
    placeIds: [r.id],
  }));
}
```

- [ ] **Step 4: Register** — update import and register after `checkPlaceCoordinatesInvalid`.

- [ ] **Step 5: i18n** —
  - sv: `PLACE_DATES_INVERTED: 'Platsen "{name}" har omvänt datumintervall ({dateFrom} → {dateTo})'`
  - en: `PLACE_DATES_INVERTED: 'Place "{name}" has inverted date range ({dateFrom} → {dateTo})'`

- [ ] **Step 6: Run test — expect pass** — `npm test -- checks-place.test.ts`. Then `npm test`.

- [ ] **Step 7: Commit** —

```bash
git add src/api/checks/checks-place.ts src/api/checks/index.ts tests/unit/checks-place.test.ts src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "feat(checks): add PLACE_DATES_INVERTED quality check"
```

---

## Phase C — Media checks (new file, relocate MEDIA_FILE_MISSING)

### Task 8: Scaffold `checks-media.ts` and relocate `checkMediaFileMissing`

**Files:**
- Create: `src/api/checks/checks-media.ts`
- Modify: `src/api/checks/checks-location.ts` (remove `checkMediaFileMissing`)
- Modify: `src/api/checks/index.ts` (update imports)
- Create: `tests/unit/checks-media.test.ts`

- [ ] **Step 1: Move `checkMediaFileMissing`** — copy its implementation from `src/api/checks/checks-location.ts` into the new file:

Create `src/api/checks/checks-media.ts`:

```typescript
import type { Database } from 'node-sqlite3-wasm';
import { queryAll } from '../db';
import type { CheckResult, CheckSeverity } from './check-utils';

export function checkMediaFileMissing(db: Database, _dbDir?: string): CheckResult[] {
  const rows = queryAll<{ id: string; file_ref: string }>(db, `
    SELECT id, file_ref FROM media
    WHERE is_missing = 1 AND file_ref IS NOT NULL AND file_ref != ''
  `);

  return rows.map(row => ({
    code: 'MEDIA_FILE_MISSING' as const,
    severity: 'warning' as CheckSeverity,
    message: `Mediafil saknas: ${row.file_ref}`,
    messageParams: { filePath: row.file_ref },
    personIds: [],
    mediaIds: [row.id],
  }));
}
```

- [ ] **Step 2: Remove it from `checks-location.ts`** — delete the `checkMediaFileMissing` function from `src/api/checks/checks-location.ts`.

- [ ] **Step 3: Update index imports** — in `src/api/checks/index.ts`:
  - Remove `checkMediaFileMissing` from the `./checks-location` import list.
  - Add `import { checkMediaFileMissing } from './checks-media';`.
  - The existing registration line `{ name: 'checkMediaFileMissing', global: true, fn: (db, dbDir) => checkMediaFileMissing(db, dbDir) },` stays unchanged.

- [ ] **Step 4: Scaffold the test file** — create `tests/unit/checks-media.test.ts` with imports and a first smoke test that confirms the registration still works:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { runAllChecks } from '../../src/api/checks';
import { createMedia, addMediaLink } from '../../src/api/media';
import { createPerson } from '../../src/api/persons';
import { createEvent } from '../../src/api/events';
import { addEventParticipant } from '../../src/api/relationships';
import { createTestDb } from './helpers';
import { queryRun } from '../../src/api/db';

let db: ReturnType<typeof createTestDb>;
beforeEach(() => { db = createTestDb(); });

describe('MEDIA_FILE_MISSING (relocated)', () => {
  it('still fires when is_missing flag is 1', () => {
    const m = createMedia(db, { title: 'Missing photo', file_ref: '/absent.jpg' });
    queryRun(db, 'UPDATE media SET is_missing = 1 WHERE id = ?', [m.id]);
    // Link it so it isn't flagged as orphaned by future ORPHANED_MEDIA check
    const p = createPerson(db, {});
    addMediaLink(db, { media_id: m.id, entity_type: 'person', entity_id: p.id });
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'MEDIA_FILE_MISSING' && r.mediaIds?.includes(m.id))).toHaveLength(1);
  });
});
```

- [ ] **Step 5: Run tests — expect pass** — `npm test -- checks-media.test.ts` and `npm test`. A relocation that doesn't break existing behaviour should leave all prior tests green.

- [ ] **Step 6: Commit** —

```bash
git add src/api/checks/checks-media.ts src/api/checks/checks-location.ts src/api/checks/index.ts tests/unit/checks-media.test.ts
git commit -m "refactor(checks): move MEDIA_FILE_MISSING to checks-media.ts"
```

### Task 9: `ORPHANED_MEDIA`

**Files:**
- Modify: `src/api/checks/checks-media.ts`
- Modify: `src/api/checks/index.ts`
- Modify: `tests/unit/checks-media.test.ts`
- Modify: `src/renderer/i18n/sv.ts`, `src/renderer/i18n/en.ts`

- [ ] **Step 1: Write the failing test** — append to `tests/unit/checks-media.test.ts`:

```typescript
describe('ORPHANED_MEDIA', () => {
  it('fires for media with no links', () => {
    const m = createMedia(db, { title: 'Lonely photo' });
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'ORPHANED_MEDIA' && r.mediaIds?.includes(m.id))).toHaveLength(1);
  });

  it('does not fire for media linked to a person', () => {
    const m = createMedia(db, { title: 'Linked photo' });
    const p = createPerson(db, {});
    addMediaLink(db, { media_id: m.id, entity_type: 'person', entity_id: p.id });
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'ORPHANED_MEDIA' && r.mediaIds?.includes(m.id))).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test — expect fail** — `npm test -- checks-media.test.ts -t ORPHANED_MEDIA`.

- [ ] **Step 3: Implement** — append to `src/api/checks/checks-media.ts`:

```typescript
export function checkOrphanedMedia(db: Database): CheckResult[] {
  const rows = queryAll<{ id: string; title: string | null }>(db, `
    SELECT m.id, m.title
    FROM media m
    WHERE NOT EXISTS (SELECT 1 FROM media_links ml WHERE ml.media_id = m.id)
  `);
  return rows.map(r => ({
    code: 'ORPHANED_MEDIA',
    severity: 'notice' as CheckSeverity,
    message: `Mediafil "${r.title || '(utan titel)'}" saknar kopplingar`,
    messageParams: { title: r.title || '' },
    personIds: [],
    mediaIds: [r.id],
  }));
}
```

- [ ] **Step 4: Register** — add `checkOrphanedMedia` to the import from `./checks-media` and register after `checkMediaFileMissing` in `src/api/checks/index.ts`.

- [ ] **Step 5: i18n** —
  - sv: `ORPHANED_MEDIA: 'Mediafil "{title}" saknar kopplingar'`
  - en: `ORPHANED_MEDIA: 'Media file "{title}" has no links'`

- [ ] **Step 6: Run test — expect pass** — `npm test -- checks-media.test.ts`. Then `npm test`.

- [ ] **Step 7: Commit** —

```bash
git add src/api/checks/checks-media.ts src/api/checks/index.ts tests/unit/checks-media.test.ts src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "feat(checks): add ORPHANED_MEDIA quality check"
```

### Task 10: `MEDIA_REGION_OUT_OF_BOUNDS`

Same file set as Task 9.

- [ ] **Step 1: Write the failing test** — append to `tests/unit/checks-media.test.ts`:

```typescript
import { createMediaRegion } from '../../src/api/media_regions';

describe('MEDIA_REGION_OUT_OF_BOUNDS', () => {
  it('fires when a region extends past the right edge', () => {
    const m = createMedia(db, { title: 'Photo' });
    const p = createPerson(db, {});
    addMediaLink(db, { media_id: m.id, entity_type: 'person', entity_id: p.id });
    const region = createMediaRegion(db, { media_id: m.id, person_id: p.id, x: 0.8, y: 0.1, width: 0.5, height: 0.2 });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'MEDIA_REGION_OUT_OF_BOUNDS' && r.mediaIds?.includes(m.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('warning');
    // sanity: region id is referenced so future UI can navigate
    void region;
  });

  it('does not fire for a region fully inside the unit square', () => {
    const m = createMedia(db, { title: 'Photo' });
    const p = createPerson(db, {});
    addMediaLink(db, { media_id: m.id, entity_type: 'person', entity_id: p.id });
    createMediaRegion(db, { media_id: m.id, person_id: p.id, x: 0.1, y: 0.1, width: 0.2, height: 0.2 });
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'MEDIA_REGION_OUT_OF_BOUNDS' && r.mediaIds?.includes(m.id))).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test — expect fail** — `npm test -- checks-media.test.ts -t MEDIA_REGION_OUT_OF_BOUNDS`.

- [ ] **Step 3: Implement** — append to `src/api/checks/checks-media.ts`:

```typescript
export function checkMediaRegionOutOfBounds(db: Database): CheckResult[] {
  const rows = queryAll<{
    id: string; media_id: string; x: number; y: number; width: number; height: number;
  }>(db, `
    SELECT id, media_id, x, y, width, height FROM media_regions
    WHERE x < 0 OR y < 0 OR (x + width) > 1 OR (y + height) > 1
  `);
  return rows.map(r => ({
    code: 'MEDIA_REGION_OUT_OF_BOUNDS',
    severity: 'warning' as CheckSeverity,
    message: `Mediaregion ligger utanför bilden (${r.x.toFixed(2)}, ${r.y.toFixed(2)} + ${r.width.toFixed(2)}×${r.height.toFixed(2)})`,
    messageParams: { x: r.x, y: r.y, width: r.width, height: r.height },
    personIds: [],
    mediaIds: [r.media_id],
  }));
}
```

- [ ] **Step 4: Register** — add `checkMediaRegionOutOfBounds` to the import and register after `checkOrphanedMedia`.

- [ ] **Step 5: i18n** —
  - sv: `MEDIA_REGION_OUT_OF_BOUNDS: 'Mediaregion ligger utanför bilden ({x}, {y} + {width}×{height})'`
  - en: `MEDIA_REGION_OUT_OF_BOUNDS: 'Media region falls outside the image ({x}, {y} + {width}×{height})'`

- [ ] **Step 6: Run test — expect pass** — `npm test -- checks-media.test.ts`. Then `npm test`.

- [ ] **Step 7: Commit** —

```bash
git add src/api/checks/checks-media.ts src/api/checks/index.ts tests/unit/checks-media.test.ts src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "feat(checks): add MEDIA_REGION_OUT_OF_BOUNDS quality check"
```

### Task 11: `PHOTO_AFTER_SUBJECT_DEATH`

Same file set as Task 9.

- [ ] **Step 1: Write the failing test** — append to `tests/unit/checks-media.test.ts`:

```typescript
describe('PHOTO_AFTER_SUBJECT_DEATH', () => {
  it('fires when a tagged person died before the linked event date', () => {
    const p = createPerson(db, { given_name: 'Anna', surname: 'Eriksson' });
    // Death 1900
    const death = createEvent(db, { event_type: 'death', date_type: 'exact', date_value: '1900-06-01' });
    addEventParticipant(db, { event_id: death.id, person_id: p.id, role: 'primary' });

    // Media linked to event in 1950
    const m = createMedia(db, { title: 'Family reunion' });
    const event = createEvent(db, { event_type: 'reunion', date_type: 'exact', date_value: '1950-07-01' });
    addMediaLink(db, { media_id: m.id, entity_type: 'event', entity_id: event.id });
    createMediaRegion(db, { media_id: m.id, person_id: p.id, x: 0.1, y: 0.1, width: 0.2, height: 0.2 });

    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'PHOTO_AFTER_SUBJECT_DEATH' && r.mediaIds?.includes(m.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('warning');
    expect(hit[0].personIds).toContain(p.id);
  });

  it('does not fire when event date is before death', () => {
    const p = createPerson(db, {});
    const death = createEvent(db, { event_type: 'death', date_type: 'exact', date_value: '1950-01-01' });
    addEventParticipant(db, { event_id: death.id, person_id: p.id, role: 'primary' });

    const m = createMedia(db, { title: 'Early photo' });
    const event = createEvent(db, { event_type: 'portrait', date_type: 'exact', date_value: '1940-01-01' });
    addMediaLink(db, { media_id: m.id, entity_type: 'event', entity_id: event.id });
    createMediaRegion(db, { media_id: m.id, person_id: p.id, x: 0.1, y: 0.1, width: 0.2, height: 0.2 });

    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'PHOTO_AFTER_SUBJECT_DEATH')).toHaveLength(0);
  });

  it('does not fire for floating media without event links', () => {
    const p = createPerson(db, {});
    const death = createEvent(db, { event_type: 'death', date_type: 'exact', date_value: '1900-01-01' });
    addEventParticipant(db, { event_id: death.id, person_id: p.id, role: 'primary' });

    const m = createMedia(db, { title: 'Floating photo' });
    addMediaLink(db, { media_id: m.id, entity_type: 'person', entity_id: p.id });
    createMediaRegion(db, { media_id: m.id, person_id: p.id, x: 0.1, y: 0.1, width: 0.2, height: 0.2 });

    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'PHOTO_AFTER_SUBJECT_DEATH')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test — expect fail** — `npm test -- checks-media.test.ts -t PHOTO_AFTER_SUBJECT_DEATH`.

- [ ] **Step 3: Implement** — append to `src/api/checks/checks-media.ts` (imports extend with `dateDefinitelyAfter`):

```typescript
import { dateDefinitelyAfter } from './check-utils';

export function checkPhotoAfterSubjectDeath(db: Database): CheckResult[] {
  const rows = queryAll<{
    media_id: string; person_id: string; event_date: string; death_date: string;
  }>(db, `
    SELECT mr.media_id, mr.person_id,
           e.date_value AS event_date,
           de.date_value AS death_date
    FROM media_regions mr
    JOIN media_links ml
      ON ml.media_id = mr.media_id AND ml.entity_type = 'event'
    JOIN events e
      ON e.id = ml.entity_id
      AND e.date_value IS NOT NULL
      AND e.date_type IN ('exact', 'calculated')
    JOIN event_participants dep
      ON dep.person_id = mr.person_id
    JOIN events de
      ON de.id = dep.event_id
      AND de.event_type = 'death'
      AND de.date_value IS NOT NULL
      AND de.date_type IN ('exact', 'calculated')
    WHERE mr.person_id IS NOT NULL
  `);
  const results: CheckResult[] = [];
  for (const r of rows) {
    if (dateDefinitelyAfter(r.event_date, r.death_date)) {
      results.push({
        code: 'PHOTO_AFTER_SUBJECT_DEATH',
        severity: 'warning' as CheckSeverity,
        message: `Bilden är daterad (${r.event_date}) efter den taggade personens död (${r.death_date})`,
        messageParams: { eventDate: r.event_date, deathDate: r.death_date },
        personIds: [r.person_id],
        mediaIds: [r.media_id],
      });
    }
  }
  return results;
}
```

- [ ] **Step 4: Register** — add to the import and register after `checkMediaRegionOutOfBounds`.

- [ ] **Step 5: i18n** —
  - sv: `PHOTO_AFTER_SUBJECT_DEATH: 'Bilden är daterad ({eventDate}) efter den taggade personens död ({deathDate})'`
  - en: `PHOTO_AFTER_SUBJECT_DEATH: 'Photo is dated ({eventDate}) after the tagged person\'s death ({deathDate})'`

- [ ] **Step 6: Run test — expect pass** — `npm test -- checks-media.test.ts`. Then `npm test`.

- [ ] **Step 7: Commit** —

```bash
git add src/api/checks/checks-media.ts src/api/checks/index.ts tests/unit/checks-media.test.ts src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "feat(checks): add PHOTO_AFTER_SUBJECT_DEATH quality check"
```

### Task 12: `PHOTO_BEFORE_SUBJECT_BIRTH`

Same file set as Task 11.

- [ ] **Step 1: Write the failing test** — append to `tests/unit/checks-media.test.ts`:

```typescript
describe('PHOTO_BEFORE_SUBJECT_BIRTH', () => {
  it('fires when a tagged person was born after the linked event date', () => {
    const p = createPerson(db, {});
    const birth = createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1950-01-01' });
    addEventParticipant(db, { event_id: birth.id, person_id: p.id, role: 'primary' });

    const m = createMedia(db, { title: 'Old photo' });
    const event = createEvent(db, { event_type: 'portrait', date_type: 'exact', date_value: '1900-01-01' });
    addMediaLink(db, { media_id: m.id, entity_type: 'event', entity_id: event.id });
    createMediaRegion(db, { media_id: m.id, person_id: p.id, x: 0.1, y: 0.1, width: 0.2, height: 0.2 });

    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'PHOTO_BEFORE_SUBJECT_BIRTH' && r.mediaIds?.includes(m.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('warning');
  });

  it('does not fire when event date is after birth', () => {
    const p = createPerson(db, {});
    const birth = createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1950-01-01' });
    addEventParticipant(db, { event_id: birth.id, person_id: p.id, role: 'primary' });

    const m = createMedia(db, { title: 'Photo' });
    const event = createEvent(db, { event_type: 'portrait', date_type: 'exact', date_value: '1960-01-01' });
    addMediaLink(db, { media_id: m.id, entity_type: 'event', entity_id: event.id });
    createMediaRegion(db, { media_id: m.id, person_id: p.id, x: 0.1, y: 0.1, width: 0.2, height: 0.2 });

    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'PHOTO_BEFORE_SUBJECT_BIRTH')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test — expect fail** — `npm test -- checks-media.test.ts -t PHOTO_BEFORE_SUBJECT_BIRTH`.

- [ ] **Step 3: Implement** — append to `src/api/checks/checks-media.ts`:

```typescript
export function checkPhotoBeforeSubjectBirth(db: Database): CheckResult[] {
  const rows = queryAll<{
    media_id: string; person_id: string; event_date: string; birth_date: string;
  }>(db, `
    SELECT mr.media_id, mr.person_id,
           e.date_value AS event_date,
           be.date_value AS birth_date
    FROM media_regions mr
    JOIN media_links ml
      ON ml.media_id = mr.media_id AND ml.entity_type = 'event'
    JOIN events e
      ON e.id = ml.entity_id
      AND e.date_value IS NOT NULL
      AND e.date_type IN ('exact', 'calculated')
    JOIN event_participants bep
      ON bep.person_id = mr.person_id
    JOIN events be
      ON be.id = bep.event_id
      AND be.event_type = 'birth'
      AND be.date_value IS NOT NULL
      AND be.date_type IN ('exact', 'calculated')
    WHERE mr.person_id IS NOT NULL
  `);
  const results: CheckResult[] = [];
  for (const r of rows) {
    if (dateDefinitelyAfter(r.birth_date, r.event_date)) {
      results.push({
        code: 'PHOTO_BEFORE_SUBJECT_BIRTH',
        severity: 'warning' as CheckSeverity,
        message: `Bilden är daterad (${r.event_date}) före den taggade personens födelse (${r.birth_date})`,
        messageParams: { eventDate: r.event_date, birthDate: r.birth_date },
        personIds: [r.person_id],
        mediaIds: [r.media_id],
      });
    }
  }
  return results;
}
```

- [ ] **Step 4: Register** — add to the import and register after `checkPhotoAfterSubjectDeath`.

- [ ] **Step 5: i18n** —
  - sv: `PHOTO_BEFORE_SUBJECT_BIRTH: 'Bilden är daterad ({eventDate}) före den taggade personens födelse ({birthDate})'`
  - en: `PHOTO_BEFORE_SUBJECT_BIRTH: 'Photo is dated ({eventDate}) before the tagged person\'s birth ({birthDate})'`

- [ ] **Step 6: Run test — expect pass** — `npm test -- checks-media.test.ts`. Then `npm test`.

- [ ] **Step 7: Commit** —

```bash
git add src/api/checks/checks-media.ts src/api/checks/index.ts tests/unit/checks-media.test.ts src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "feat(checks): add PHOTO_BEFORE_SUBJECT_BIRTH quality check"
```

---

## Phase D — Source checks (new file, relocate ORPHANED_SOURCE)

### Task 13: Scaffold `checks-source.ts` and relocate `checkOrphanedSource`

**Files:**
- Create: `src/api/checks/checks-source.ts`
- Modify: `src/api/checks/checks-quality.ts` (remove `checkOrphanedSource`)
- Modify: `src/api/checks/index.ts`
- Create: `tests/unit/checks-source.test.ts`

- [ ] **Step 1: Move `checkOrphanedSource`** — create `src/api/checks/checks-source.ts`:

```typescript
import type { Database } from 'node-sqlite3-wasm';
import { queryAll } from '../db';
import type { CheckResult, CheckSeverity } from './check-utils';

export function checkOrphanedSource(db: Database): CheckResult[] {
  const rows = queryAll<{ id: string; title: string }>(db, `
    SELECT s.id, s.title
    FROM sources s
    WHERE NOT EXISTS (
      SELECT 1 FROM citations c WHERE c.source_id = s.id
    )
  `);

  return rows.map(r => ({
    code: 'ORPHANED_SOURCE',
    severity: 'notice' as CheckSeverity,
    message: `Källa "${r.title || '(utan titel)'}" har inga källhänvisningar`,
    messageParams: { title: r.title || '' },
    personIds: [],
    sourceIds: [r.id],
  }));
}
```

- [ ] **Step 2: Remove it from `checks-quality.ts`** — delete `checkOrphanedSource` from `src/api/checks/checks-quality.ts`.

- [ ] **Step 3: Update `index.ts`** —
  - Remove `checkOrphanedSource` from the `./checks-quality` import list.
  - Add `import { checkOrphanedSource } from './checks-source';`
  - Existing registration line `{ name: 'checkOrphanedSource', fn: (db) => checkOrphanedSource(db) },` stays unchanged.

- [ ] **Step 4: Scaffold the test file** — create `tests/unit/checks-source.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { runAllChecks } from '../../src/api/checks';
import { createSource, createCitation } from '../../src/api/sources';
import { createEvent } from '../../src/api/events';
import { createTestDb } from './helpers';

let db: ReturnType<typeof createTestDb>;
beforeEach(() => { db = createTestDb(); });

describe('ORPHANED_SOURCE (relocated)', () => {
  it('still fires for sources with no citations', () => {
    const s = createSource(db, { title: 'Lonely source' });
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'ORPHANED_SOURCE' && r.sourceIds?.includes(s.id))).toHaveLength(1);
  });

  it('does not fire when source has a citation', () => {
    const s = createSource(db, { title: 'Cited source' });
    const e = createEvent(db, { event_type: 'birth' });
    createCitation(db, { source_id: s.id, event_id: e.id });
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'ORPHANED_SOURCE' && r.sourceIds?.includes(s.id))).toHaveLength(0);
  });
});
```

- [ ] **Step 5: Run tests — expect pass** — `npm test -- checks-source.test.ts` and `npm test`. If the ORPHANED_SOURCE case in the older `checks.test.ts` still exists, keep it there — duplicated coverage is fine.

- [ ] **Step 6: Commit** —

```bash
git add src/api/checks/checks-source.ts src/api/checks/checks-quality.ts src/api/checks/index.ts tests/unit/checks-source.test.ts
git commit -m "refactor(checks): move ORPHANED_SOURCE to checks-source.ts"
```

### Task 14: `SOURCE_MISSING_TITLE`

**Files:**
- Modify: `src/api/checks/checks-source.ts`
- Modify: `src/api/checks/index.ts`
- Modify: `tests/unit/checks-source.test.ts`
- Modify: `src/renderer/i18n/sv.ts`, `src/renderer/i18n/en.ts`

- [ ] **Step 1: Write the failing test** — append to `tests/unit/checks-source.test.ts`:

```typescript
describe('SOURCE_MISSING_TITLE', () => {
  it('fires when title is empty string', () => {
    const s = createSource(db, { title: '' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'SOURCE_MISSING_TITLE' && r.sourceIds?.includes(s.id));
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('warning');
  });

  it('does not fire when title has content', () => {
    const s = createSource(db, { title: 'Proper title' });
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'SOURCE_MISSING_TITLE' && r.sourceIds?.includes(s.id))).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test — expect fail** — `npm test -- checks-source.test.ts -t SOURCE_MISSING_TITLE`.

- [ ] **Step 3: Implement** — append to `src/api/checks/checks-source.ts`:

```typescript
export function checkSourceMissingTitle(db: Database): CheckResult[] {
  const rows = queryAll<{ id: string }>(db, `
    SELECT id FROM sources WHERE title IS NULL OR title = ''
  `);
  return rows.map(r => ({
    code: 'SOURCE_MISSING_TITLE',
    severity: 'warning' as CheckSeverity,
    message: 'Källa saknar titel',
    messageParams: {},
    personIds: [],
    sourceIds: [r.id],
  }));
}
```

- [ ] **Step 4: Register** — add to the import from `./checks-source` and register after `checkOrphanedSource`.

- [ ] **Step 5: i18n** —
  - sv: `SOURCE_MISSING_TITLE: 'Källa saknar titel'`
  - en: `SOURCE_MISSING_TITLE: 'Source has no title'`

- [ ] **Step 6: Run test — expect pass** — `npm test -- checks-source.test.ts`. Then `npm test`.

- [ ] **Step 7: Commit** —

```bash
git add src/api/checks/checks-source.ts src/api/checks/index.ts tests/unit/checks-source.test.ts src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "feat(checks): add SOURCE_MISSING_TITLE quality check"
```

### Task 15: `ORPHANED_REPOSITORY`

Same file set as Task 14.

- [ ] **Step 1: Write the failing test** — append to `tests/unit/checks-source.test.ts`:

```typescript
import { createRepository, linkSourceRepository } from '../../src/api/repositories';

describe('ORPHANED_REPOSITORY', () => {
  it('fires for a repository that no source references', () => {
    const r = createRepository(db, { name: 'Tyst arkiv' });
    const results = runAllChecks(db);
    const hit = results.filter(h => h.code === 'ORPHANED_REPOSITORY' && h.messageParams?.repositoryId === r.id);
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('notice');
  });

  it('does not fire when the repository is linked to a source', () => {
    const repo = createRepository(db, { name: 'Använt arkiv' });
    const src = createSource(db, { title: 'Bok' });
    linkSourceRepository(db, src.id, repo.id);
    const results = runAllChecks(db);
    expect(results.filter(h => h.code === 'ORPHANED_REPOSITORY' && h.messageParams?.repositoryId === repo.id)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test — expect fail** — `npm test -- checks-source.test.ts -t ORPHANED_REPOSITORY`.

- [ ] **Step 3: Implement** — append to `src/api/checks/checks-source.ts`:

```typescript
export function checkOrphanedRepository(db: Database): CheckResult[] {
  const rows = queryAll<{ id: string; name: string }>(db, `
    SELECT r.id, r.name
    FROM repositories r
    WHERE NOT EXISTS (
      SELECT 1 FROM source_repositories sr WHERE sr.repository_id = r.id
    )
  `);
  return rows.map(r => ({
    code: 'ORPHANED_REPOSITORY',
    severity: 'notice' as CheckSeverity,
    message: `Arkivet "${r.name}" är inte kopplat till någon källa`,
    messageParams: { name: r.name, repositoryId: r.id },
    personIds: [],
  }));
}
```

- [ ] **Step 4: Register** — add to the import and register after `checkSourceMissingTitle`.

- [ ] **Step 5: i18n** —
  - sv: `ORPHANED_REPOSITORY: 'Arkivet "{name}" är inte kopplat till någon källa'`
  - en: `ORPHANED_REPOSITORY: 'Repository "{name}" is not linked to any source'`

- [ ] **Step 6: Run test — expect pass** — `npm test -- checks-source.test.ts`. Then `npm test`.

- [ ] **Step 7: Commit** —

```bash
git add src/api/checks/checks-source.ts src/api/checks/index.ts tests/unit/checks-source.test.ts src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "feat(checks): add ORPHANED_REPOSITORY quality check"
```

---

## Phase E — Duplicates (new file)

### Task 16: Scaffold `checks-duplicates.ts` + `POSSIBLE_DUPLICATE_PERSON`

**Files:**
- Create: `src/api/checks/checks-duplicates.ts`
- Modify: `src/api/checks/index.ts`
- Create: `tests/unit/checks-duplicates.test.ts`
- Modify: `src/renderer/i18n/sv.ts`, `src/renderer/i18n/en.ts`

- [ ] **Step 1: Write the failing test** — create `tests/unit/checks-duplicates.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { runAllChecks } from '../../src/api/checks';
import { createPerson, addPersonName } from '../../src/api/persons';
import { createEvent } from '../../src/api/events';
import { addEventParticipant } from '../../src/api/relationships';
import { createTestDb } from './helpers';

let db: ReturnType<typeof createTestDb>;
beforeEach(() => { db = createTestDb(); });

describe('POSSIBLE_DUPLICATE_PERSON', () => {
  it('fires for two persons with the same name and matching birth year', () => {
    const p1 = createPerson(db, { given_name: 'Anna', surname: 'Eriksson' });
    const p2 = createPerson(db, { given_name: 'Anna', surname: 'Eriksson' });
    for (const p of [p1, p2]) {
      const e = createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1900-01-01' });
      addEventParticipant(db, { event_id: e.id, person_id: p.id, role: 'primary' });
    }
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'POSSIBLE_DUPLICATE_PERSON');
    expect(hit.length).toBeGreaterThanOrEqual(1);
    // Both persons must appear across the results for this pair
    const ids = new Set(hit.flatMap(h => h.personIds));
    expect(ids.has(p1.id)).toBe(true);
    expect(ids.has(p2.id)).toBe(true);
    expect(hit[0].severity).toBe('notice');
  });
});
```

- [ ] **Step 2: Run test — expect fail** — `npm test -- checks-duplicates.test.ts`.

- [ ] **Step 3: Implement** — create `src/api/checks/checks-duplicates.ts`:

```typescript
import type { Database } from 'node-sqlite3-wasm';
import { queryAll } from '../db';
import type { CheckResult, CheckSeverity } from './check-utils';
import { findDuplicates } from '../duplicates';

export function checkPossibleDuplicatePerson(db: Database): CheckResult[] {
  const candidates = findDuplicates(db);
  return candidates.map(c => ({
    code: 'POSSIBLE_DUPLICATE_PERSON',
    severity: 'notice' as CheckSeverity,
    message: `Möjliga dubblettpersoner (poäng ${c.score})`,
    messageParams: { score: c.score, count: 2 },
    personIds: [c.person1_id, c.person2_id],
  }));
}
```

**Note:** `DuplicateCandidate` uses snake_case (`person1_id`, `person2_id`, `score`) — see `src/api/duplicates.ts`.

- [ ] **Step 4: Register** — in `src/api/checks/index.ts`:
  - Add `import { checkPossibleDuplicatePerson } from './checks-duplicates';`
  - Register at the end of `getAllCheckFunctions()` after all other checks.

- [ ] **Step 5: i18n** —
  - sv: `POSSIBLE_DUPLICATE_PERSON: 'Möjliga dubblettpersoner (poäng {score})'`
  - en: `POSSIBLE_DUPLICATE_PERSON: 'Possible duplicate persons (score {score})'`

- [ ] **Step 6: Run test — expect pass** — `npm test -- checks-duplicates.test.ts`. Then `npm test`.

- [ ] **Step 7: Commit** —

```bash
git add src/api/checks/checks-duplicates.ts src/api/checks/index.ts tests/unit/checks-duplicates.test.ts src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "feat(checks): add POSSIBLE_DUPLICATE_PERSON quality check"
```

### Task 17: `DUPLICATE_IDENTIFIER`

**Files:**
- Modify: `src/api/checks/checks-duplicates.ts`
- Modify: `src/api/checks/index.ts`
- Modify: `tests/unit/checks-duplicates.test.ts`
- Modify: `src/renderer/i18n/sv.ts`, `src/renderer/i18n/en.ts`

- [ ] **Step 1: Write the failing test** — append to `tests/unit/checks-duplicates.test.ts`:

```typescript
import { queryRun } from '../../src/api/db';
import { v4 as uuidv4 } from 'uuid';

describe('DUPLICATE_IDENTIFIER', () => {
  it('fires when two persons share the same identifier', () => {
    const p1 = createPerson(db, {});
    const p2 = createPerson(db, {});
    queryRun(db,
      'INSERT INTO person_identifiers (id, person_id, identifier_type, identifier_value) VALUES (?, ?, ?, ?)',
      [uuidv4(), p1.id, 'familysearch', 'ABC-1234']);
    queryRun(db,
      'INSERT INTO person_identifiers (id, person_id, identifier_type, identifier_value) VALUES (?, ?, ?, ?)',
      [uuidv4(), p2.id, 'familysearch', 'ABC-1234']);
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'DUPLICATE_IDENTIFIER');
    expect(hit).toHaveLength(1);
    expect(hit[0].severity).toBe('warning');
    expect(new Set(hit[0].personIds)).toEqual(new Set([p1.id, p2.id]));
  });

  it('does not fire for unique identifiers', () => {
    const p1 = createPerson(db, {});
    const p2 = createPerson(db, {});
    queryRun(db, 'INSERT INTO person_identifiers (id, person_id, identifier_type, identifier_value) VALUES (?, ?, ?, ?)', [uuidv4(), p1.id, 'familysearch', 'A']);
    queryRun(db, 'INSERT INTO person_identifiers (id, person_id, identifier_type, identifier_value) VALUES (?, ?, ?, ?)', [uuidv4(), p2.id, 'familysearch', 'B']);
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'DUPLICATE_IDENTIFIER')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test — expect fail** — `npm test -- checks-duplicates.test.ts -t DUPLICATE_IDENTIFIER`.

- [ ] **Step 3: Implement** — append to `src/api/checks/checks-duplicates.ts`:

```typescript
export function checkDuplicateIdentifier(db: Database): CheckResult[] {
  const rows = queryAll<{ identifier_type: string; identifier_value: string; person_id: string }>(db, `
    SELECT identifier_type, identifier_value, person_id
    FROM person_identifiers
    WHERE (identifier_type, identifier_value) IN (
      SELECT identifier_type, identifier_value
      FROM person_identifiers
      GROUP BY identifier_type, identifier_value
      HAVING COUNT(*) > 1
    )
    ORDER BY identifier_type, identifier_value
  `);
  const groups = new Map<string, { type: string; value: string; personIds: string[] }>();
  for (const r of rows) {
    const key = `${r.identifier_type}:${r.identifier_value}`;
    if (!groups.has(key)) groups.set(key, { type: r.identifier_type, value: r.identifier_value, personIds: [] });
    groups.get(key)!.personIds.push(r.person_id);
  }
  const results: CheckResult[] = [];
  for (const g of groups.values()) {
    results.push({
      code: 'DUPLICATE_IDENTIFIER',
      severity: 'warning' as CheckSeverity,
      message: `${g.personIds.length} personer delar identifierare ${g.type}:${g.value}`,
      messageParams: { count: g.personIds.length, type: g.type, value: g.value },
      personIds: g.personIds,
    });
  }
  return results;
}
```

- [ ] **Step 4: Register** — add to the import and register after `checkPossibleDuplicatePerson`.

- [ ] **Step 5: i18n** —
  - sv: `DUPLICATE_IDENTIFIER: '{count} personer delar identifierare {type}:{value}'`
  - en: `DUPLICATE_IDENTIFIER: '{count} persons share identifier {type}:{value}'`

- [ ] **Step 6: Run test — expect pass** — `npm test -- checks-duplicates.test.ts`. Then `npm test`.

- [ ] **Step 7: Commit** —

```bash
git add src/api/checks/checks-duplicates.ts src/api/checks/index.ts tests/unit/checks-duplicates.test.ts src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "feat(checks): add DUPLICATE_IDENTIFIER quality check"
```

### Task 18: `DUPLICATE_PLACE`

Same file set as Task 17.

- [ ] **Step 1: Write the failing test** — append to `tests/unit/checks-duplicates.test.ts`:

```typescript
import { createPlace } from '../../src/api/places';

describe('DUPLICATE_PLACE', () => {
  it('fires for two places with the same normalized_name and same parent', () => {
    const country = createPlace(db, { name: 'Sverige' });
    const a = createPlace(db, { name: 'Stockholm', parent_place_id: country.id });
    const b = createPlace(db, { name: 'Stockholm', parent_place_id: country.id });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'DUPLICATE_PLACE');
    expect(hit).toHaveLength(1);
    expect(new Set(hit[0].placeIds)).toEqual(new Set([a.id, b.id]));
  });

  it('does not fire for same name under different parents', () => {
    const p1 = createPlace(db, { name: 'Sverige' });
    const p2 = createPlace(db, { name: 'Norge' });
    createPlace(db, { name: 'Strömstad', parent_place_id: p1.id });
    createPlace(db, { name: 'Strömstad', parent_place_id: p2.id });
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'DUPLICATE_PLACE')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test — expect fail** — `npm test -- checks-duplicates.test.ts -t DUPLICATE_PLACE`.

- [ ] **Step 3: Implement** — append to `src/api/checks/checks-duplicates.ts`:

```typescript
export function checkDuplicatePlace(db: Database): CheckResult[] {
  const rows = queryAll<{ normalized_name: string; parent_place_id: string | null; id: string; name: string }>(db, `
    SELECT normalized_name, parent_place_id, id, name
    FROM places
    WHERE (normalized_name, COALESCE(parent_place_id, '')) IN (
      SELECT normalized_name, COALESCE(parent_place_id, '')
      FROM places
      GROUP BY normalized_name, COALESCE(parent_place_id, '')
      HAVING COUNT(*) > 1
    )
    ORDER BY normalized_name
  `);
  const groups = new Map<string, { name: string; placeIds: string[] }>();
  for (const r of rows) {
    const key = `${r.normalized_name}:${r.parent_place_id ?? ''}`;
    if (!groups.has(key)) groups.set(key, { name: r.name, placeIds: [] });
    groups.get(key)!.placeIds.push(r.id);
  }
  const results: CheckResult[] = [];
  for (const g of groups.values()) {
    results.push({
      code: 'DUPLICATE_PLACE',
      severity: 'notice' as CheckSeverity,
      message: `${g.placeIds.length} platser delar namn "${g.name}" under samma förälder`,
      messageParams: { count: g.placeIds.length, name: g.name },
      personIds: [],
      placeIds: g.placeIds,
    });
  }
  return results;
}
```

- [ ] **Step 4: Register** — add to the import and register after `checkDuplicateIdentifier`.

- [ ] **Step 5: i18n** —
  - sv: `DUPLICATE_PLACE: '{count} platser delar namn "{name}" under samma förälder'`
  - en: `DUPLICATE_PLACE: '{count} places share name "{name}" under the same parent'`

- [ ] **Step 6: Run test — expect pass** — `npm test -- checks-duplicates.test.ts`. Then `npm test`.

- [ ] **Step 7: Commit** —

```bash
git add src/api/checks/checks-duplicates.ts src/api/checks/index.ts tests/unit/checks-duplicates.test.ts src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "feat(checks): add DUPLICATE_PLACE quality check"
```

### Task 19: `DUPLICATE_MEDIA`

Same file set as Task 18.

- [ ] **Step 1: Write the failing test** — append to `tests/unit/checks-duplicates.test.ts`:

```typescript
import { createMedia, addMediaLink } from '../../src/api/media';

describe('DUPLICATE_MEDIA', () => {
  it('fires for two media rows with the same file_ref', () => {
    const p = createPerson(db, {});
    const a = createMedia(db, { title: 'Foo', file_ref: '/photos/p.jpg' });
    const b = createMedia(db, { title: 'Bar', file_ref: '/photos/p.jpg' });
    addMediaLink(db, { media_id: a.id, entity_type: 'person', entity_id: p.id });
    addMediaLink(db, { media_id: b.id, entity_type: 'person', entity_id: p.id });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'DUPLICATE_MEDIA');
    expect(hit).toHaveLength(1);
    expect(new Set(hit[0].mediaIds)).toEqual(new Set([a.id, b.id]));
  });

  it('does not fire for empty file_ref', () => {
    const p = createPerson(db, {});
    const a = createMedia(db, { title: 'Foo' });
    const b = createMedia(db, { title: 'Bar' });
    addMediaLink(db, { media_id: a.id, entity_type: 'person', entity_id: p.id });
    addMediaLink(db, { media_id: b.id, entity_type: 'person', entity_id: p.id });
    const results = runAllChecks(db);
    expect(results.filter(r => r.code === 'DUPLICATE_MEDIA')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test — expect fail** — `npm test -- checks-duplicates.test.ts -t DUPLICATE_MEDIA`.

- [ ] **Step 3: Implement** — append to `src/api/checks/checks-duplicates.ts`:

```typescript
export function checkDuplicateMedia(db: Database): CheckResult[] {
  const rows = queryAll<{ file_ref: string; id: string; title: string | null }>(db, `
    SELECT file_ref, id, title
    FROM media
    WHERE file_ref IS NOT NULL AND file_ref != ''
      AND file_ref IN (
        SELECT file_ref FROM media
        WHERE file_ref IS NOT NULL AND file_ref != ''
        GROUP BY file_ref
        HAVING COUNT(*) > 1
      )
    ORDER BY file_ref
  `);
  const groups = new Map<string, { fileRef: string; mediaIds: string[] }>();
  for (const r of rows) {
    if (!groups.has(r.file_ref)) groups.set(r.file_ref, { fileRef: r.file_ref, mediaIds: [] });
    groups.get(r.file_ref)!.mediaIds.push(r.id);
  }
  const results: CheckResult[] = [];
  for (const g of groups.values()) {
    results.push({
      code: 'DUPLICATE_MEDIA',
      severity: 'notice' as CheckSeverity,
      message: `${g.mediaIds.length} mediafiler delar filväg "${g.fileRef}"`,
      messageParams: { count: g.mediaIds.length, fileRef: g.fileRef },
      personIds: [],
      mediaIds: g.mediaIds,
    });
  }
  return results;
}
```

- [ ] **Step 4: Register** — add to the import and register after `checkDuplicatePlace`.

- [ ] **Step 5: i18n** —
  - sv: `DUPLICATE_MEDIA: '{count} mediafiler delar filväg "{fileRef}"'`
  - en: `DUPLICATE_MEDIA: '{count} media files share file path "{fileRef}"'`

- [ ] **Step 6: Run test — expect pass** — `npm test -- checks-duplicates.test.ts`. Then `npm test`.

- [ ] **Step 7: Commit** —

```bash
git add src/api/checks/checks-duplicates.ts src/api/checks/index.ts tests/unit/checks-duplicates.test.ts src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "feat(checks): add DUPLICATE_MEDIA quality check"
```

### Task 20: `DUPLICATE_SOURCE`

Same file set as Task 19.

- [ ] **Step 1: Write the failing test** — append to `tests/unit/checks-duplicates.test.ts`:

```typescript
import { createSource } from '../../src/api/sources';

describe('DUPLICATE_SOURCE', () => {
  it('fires for two sources with the same URL', () => {
    const a = createSource(db, { title: 'A', url: 'https://example.org/book' });
    const b = createSource(db, { title: 'B', url: 'https://example.org/book' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'DUPLICATE_SOURCE');
    expect(hit).toHaveLength(1);
    expect(new Set(hit[0].sourceIds)).toEqual(new Set([a.id, b.id]));
  });

  it('fires for two sources with the same (title, author, publication_info)', () => {
    const a = createSource(db, { title: 'Bygdebok', author: 'Svensson', publication_info: '1932' });
    const b = createSource(db, { title: 'Bygdebok', author: 'Svensson', publication_info: '1932' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'DUPLICATE_SOURCE');
    expect(hit).toHaveLength(1);
    expect(new Set(hit[0].sourceIds)).toEqual(new Set([a.id, b.id]));
  });

  it('deduplicates when a group matches both url and metadata', () => {
    const a = createSource(db, { title: 'Same', author: 'Same', publication_info: 'Same', url: 'https://x.org' });
    const b = createSource(db, { title: 'Same', author: 'Same', publication_info: 'Same', url: 'https://x.org' });
    const results = runAllChecks(db);
    const hit = results.filter(r => r.code === 'DUPLICATE_SOURCE');
    expect(hit).toHaveLength(1);
    expect(new Set(hit[0].sourceIds)).toEqual(new Set([a.id, b.id]));
  });
});
```

- [ ] **Step 2: Run test — expect fail** — `npm test -- checks-duplicates.test.ts -t DUPLICATE_SOURCE`.

- [ ] **Step 3: Implement** — append to `src/api/checks/checks-duplicates.ts`:

```typescript
export function checkDuplicateSource(db: Database): CheckResult[] {
  // Pass 1: same URL
  const urlRows = queryAll<{ id: string; url: string }>(db, `
    SELECT id, url FROM sources
    WHERE url IS NOT NULL AND url != ''
      AND url IN (
        SELECT url FROM sources
        WHERE url IS NOT NULL AND url != ''
        GROUP BY url
        HAVING COUNT(*) > 1
      )
    ORDER BY url
  `);
  const urlGroups = new Map<string, string[]>();
  for (const r of urlRows) {
    if (!urlGroups.has(r.url)) urlGroups.set(r.url, []);
    urlGroups.get(r.url)!.push(r.id);
  }

  // Pass 2: same (title, author, publication_info), all non-empty
  const metaRows = queryAll<{ id: string; title: string; author: string; publication_info: string }>(db, `
    SELECT id, title, author, publication_info FROM sources
    WHERE title IS NOT NULL AND title != ''
      AND author IS NOT NULL AND author != ''
      AND publication_info IS NOT NULL AND publication_info != ''
      AND (title, author, publication_info) IN (
        SELECT title, author, publication_info FROM sources
        WHERE title IS NOT NULL AND title != ''
          AND author IS NOT NULL AND author != ''
          AND publication_info IS NOT NULL AND publication_info != ''
        GROUP BY title, author, publication_info
        HAVING COUNT(*) > 1
      )
    ORDER BY title, author, publication_info
  `);
  const metaGroups = new Map<string, string[]>();
  for (const r of metaRows) {
    const key = `${r.title}\u0000${r.author}\u0000${r.publication_info}`;
    if (!metaGroups.has(key)) metaGroups.set(key, []);
    metaGroups.get(key)!.push(r.id);
  }

  // Merge: dedupe by the set of sourceIds so a group that appears in both passes
  // shows up only once.
  const seen = new Set<string>();
  const results: CheckResult[] = [];
  function emit(sourceIds: string[], label: string) {
    const key = [...sourceIds].sort().join(',');
    if (seen.has(key)) return;
    seen.add(key);
    results.push({
      code: 'DUPLICATE_SOURCE',
      severity: 'notice' as CheckSeverity,
      message: `${sourceIds.length} källor matchar ${label}`,
      messageParams: { count: sourceIds.length, label },
      personIds: [],
      sourceIds,
    });
  }
  for (const ids of urlGroups.values()) emit(ids, 'samma URL');
  for (const ids of metaGroups.values()) emit(ids, 'samma titel, författare och utgivning');
  return results;
}
```

- [ ] **Step 4: Register** — add to the import and register after `checkDuplicateMedia`.

- [ ] **Step 5: i18n** —
  - sv: `DUPLICATE_SOURCE: '{count} källor matchar {label}'`
  - en: `DUPLICATE_SOURCE: '{count} sources match {label}'`

  Note: the `{label}` text is already translated to Swedish inside the check for historical reasons. For English callers the label remains Swedish, which is acceptable for v1 (the English `quality.checks.DUPLICATE_SOURCE` message still interpolates the label verbatim). A follow-up task can move the label to a key.

- [ ] **Step 6: Run test — expect pass** — `npm test -- checks-duplicates.test.ts`. Then `npm test`.

- [ ] **Step 7: Commit** —

```bash
git add src/api/checks/checks-duplicates.ts src/api/checks/index.ts tests/unit/checks-duplicates.test.ts src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "feat(checks): add DUPLICATE_SOURCE quality check"
```

---

## Phase F — UI: per-entity links on duplicate rows

### Task 21: Render each duplicate ID as its own router-link

**Files:**
- Modify: `src/renderer/components/QualityIssuesTable.vue`
- Modify: `src/renderer/views/QualityView.vue` (skip row-click navigation on duplicate rows)

**Context:** Today the entity column shows one span (`entity-name`). For rows whose code starts with `DUPLICATE_` or equals `POSSIBLE_DUPLICATE_PERSON`, render each entity as its own `<router-link>` using the matching name array. Row click navigation is suppressed for these rows because there is no single target.

- [ ] **Step 1: Extend the template** — edit `src/renderer/components/QualityIssuesTable.vue`. Replace the `<span class="entity-name">{{ entityLabel(r) }}</span>` block with:

```vue
<template v-if="isDuplicateCode(r.code)">
  <router-link
    v-for="(id, idx) in primaryIds(r)"
    :key="id"
    class="entity-name entity-link"
    :to="entityRoute(r, id)"
    @click.stop
  >{{ primaryLabel(r, idx) }}</router-link>
</template>
<span v-else class="entity-name">{{ entityLabel(r) }}</span>
```

Then add the helpers to the `<script setup>` block:

```typescript
function isDuplicateCode(code: string): boolean {
  return code === 'POSSIBLE_DUPLICATE_PERSON' || code.startsWith('DUPLICATE_');
}

function primaryIds(r: QualityIssue): string[] {
  const t = entityType(r);
  if (t === 'place') return r.placeIds ?? [];
  if (t === 'media') return r.mediaIds ?? [];
  if (t === 'source') return r.sourceIds ?? [];
  if (t === 'person') return r.personIds ?? [];
  return [];
}

function primaryLabel(r: QualityIssue, idx: number): string {
  const t = entityType(r);
  const arr =
    t === 'place' ? r.placeNames :
    t === 'media' ? r.mediaTitles :
    t === 'source' ? r.sourceTitles :
    r.personNames;
  const name = arr?.[idx];
  return name && name.trim() !== '' ? name : `#${idx + 1}`;
}

function entityRoute(r: QualityIssue, id: string): { path: string; query?: Record<string, string> } {
  const t = entityType(r);
  if (t === 'place') return { path: '/places/' + id };
  if (t === 'media') return { path: '/media', query: { open: id } };
  if (t === 'source') return { path: '/sources/' + id };
  return { path: '/persons/' + id };
}
```

Also adjust the CSS so the `entity-link` stacks/separates nicely:

```css
.entity-link { color: var(--accent); text-decoration: underline; }
.entity-link + .entity-link { margin-left: var(--space-sm); }
```

- [ ] **Step 2: Suppress row click on duplicate rows** — in `src/renderer/views/QualityView.vue` update `hasNavigation` so it returns `false` for rows where `isDuplicateCode(r.code)` holds. Simplest change: add a small helper and use it:

```typescript
function isDuplicateCode(code: string): boolean {
  return code === 'POSSIBLE_DUPLICATE_PERSON' || code.startsWith('DUPLICATE_');
}

function hasNavigation(r: QualityResult): boolean {
  if (isDuplicateCode(r.code)) return false;
  return (
    (r.placeIds?.length ?? 0) > 0 ||
    (r.mediaIds?.length ?? 0) > 0 ||
    (r.sourceIds?.length ?? 0) > 0 ||
    r.personIds.length > 0
  );
}
```

- [ ] **Step 3: Verify manually** — start the app: `npm start`. Navigate to Quality, run checks, seed a duplicate (e.g., via `seed_family` + manual dupe). Confirm duplicate rows render multiple clickable links and that row click does not navigate.

- [ ] **Step 4: Commit** —

```bash
git add src/renderer/components/QualityIssuesTable.vue src/renderer/views/QualityView.vue
git commit -m "feat(ui): per-entity links for duplicate quality rows"
```

---

## Phase G — Finishing

### Task 22: Full sweep + release notes

**Files:**
- Modify: `docs/PLAN.md` (roadmap — mark quality-check expansion done; add v2 compare-UI entry)

- [ ] **Step 1: Run full test suite** — `npm test`. Every test should pass. `npm run lint` should also pass with zero errors.

- [ ] **Step 2: Run the app manually** —
  - `npm start`
  - Navigate to `/quality`, click "Kör kontroller"
  - Confirm severity counts include new codes
  - Filter by each severity to confirm i18n text is correct
  - Confirm a duplicate row shows multiple links

- [ ] **Step 3: Update roadmap** — in `docs/PLAN.md`, append under the "Done" section:

```markdown
- **Quality checks expansion** — 18 new checks (persons, places, media, sources, cross-entity duplicates). Spec: [docs/plans/archive/2026-04-19-quality-checks-expansion-design.md](plans/archive/2026-04-19-quality-checks-expansion-design.md)
```

Also add to the Roadmap section (not yet done):

```markdown
- **Unified compare-and-merge UI for duplicates (v2)** — extend `MergePersonsModal` pattern to places, media, and sources. Make the compare UI the landing target for all `DUPLICATE_*` quality rows. Consider a `/duplicates` route aggregating all duplicate types.
```

- [ ] **Step 4: Archive the spec** — `mv docs/plans/2026-04-19-quality-checks-expansion-design.md docs/plans/archive/2026-04-19-quality-checks-expansion-design.md` and update the link above to the archived path.

- [ ] **Step 5: Bump version** — edit `package.json` to bump the minor version (x.Y.0). This is a feature-complete release.

- [ ] **Step 6: Commit the release** —

```bash
git add docs/PLAN.md docs/superpowers/specs package.json
git commit -m "release: quality checks expansion — 18 new checks across persons, places, media, sources, duplicates"
```
