# Gazetteer Match Quality Checks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add quality checks that evaluate place-to-gazetteer match quality, surfaced in QualityView.

**Architecture:** New check function in `checks-location.ts` that loads gazetteers, resolves all places without manual coordinates, and flags ambiguous/partial/none/wrong-level matches. Results flow through existing check pipeline to QualityView. A "wrong level" heuristic catches single-word place names (like country names) that match leaf parishes.

**Tech Stack:** TypeScript, SQLite (node-sqlite3-wasm), existing check + gazetteer APIs.

**Spec:** `docs/plans/2026-04-15-gazetteer-quality-media-editor-design.md` (Feature 1)

---

### Task 1: Extend CheckResult with place fields

**Files:**
- Modify: `src/api/checks/check-utils.ts:6-14`
- Modify: `src/renderer/stores/quality.ts:4-13`

- [ ] **Step 1: Add optional place fields to CheckResult**

In `src/api/checks/check-utils.ts`, add three optional fields to the `CheckResult` interface:

```typescript
export interface CheckResult {
  code: string;
  severity: CheckSeverity;
  message: string;
  messageParams?: Record<string, string | number>;
  personIds: string[];
  eventIds?: string[];
  relationshipIds?: string[];
  placeIds?: string[];
  resolvedLat?: number;
  resolvedLon?: number;
  matchedPath?: string;
}
```

- [ ] **Step 2: Mirror fields in QualityResult**

In `src/renderer/stores/quality.ts`, add the same three fields to `QualityResult`:

```typescript
export interface QualityResult {
  code: string;
  severity: 'error' | 'warning' | 'notice';
  message: string;
  messageParams?: Record<string, string | number>;
  personIds: string[];
  personNames: string[];
  eventIds?: string[];
  relationshipIds?: string[];
  placeIds?: string[];
  resolvedLat?: number;
  resolvedLon?: number;
  matchedPath?: string;
}
```

- [ ] **Step 3: Commit**

```
git add src/api/checks/check-utils.ts src/renderer/stores/quality.ts
git commit -m "feat: add placeIds and resolved coords to CheckResult"
```

---

### Task 2: Write the gazetteer match quality check function

**Files:**
- Modify: `src/api/checks/checks-location.ts`
- Test: `tests/unit/checks-location.test.ts` (create)

- [ ] **Step 1: Write failing tests**

Create `tests/unit/checks-location.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import { checkGazetteerMatchQuality } from '../../src/api/checks/checks-location';
import { createPlace } from '../../src/api/places';
import { createPerson } from '../../src/api/persons';
import { createEvent } from '../../src/api/events';
import { addEventParticipant } from '../../src/api/relationships';
import type { Gazetteer } from '../../src/api/place-gazetteers/types';

// Minimal test gazetteer: Sverige > Dalarnas lan > Smedjebacken
const testGazetteer: Gazetteer = {
  id: 'test-gaz',
  name: 'Test Gazetteer',
  locale: 'sv',
  kind: 'point',
  root: {
    name: 'Sverige',
    type: 'country',
    lat: 62.0, lon: 15.0,
    children: [
      {
        name: 'Dalarnas lan',
        type: 'county',
        lat: 60.6, lon: 15.6,
        aliases: ['Kopparbergs lan'],
        children: [
          {
            name: 'Smedjebacken',
            type: 'parish',
            lat: 60.15, lon: 15.41,
          },
          {
            name: 'Amerika',
            type: 'parish',
            lat: 60.5, lon: 15.3,
          },
        ],
      },
    ],
  },
};

describe('checkGazetteerMatchQuality', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('returns empty for places with manual coordinates', () => {
    createPlace(db, { name: 'Smedjebacken', latitude: 60.15, longitude: 15.41 });
    const results = checkGazetteerMatchQuality(db, [testGazetteer]);
    expect(results).toEqual([]);
  });

  it('returns PLACE_MATCH_NONE for unresolvable place', () => {
    const place = createPlace(db, { name: 'Fantasiland' });
    const person = createPerson(db, { given_name: 'Test' });
    const event = createEvent(db, { event_type: 'birth', place_id: place.id });
    addEventParticipant(db, { event_id: event.id, person_id: person.id, role: 'primary' });

    const results = checkGazetteerMatchQuality(db, [testGazetteer]);
    expect(results.some(r => r.code === 'PLACE_MATCH_NONE')).toBe(true);
  });

  it('returns PLACE_MATCH_WRONG_LEVEL for country name matched to parish', () => {
    const place = createPlace(db, { name: 'Amerika' });
    const person = createPerson(db, { given_name: 'Test' });
    const event = createEvent(db, { event_type: 'birth', place_id: place.id });
    addEventParticipant(db, { event_id: event.id, person_id: person.id, role: 'primary' });

    const results = checkGazetteerMatchQuality(db, [testGazetteer]);
    expect(results.some(r => r.code === 'PLACE_MATCH_WRONG_LEVEL')).toBe(true);
  });

  it('flags exact match as no issue', () => {
    const place = createPlace(db, { name: 'Smedjebacken, Dalarnas lan, Sverige' });
    const person = createPerson(db, { given_name: 'Test' });
    const event = createEvent(db, { event_type: 'birth', place_id: place.id });
    addEventParticipant(db, { event_id: event.id, person_id: person.id, role: 'primary' });

    const results = checkGazetteerMatchQuality(db, [testGazetteer]);
    expect(results.length).toBe(0);
  });

  it('returns PLACE_MATCH_PARTIAL for partial match with unmatched components', () => {
    const place = createPlace(db, { name: 'Okand gard, Smedjebacken, Sverige' });
    const person = createPerson(db, { given_name: 'Test' });
    const event = createEvent(db, { event_type: 'birth', place_id: place.id });
    addEventParticipant(db, { event_id: event.id, person_id: person.id, role: 'primary' });

    const results = checkGazetteerMatchQuality(db, [testGazetteer]);
    expect(results.some(r => r.code === 'PLACE_MATCH_PARTIAL')).toBe(true);
  });

  it('includes personIds from linked event participants', () => {
    const place = createPlace(db, { name: 'Fantasiland' });
    const person = createPerson(db, { given_name: 'Test' });
    const event = createEvent(db, { event_type: 'birth', place_id: place.id });
    addEventParticipant(db, { event_id: event.id, person_id: person.id, role: 'primary' });

    const results = checkGazetteerMatchQuality(db, [testGazetteer]);
    const match = results.find(r => r.code === 'PLACE_MATCH_NONE');
    expect(match?.personIds).toContain(person.id);
  });

  it('skips places not linked to any event', () => {
    createPlace(db, { name: 'Fantasiland' });
    const results = checkGazetteerMatchQuality(db, [testGazetteer]);
    expect(results).toEqual([]);
  });

  it('includes placeIds and resolvedLat/Lon for partial matches', () => {
    const place = createPlace(db, { name: 'Okand gard, Smedjebacken, Sverige' });
    const person = createPerson(db, { given_name: 'Test' });
    const event = createEvent(db, { event_type: 'birth', place_id: place.id });
    addEventParticipant(db, { event_id: event.id, person_id: person.id, role: 'primary' });

    const results = checkGazetteerMatchQuality(db, [testGazetteer]);
    const match = results.find(r => r.code === 'PLACE_MATCH_PARTIAL');
    expect(match?.placeIds).toContain(place.id);
    expect(match?.resolvedLat).toBeDefined();
    expect(match?.resolvedLon).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/checks-location.test.ts`
Expected: FAIL — `checkGazetteerMatchQuality` not exported

- [ ] **Step 3: Implement checkGazetteerMatchQuality**

Add to `src/api/checks/checks-location.ts`:

```typescript
import { resolvePlace } from '../place-gazetteers/resolver';
import type { Gazetteer } from '../place-gazetteers/types';

// Well-known country/region names that should NOT match leaf parishes
const WELL_KNOWN_REGIONS = new Set([
  'sverige', 'norway', 'norge', 'danmark', 'denmark', 'finland',
  'england', 'amerika', 'usa', 'tyskland', 'germany', 'frankrike',
  'france', 'polen', 'poland', 'ryssland', 'russia', 'irland',
  'ireland', 'skottland', 'scotland', 'italien', 'italy', 'spanien',
  'spain', 'kanada', 'canada', 'australien', 'australia',
]);

export function checkGazetteerMatchQuality(db: Database, gazetteers: Gazetteer[]): CheckResult[] {
  if (gazetteers.length === 0) return [];

  // Get places used in events that lack manual coordinates
  const places = queryAll<{ id: string; name: string }>(db, );

  // Resolve each unique place name once
  const resolveCache = new Map<string, ReturnType<typeof resolvePlace>>();
  const results: CheckResult[] = [];

  for (const place of places) {
    if (!place.name?.trim()) continue;

    let resolved = resolveCache.get(place.name);
    if (resolved === undefined) {
      resolved = resolvePlace(place.name, gazetteers);
      resolveCache.set(place.name, resolved);
    }

    // Find persons linked to events at this place
    const personIds = queryAll<{ person_id: string }>(db, , [place.id]).map(r => r.person_id);

    if (personIds.length === 0) continue;

    if (!resolved) {
      results.push({
        code: 'PLACE_MATCH_NONE',
        severity: 'notice',
        message: `Plats utan koordinater: ${place.name}`,
        messageParams: { name: place.name },
        personIds,
        placeIds: [place.id],
      });
      continue;
    }

    // Wrong-level heuristic: single-component name matching a leaf at depth > 2
    const components = place.name.split(',').map(s => s.trim()).filter(Boolean);
    const isLeaf = !resolved.matchedNode.children || resolved.matchedNode.children.length === 0;
    const isWellKnown = WELL_KNOWN_REGIONS.has(place.name.trim().toLowerCase());
    if (components.length === 1 && isLeaf && resolved.matchDepth > 2 || isWellKnown && isLeaf) {
      results.push({
        code: 'PLACE_MATCH_WRONG_LEVEL',
        severity: 'warning',
        message: `Plats matchad pa fel niva: ${place.name} matchade ${resolved.matchedPath.join(' > ')}`,
        messageParams: { name: place.name, matchedPath: resolved.matchedPath.join(' > ') },
        personIds,
        placeIds: [place.id],
        resolvedLat: resolved.lat,
        resolvedLon: resolved.lon,
        matchedPath: resolved.matchedPath.join(' > '),
      });
      continue;
    }

    if (resolved.matchQuality === 'ambiguous') {
      results.push({
        code: 'PLACE_MATCH_AMBIGUOUS',
        severity: 'warning',
        message: `Plats har tvetydig matchning: ${place.name} — matchade ${resolved.matchedPath.join(' > ')}`,
        messageParams: { name: place.name, matchedPath: resolved.matchedPath.join(' > ') },
        personIds,
        placeIds: [place.id],
        resolvedLat: resolved.lat,
        resolvedLon: resolved.lon,
        matchedPath: resolved.matchedPath.join(' > '),
      });
    } else if (resolved.matchQuality === 'partial') {
      results.push({
        code: 'PLACE_MATCH_PARTIAL',
        severity: 'notice',
        message: `Plats delvis matchad: ${place.name} — omatchade: ${resolved.unmatchedComponents.join(', ')}`,
        messageParams: { name: place.name, unmatched: resolved.unmatchedComponents.join(', ') },
        personIds,
        placeIds: [place.id],
        resolvedLat: resolved.lat,
        resolvedLon: resolved.lon,
        matchedPath: resolved.matchedPath.join(' > '),
      });
    }
    // exact matches produce no result — they're fine
  }

  return results;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/checks-location.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```
git add src/api/checks/checks-location.ts tests/unit/checks-location.test.ts
git commit -m "feat: gazetteer match quality check function with tests"
```

---

### Task 3: Register the check and load gazetteers

**Files:**
- Modify: `src/api/checks/index.ts`

- [ ] **Step 1: Add import and load gazetteers in runAllCheckFunctions**

In `src/api/checks/index.ts`, add the import:

```typescript
import {
  checkSimultaneousDistantLocations,
  checkMediaFileMissing,
  checkGazetteerMatchQuality,
} from './checks-location';

import { loadGazetteers, getAllGazetteers } from '../place-gazetteers';
import { getImportedGazetteers } from '../gazetteers';
import { getDbSetting } from '../db_settings';
import type { GazetteerConfig } from '../place-gazetteers/types';
```

Inside `runAllCheckFunctions`, after the existing location checks (after line 93), add:

```typescript
  // E2. Gazetteer match quality
  const configJson = getDbSetting(db, 'gazetteer_config');
  const gazConfig: GazetteerConfig = configJson
    ? JSON.parse(configJson)
    : { enabledGazetteers: getAllGazetteers().map(g => g.id) };
  const imported = getImportedGazetteers(db);
  const gazetteers = loadGazetteers(gazConfig, imported);
  const rejectedJson = getDbSetting(db, 'gazetteer_rejections');
  const rejectedPlaceIds = new Set<string>(rejectedJson ? JSON.parse(rejectedJson) : []);
  run('checkGazetteerMatchQuality', () => {
    const raw = checkGazetteerMatchQuality(db, gazetteers);
    return raw.filter(r => !r.placeIds?.some(id => rejectedPlaceIds.has(id)));
  });
```

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: All tests pass (existing + new)

- [ ] **Step 3: Commit**

```
git add src/api/checks/index.ts
git commit -m "feat: register gazetteer match quality check in check runner"
```

---

### Task 4: Add i18n keys for gazetteer checks

**Files:**
- Modify: `src/renderer/i18n/sv.ts`
- Modify: `src/renderer/i18n/en.ts`

- [ ] **Step 1: Add Swedish translations**

In `sv.ts`, inside the `quality.checks` object, after the `MEDIA_FILE_MISSING` line, add:

```typescript
      PLACE_MATCH_AMBIGUOUS: 'Tvetydig platsmatchning: {name} — matchade {matchedPath}',
      PLACE_MATCH_PARTIAL: 'Delvis platsmatchning: {name} — omatchade komponenter: {unmatched}',
      PLACE_MATCH_NONE: 'Plats utan koordinater: {name}',
      PLACE_MATCH_WRONG_LEVEL: 'Plats matchad pa fel niva: {name} matchade {matchedPath}',
```

- [ ] **Step 2: Add English translations**

In `en.ts`, inside the `quality.checks` object, after the `MEDIA_FILE_MISSING` line, add:

```typescript
      PLACE_MATCH_AMBIGUOUS: 'Ambiguous place match: {name} — matched {matchedPath}',
      PLACE_MATCH_PARTIAL: 'Partial place match: {name} — unmatched: {unmatched}',
      PLACE_MATCH_NONE: 'Place without coordinates: {name}',
      PLACE_MATCH_WRONG_LEVEL: 'Place matched at wrong level: {name} matched {matchedPath}',
```

- [ ] **Step 3: Commit**

```
git add src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "i18n: add gazetteer match quality check translations"
```

---

### Task 5: Update docs and bump version

**Files:**
- Modify: `docs/PLAN.md`
- Modify: `CLAUDE.md` (if needed)
- Modify: `package.json` (version bump)

- [ ] **Step 1: Run full test suite to verify everything works**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 2: Update PLAN.md implementation status**

Add a new row to the implementation status table.

- [ ] **Step 3: Bump version (minor — new feature)**

In `package.json`, bump the minor version.

- [ ] **Step 4: Commit**

```
git add -A
git commit -m "feat(vX.Y.0): gazetteer match quality checks in QualityView"
```
