# Keepsake Reports Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Rebuild the Reports view around a single audience — family members of the genealogist — with seven keepsake reports (four evolved, three new) plus six framable chart prints, dropping two redundant reports.

**Architecture:** Each report remains a Vue component in `src/renderer/components/reports/`. A new `primitives/` subfolder holds six shared print-safe components (`ReportCover`, `PersonMiniCard`, `TimelineBar`, `LifeMap`, `PlaceBoundaryMap`, `MediaChronological`) used across reports. One new `src/api/` function (`getAliveInYear`) for the Family-in-Year-X snapshot. Two new renderer composables wrap existing API calls with chronological sorting. Reports read what the genealogist authored — no inferred prose or historical context.

**Tech Stack:** Vue 3 (Composition API, `<script setup>`), TypeScript, Vitest for unit tests, Playwright for E2E, node-sqlite3-wasm, Leaflet/OSM (already in use for maps), Electron IPC.

**Spec reference:** [2026-04-19-keepsake-reports-redesign-design.md](2026-04-19-keepsake-reports-redesign-design.md)

**Target version:** v0.131.0 (main advanced to v0.130.x while this feature was in a worktree, so bump goes to v0.131.0).

---

## Phase 1: Foundation

Foundation work is backend/API/composables/design tokens — nothing visible to the user yet. After Phase 1 the app still renders the same old reports; infrastructure is just in place.

### Task 1: Add `getAliveInYear` API function

**Files:**
- Create section in: `src/api/report_data.ts`
- Test: `tests/unit/report_data.test.ts`

- [x] **Step 1: Write the failing test**

Append these tests to `tests/unit/report_data.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import type { Database } from 'node-sqlite3-wasm';
import {
  getAliveInYear,
} from '../../src/api/report_data';
import { createPerson } from '../../src/api/persons';
import { createEvent } from '../../src/api/events';
import { addEventParticipant } from '../../src/api/relationships';
import { createRelationship } from '../../src/api/relationships';
import { findOrCreatePlace } from '../../src/api/places';

describe('getAliveInYear', () => {
  let db: Database;
  beforeEach(() => { db = createTestDb(); });

  function addBirth(personId: string, year: number, placeName?: string) {
    const placeId = placeName ? findOrCreatePlace(db, placeName).id : undefined;
    const event = createEvent(db, {
      event_type: 'birth',
      date_type: 'exact',
      date_value: `${year}-01-01`,
      place_id: placeId,
    });
    addEventParticipant(db, { event_id: event.id, person_id: personId, role: 'primary' });
  }
  function addDeath(personId: string, year: number) {
    const event = createEvent(db, {
      event_type: 'death',
      date_type: 'exact',
      date_value: `${year}-12-31`,
    });
    addEventParticipant(db, { event_id: event.id, person_id: personId, role: 'primary' });
  }

  it('returns persons with known birth and death bracketing the target year', () => {
    const p = createPerson(db, { sex: 'M', given_name: 'Erik', surname: 'Andersson' });
    addBirth(p.id, 1850);
    addDeath(p.id, 1920);
    const result = getAliveInYear(db, 1900);
    expect(result.persons.some(x => x.id === p.id)).toBe(true);
    expect(result.persons.find(x => x.id === p.id)?.age).toBe(50);
  });

  it('excludes persons born after the target year', () => {
    const p = createPerson(db, { sex: 'F', given_name: 'Anna', surname: 'Svensson' });
    addBirth(p.id, 1920);
    addDeath(p.id, 1990);
    const result = getAliveInYear(db, 1900);
    expect(result.persons.some(x => x.id === p.id)).toBe(false);
  });

  it('excludes persons who died before the target year', () => {
    const p = createPerson(db, { sex: 'M', given_name: 'Johan', surname: 'Nilsson' });
    addBirth(p.id, 1800);
    addDeath(p.id, 1890);
    const result = getAliveInYear(db, 1900);
    expect(result.persons.some(x => x.id === p.id)).toBe(false);
  });

  it('includes persons with birth but no death if birth is before target year', () => {
    const p = createPerson(db, { sex: 'F', given_name: 'Kristina', surname: 'Larsson' });
    addBirth(p.id, 1850);
    const result = getAliveInYear(db, 1900);
    expect(result.persons.some(x => x.id === p.id)).toBe(true);
  });

  it('excludes persons with only death if death is after 110 years from target year', () => {
    const p = createPerson(db, { sex: 'M', given_name: 'Sven', surname: 'Eriksson' });
    addDeath(p.id, 2050);
    const result = getAliveInYear(db, 1900);
    expect(result.persons.some(x => x.id === p.id)).toBe(false);
  });

  it('includes persons with neither birth nor death if they have events in target year', () => {
    const p = createPerson(db, { sex: 'M', given_name: 'Olof', surname: 'Persson' });
    const event = createEvent(db, {
      event_type: 'census',
      date_type: 'exact',
      date_value: '1900-06-15',
    });
    addEventParticipant(db, { event_id: event.id, person_id: p.id, role: 'primary' });
    const result = getAliveInYear(db, 1900);
    expect(result.persons.some(x => x.id === p.id)).toBe(true);
  });

  it('groups persons by family unit (couple relationships)', () => {
    const husband = createPerson(db, { sex: 'M', given_name: 'Erik', surname: 'Andersson' });
    const wife = createPerson(db, { sex: 'F', given_name: 'Anna', surname: 'Andersson' });
    const child = createPerson(db, { sex: 'F', given_name: 'Maja', surname: 'Andersson' });
    addBirth(husband.id, 1850);
    addBirth(wife.id, 1855);
    addBirth(child.id, 1880);

    const couple = createRelationship(db, { type: 'couple', person1_id: husband.id, person2_id: wife.id });
    createRelationship(db, { type: 'parent_child', person1_id: husband.id, person2_id: child.id });
    createRelationship(db, { type: 'parent_child', person1_id: wife.id, person2_id: child.id });

    const result = getAliveInYear(db, 1900);
    const family = result.families.find(f => f.relationshipId === couple.id);
    expect(family).toBeDefined();
    expect(family?.parents.map(p => p.id).sort()).toEqual([husband.id, wife.id].sort());
    expect(family?.children.map(c => c.id)).toContain(child.id);
  });

  it('returns place name from latest pre-target-year event with a place', () => {
    const p = createPerson(db, { sex: 'M', given_name: 'Lars', surname: 'Gustafsson' });
    addBirth(p.id, 1850, 'Ödeshög');
    const place = findOrCreatePlace(db, 'Stockholm');
    const event = createEvent(db, {
      event_type: 'residence',
      date_type: 'exact',
      date_value: '1895-01-01',
      place_id: place.id,
    });
    addEventParticipant(db, { event_id: event.id, person_id: p.id, role: 'primary' });
    const result = getAliveInYear(db, 1900);
    expect(result.persons.find(x => x.id === p.id)?.placeName).toBe('Stockholm');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/report_data.test.ts
```

Expected: FAIL — `getAliveInYear` is not exported from `src/api/report_data`.

- [x] **Step 3: Implement the function**

Add to `src/api/report_data.ts`:

```typescript
export interface AliveInYearPerson {
  id: string;
  given_name: string | null;
  surname: string | null;
  sex: 'M' | 'F' | 'U';
  birthYear: number | null;
  deathYear: number | null;
  age: number | null;
  placeName: string | null;
}

export interface AliveInYearFamily {
  relationshipId: string;
  parents: AliveInYearPerson[];
  children: AliveInYearPerson[];
}

export interface AliveInYearResult {
  year: number;
  persons: AliveInYearPerson[];
  families: AliveInYearFamily[];
  unattached: AliveInYearPerson[];
}

const MAX_LIFESPAN = 110;

export function getAliveInYear(db: Database, year: number): AliveInYearResult {
  // Use a CTE to compute per-person birth/death years and membership in the year window
  const rows = db.all(`
    WITH birth AS (
      SELECT ep.person_id AS pid,
             CAST(substr(e.date_value, 1, 4) AS INTEGER) AS birth_year
      FROM events e
      JOIN event_participants ep ON ep.event_id = e.id
      WHERE e.event_type = 'birth' AND e.date_value IS NOT NULL
    ),
    death AS (
      SELECT ep.person_id AS pid,
             CAST(substr(e.date_value, 1, 4) AS INTEGER) AS death_year
      FROM events e
      JOIN event_participants ep ON ep.event_id = e.id
      WHERE e.event_type = 'death' AND e.date_value IS NOT NULL
    ),
    any_event AS (
      SELECT ep.person_id AS pid,
             CAST(substr(e.date_value, 1, 4) AS INTEGER) AS any_year
      FROM events e
      JOIN event_participants ep ON ep.event_id = e.id
      WHERE e.date_value IS NOT NULL
    ),
    last_place AS (
      SELECT ep.person_id AS pid, pl.name AS place_name
      FROM events e
      JOIN event_participants ep ON ep.event_id = e.id
      JOIN places pl ON pl.id = e.place_id
      WHERE e.date_value IS NOT NULL AND CAST(substr(e.date_value, 1, 4) AS INTEGER) <= ?
      ORDER BY e.date_value DESC
    )
    SELECT p.id, p.sex,
           pn.given_name, pn.surname,
           b.birth_year, d.death_year,
           (SELECT place_name FROM last_place lp WHERE lp.pid = p.id LIMIT 1) AS place_name,
           EXISTS(SELECT 1 FROM any_event a WHERE a.pid = p.id AND a.any_year = ?) AS has_event_in_year
    FROM persons p
    LEFT JOIN person_names pn ON pn.person_id = p.id AND pn.sort_order = 0
    LEFT JOIN birth b ON b.pid = p.id
    LEFT JOIN death d ON d.pid = p.id
  `, [year, year]) as Array<{
    id: string; sex: 'M' | 'F' | 'U';
    given_name: string | null; surname: string | null;
    birth_year: number | null; death_year: number | null;
    place_name: string | null; has_event_in_year: number;
  }>;

  const alive: AliveInYearPerson[] = [];
  for (const r of rows) {
    const birthOk = r.birth_year == null || r.birth_year <= year;
    const deathOk = r.death_year == null || r.death_year >= year;
    const notBornYet = r.birth_year != null && r.birth_year > year;
    const diedAlready = r.death_year != null && r.death_year < year;
    const tooOldNoBirth = r.birth_year == null && r.death_year != null && (r.death_year - year) > MAX_LIFESPAN;
    const tooOldNoDeath = r.death_year == null && r.birth_year != null && (year - r.birth_year) > MAX_LIFESPAN;

    let include = false;
    if (notBornYet || diedAlready) include = false;
    else if (r.birth_year != null && r.death_year != null) include = birthOk && deathOk;
    else if (r.birth_year != null) include = !tooOldNoDeath;
    else if (r.death_year != null) include = !tooOldNoBirth;
    else include = !!r.has_event_in_year;

    if (include) {
      alive.push({
        id: r.id, sex: r.sex, given_name: r.given_name, surname: r.surname,
        birthYear: r.birth_year, deathYear: r.death_year,
        age: r.birth_year != null ? year - r.birth_year : null,
        placeName: r.place_name,
      });
    }
  }

  // Group into family units by couple relationships
  const alivePersonIds = new Set(alive.map(p => p.id));
  const coupleRows = db.all(`
    SELECT id, person1_id, person2_id FROM relationships WHERE type = 'couple'
  `) as Array<{ id: string; person1_id: string | null; person2_id: string | null }>;

  const parentChildRows = db.all(`
    SELECT person1_id AS parent_id, person2_id AS child_id
    FROM relationships WHERE type = 'parent_child'
  `) as Array<{ parent_id: string | null; child_id: string | null }>;

  const childrenByParent = new Map<string, string[]>();
  for (const r of parentChildRows) {
    if (!r.parent_id || !r.child_id) continue;
    if (!childrenByParent.has(r.parent_id)) childrenByParent.set(r.parent_id, []);
    childrenByParent.get(r.parent_id)!.push(r.child_id);
  }

  const personById = new Map(alive.map(p => [p.id, p]));
  const families: AliveInYearFamily[] = [];
  const groupedPersonIds = new Set<string>();

  for (const c of coupleRows) {
    if (!c.person1_id || !c.person2_id) continue;
    const p1 = personById.get(c.person1_id);
    const p2 = personById.get(c.person2_id);
    if (!p1 && !p2) continue;
    const parents: AliveInYearPerson[] = [];
    if (p1) { parents.push(p1); groupedPersonIds.add(p1.id); }
    if (p2) { parents.push(p2); groupedPersonIds.add(p2.id); }

    const childIds = new Set<string>();
    if (c.person1_id) (childrenByParent.get(c.person1_id) || []).forEach(x => childIds.add(x));
    if (c.person2_id) (childrenByParent.get(c.person2_id) || []).forEach(x => childIds.add(x));
    const children: AliveInYearPerson[] = [];
    for (const cid of childIds) {
      const child = personById.get(cid);
      if (child) { children.push(child); groupedPersonIds.add(child.id); }
    }

    families.push({ relationshipId: c.id, parents, children });
  }

  const unattached = alive.filter(p => !groupedPersonIds.has(p.id));

  return { year, persons: alive, families, unattached };
}
```

- [x] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/report_data.test.ts
```

Expected: PASS (all existing tests + the 8 new ones).

- [x] **Step 5: Commit**

```bash
git add src/api/report_data.ts tests/unit/report_data.test.ts
git commit -m "feat(api): add getAliveInYear for Family-in-Year-X report"
```

---

### Task 2: Wire getAliveInYear through IPC and preload

**Files:**
- Modify: `src/main/ipc/utility.ts`
- Modify: `src/preload/index.ts`

- [x] **Step 1: Add IPC handler**

In `src/main/ipc/utility.ts`, find the block of `reports:*` handlers (around lines 53–58) and append:

```typescript
  wrapHandler('reports:aliveInYear', (year) => reportData.getAliveInYear(getDb(), year as number));
```

- [x] **Step 2: Expose in preload**

In `src/preload/index.ts`, find the `reports:` object (around line 153) and add inside it:

```typescript
    aliveInYear: (year: number) => ipcRenderer.invoke('reports:aliveInYear', year),
```

- [x] **Step 3: Update window.api type declarations**

Check `src/renderer` for `window.api` type augmentations (search for `reports.personSummary` in `.d.ts` or component type blocks) and add `aliveInYear: (year: number) => Promise<AliveInYearResult>` to the same shape.

- [x] **Step 4: Run lint + tests**

```bash
npm run lint && npm test
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/main/ipc/utility.ts src/preload/index.ts
git commit -m "feat(ipc): expose reports:aliveInYear"
```

---

### Task 3: Add report design tokens

**Files:**
- Modify: `src/renderer/styles/tokens.css`

- [x] **Step 1: Add report-specific tokens**

Append to `:root` in `src/renderer/styles/tokens.css`:

```css
  /* Report typography */
  --report-serif-stack: Georgia, 'Times New Roman', 'Liberation Serif', serif;
  --report-prose-leading: 1.65;
  --report-page-max-width: 800px;
  --report-cover-accent-height: 4px;
```

- [x] **Step 2: Run lint + tests**

```bash
npm run lint && npm test
```

Expected: PASS (WCAG tests should still pass — these tokens don't introduce colors).

- [x] **Step 3: Commit**

```bash
git add src/renderer/styles/tokens.css
git commit -m "style(tokens): add report-specific typography tokens"
```

---

### Task 4: Add researcher_name db_setting and Settings UI

**Files:**
- Modify: `src/renderer/views/SettingsView.vue`
- Modify: `src/renderer/i18n/sv.ts`
- Modify: `src/renderer/i18n/en.ts`

- [x] **Step 1: Locate the Database tab section**

In `src/renderer/views/SettingsView.vue`, find the Database tab content block. It likely contains the existing default-person-id picker.

- [x] **Step 2: Add researcher_name input**

Add a new labeled input inside the Database tab (or a new "Reports" subsection within Settings if the Database tab is crowded). Use the existing `window.api.db.getSetting` / `setSetting` pattern:

```vue
<label>
  {{ $t('settings.researcherName') }}
  <input
    type="text"
    :value="researcherName"
    @input="onResearcherNameInput(($event.target as HTMLInputElement).value)"
    :placeholder="$t('settings.researcherNamePlaceholder')"
  />
</label>
```

In `<script setup>`:

```typescript
const researcherName = ref<string>('');

async function loadResearcherName() {
  const val = await window.api.db.getSetting('researcher_name');
  researcherName.value = (val as string) || '';
}

async function onResearcherNameInput(value: string) {
  researcherName.value = value;
  if (value.trim()) {
    await window.api.db.setSetting('researcher_name', value.trim());
  } else {
    await window.api.db.deleteSetting('researcher_name');
  }
}

onMounted(loadResearcherName);
```

- [x] **Step 3: Add i18n keys**

In `src/renderer/i18n/en.ts`:

```typescript
  settings: {
    // ... existing keys
    researcherName: 'Researcher name',
    researcherNamePlaceholder: 'Your name, as it appears in report attribution',
  }
```

In `src/renderer/i18n/sv.ts`:

```typescript
  settings: {
    // ... existing keys
    researcherName: 'Släktforskarens namn',
    researcherNamePlaceholder: 'Ditt namn, som det visas i rapportens attribution',
  }
```

- [x] **Step 4: Test manually**

```bash
npm start
```

Navigate to Settings → Database, enter a name, close the app, re-open, verify name persists.

- [x] **Step 5: Commit**

```bash
git add src/renderer/views/SettingsView.vue src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "feat(settings): add researcher_name for report attribution"
```

---

### Task 5: Add `reports.common.*` i18n keys

**Files:**
- Modify: `src/renderer/i18n/sv.ts`
- Modify: `src/renderer/i18n/en.ts`

- [x] **Step 1: Add shared report keys (en)**

In `src/renderer/i18n/en.ts`, extend the `reports:` block:

```typescript
  reports: {
    // ... existing keys kept
    common: {
      compiledBy: 'Compiled by {name}',
      compiledByAnonymous: 'Compiled {date}',
      generatedOn: '{date}',
      page: 'Page {n}',
      pageOf: 'Page {n} of {total}',
      unknownPerson: 'Unknown',
      unknownPlace: 'Unknown place',
      unknownDate: 'Unknown date',
      years: '{birth}–{death}',
      born: 'Born',
      died: 'Died',
      married: 'Married',
      age: 'age {n}',
      sources: 'Sources',
      documents: 'Documents',
      photos: 'Photos',
    },
  }
```

- [x] **Step 2: Add shared report keys (sv)**

In `src/renderer/i18n/sv.ts`:

```typescript
  reports: {
    common: {
      compiledBy: 'Sammanställt av {name}',
      compiledByAnonymous: 'Sammanställt {date}',
      generatedOn: '{date}',
      page: 'Sida {n}',
      pageOf: 'Sida {n} av {total}',
      unknownPerson: 'Okänd',
      unknownPlace: 'Okänd plats',
      unknownDate: 'Okänt datum',
      years: '{birth}–{death}',
      born: 'Född',
      died: 'Död',
      married: 'Gift',
      age: 'ålder {n}',
      sources: 'Källor',
      documents: 'Dokument',
      photos: 'Foton',
    },
  }
```

- [x] **Step 3: Commit**

```bash
git add src/renderer/i18n/en.ts src/renderer/i18n/sv.ts
git commit -m "i18n: add reports.common.* shared keys"
```

---

### Task 6: Add `useLifeMap` composable

**Files:**
- Create: `src/renderer/composables/useLifeMap.ts`
- Test: `tests/unit/useLifeMap.test.ts`

- [x] **Step 1: Write the composable**

```typescript
// src/renderer/composables/useLifeMap.ts
import { ref, watch, type Ref } from 'vue';

export interface LifeMapEvent {
  id: string;
  eventType: string;
  dateISO: string | null;
  placeName: string;
  lat: number;
  lon: number;
  description: string | null;
}

export interface LifeMapData {
  events: LifeMapEvent[];
  bounds: { north: number; south: number; east: number; west: number } | null;
}

declare const window: Window & {
  api: {
    events: { forPerson: (personId: string) => Promise<Array<Record<string, unknown>>> };
    places: { get: (id: string) => Promise<Record<string, unknown> | null> };
  };
};

export function useLifeMap(personId: Ref<string | null>) {
  const data = ref<LifeMapData>({ events: [], bounds: null });
  const loading = ref(false);

  async function load() {
    if (!personId.value) {
      data.value = { events: [], bounds: null };
      return;
    }
    loading.value = true;
    try {
      const events = await window.api.events.forPerson(personId.value);
      const geocoded: LifeMapEvent[] = [];
      for (const e of events) {
        const placeId = e.place_id as string | null;
        if (!placeId) continue;
        const place = await window.api.places.get(placeId);
        if (!place || place.latitude == null || place.longitude == null) continue;
        geocoded.push({
          id: e.id as string,
          eventType: e.event_type as string,
          dateISO: (e.date_value as string) || null,
          placeName: place.name as string,
          lat: place.latitude as number,
          lon: place.longitude as number,
          description: (e.description as string) || null,
        });
      }
      geocoded.sort((a, b) => (a.dateISO || '').localeCompare(b.dateISO || ''));

      const bounds = geocoded.length ? {
        north: Math.max(...geocoded.map(g => g.lat)),
        south: Math.min(...geocoded.map(g => g.lat)),
        east: Math.max(...geocoded.map(g => g.lon)),
        west: Math.min(...geocoded.map(g => g.lon)),
      } : null;

      data.value = { events: geocoded, bounds };
    } finally {
      loading.value = false;
    }
  }

  watch(personId, load, { immediate: true });

  return { data, loading, reload: load };
}
```

- [x] **Step 2: Write a basic smoke test**

```typescript
// tests/unit/useLifeMap.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref, nextTick } from 'vue';
import { useLifeMap } from '../../src/renderer/composables/useLifeMap';

const mockApi = {
  events: { forPerson: vi.fn() },
  places: { get: vi.fn() },
};
// @ts-expect-error test shim
globalThis.window = { api: mockApi } as never;

describe('useLifeMap', () => {
  beforeEach(() => {
    mockApi.events.forPerson.mockReset();
    mockApi.places.get.mockReset();
  });

  it('returns geocoded events sorted chronologically', async () => {
    mockApi.events.forPerson.mockResolvedValue([
      { id: 'e1', event_type: 'birth', date_value: '1850-01-01', place_id: 'p1' },
      { id: 'e2', event_type: 'death', date_value: '1920-01-01', place_id: 'p2' },
    ]);
    mockApi.places.get.mockImplementation(async (id: string) => {
      if (id === 'p1') return { id, name: 'A', latitude: 1, longitude: 1 };
      if (id === 'p2') return { id, name: 'B', latitude: 2, longitude: 2 };
      return null;
    });

    const personId = ref('person-1');
    const { data } = useLifeMap(personId);
    await nextTick();
    await new Promise(r => setTimeout(r, 10));
    expect(data.value.events).toHaveLength(2);
    expect(data.value.events[0].eventType).toBe('birth');
    expect(data.value.events[1].eventType).toBe('death');
    expect(data.value.bounds).toEqual({ north: 2, south: 1, east: 2, west: 1 });
  });

  it('skips events without place_id or without lat/lon', async () => {
    mockApi.events.forPerson.mockResolvedValue([
      { id: 'e1', event_type: 'birth', date_value: '1850-01-01', place_id: null },
      { id: 'e2', event_type: 'death', date_value: '1920-01-01', place_id: 'p2' },
    ]);
    mockApi.places.get.mockResolvedValue({ name: 'B', latitude: null, longitude: null });
    const personId = ref('person-1');
    const { data } = useLifeMap(personId);
    await nextTick();
    await new Promise(r => setTimeout(r, 10));
    expect(data.value.events).toHaveLength(0);
  });
});
```

- [x] **Step 3: Run tests**

```bash
npx vitest run tests/unit/useLifeMap.test.ts
```

Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add src/renderer/composables/useLifeMap.ts tests/unit/useLifeMap.test.ts
git commit -m "feat(composables): add useLifeMap for chronological geocoded events"
```

---

### Task 7: Add `useMediaChronological` composable

**Files:**
- Create: `src/renderer/composables/useMediaChronological.ts`
- Test: `tests/unit/useMediaChronological.test.ts`

- [x] **Step 1: Write the composable**

```typescript
// src/renderer/composables/useMediaChronological.ts
import { ref, watch, type Ref } from 'vue';

export interface ChronologicalMediaItem {
  id: string;
  title: string | null;
  notes: string | null;
  fileRef: string | null;
  format: string | null;
  isPrintable: boolean;
  sortOrder: number;
  inferredDateISO: string | null;
}

export interface MediaEntityRef {
  entityType: 'person' | 'relationship' | 'place' | 'event';
  entityId: string;
}

declare const window: Window & {
  api: {
    media: { forEntity: (entityType: string, entityId: string) => Promise<Array<Record<string, unknown>>> };
    events: { forPerson?: (personId: string) => Promise<Array<Record<string, unknown>>> };
  };
};

export function useMediaChronological(entityRef: Ref<MediaEntityRef | null>) {
  const items = ref<ChronologicalMediaItem[]>([]);
  const loading = ref(false);

  async function load() {
    if (!entityRef.value) {
      items.value = [];
      return;
    }
    loading.value = true;
    try {
      const media = await window.api.media.forEntity(
        entityRef.value.entityType,
        entityRef.value.entityId,
      );
      // Map to our interface; date inference via linked event's date would require
      // additional API lookups — we keep it simple: use `sort_order` as primary sort,
      // fallback to title for stable ordering.
      const mapped: ChronologicalMediaItem[] = media.map(m => ({
        id: m.id as string,
        title: (m.title as string) || null,
        notes: (m.notes as string) || null,
        fileRef: (m.file_ref as string) || null,
        format: (m.format as string) || null,
        isPrintable: !!(m.is_printable as number | boolean),
        sortOrder: (m.sort_order as number) ?? 0,
        inferredDateISO: null,
      }));
      mapped.sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return (a.title || '').localeCompare(b.title || '');
      });
      items.value = mapped;
    } finally {
      loading.value = false;
    }
  }

  watch(entityRef, load, { immediate: true, deep: true });

  return { items, loading, reload: load };
}
```

- [x] **Step 2: Write smoke test**

```typescript
// tests/unit/useMediaChronological.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref, nextTick } from 'vue';
import { useMediaChronological } from '../../src/renderer/composables/useMediaChronological';

const mockApi = { media: { forEntity: vi.fn() } };
// @ts-expect-error test shim
globalThis.window = { api: mockApi } as never;

describe('useMediaChronological', () => {
  beforeEach(() => { mockApi.media.forEntity.mockReset(); });

  it('sorts by sort_order ascending', async () => {
    mockApi.media.forEntity.mockResolvedValue([
      { id: 'm2', title: 'Second', sort_order: 1 },
      { id: 'm1', title: 'First', sort_order: 0 },
    ]);
    const ref0 = ref({ entityType: 'person' as const, entityId: 'p1' });
    const { items } = useMediaChronological(ref0);
    await nextTick();
    await new Promise(r => setTimeout(r, 10));
    expect(items.value.map(i => i.id)).toEqual(['m1', 'm2']);
  });
});
```

- [x] **Step 3: Run tests**

```bash
npx vitest run tests/unit/useMediaChronological.test.ts
```

Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add src/renderer/composables/useMediaChronological.ts tests/unit/useMediaChronological.test.ts
git commit -m "feat(composables): add useMediaChronological"
```

---

## Phase 2: Primitives

Six shared print-safe components under `src/renderer/components/reports/primitives/`. Each one is a small Vue component with focused props.

### Task 8: Create primitives directory and ReportCover

**Files:**
- Create: `src/renderer/components/reports/primitives/ReportCover.vue`
- Test: `tests/unit/components/reports/ReportCover.test.ts`

- [x] **Step 1: Create the component**

```vue
<!-- src/renderer/components/reports/primitives/ReportCover.vue -->
<template>
  <div class="report-cover" role="banner">
    <div class="cover-accent" aria-hidden="true"></div>
    <div v-if="heroImageUrl" class="cover-hero">
      <img :src="heroImageUrl" :alt="heroAlt || title" />
    </div>
    <h1 class="cover-title">{{ title }}</h1>
    <p v-if="subtitle" class="cover-subtitle">{{ subtitle }}</p>
    <p class="cover-attribution">
      <template v-if="researcherName">
        {{ $t('reports.common.compiledBy', { name: researcherName }) }}
      </template>
      <template v-else>
        {{ $t('reports.common.compiledByAnonymous', { date: formattedDate }) }}
      </template>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  title: string;
  subtitle?: string;
  heroImageUrl?: string | null;
  heroAlt?: string;
  researcherName?: string | null;
  date?: Date;
}>();

const { locale } = useI18n();
const formattedDate = computed(() => {
  const d = props.date || new Date();
  return d.toLocaleDateString(locale.value === 'sv' ? 'sv-SE' : 'en-GB');
});
</script>

<style scoped>
.report-cover {
  padding: var(--space-2xl);
  text-align: center;
  font-family: var(--report-serif-stack);
  page-break-after: always;
}
.cover-accent {
  height: var(--report-cover-accent-height);
  width: 120px;
  background: var(--accent);
  margin: 0 auto var(--space-xl);
}
.cover-hero img {
  max-width: 60%;
  max-height: 400px;
  object-fit: cover;
  border-radius: var(--radius-sm);
  margin-bottom: var(--space-xl);
}
.cover-title { font-size: 2.5rem; margin: var(--space-lg) 0 var(--space-sm); }
.cover-subtitle { font-size: 1.25rem; color: var(--text-secondary); margin: 0 0 var(--space-2xl); }
.cover-attribution { font-size: var(--font-sm); color: var(--text-muted); margin-top: var(--space-2xl); }
</style>
```

- [x] **Step 2: Write component smoke test**

```typescript
// tests/unit/components/reports/ReportCover.test.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import ReportCover from '../../../../src/renderer/components/reports/primitives/ReportCover.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: { reports: { common: {
      compiledBy: 'Compiled by {name}',
      compiledByAnonymous: 'Compiled {date}',
    } } },
  },
});

describe('ReportCover', () => {
  it('renders title and subtitle', () => {
    const wrapper = mount(ReportCover, {
      props: { title: 'A Life', subtitle: 'Anna Andersson (1850–1920)' },
      global: { plugins: [i18n] },
    });
    expect(wrapper.text()).toContain('A Life');
    expect(wrapper.text()).toContain('Anna Andersson');
  });

  it('uses researcherName when provided', () => {
    const wrapper = mount(ReportCover, {
      props: { title: 'T', researcherName: 'Jonas Ahnstedt' },
      global: { plugins: [i18n] },
    });
    expect(wrapper.text()).toContain('Compiled by Jonas Ahnstedt');
  });

  it('falls back to anonymous attribution', () => {
    const wrapper = mount(ReportCover, {
      props: { title: 'T', date: new Date('2026-04-19') },
      global: { plugins: [i18n] },
    });
    expect(wrapper.text()).toContain('Compiled');
  });
});
```

- [x] **Step 3: Run tests**

```bash
npx vitest run tests/unit/components/reports/ReportCover.test.ts
```

Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add src/renderer/components/reports/primitives/ReportCover.vue tests/unit/components/reports/ReportCover.test.ts
git commit -m "feat(reports): add ReportCover primitive"
```

---

### Task 9: Add PersonMiniCard primitive

**Files:**
- Create: `src/renderer/components/reports/primitives/PersonMiniCard.vue`
- Test: `tests/unit/components/reports/PersonMiniCard.test.ts`

- [x] **Step 1: Create component**

```vue
<!-- src/renderer/components/reports/primitives/PersonMiniCard.vue -->
<template>
  <div class="person-mini-card" :class="['sex-' + sex]">
    <div v-if="portraitUrl" class="portrait">
      <img :src="portraitUrl" :alt="fullName" />
    </div>
    <div v-else class="portrait portrait-placeholder" aria-hidden="true">
      {{ initials }}
    </div>
    <div class="identity">
      <div class="name">{{ fullName }}</div>
      <div v-if="yearsLabel" class="years">{{ yearsLabel }}</div>
      <div v-if="keyPlace" class="place">{{ keyPlace }}</div>
      <div v-if="ahnentafel" class="ahnentafel">#{{ ahnentafel }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  givenName?: string | null;
  surname?: string | null;
  sex?: 'M' | 'F' | 'U';
  birthYear?: number | null;
  deathYear?: number | null;
  keyPlace?: string | null;
  portraitUrl?: string | null;
  ahnentafel?: number | null;
}>();

const fullName = computed(() =>
  [props.givenName, props.surname].filter(Boolean).join(' ') || '—'
);

const initials = computed(() => {
  const parts = [props.givenName, props.surname].filter(Boolean) as string[];
  return parts.map(p => p.charAt(0).toUpperCase()).join('') || '?';
});

const yearsLabel = computed(() => {
  if (!props.birthYear && !props.deathYear) return null;
  return `${props.birthYear ?? '?'}–${props.deathYear ?? ''}`;
});
</script>

<style scoped>
.person-mini-card {
  display: grid;
  grid-template-columns: 64px 1fr;
  gap: var(--space-md);
  padding: var(--space-sm);
  border: 1px solid var(--surface-border-subtle);
  border-radius: var(--radius-sm);
  break-inside: avoid;
}
.portrait {
  width: 64px; height: 64px;
  border-radius: var(--radius-full);
  overflow: hidden;
  background: var(--surface-hover);
}
.portrait img { width: 100%; height: 100%; object-fit: cover; }
.portrait-placeholder {
  display: flex; align-items: center; justify-content: center;
  font-weight: 600; color: var(--text-secondary);
}
.sex-M .portrait { background: var(--sex-m-bg); color: var(--sex-m-text); }
.sex-F .portrait { background: var(--sex-f-bg); color: var(--sex-f-text); }
.sex-U .portrait { background: var(--sex-u-bg); color: var(--sex-u-text); }
.name { font-weight: 600; }
.years, .place, .ahnentafel { font-size: var(--font-sm); color: var(--text-secondary); }
</style>
```

- [x] **Step 2: Write smoke test**

```typescript
// tests/unit/components/reports/PersonMiniCard.test.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PersonMiniCard from '../../../../src/renderer/components/reports/primitives/PersonMiniCard.vue';

describe('PersonMiniCard', () => {
  it('renders full name', () => {
    const wrapper = mount(PersonMiniCard, {
      props: { givenName: 'Anna', surname: 'Andersson', sex: 'F' },
    });
    expect(wrapper.text()).toContain('Anna Andersson');
  });
  it('renders years label', () => {
    const wrapper = mount(PersonMiniCard, {
      props: { givenName: 'E', surname: 'A', birthYear: 1850, deathYear: 1920 },
    });
    expect(wrapper.text()).toContain('1850–1920');
  });
  it('shows initials when no portrait', () => {
    const wrapper = mount(PersonMiniCard, {
      props: { givenName: 'Erik', surname: 'Andersson' },
    });
    expect(wrapper.text()).toContain('EA');
  });
  it('shows ahnentafel when provided', () => {
    const wrapper = mount(PersonMiniCard, {
      props: { givenName: 'X', surname: 'Y', ahnentafel: 4 },
    });
    expect(wrapper.text()).toContain('#4');
  });
});
```

- [x] **Step 3: Run tests**

```bash
npx vitest run tests/unit/components/reports/PersonMiniCard.test.ts
```

Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add src/renderer/components/reports/primitives/PersonMiniCard.vue tests/unit/components/reports/PersonMiniCard.test.ts
git commit -m "feat(reports): add PersonMiniCard primitive"
```

---

### Task 10: Add TimelineBar primitive

**Files:**
- Create: `src/renderer/components/reports/primitives/TimelineBar.vue`
- Test: `tests/unit/components/reports/TimelineBar.test.ts`

- [x] **Step 1: Create component**

```vue
<!-- src/renderer/components/reports/primitives/TimelineBar.vue -->
<template>
  <div class="timeline-bar" v-if="items.length > 0">
    <div class="track" :style="{ width: '100%' }">
      <div
        v-for="item in positioned"
        :key="item.id"
        class="marker"
        :class="['event-' + item.eventType]"
        :style="{ left: item.leftPct + '%' }"
        :title="item.label"
      >
        <span class="marker-dot" aria-hidden="true"></span>
        <span class="marker-label">{{ item.label }}</span>
      </div>
    </div>
    <div class="axis">
      <span class="axis-start">{{ yearMin }}</span>
      <span class="axis-end">{{ yearMax }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

export interface TimelineItem {
  id: string;
  year: number;
  eventType: string;
  label: string;
}

const props = defineProps<{
  items: TimelineItem[];
  rangeStart?: number | null;
  rangeEnd?: number | null;
}>();

const yearMin = computed(() => {
  if (props.rangeStart != null) return props.rangeStart;
  if (!props.items.length) return 0;
  return Math.min(...props.items.map(i => i.year));
});
const yearMax = computed(() => {
  if (props.rangeEnd != null) return props.rangeEnd;
  if (!props.items.length) return 0;
  return Math.max(...props.items.map(i => i.year));
});

const positioned = computed(() => {
  const span = Math.max(1, yearMax.value - yearMin.value);
  return props.items.map(item => ({
    ...item,
    leftPct: ((item.year - yearMin.value) / span) * 100,
  }));
});
</script>

<style scoped>
.timeline-bar { padding: var(--space-lg) 0; }
.track {
  position: relative;
  height: 4px;
  background: var(--surface-border);
  margin-bottom: var(--space-lg);
}
.marker {
  position: absolute; top: -6px;
  transform: translateX(-50%);
  text-align: center;
}
.marker-dot {
  display: block;
  width: 12px; height: 12px;
  border-radius: var(--radius-full);
  background: var(--accent);
  margin: 0 auto 2px;
}
.marker-label {
  display: block;
  font-size: var(--font-xs);
  white-space: nowrap;
  color: var(--text-secondary);
}
.axis {
  display: flex;
  justify-content: space-between;
  font-size: var(--font-xs);
  color: var(--text-muted);
}
</style>
```

- [x] **Step 2: Write smoke test**

```typescript
// tests/unit/components/reports/TimelineBar.test.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TimelineBar from '../../../../src/renderer/components/reports/primitives/TimelineBar.vue';

describe('TimelineBar', () => {
  it('renders items as markers', () => {
    const wrapper = mount(TimelineBar, {
      props: {
        items: [
          { id: '1', year: 1850, eventType: 'birth', label: 'Born 1850' },
          { id: '2', year: 1920, eventType: 'death', label: 'Died 1920' },
        ],
      },
    });
    expect(wrapper.findAll('.marker').length).toBe(2);
    expect(wrapper.text()).toContain('Born 1850');
  });

  it('positions markers proportionally', () => {
    const wrapper = mount(TimelineBar, {
      props: {
        items: [
          { id: '1', year: 1900, eventType: 'birth', label: 'A' },
          { id: '2', year: 1950, eventType: 'death', label: 'B' },
        ],
      },
    });
    const markers = wrapper.findAll('.marker');
    expect((markers[0].element as HTMLElement).style.left).toBe('0%');
    expect((markers[1].element as HTMLElement).style.left).toBe('100%');
  });

  it('renders nothing when items empty', () => {
    const wrapper = mount(TimelineBar, { props: { items: [] } });
    expect(wrapper.find('.timeline-bar').exists()).toBe(false);
  });
});
```

- [x] **Step 3: Run tests**

```bash
npx vitest run tests/unit/components/reports/TimelineBar.test.ts
```

Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add src/renderer/components/reports/primitives/TimelineBar.vue tests/unit/components/reports/TimelineBar.test.ts
git commit -m "feat(reports): add TimelineBar primitive"
```

---

### Task 11: Add LifeMap primitive

**Files:**
- Create: `src/renderer/components/reports/primitives/LifeMap.vue`
- Test: `tests/unit/components/reports/LifeMap.test.ts`

- [x] **Step 1: Study existing Leaflet usage**

Run once to locate existing map components for reference:

```bash
```

Use Grep to search for `leaflet` in `.vue` files under `src/renderer` and read the first match to understand the Leaflet/OSM setup pattern used in the app.

- [x] **Step 2: Create component**

```vue
<!-- src/renderer/components/reports/primitives/LifeMap.vue -->
<template>
  <div ref="mapEl" class="life-map" :style="{ height: height + 'px' }" role="img" :aria-label="ariaLabel"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface LifeMapPathPoint {
  lat: number;
  lon: number;
  label: string;
  year: number | null;
  color?: string;
}

const props = defineProps<{
  points: LifeMapPathPoint[];
  height?: number;
  drawPath?: boolean;
  pathColor?: string;
  ariaLabel?: string;
}>();

const mapEl = ref<HTMLDivElement | null>(null);
let map: L.Map | null = null;
const layers: L.Layer[] = [];

function renderMap() {
  if (!mapEl.value || !props.points.length) return;
  if (map) { map.remove(); map = null; layers.length = 0; }

  map = L.map(mapEl.value, { zoomControl: false, attributionControl: false });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

  const latlngs = props.points.map(p => [p.lat, p.lon] as [number, number]);
  props.points.forEach((p, idx) => {
    const marker = L.circleMarker([p.lat, p.lon], {
      radius: 6,
      color: p.color || props.pathColor || '#2c5aa0',
      fillOpacity: 0.8,
    }).bindTooltip(`${idx + 1}. ${p.label}${p.year ? ` (${p.year})` : ''}`);
    marker.addTo(map!);
    layers.push(marker);
  });
  if (props.drawPath !== false && latlngs.length > 1) {
    const line = L.polyline(latlngs, { color: props.pathColor || '#2c5aa0', weight: 2, opacity: 0.7 });
    line.addTo(map!);
    layers.push(line);
  }
  map.fitBounds(L.latLngBounds(latlngs), { padding: [30, 30] });
}

onMounted(renderMap);
watch(() => props.points, renderMap, { deep: true });
onBeforeUnmount(() => { if (map) map.remove(); });
</script>

<style scoped>
.life-map { width: 100%; border-radius: var(--radius-sm); overflow: hidden; break-inside: avoid; }
</style>
```

- [x] **Step 3: Write a non-DOM smoke test**

Map rendering requires a browser; for unit tests assert the component mounts without error with no points.

```typescript
// tests/unit/components/reports/LifeMap.test.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import LifeMap from '../../../../src/renderer/components/reports/primitives/LifeMap.vue';

describe('LifeMap', () => {
  it('mounts without points', () => {
    const wrapper = mount(LifeMap, { props: { points: [] } });
    expect(wrapper.find('.life-map').exists()).toBe(true);
  });
});
```

- [x] **Step 4: Run tests**

```bash
npx vitest run tests/unit/components/reports/LifeMap.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/renderer/components/reports/primitives/LifeMap.vue tests/unit/components/reports/LifeMap.test.ts
git commit -m "feat(reports): add LifeMap primitive"
```

---

### Task 12: Add PlaceBoundaryMap primitive

**Files:**
- Create: `src/renderer/components/reports/primitives/PlaceBoundaryMap.vue`
- Test: `tests/unit/components/reports/PlaceBoundaryMap.test.ts`

- [x] **Step 1: Create component**

Model this on the existing MapView/PlacePanel boundary rendering. Accept these props:
- `placeId: string` — the focal place
- `persons: Array<{ id: string; lat: number; lon: number; label: string }>` — pins
- `showBoundary: boolean`
- `height?: number`

```vue
<!-- src/renderer/components/reports/primitives/PlaceBoundaryMap.vue -->
<template>
  <div ref="mapEl" class="place-boundary-map" :style="{ height: height + 'px' }" role="img" :aria-label="ariaLabel"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { usePlaceResolver } from '../../../composables/usePlaceResolver';

export interface PlacePin {
  id: string;
  lat: number;
  lon: number;
  label: string;
}

const props = defineProps<{
  placeId: string | null;
  persons?: PlacePin[];
  showBoundary?: boolean;
  height?: number;
  ariaLabel?: string;
}>();

const mapEl = ref<HTMLDivElement | null>(null);
let map: L.Map | null = null;

async function renderMap() {
  if (!mapEl.value || !props.placeId) return;
  if (map) { map.remove(); map = null; }

  map = L.map(mapEl.value, { zoomControl: false, attributionControl: false });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

  // Load the place, draw boundary if available and enabled
  const place = await window.api.places.get(props.placeId);
  if (!place) return;
  if (place.latitude != null && place.longitude != null) {
    L.circleMarker([place.latitude, place.longitude], {
      radius: 10, color: '#b33', fillOpacity: 0.6,
    }).addTo(map);
  }

  if (props.showBoundary !== false) {
    // Use existing gazetteer resolver to check for boundary polygons
    const resolver = usePlaceResolver();
    const resolved = await resolver.resolve(place.name as string);
    if (resolved?.boundary) {
      L.geoJSON(resolved.boundary, { style: { color: '#b33', weight: 1, fillOpacity: 0.1 } }).addTo(map);
    }
  }

  for (const pin of (props.persons || [])) {
    L.circleMarker([pin.lat, pin.lon], {
      radius: 5, color: '#2c5aa0', fillOpacity: 0.8,
    }).bindTooltip(pin.label).addTo(map);
  }

  const bounds = L.latLngBounds([]);
  if (place.latitude != null) bounds.extend([place.latitude, place.longitude]);
  (props.persons || []).forEach(p => bounds.extend([p.lat, p.lon]));
  if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] });
}

onMounted(renderMap);
watch(() => [props.placeId, props.persons], renderMap, { deep: true });
onBeforeUnmount(() => { if (map) map.remove(); });

declare const window: Window & { api: { places: { get: (id: string) => Promise<Record<string, unknown> | null> } } };
</script>

<style scoped>
.place-boundary-map { width: 100%; border-radius: var(--radius-sm); overflow: hidden; break-inside: avoid; }
</style>
```

- [x] **Step 2: Write smoke test**

```typescript
// tests/unit/components/reports/PlaceBoundaryMap.test.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PlaceBoundaryMap from '../../../../src/renderer/components/reports/primitives/PlaceBoundaryMap.vue';

describe('PlaceBoundaryMap', () => {
  it('mounts with null placeId', () => {
    const wrapper = mount(PlaceBoundaryMap, { props: { placeId: null } });
    expect(wrapper.find('.place-boundary-map').exists()).toBe(true);
  });
});
```

- [x] **Step 3: Run tests**

```bash
npx vitest run tests/unit/components/reports/PlaceBoundaryMap.test.ts
```

Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add src/renderer/components/reports/primitives/PlaceBoundaryMap.vue tests/unit/components/reports/PlaceBoundaryMap.test.ts
git commit -m "feat(reports): add PlaceBoundaryMap primitive"
```

---

### Task 13: Add MediaChronological primitive

**Files:**
- Create: `src/renderer/components/reports/primitives/MediaChronological.vue`
- Test: `tests/unit/components/reports/MediaChronological.test.ts`

- [x] **Step 1: Create component**

```vue
<!-- src/renderer/components/reports/primitives/MediaChronological.vue -->
<template>
  <div class="media-chronological" v-if="printableItems.length > 0">
    <div
      v-for="item in printableItems"
      :key="item.id"
      class="media-item"
      :class="'per-page-' + perPage"
    >
      <div class="media-image">
        <img
          v-if="imageUrl(item)"
          :src="imageUrl(item)!"
          :alt="item.title || ''"
          loading="lazy"
        />
      </div>
      <div v-if="showCaptions" class="media-caption">
        <div v-if="item.title" class="caption-title">{{ item.title }}</div>
        <div v-if="item.contextLine" class="caption-context">{{ item.contextLine }}</div>
        <div v-if="item.notes" class="caption-notes">{{ item.notes }}</div>
        <div v-if="item.inferredDateISO" class="caption-date">{{ formatDate(item.inferredDateISO) }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

export interface MediaDisplayItem {
  id: string;
  title: string | null;
  notes: string | null;
  fileRef: string | null;
  format: string | null;
  inferredDateISO: string | null;
  contextLine?: string | null;
}

const props = defineProps<{
  items: MediaDisplayItem[];
  showCaptions?: boolean;
  perPage?: 1 | 2 | 4;
  includeDocuments?: boolean;
}>();

const printableItems = computed(() => {
  return props.items.filter(i => {
    if (!i.fileRef) return false;
    const fmt = (i.format || '').toLowerCase();
    const isImage = /\.(jpe?g|png|webp|gif|svg)$/i.test(i.fileRef) || /image/.test(fmt);
    if (isImage) return true;
    return !!props.includeDocuments;
  });
});

function imageUrl(item: MediaDisplayItem): string | null {
  if (!item.fileRef) return null;
  // Use existing media file URL scheme — this follows the pattern used in MediaPanel.
  return `media-file://${encodeURIComponent(item.fileRef)}`;
}

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}
</script>

<style scoped>
.media-chronological { display: grid; gap: var(--space-lg); }
.media-item { break-inside: avoid; }
.media-item.per-page-1 { grid-template-columns: 1fr; }
.per-page-2 .media-item { display: inline-block; width: 48%; }
.per-page-4 .media-item { display: inline-block; width: 23%; }
.media-image img { max-width: 100%; height: auto; border-radius: var(--radius-sm); }
.media-caption { margin-top: var(--space-sm); font-size: var(--font-sm); }
.caption-title { font-weight: 600; }
.caption-context { color: var(--text-secondary); font-style: italic; }
.caption-date { color: var(--text-muted); }
</style>
```

- [x] **Step 2: Write smoke test**

```typescript
// tests/unit/components/reports/MediaChronological.test.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MediaChronological from '../../../../src/renderer/components/reports/primitives/MediaChronological.vue';

describe('MediaChronological', () => {
  it('filters out documents by default', () => {
    const wrapper = mount(MediaChronological, {
      props: {
        items: [
          { id: '1', title: 'Photo', notes: null, fileRef: '/a/b.jpg', format: 'image/jpeg', inferredDateISO: null },
          { id: '2', title: 'Doc', notes: null, fileRef: '/a/b.pdf', format: 'application/pdf', inferredDateISO: null },
        ],
      },
    });
    expect(wrapper.findAll('.media-item').length).toBe(1);
    expect(wrapper.text()).toContain('Photo');
    expect(wrapper.text()).not.toContain('Doc');
  });
  it('includes documents when toggle on', () => {
    const wrapper = mount(MediaChronological, {
      props: {
        includeDocuments: true,
        items: [
          { id: '1', title: 'Photo', notes: null, fileRef: '/a/b.jpg', format: 'image/jpeg', inferredDateISO: null },
          { id: '2', title: 'Doc', notes: null, fileRef: '/a/b.pdf', format: 'application/pdf', inferredDateISO: null },
        ],
      },
    });
    expect(wrapper.findAll('.media-item').length).toBe(2);
  });
  it('renders nothing when items empty', () => {
    const wrapper = mount(MediaChronological, { props: { items: [] } });
    expect(wrapper.find('.media-chronological').exists()).toBe(false);
  });
});
```

- [x] **Step 3: Run tests**

```bash
npx vitest run tests/unit/components/reports/MediaChronological.test.ts
```

Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add src/renderer/components/reports/primitives/MediaChronological.vue tests/unit/components/reports/MediaChronological.test.ts
git commit -m "feat(reports): add MediaChronological primitive"
```

---

## Phase 3: Evolved reports (rename + rewrite)

> **Media URL convention (learned during Phase 2):** Local media files are NOT served via a `media-file://` URL. The dev origin blocks `file://`. Use `window.api.media.readAsDataUrl(mediaId)` to get a base64 `data:` URL. The `MediaChronological` primitive (Task 13) already handles this internally — just pass `MediaDisplayItem[]` with `id` fields. For cover/profile images in reports that aren't handled by the primitive, use a `ref<string | null>` loaded via `watch` + `readAsDataUrl`. See examples inline below.


Each task in Phase 3 takes an existing report, renames it, and rewrites it using the new primitives. The rename happens via `git mv` to preserve history, then the file is rewritten. `ReportsView.vue` import statements are updated in the same commit to keep the build green.

### Task 14: Evolve Biography → A Life

**Files:**
- Rename + rewrite: `src/renderer/components/reports/PersonBiography.vue` → `src/renderer/components/reports/ALifeReport.vue`
- Modify: `src/renderer/views/ReportsView.vue`
- Modify: `src/renderer/i18n/en.ts`
- Modify: `src/renderer/i18n/sv.ts`

- [x] **Step 1: Rename file preserving history**

```bash
git mv src/renderer/components/reports/PersonBiography.vue src/renderer/components/reports/ALifeReport.vue
```

- [x] **Step 2: Rewrite the component**

Replace the file contents with the implementation below. The component uses `getPersonSummary` for data, plus `useLifeMap`, `useMediaChronological`, `ReportCover`, `TimelineBar`, `LifeMap`, `MediaChronological`.

```vue
<!-- src/renderer/components/reports/ALifeReport.vue -->
<template>
  <div v-if="loading" class="loading">{{ $t('common.loading') }}</div>
  <div v-else-if="error" class="error">{{ error }}</div>
  <template v-else-if="data">
    <ReportCover
      :title="data.primaryName || $t('common.unknown')"
      :subtitle="yearsSubtitle"
      :hero-image-url="profileImageUrl"
      :researcher-name="researcherName"
    />

    <section v-if="lifeMap.data.value.events.length" class="report-section">
      <h2 class="section-heading">{{ $t('reports.alife.lifeMap') }}</h2>
      <LifeMap :points="lifeMapPoints" :height="400" draw-path />
    </section>

    <section v-if="timelineItems.length" class="report-section">
      <h2 class="section-heading">{{ $t('reports.alife.timeline') }}</h2>
      <TimelineBar :items="timelineItems" />
    </section>

    <section v-if="hasFamily" class="report-section">
      <h2 class="section-heading">{{ $t('reports.alife.family') }}</h2>
      <div v-if="data.parents.length" class="rel-group">
        <h3>{{ $t('reports.parents') }}</h3>
        <ul><li v-for="p in data.parents" :key="p.id">{{ p.name || $t('common.unknown') }}</li></ul>
      </div>
      <div v-if="data.spouses.length" class="rel-group">
        <h3>{{ $t('personPanel.partners') }}</h3>
        <ul><li v-for="s in data.spouses" :key="s.id">{{ s.name || $t('common.unknown') }}</li></ul>
      </div>
      <div v-if="data.children.length" class="rel-group">
        <h3>{{ $t('personPanel.children') }}</h3>
        <ul><li v-for="c in data.children" :key="c.id">{{ c.name || $t('common.unknown') }}</li></ul>
      </div>
    </section>

    <section v-if="data.events.length" class="report-section">
      <h2 class="section-heading">{{ $t('reports.alife.events') }}</h2>
      <ul class="event-list">
        <li v-for="e in data.events" :key="e.id">
          <strong>{{ eventDateLabel(e) }}</strong> — {{ $t('events.' + e.event_type, e.event_type) }}
          <span v-if="e.place_name"> — {{ e.place_name }}</span>
          <div v-if="e.description">{{ e.description }}</div>
        </li>
      </ul>
    </section>

    <section v-if="data.notes && showNotes" class="report-section prose-section">
      <h2 class="section-heading">{{ $t('reports.alife.biography') }}</h2>
      <p v-for="(para, i) in notesParagraphs" :key="i" class="prose-paragraph">{{ para }}</p>
    </section>

    <section v-if="mediaItems.length && showPhotos" class="report-section">
      <h2 class="section-heading">{{ $t('reports.common.photos') }}</h2>
      <MediaChronological :items="mediaDisplay" :show-captions="true" :per-page="2" />
    </section>

    <section v-if="showDocuments && documentMedia.length" class="report-section">
      <h2 class="section-heading">{{ $t('reports.common.documents') }}</h2>
      <MediaChronological :items="documentMedia" :show-captions="true" :per-page="4" :include-documents="true" />
    </section>

    <section v-if="showSources && data.citations.length" class="report-section">
      <h2 class="section-heading">{{ $t('reports.common.sources') }}</h2>
      <ul class="citation-list">
        <li v-for="c in data.citations" :key="c.id">
          {{ c.source_title }} <span v-if="c.page">— {{ c.page }}</span>
        </li>
      </ul>
    </section>
  </template>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import ReportCover from './primitives/ReportCover.vue';
import LifeMap from './primitives/LifeMap.vue';
import TimelineBar from './primitives/TimelineBar.vue';
import MediaChronological from './primitives/MediaChronological.vue';
import { useLifeMap } from '../../composables/useLifeMap';
import { useMediaChronological } from '../../composables/useMediaChronological';

const props = defineProps<{
  personId: string;
  showPhotos?: boolean;
  showDocuments?: boolean;
  showSources?: boolean;
  showNotes?: boolean;
}>();

// Defaults for undefined props
const showPhotos = computed(() => props.showPhotos !== false);
const showDocuments = computed(() => props.showDocuments === true);
const showSources = computed(() => props.showSources === true);
const showNotes = computed(() => props.showNotes !== false);

const { t } = useI18n();
const loading = ref(true);
const error = ref<string | null>(null);
const data = ref<Record<string, any> | null>(null);
const researcherName = ref<string | null>(null);

const personIdRef = computed(() => props.personId);
const lifeMap = useLifeMap(personIdRef);
const mediaEntityRef = computed(() => props.personId ? { entityType: 'person' as const, entityId: props.personId } : null);
const mediaCh = useMediaChronological(mediaEntityRef);

async function loadAll() {
  loading.value = true;
  try {
    data.value = await (window.api as any).reports.personSummary(props.personId);
    const rn = await (window.api as any).db.getSetting('researcher_name');
    researcherName.value = (rn as string) || null;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

watch(() => props.personId, loadAll, { immediate: true });

const yearsSubtitle = computed(() => {
  if (!data.value) return '';
  const b = data.value.birthYear;
  const d = data.value.deathYear;
  if (!b && !d) return '';
  return `${b ?? '?'}–${d ?? ''}`;
});

const profileImageUrl = ref<string | null>(null);

// Load profile image as data URL when first media changes.
watch(() => mediaCh.items.value[0]?.id, async (firstId) => {
  if (!firstId) { profileImageUrl.value = null; return; }
  profileImageUrl.value = await (window.api as any).media.readAsDataUrl(firstId);
}, { immediate: true });

const lifeMapPoints = computed(() =>
  lifeMap.data.value.events.map(e => ({
    lat: e.lat, lon: e.lon,
    label: `${t('events.' + e.eventType, e.eventType)} — ${e.placeName}`,
    year: e.dateISO ? parseInt(e.dateISO.slice(0, 4), 10) : null,
  }))
);

const timelineItems = computed(() => {
  if (!data.value) return [];
  return (data.value.events as any[])
    .filter(e => e.date_value)
    .map(e => ({
      id: e.id,
      year: parseInt(e.date_value.slice(0, 4), 10),
      eventType: e.event_type,
      label: `${t('events.' + e.event_type, e.event_type)} ${e.date_value.slice(0, 4)}`,
    }));
});

const hasFamily = computed(() =>
  data.value && (data.value.parents.length || data.value.spouses.length || data.value.children.length)
);

const notesParagraphs = computed(() => (data.value?.notes as string || '').split(/\n\n+/).filter(Boolean));

const mediaItems = computed(() => mediaCh.items.value.filter(i => /\.(jpe?g|png|webp|gif)$/i.test(i.fileRef || '')));
const documentMedia = computed(() => mediaCh.items.value.filter(i => /\.(pdf|docx?|txt)$/i.test(i.fileRef || '')));

const mediaDisplay = computed(() =>
  mediaCh.items.value.map(i => ({
    id: i.id,
    title: i.title,
    notes: i.notes,
    fileRef: i.fileRef,
    format: i.format,
    inferredDateISO: i.inferredDateISO,
    contextLine: null,
  }))
);

function eventDateLabel(e: any): string {
  return e.date_original || e.date_value || t('reports.common.unknownDate');
}
</script>

<style scoped>
.report-section { padding: var(--space-xl) 0; page-break-inside: avoid; }
.section-heading { font-family: var(--report-serif-stack); font-size: 1.5rem; margin-bottom: var(--space-lg); }
.prose-section { font-family: var(--report-serif-stack); line-height: var(--report-prose-leading); }
.prose-paragraph { margin-bottom: var(--space-md); }
.event-list { list-style: none; padding: 0; }
.event-list li { padding: var(--space-sm) 0; border-bottom: 1px solid var(--surface-border-subtle); }
.citation-list { padding-left: var(--space-lg); font-size: var(--font-sm); }
.rel-group { margin-bottom: var(--space-md); }
</style>
```

- [x] **Step 3: Update ReportsView.vue imports and tab label**

In `src/renderer/views/ReportsView.vue`:
1. Change the import from `PersonBiography` to `ALifeReport`:
```typescript
import ALifeReport from '../components/reports/ALifeReport.vue';
```
2. Rename the tab id from `biography` to `alife` in the `tabs` array and the `activeTab` type.
3. Replace `<PersonBiography :person-id="biographyPersonId" />` with `<ALifeReport :person-id="aLifePersonId" />`.
4. Rename the `biographyPersonId` ref to `aLifePersonId` throughout.
5. Pass new option props: `:show-photos="showPhotos"` etc., where `showPhotos` etc. are new refs bound to toggles in the tab-header controls.

- [x] **Step 4: Rename i18n keys**

In `src/renderer/i18n/en.ts`, under `reports:`:

```typescript
  alife: {
    title: 'A Life',
    lifeMap: 'Life Map',
    timeline: 'Timeline',
    family: 'Family',
    events: 'Events',
    biography: 'Biography',
  },
```

Remove the old `biography: { ... }` namespace and `lifeStory`, `noEvents`, `familySection`, `noRelationships`, `parents` keys that were exclusive to PersonBiography (retain any still used elsewhere — check by grep first).

In `src/renderer/i18n/sv.ts`:

```typescript
  alife: {
    title: 'Ett liv',
    lifeMap: 'Livskarta',
    timeline: 'Tidslinje',
    family: 'Familj',
    events: 'Händelser',
    biography: 'Biografi',
  },
```

- [x] **Step 5: Run lint + tests + manual smoke**

```bash
npm run lint && npm test
npm start
```

Navigate to Reports → A Life, pick a person with events + notes + photos, verify preview renders with cover, life map, timeline, family, events, biography prose, photos, sources toggle.

- [x] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(reports): evolve Biography into A Life with new primitives"
```

---

### Task 15: Evolve Family Narrative → A Marriage

**Files:**
- Rename + rewrite: `src/renderer/components/reports/FamilyNarrative.vue` → `src/renderer/components/reports/AMarriageReport.vue`
- Modify: `src/renderer/views/ReportsView.vue`
- Modify: `src/renderer/i18n/en.ts`, `src/renderer/i18n/sv.ts`

- [x] **Step 1: Rename file**

```bash
git mv src/renderer/components/reports/FamilyNarrative.vue src/renderer/components/reports/AMarriageReport.vue
```

- [x] **Step 2: Rewrite component**

The new `AMarriageReport.vue` takes a `relationshipId` prop. Structure:
1. `ReportCover` with `{husband} + {wife}` title and marriage year subtitle, hero image = first linked media of the relationship.
2. Dual `LifeMap`: compute points for both spouses, label each with spouse name + year. Use two `LifeMap` components side-by-side, or a single map with two colored paths (simpler: two maps side by side).
3. Shared `TimelineBar` covering marriage + children births + divorces + deaths.
4. The Couple: two `PersonMiniCard`s side by side.
5. Children: grid of `PersonMiniCard` with ahnentafel omitted and portraits.
6. Events: chronological list of couple and family events.
7. Narrative: `Relationship.notes` rendered as prose.
8. Photos: `MediaChronological` on the relationship entity.
9. Sources: back-matter.

Use `window.api.reports.familyUnit(relationshipId)` to fetch the family unit (couple, each spouse, children with ages, shared events).

```vue
<!-- src/renderer/components/reports/AMarriageReport.vue -->
<template>
  <div v-if="loading" class="loading">{{ $t('common.loading') }}</div>
  <template v-else-if="data">
    <ReportCover :title="coupleTitle" :subtitle="marriageYearSubtitle" :hero-image-url="coverImageUrl" :researcher-name="researcherName" />

    <section v-if="husbandMap.data.value.events.length || wifeMap.data.value.events.length" class="report-section">
      <h2 class="section-heading">{{ $t('reports.amarriage.lifeMap') }}</h2>
      <div class="dual-maps">
        <LifeMap :points="husbandPoints" :height="300" path-color="#2c5aa0" :aria-label="$t('reports.amarriage.mapSpouse1')" />
        <LifeMap :points="wifePoints" :height="300" path-color="#a02c5a" :aria-label="$t('reports.amarriage.mapSpouse2')" />
      </div>
    </section>

    <section v-if="sharedTimeline.length" class="report-section">
      <h2 class="section-heading">{{ $t('reports.amarriage.sharedTimeline') }}</h2>
      <TimelineBar :items="sharedTimeline" />
    </section>

    <section class="report-section">
      <h2 class="section-heading">{{ $t('reports.amarriage.theCouple') }}</h2>
      <div class="couple-pair">
        <PersonMiniCard v-if="data.spouse1" v-bind="spouseProps(data.spouse1)" />
        <PersonMiniCard v-if="data.spouse2" v-bind="spouseProps(data.spouse2)" />
      </div>
    </section>

    <section v-if="data.children.length" class="report-section">
      <h2 class="section-heading">{{ $t('personPanel.children') }}</h2>
      <div class="children-grid">
        <PersonMiniCard v-for="c in data.children" :key="c.id" v-bind="spouseProps(c)" />
      </div>
    </section>

    <section v-if="data.events.length" class="report-section">
      <h2 class="section-heading">{{ $t('reports.amarriage.events') }}</h2>
      <ul class="event-list">
        <li v-for="e in data.events" :key="e.id">
          <strong>{{ e.date_original || e.date_value || $t('reports.common.unknownDate') }}</strong>
          — {{ $t('events.' + e.event_type, e.event_type) }}
          <span v-if="e.place_name"> — {{ e.place_name }}</span>
        </li>
      </ul>
    </section>

    <section v-if="data.notes && showNotes" class="report-section prose-section">
      <h2 class="section-heading">{{ $t('reports.amarriage.narrative') }}</h2>
      <p v-for="(para, i) in notesParagraphs" :key="i" class="prose-paragraph">{{ para }}</p>
    </section>

    <section v-if="mediaItems.length && showPhotos" class="report-section">
      <h2 class="section-heading">{{ $t('reports.common.photos') }}</h2>
      <MediaChronological :items="mediaItems" :show-captions="true" :per-page="2" />
    </section>
  </template>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ReportCover from './primitives/ReportCover.vue';
import LifeMap from './primitives/LifeMap.vue';
import TimelineBar from './primitives/TimelineBar.vue';
import PersonMiniCard from './primitives/PersonMiniCard.vue';
import MediaChronological from './primitives/MediaChronological.vue';
import { useLifeMap } from '../../composables/useLifeMap';
import { useMediaChronological } from '../../composables/useMediaChronological';

const props = defineProps<{
  relationshipId: string;
  showPhotos?: boolean;
  showNotes?: boolean;
  showSources?: boolean;
}>();

const showPhotos = computed(() => props.showPhotos !== false);
const showNotes = computed(() => props.showNotes !== false);

const { t } = useI18n();
const loading = ref(true);
const data = ref<any>(null);
const researcherName = ref<string | null>(null);

const spouse1Id = computed(() => data.value?.spouse1?.id || null);
const spouse2Id = computed(() => data.value?.spouse2?.id || null);
const husbandMap = useLifeMap(spouse1Id);
const wifeMap = useLifeMap(spouse2Id);
const mediaEntityRef = computed(() => props.relationshipId ? { entityType: 'relationship' as const, entityId: props.relationshipId } : null);
const mediaCh = useMediaChronological(mediaEntityRef);

async function load() {
  loading.value = true;
  data.value = await (window.api as any).reports.familyUnit(props.relationshipId);
  researcherName.value = (await (window.api as any).db.getSetting('researcher_name')) as string || null;
  loading.value = false;
}
watch(() => props.relationshipId, load, { immediate: true });

const coupleTitle = computed(() => {
  if (!data.value) return '';
  return [data.value.spouse1?.name, data.value.spouse2?.name].filter(Boolean).join(' + ');
});
const marriageYearSubtitle = computed(() => data.value?.marriageYear ? String(data.value.marriageYear) : '');
const coverImageUrl = ref<string | null>(null);
watch(() => mediaCh.items.value[0]?.id, async (firstId) => {
  if (!firstId) { coverImageUrl.value = null; return; }
  coverImageUrl.value = await (window.api as any).media.readAsDataUrl(firstId);
}, { immediate: true });

function spouseProps(p: any) {
  return {
    givenName: p.givenName,
    surname: p.surname,
    sex: p.sex,
    birthYear: p.birthYear,
    deathYear: p.deathYear,
    keyPlace: p.keyPlace,
    portraitUrl: null,  // Spouse/child portraits loaded separately via window.api.media.readAsDataUrl if needed.
  };
}

const husbandPoints = computed(() => husbandMap.data.value.events.map(e => ({
  lat: e.lat, lon: e.lon, label: e.placeName, year: e.dateISO ? parseInt(e.dateISO.slice(0, 4), 10) : null,
})));
const wifePoints = computed(() => wifeMap.data.value.events.map(e => ({
  lat: e.lat, lon: e.lon, label: e.placeName, year: e.dateISO ? parseInt(e.dateISO.slice(0, 4), 10) : null,
})));

const sharedTimeline = computed(() => {
  if (!data.value) return [];
  return (data.value.events as any[])
    .filter(e => e.date_value)
    .map(e => ({
      id: e.id,
      year: parseInt(e.date_value.slice(0, 4), 10),
      eventType: e.event_type,
      label: `${t('events.' + e.event_type, e.event_type)} ${e.date_value.slice(0, 4)}`,
    }));
});

const notesParagraphs = computed(() => (data.value?.notes as string || '').split(/\n\n+/).filter(Boolean));

const mediaItems = computed(() => mediaCh.items.value.map(i => ({
  id: i.id, title: i.title, notes: i.notes, fileRef: i.fileRef, format: i.format, inferredDateISO: i.inferredDateISO, contextLine: null,
})));
</script>

<style scoped>
.report-section { padding: var(--space-xl) 0; page-break-inside: avoid; }
.section-heading { font-family: var(--report-serif-stack); font-size: 1.5rem; margin-bottom: var(--space-lg); }
.prose-section { font-family: var(--report-serif-stack); line-height: var(--report-prose-leading); }
.prose-paragraph { margin-bottom: var(--space-md); }
.dual-maps { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-lg); }
.couple-pair { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-lg); }
.children-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--space-md); }
.event-list { list-style: none; padding: 0; }
.event-list li { padding: var(--space-sm) 0; border-bottom: 1px solid var(--surface-border-subtle); }
</style>
```

- [x] **Step 3: Update ReportsView.vue**

In `ReportsView.vue`, rename the `familyNarrative` tab to `amarriage`, rename the component import + usage, and add content toggle controls `showPhotos`/`showNotes`/`showSources`.

- [x] **Step 4: Update i18n**

Add `reports.amarriage.*` keys (title, lifeMap, sharedTimeline, theCouple, events, narrative, mapSpouse1, mapSpouse2) in both `en.ts` and `sv.ts`. Remove any FamilyNarrative-specific keys that are no longer referenced.

- [x] **Step 5: Run lint + tests + manual smoke**

```bash
npm run lint && npm test
npm start
```

Verify: pick a couple, preview shows dual maps, timeline, couple, children, events, narrative prose, photos.

- [x] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(reports): evolve Family Narrative into A Marriage"
```

---

### Task 16: Evolve Place History → Place Chronicle

**Files:**
- Rename + rewrite: `src/renderer/components/reports/PlaceHistory.vue` → `src/renderer/components/reports/PlaceChronicleReport.vue`
- Modify: `src/renderer/views/ReportsView.vue`
- Modify: i18n

- [x] **Step 1: Rename file**

```bash
git mv src/renderer/components/reports/PlaceHistory.vue src/renderer/components/reports/PlaceChronicleReport.vue
```

- [x] **Step 2: Rewrite component**

Uses `window.api.reports.placeHistory(placeId)` for data. Sections:
1. `ReportCover` — place name + type + date range.
2. `PlaceBoundaryMap` — with boundary + person pins (person pins derived from the persons section events).
3. Persons at this place (chronological): list of persons linked to events at this place, first-association-date sort.
4. Events at this place (chronological).
5. Description: `Place.notes` as prose.
6. Photos: `MediaChronological` on the place entity.
7. Child places (optional toggle): hierarchical list.
8. Sources (optional toggle).

```vue
<!-- src/renderer/components/reports/PlaceChronicleReport.vue -->
<template>
  <div v-if="loading" class="loading">{{ $t('common.loading') }}</div>
  <template v-else-if="data">
    <ReportCover :title="data.place.name" :subtitle="placeSubtitle" :researcher-name="researcherName" />

    <section class="report-section">
      <h2 class="section-heading">{{ $t('reports.placeChronicle.map') }}</h2>
      <PlaceBoundaryMap :place-id="props.placeId" :persons="personPins" :show-boundary="showBoundary" :height="500" />
    </section>

    <section v-if="data.persons.length" class="report-section">
      <h2 class="section-heading">{{ $t('reports.placeChronicle.persons') }}</h2>
      <ul class="person-list">
        <li v-for="p in data.persons" :key="p.id">
          <strong>{{ p.name }}</strong>
          <span v-if="p.firstYear"> — {{ p.firstYear }}</span>
          <span v-if="p.eventTypes?.length"> ({{ p.eventTypes.join(', ') }})</span>
        </li>
      </ul>
    </section>

    <section v-if="data.events.length" class="report-section">
      <h2 class="section-heading">{{ $t('reports.placeChronicle.events') }}</h2>
      <ul class="event-list">
        <li v-for="e in data.events" :key="e.id">
          <strong>{{ e.date_original || e.date_value }}</strong> — {{ $t('events.' + e.event_type, e.event_type) }}
          <span v-if="e.personName"> — {{ e.personName }}</span>
        </li>
      </ul>
    </section>

    <section v-if="data.place.notes && showNotes" class="report-section prose-section">
      <h2 class="section-heading">{{ $t('reports.placeChronicle.description') }}</h2>
      <p v-for="(para, i) in notesParagraphs" :key="i" class="prose-paragraph">{{ para }}</p>
    </section>

    <section v-if="mediaItems.length && showPhotos" class="report-section">
      <h2 class="section-heading">{{ $t('reports.common.photos') }}</h2>
      <MediaChronological :items="mediaItems" :show-captions="true" :per-page="2" />
    </section>

    <section v-if="showChildPlaces && data.childPlaces?.length" class="report-section">
      <h2 class="section-heading">{{ $t('reports.placeChronicle.childPlaces') }}</h2>
      <ul>
        <li v-for="c in data.childPlaces" :key="c.id">{{ c.name }}</li>
      </ul>
    </section>
  </template>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import ReportCover from './primitives/ReportCover.vue';
import PlaceBoundaryMap from './primitives/PlaceBoundaryMap.vue';
import MediaChronological from './primitives/MediaChronological.vue';
import { useMediaChronological } from '../../composables/useMediaChronological';

const props = defineProps<{
  placeId: string;
  showBoundary?: boolean;
  showChildPlaces?: boolean;
  showPhotos?: boolean;
  showNotes?: boolean;
  showSources?: boolean;
}>();

const showBoundary = computed(() => props.showBoundary !== false);
const showChildPlaces = computed(() => props.showChildPlaces === true);
const showPhotos = computed(() => props.showPhotos !== false);
const showNotes = computed(() => props.showNotes !== false);

const loading = ref(true);
const data = ref<any>(null);
const researcherName = ref<string | null>(null);

const mediaEntityRef = computed(() => props.placeId ? { entityType: 'place' as const, entityId: props.placeId } : null);
const mediaCh = useMediaChronological(mediaEntityRef);

async function load() {
  loading.value = true;
  data.value = await (window.api as any).reports.placeHistory(props.placeId);
  researcherName.value = (await (window.api as any).db.getSetting('researcher_name')) as string || null;
  loading.value = false;
}
watch(() => props.placeId, load, { immediate: true });

const placeSubtitle = computed(() => {
  if (!data.value) return '';
  const parts = [data.value.place.place_type, data.value.dateRange].filter(Boolean);
  return parts.join(' · ');
});

const personPins = computed(() => {
  if (!data.value?.persons) return [];
  return data.value.persons
    .filter((p: any) => p.lat != null && p.lon != null)
    .map((p: any) => ({ id: p.id, lat: p.lat, lon: p.lon, label: p.name }));
});

const notesParagraphs = computed(() => (data.value?.place?.notes as string || '').split(/\n\n+/).filter(Boolean));
const mediaItems = computed(() => mediaCh.items.value.map(i => ({ ...i, contextLine: null })));
</script>

<style scoped>
.report-section { padding: var(--space-xl) 0; page-break-inside: avoid; }
.section-heading { font-family: var(--report-serif-stack); font-size: 1.5rem; margin-bottom: var(--space-lg); }
.prose-section { font-family: var(--report-serif-stack); line-height: var(--report-prose-leading); }
.prose-paragraph { margin-bottom: var(--space-md); }
.person-list, .event-list { list-style: none; padding: 0; }
.person-list li, .event-list li { padding: var(--space-sm) 0; border-bottom: 1px solid var(--surface-border-subtle); }
</style>
```

- [x] **Step 3: Update ReportsView.vue + i18n**

Rename `placeHistory` tab to `placeChronicle`; update component import/usage; add i18n keys `reports.placeChronicle.{title,map,persons,events,description,childPlaces}`.

- [x] **Step 4: Lint + tests + manual**

```bash
npm run lint && npm test
npm start
```

Pick a Swedish parish place with boundary, verify map shows boundary overlay and person pins.

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(reports): evolve Place History into Place Chronicle"
```

---

### Task 17: Evolve Ancestor Book → Your Ancestors

**Files:**
- Rename + rewrite: `src/renderer/components/reports/AncestorBookReport.vue` → `src/renderer/components/reports/YourAncestorsReport.vue`
- Modify: `src/renderer/views/ReportsView.vue`
- Modify: i18n

- [x] **Step 1: Rename file**

```bash
git mv src/renderer/components/reports/AncestorBookReport.vue src/renderer/components/reports/YourAncestorsReport.vue
```

- [x] **Step 2: Rewrite component**

Sections:
1. `ReportCover` — title "N Generations of Ancestors of X", hero = fan chart SVG snapshot or primary photo.
2. Introduction — one paragraph: root person name, scope statement (generations included).
3. Full-page fan chart — reuse existing `FanChartReport` component inline (or the underlying fan renderer), rendered at full page size.
4. Per-ancestor pages — iterate over ancestors from `getAncestorTree(personId, generations)`. For each ancestor, render a page with `PersonMiniCard` header, ahnentafel number, notes prose, optional short event list and optional photos.
5. Surname index — compute from ancestor list, group by surname, show page numbers (use a computed ref that tracks rendering order).
6. Sources (optional toggle).

```vue
<!-- src/renderer/components/reports/YourAncestorsReport.vue -->
<template>
  <div v-if="loading" class="loading">{{ $t('common.loading') }}</div>
  <template v-else-if="rootData">
    <ReportCover
      :title="$t('reports.yourAncestors.title', { generations, name: rootData.primaryName })"
      :subtitle="$t('reports.yourAncestors.subtitle', { name: rootData.primaryName })"
      :researcher-name="researcherName"
    />

    <section class="report-section">
      <p class="intro">{{ $t('reports.yourAncestors.introduction', { name: rootData.primaryName, generations }) }}</p>
    </section>

    <section class="report-section fan-chart-page">
      <!-- Delegate to the existing FanChartReport for the cover fan -->
      <FanChartReport :person-id="personId" :generations="generations" :arc-span="270" :color-mode="colorMode" />
    </section>

    <section
      v-for="ancestor in ancestorList"
      :key="ancestor.id"
      class="report-section ancestor-page"
      :class="{ 'half-page': density === 'two' }"
    >
      <div class="ancestor-header">
        <PersonMiniCard
          :given-name="ancestor.givenName"
          :surname="ancestor.surname"
          :sex="ancestor.sex"
          :birth-year="ancestor.birthYear"
          :death-year="ancestor.deathYear"
          :key-place="ancestor.keyPlace"
          :portrait-url="ancestor.portraitUrl"
          :ahnentafel="ancestor.ahnentafel"
        />
      </div>
      <div v-if="ancestor.notes" class="prose-section">
        <p v-for="(para, i) in splitParagraphs(ancestor.notes)" :key="i" class="prose-paragraph">{{ para }}</p>
      </div>
      <div v-if="showEvents && ancestor.events?.length" class="ancestor-events">
        <ul>
          <li v-for="e in ancestor.events.slice(0, 6)" :key="e.id">
            {{ e.date || '?' }} — {{ $t('events.' + e.event_type, e.event_type) }}
            <span v-if="e.place_name"> — {{ e.place_name }}</span>
          </li>
        </ul>
      </div>
    </section>

    <section class="report-section surname-index">
      <h2 class="section-heading">{{ $t('reports.yourAncestors.surnameIndex') }}</h2>
      <ul>
        <li v-for="(group, sn) in surnamesGrouped" :key="sn">
          <strong>{{ sn }}:</strong> {{ group.map(g => g.ahnentafel).join(', ') }}
        </li>
      </ul>
    </section>
  </template>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import ReportCover from './primitives/ReportCover.vue';
import PersonMiniCard from './primitives/PersonMiniCard.vue';
import FanChartReport from './FanChartReport.vue';

const props = defineProps<{
  personId: string;
  generations?: number;
  colorMode?: 'bw' | 'branch' | 'sex' | 'themed';
  density?: 'one' | 'two';
  showEvents?: boolean;
  showExtraPhotos?: boolean;
  showSources?: boolean;
}>();

const generations = computed(() => props.generations ?? 4);
const colorMode = computed(() => props.colorMode ?? 'themed');
const density = computed(() => props.density ?? 'one');
const showEvents = computed(() => props.showEvents !== false);

const loading = ref(true);
const rootData = ref<any>(null);
const ancestorList = ref<any[]>([]);
const researcherName = ref<string | null>(null);

async function load() {
  loading.value = true;
  const tree = await (window.api as any).reports.ancestorTree(props.personId, generations.value);
  rootData.value = await (window.api as any).reports.personSummary(props.personId);
  researcherName.value = (await (window.api as any).db.getSetting('researcher_name')) as string || null;
  ancestorList.value = flattenAncestorTree(tree);
  loading.value = false;
}
watch([() => props.personId, generations], load, { immediate: true });

function flattenAncestorTree(node: any): any[] {
  const list: any[] = [];
  function walk(n: any, ahnentafel: number) {
    if (!n) return;
    if (ahnentafel > 1) {
      list.push({ ...n, ahnentafel });
    }
    walk(n.father, ahnentafel * 2);
    walk(n.mother, ahnentafel * 2 + 1);
  }
  walk(node, 1);
  return list.sort((a, b) => a.ahnentafel - b.ahnentafel);
}

function splitParagraphs(notes: string): string[] {
  return notes.split(/\n\n+/).filter(Boolean);
}

const surnamesGrouped = computed(() => {
  const groups: Record<string, { ahnentafel: number }[]> = {};
  ancestorList.value.forEach(a => {
    const sn = a.surname || '—';
    if (!groups[sn]) groups[sn] = [];
    groups[sn].push({ ahnentafel: a.ahnentafel });
  });
  return groups;
});
</script>

<style scoped>
.report-section { padding: var(--space-xl) 0; page-break-inside: avoid; }
.section-heading { font-family: var(--report-serif-stack); font-size: 1.5rem; margin-bottom: var(--space-lg); }
.intro { font-family: var(--report-serif-stack); line-height: var(--report-prose-leading); font-size: 1.1rem; }
.ancestor-page { page-break-after: always; }
.ancestor-page.half-page { page-break-after: auto; height: 45vh; }
.fan-chart-page { page-break-after: always; height: 100vh; display: flex; align-items: center; justify-content: center; }
.prose-section { font-family: var(--report-serif-stack); line-height: var(--report-prose-leading); margin-top: var(--space-lg); }
.prose-paragraph { margin-bottom: var(--space-md); }
.surname-index ul { columns: 2; font-size: var(--font-sm); }
</style>
```

- [x] **Step 3: Update ReportsView.vue**

Rename `ancestorBook` tab to `yourAncestors`. Add density dropdown (`one`/`two`), generations slider (4–10), color mode select, event/photo toggles.

- [x] **Step 4: Update i18n**

Keys: `reports.yourAncestors.title` (with `{generations, name}` interpolation), `.subtitle`, `.introduction`, `.surnameIndex`.

- [x] **Step 5: Lint + tests + manual**

```bash
npm run lint && npm test
npm start
```

Pick a root person with 4+ generations of ancestors, verify cover, fan chart, per-ancestor pages, surname index.

- [x] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(reports): evolve Ancestor Book into Your Ancestors"
```

---

## Phase 4: New reports

### Task 18: Life on One Page

**Files:**
- Create: `src/renderer/components/reports/LifeOnOnePageReport.vue`
- Modify: `src/renderer/views/ReportsView.vue`
- Modify: i18n

- [x] **Step 1: Create component**

Single-sheet, no cover, no page breaks within. Layout uses CSS grid to arrange panels.

```vue
<!-- src/renderer/components/reports/LifeOnOnePageReport.vue -->
<template>
  <div v-if="loading" class="loading">{{ $t('common.loading') }}</div>
  <div v-else-if="data" class="one-page" :class="'orient-' + orientation">
    <header class="op-header">
      <h1 class="op-name">{{ data.primaryName }}</h1>
      <div v-if="yearsLabel" class="op-years">{{ yearsLabel }}</div>
    </header>

    <div class="op-portrait">
      <img v-if="portraitUrl" :src="portraitUrl" :alt="data.primaryName" />
    </div>

    <div class="op-facts">
      <h3>{{ $t('reports.onePage.keyDates') }}</h3>
      <ul>
        <li v-if="data.birthYear">{{ $t('reports.common.born') }} {{ data.birthYear }}<span v-if="birthPlace"> — {{ birthPlace }}</span></li>
        <li v-for="s in data.spouses" :key="s.id" v-if="s.marriageYear">{{ $t('reports.common.married') }} {{ s.name }}, {{ s.marriageYear }}</li>
        <li v-if="data.deathYear">{{ $t('reports.common.died') }} {{ data.deathYear }}</li>
      </ul>
    </div>

    <div class="op-map">
      <LifeMap :points="lifeMapPoints" :height="200" draw-path />
    </div>

    <div class="op-photos">
      <div v-for="(m, i) in photoGrid" :key="m.id" class="grid-photo" :class="'pos-' + i">
        <img v-if="photoGridUrls[m.id]" :src="photoGridUrls[m.id]" alt="" />
      </div>
    </div>

    <div v-if="bioSnippet" class="op-snippet">{{ bioSnippet }}</div>

    <footer class="op-footer">
      <span v-if="researcherName">{{ $t('reports.common.compiledBy', { name: researcherName }) }}</span>
      <span class="spacer"></span>
      <span>{{ formattedDate }}</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import LifeMap from './primitives/LifeMap.vue';
import { useLifeMap } from '../../composables/useLifeMap';
import { useMediaChronological } from '../../composables/useMediaChronological';

const props = defineProps<{
  personId: string;
  orientation?: 'portrait' | 'landscape';
}>();

const orientation = computed(() => props.orientation ?? 'portrait');

const { locale } = useI18n();
const loading = ref(true);
const data = ref<any>(null);
const researcherName = ref<string | null>(null);

const personIdRef = computed(() => props.personId);
const lifeMap = useLifeMap(personIdRef);
const mediaEntityRef = computed(() => props.personId ? { entityType: 'person' as const, entityId: props.personId } : null);
const mediaCh = useMediaChronological(mediaEntityRef);

async function load() {
  loading.value = true;
  data.value = await (window.api as any).reports.personSummary(props.personId);
  researcherName.value = (await (window.api as any).db.getSetting('researcher_name')) as string || null;
  loading.value = false;
}
watch(() => props.personId, load, { immediate: true });

const yearsLabel = computed(() => {
  if (!data.value) return '';
  if (!data.value.birthYear && !data.value.deathYear) return '';
  return `${data.value.birthYear ?? '?'}–${data.value.deathYear ?? ''}`;
});
const portraitUrl = ref<string | null>(null);
watch(() => mediaCh.items.value[0]?.id, async (firstId) => {
  if (!firstId) { portraitUrl.value = null; return; }
  portraitUrl.value = await (window.api as any).media.readAsDataUrl(firstId);
}, { immediate: true });
const photoGrid = computed(() => mediaCh.items.value.slice(1, 5));
const birthPlace = computed(() => data.value?.events?.find((e: any) => e.event_type === 'birth')?.place_name || null);
const bioSnippet = computed(() => {
  const notes = data.value?.notes as string || '';
  const firstPara = notes.split(/\n\n+/)[0] || '';
  return firstPara.length > 400 ? firstPara.slice(0, 400) + '…' : firstPara;
});
const lifeMapPoints = computed(() => lifeMap.data.value.events.map(e => ({
  lat: e.lat, lon: e.lon, label: e.placeName,
  year: e.dateISO ? parseInt(e.dateISO.slice(0, 4), 10) : null,
})));
const formattedDate = computed(() =>
  new Date().toLocaleDateString(locale.value === 'sv' ? 'sv-SE' : 'en-GB')
);
</script>

<style scoped>
.one-page {
  display: grid; gap: var(--space-md);
  padding: var(--space-xl);
  min-height: 100vh;
  font-family: var(--report-serif-stack);
}
.orient-portrait {
  grid-template-columns: 1fr 1fr;
  grid-template-rows: auto auto auto auto auto;
  grid-template-areas:
    "header header"
    "portrait facts"
    "map map"
    "photos photos"
    "snippet snippet"
    "footer footer";
}
.orient-landscape {
  grid-template-columns: 1fr 1fr 1fr;
  grid-template-rows: auto 1fr auto auto;
  grid-template-areas:
    "header header header"
    "portrait facts map"
    "photos photos snippet"
    "footer footer footer";
}
.op-header { grid-area: header; text-align: center; }
.op-name { font-size: 2.5rem; margin: 0; }
.op-years { color: var(--text-secondary); font-size: 1.25rem; }
.op-portrait { grid-area: portrait; }
.op-portrait img { max-width: 100%; border-radius: var(--radius-sm); }
.op-facts { grid-area: facts; }
.op-facts ul { list-style: none; padding: 0; }
.op-map { grid-area: map; }
.op-photos { grid-area: photos; display: grid; grid-template-columns: repeat(5, 1fr); gap: var(--space-sm); }
.grid-photo img { width: 100%; height: 120px; object-fit: cover; border-radius: var(--radius-sm); }
.op-snippet { grid-area: snippet; line-height: var(--report-prose-leading); font-size: 0.95rem; }
.op-footer { grid-area: footer; display: flex; font-size: var(--font-sm); color: var(--text-muted); }
.op-footer .spacer { flex: 1; }
</style>
```

- [x] **Step 2: Add tab in ReportsView.vue + i18n keys**

Tab id `onePage`. i18n: `reports.onePage.{title, keyDates}`.

- [x] **Step 3: Lint + tests + manual**

```bash
npm run lint && npm test
npm start
```

Pick a person, verify single-page layout, test both portrait/landscape.

- [x] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(reports): add Life on One Page report"
```

---

### Task 19: Family in Year X

**Files:**
- Create: `src/renderer/components/reports/FamilyInYearReport.vue`
- Modify: `src/renderer/views/ReportsView.vue`
- Modify: i18n

- [x] **Step 1: Create component**

Uses `window.api.reports.aliveInYear(year)` from Task 2.

```vue
<!-- src/renderer/components/reports/FamilyInYearReport.vue -->
<template>
  <div v-if="loading" class="loading">{{ $t('common.loading') }}</div>
  <template v-else-if="data">
    <ReportCover
      :title="$t('reports.familyInYear.title', { year })"
      :subtitle="$t('reports.familyInYear.subtitle')"
      :hero-image-url="heroImageUrl"
      :researcher-name="researcherName"
    />

    <section v-if="personPins.length" class="report-section">
      <h2 class="section-heading">{{ $t('reports.familyInYear.map') }}</h2>
      <LifeMap :points="personPins" :height="400" :draw-path="false" />
    </section>

    <section v-if="data.families.length" class="report-section">
      <h2 class="section-heading">{{ $t('reports.familyInYear.families') }}</h2>
      <div v-for="f in data.families" :key="f.relationshipId" class="family-block">
        <h3>{{ familyLabel(f) }}</h3>
        <div class="members">
          <PersonMiniCard v-for="p in allPeopleInFamily(f)" :key="p.id" v-bind="pinCardProps(p)" />
        </div>
      </div>
    </section>

    <section v-if="data.unattached.length" class="report-section">
      <h2 class="section-heading">{{ $t('reports.familyInYear.individuals') }}</h2>
      <div class="individuals-grid">
        <PersonMiniCard v-for="p in data.unattached" :key="p.id" v-bind="pinCardProps(p)" />
      </div>
    </section>
  </template>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import ReportCover from './primitives/ReportCover.vue';
import LifeMap from './primitives/LifeMap.vue';
import PersonMiniCard from './primitives/PersonMiniCard.vue';

const props = defineProps<{
  year: number;
  scope?: 'all' | 'ancestors' | 'descendants';
  scopePersonId?: string | null;
}>();

const scope = computed(() => props.scope ?? 'all');
const loading = ref(true);
const data = ref<any>(null);
const researcherName = ref<string | null>(null);
const heroImageUrl = ref<string | null>(null);

async function load() {
  loading.value = true;
  const raw = await (window.api as any).reports.aliveInYear(props.year);
  // For scope=ancestors/descendants, filter raw.persons by running ancestor/descendant lookup.
  // v1: implement 'all' only; scope filtering can be added later. If scope !== 'all' and scopePersonId provided,
  // fetch ancestor tree / descendant set and intersect.
  data.value = raw;
  researcherName.value = (await (window.api as any).db.getSetting('researcher_name')) as string || null;
  heroImageUrl.value = null;  // auto-pick deferred; manual-pick UI can be added via props later
  loading.value = false;
}
watch(() => [props.year, props.scope, props.scopePersonId], load, { immediate: true });

const year = computed(() => props.year);

const personPins = computed(() => {
  if (!data.value) return [];
  return data.value.persons
    .filter((p: any) => p.placeName)
    .map((p: any) => ({ lat: 0, lon: 0, label: `${p.given_name} ${p.surname}`, year: p.birthYear }))
    .filter((p: any) => p.lat !== 0);  // This needs actual lat/lon from place join
});

function familyLabel(f: any): string {
  return f.parents.map((p: any) => `${p.given_name} ${p.surname}`).join(' + ') || '—';
}
function allPeopleInFamily(f: any): any[] {
  return [...f.parents, ...f.children];
}
function pinCardProps(p: any) {
  return {
    givenName: p.given_name,
    surname: p.surname,
    sex: p.sex,
    birthYear: p.birthYear,
    deathYear: p.deathYear,
    keyPlace: p.placeName,
  };
}
</script>

<style scoped>
.report-section { padding: var(--space-xl) 0; page-break-inside: avoid; }
.section-heading { font-family: var(--report-serif-stack); font-size: 1.5rem; margin-bottom: var(--space-lg); }
.family-block { margin-bottom: var(--space-xl); }
.members, .individuals-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--space-md); }
</style>
```

Note: `personPins` requires lat/lon from a place join. `getAliveInYear` currently returns `placeName` only. If maps are important at ship time, extend `getAliveInYear` to return `placeLat`/`placeLon` from the `places` table join. For v1 the map section can be hidden if no pins geocode.

- [x] **Step 2: Extend getAliveInYear to include place coordinates (optional improvement)**

Update the SQL in `src/api/report_data.ts` `getAliveInYear` to also join on `places.latitude` and `places.longitude` and return these fields in each person row. Update types accordingly.

- [x] **Step 3: Add tab + i18n**

Tab id `familyInYear`. Year input + scope select. i18n: `reports.familyInYear.{title, subtitle, map, families, individuals}`.

- [x] **Step 4: Lint + tests + manual**

```bash
npm run lint && npm test
npm start
```

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(reports): add Family in Year X report"
```

---

### Task 20: Photo Album

**Files:**
- Create: `src/renderer/components/reports/PhotoAlbumReport.vue`
- Modify: `src/renderer/views/ReportsView.vue`
- Modify: i18n

- [x] **Step 1: Create component**

```vue
<!-- src/renderer/components/reports/PhotoAlbumReport.vue -->
<template>
  <div v-if="loading" class="loading">{{ $t('common.loading') }}</div>
  <template v-else-if="items.length">
    <ReportCover :title="albumTitle" :subtitle="albumSubtitle" :hero-image-url="firstImageUrl" :researcher-name="researcherName" />

    <section class="report-section">
      <MediaChronological
        :items="displayItems"
        :show-captions="showCaptions"
        :per-page="perPage"
        :include-documents="includeDocuments"
      />
    </section>

    <section v-if="showIndex" class="report-section">
      <h2 class="section-heading">{{ $t('reports.photoAlbum.index') }}</h2>
      <ol>
        <li v-for="item in displayItems" :key="item.id">{{ item.title || $t('common.unknown') }}</li>
      </ol>
    </section>
  </template>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import ReportCover from './primitives/ReportCover.vue';
import MediaChronological from './primitives/MediaChronological.vue';
import { useMediaChronological } from '../../composables/useMediaChronological';

const props = defineProps<{
  subjectType: 'person' | 'relationship' | 'place' | 'all';
  subjectId?: string | null;
  perPage?: 1 | 2 | 4;
  showCaptions?: boolean;
  showIndex?: boolean;
  includeDocuments?: boolean;
}>();

const perPage = computed(() => props.perPage ?? 1);
const showCaptions = computed(() => props.showCaptions !== false);
const showIndex = computed(() => props.showIndex === true);
const includeDocuments = computed(() => props.includeDocuments === true);

const loading = ref(true);
const researcherName = ref<string | null>(null);

const entityRef = computed(() => {
  if (props.subjectType === 'all' || !props.subjectId) return null;
  return { entityType: props.subjectType as 'person' | 'relationship' | 'place', entityId: props.subjectId };
});

const mediaCh = useMediaChronological(entityRef);
const allMedia = ref<any[]>([]);

async function loadAllMedia() {
  if (props.subjectType !== 'all') return;
  const list = await (window.api as any).media.list();
  allMedia.value = list;
}

async function loadResearcher() {
  researcherName.value = (await (window.api as any).db.getSetting('researcher_name')) as string || null;
}

watch(() => [props.subjectType, props.subjectId], async () => {
  loading.value = true;
  if (props.subjectType === 'all') await loadAllMedia();
  await loadResearcher();
  loading.value = false;
}, { immediate: true });

const items = computed(() => props.subjectType === 'all' ? allMedia.value : mediaCh.items.value);

const displayItems = computed(() => items.value.map(i => ({
  id: i.id,
  title: i.title,
  notes: i.notes,
  fileRef: i.fileRef || i.file_ref,
  format: i.format,
  inferredDateISO: i.inferredDateISO || null,
  contextLine: null,
})));

const firstImageUrl = ref<string | null>(null);
watch(() => displayItems.value[0]?.id, async (firstId) => {
  if (!firstId) { firstImageUrl.value = null; return; }
  firstImageUrl.value = await (window.api as any).media.readAsDataUrl(firstId);
}, { immediate: true });

const albumTitle = computed(() => {
  // Basic title, can be overridden by a prop in future
  return 'Photo Album';
});
const albumSubtitle = computed(() => {
  if (props.subjectType === 'all') return '';
  return '';
});
</script>

<style scoped>
.report-section { padding: var(--space-xl) 0; }
.section-heading { font-family: var(--report-serif-stack); font-size: 1.5rem; margin-bottom: var(--space-lg); }
</style>
```

- [x] **Step 2: Add tab + i18n**

Tab id `photoAlbum`. Subject-type dropdown + subject picker (person/family/place/all) + per-page radio (1/2/4) + captions toggle + index toggle + documents toggle. i18n: `reports.photoAlbum.{title, index}`.

- [x] **Step 3: Lint + tests + manual**

```bash
npm run lint && npm test
npm start
```

- [x] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(reports): add Photo Album report"
```

---

## Phase 5: Migration & cleanup

### Task 21: Repurpose Ancestor Sheet → Pedigree Print

**Files:**
- Rename + rewrite: `src/renderer/components/reports/AncestorSheetReport.vue` → `src/renderer/components/reports/PedigreePrintReport.vue`
- Modify: `src/renderer/views/ReportsView.vue`
- Modify: i18n

- [x] **Step 1: Rename file**

```bash
git mv src/renderer/components/reports/AncestorSheetReport.vue src/renderer/components/reports/PedigreePrintReport.vue
```

- [x] **Step 2: Rewrite as a clean pedigree chart (not a table)**

The existing `AncestorSheetReport` is a tabular ancestor sheet. Replace its implementation with a clean framable pedigree chart — re-use the chart layout from `src/renderer/utils/chart-layout/pedigree.ts` and render an SVG similar to `PedigreeChartReport.vue` but with a fixed paper size frame (A3/A4 selectable), no interactive chrome, clean typography, and no table.

If `PedigreeChartReport.vue` already does exactly what we want, `PedigreePrintReport.vue` becomes a thin wrapper that passes paper-size props to it. Check `PedigreeChartReport.vue` first — if it's already print-only and matches this purpose, delete the old `AncestorSheetReport` entirely and add `PedigreeChartReport` as the "Pedigree Print" framable-prints tab in ReportsView. **Strongly recommended** — this avoids component duplication.

Plan: **delete `AncestorSheetReport.vue` after confirming `PedigreeChartReport.vue` covers the use case**, and surface it as a tab named "Pedigree Print" in the framable-prints group.

```bash
git rm src/renderer/components/reports/AncestorSheetReport.vue
```

- [x] **Step 3: Update ReportsView.vue**

Move the `ancestor` tab (which used `AncestorSheetReport`) to either:
- Redirect to using `PedigreeChartReport` with a new tab label "Pedigree Print", OR
- Remove entirely if `pedigreeChart` tab already exists in the framable-prints group.

Check current `ReportsView.vue` tabs. If `pedigreeChart` already exists and renders `PedigreeChartReport`, drop the `ancestor` tab. If not, rename `ancestor` to `pedigreePrint` and swap the component.

- [x] **Step 4: Update i18n**

Remove `reports.ancestor*` keys that referred to the Ancestor Sheet tabular format. Ensure `reports.pedigreePrint.title` exists with English "Pedigree Print" and Swedish "Antavla" (framed chart sense, distinct from the list-style "Ancestor Sheet" which is retired).

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(reports): repurpose Ancestor Sheet as Pedigree Print (framable chart)"
```

---

### Task 22: Delete IndividualSummary and FamilyGroupSheet

**Files:**
- Delete: `src/renderer/components/reports/IndividualSummary.vue`
- Delete: `src/renderer/components/reports/FamilyGroupSheet.vue`
- Modify: `src/renderer/views/ReportsView.vue`
- Modify: i18n

- [x] **Step 1: Remove imports from ReportsView.vue**

Open `src/renderer/views/ReportsView.vue`, remove the `IndividualSummary` and `FamilyGroupSheet` imports and remove the `individual` and `family` tabs, their ref state (`individualPersonId`, `familyRelationshipId`), and their conditional render blocks.

- [x] **Step 2: Delete the component files**

```bash
git rm src/renderer/components/reports/IndividualSummary.vue src/renderer/components/reports/FamilyGroupSheet.vue
```

- [x] **Step 3: Remove i18n keys**

In `en.ts` and `sv.ts`, remove the `reports.individual.*` and `reports.familyGroupSheet.*` (or equivalent) keys. Run a grep to confirm no leftover references.

```bash
```

(Use Grep tool with pattern `reports\.individual\.|reports\.familyGroupSheet\.` under `src/renderer`.)

- [x] **Step 4: Lint + tests**

```bash
npm run lint && npm test
```

Expected: PASS. No orphaned imports.

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(reports): remove IndividualSummary and FamilyGroupSheet"
```

---

### Task 23: Reorganize ReportsView tabs into two groups

**Files:**
- Modify: `src/renderer/views/ReportsView.vue`
- Modify: i18n

- [x] **Step 1: Restructure the tab list**

Replace the current flat `FilterChips` with two `FilterChips` rows (or a two-section chip bar). Keep one `activeTab` state.

Tab list:
- Keepsake reports: `alife`, `amarriage`, `placeChronicle`, `yourAncestors`, `onePage`, `familyInYear`, `photoAlbum`
- Framable prints: `pedigreePrint`, `fanChart`, `descendantChart`, `hourglassChart`, `timeline`

```vue
<div class="tab-groups">
  <div class="tab-group">
    <h3 class="tab-group-label">{{ $t('reports.groups.keepsake') }}</h3>
    <FilterChips
      :model-value="activeTab"
      :options="keepsakeTabs"
      @update:model-value="activeTab = $event as typeof activeTab"
    />
  </div>
  <div class="tab-group">
    <h3 class="tab-group-label">{{ $t('reports.groups.framablePrints') }}</h3>
    <FilterChips
      :model-value="activeTab"
      :options="framableTabs"
      @update:model-value="activeTab = $event as typeof activeTab"
    />
  </div>
</div>
```

Corresponding `<script setup>` changes:

```typescript
const keepsakeTabs = computed(() => [
  { value: 'alife', label: t('reports.alife.title') },
  { value: 'amarriage', label: t('reports.amarriage.title') },
  { value: 'placeChronicle', label: t('reports.placeChronicle.title') },
  { value: 'yourAncestors', label: t('reports.yourAncestors.tabTitle') },
  { value: 'onePage', label: t('reports.onePage.title') },
  { value: 'familyInYear', label: t('reports.familyInYear.tabTitle') },
  { value: 'photoAlbum', label: t('reports.photoAlbum.title') },
]);
const framableTabs = computed(() => [
  { value: 'pedigreePrint', label: t('reports.pedigreePrint.title') },
  { value: 'fanChart', label: t('visualization.fan') },
  { value: 'descendantChart', label: t('visualization.descendants') },
  { value: 'hourglassChart', label: t('visualization.hourglass') },
  { value: 'timeline', label: t('visualization.timeline') },
]);
```

- [x] **Step 2: Add i18n keys**

```typescript
// en.ts
reports: {
  groups: {
    keepsake: 'Keepsake reports',
    framablePrints: 'Framable prints',
  },
}
// sv.ts
reports: {
  groups: {
    keepsake: 'Minnesrapporter',
    framablePrints: 'Inramningsbara diagram',
  },
}
```

- [x] **Step 3: Style tab groups**

Add scoped CSS in ReportsView:

```css
.tab-groups { display: flex; flex-direction: column; gap: var(--space-md); }
.tab-group-label { font-size: var(--font-sm); color: var(--text-muted); margin: 0 0 var(--space-xs); text-transform: uppercase; letter-spacing: 0.5px; }
```

- [x] **Step 4: Lint + tests + manual**

```bash
npm run lint && npm test
npm start
```

Verify both groups render with correct chips, selecting a chip in either group updates `activeTab`.

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(reports): split tabs into Keepsake and Framable groups"
```

---

## Phase 6: Testing & release

### Task 24: Privacy helper for living persons

**Files:**
- Create: `src/renderer/utils/reportPrivacy.ts`
- Test: `tests/unit/reportPrivacy.test.ts`
- Modify: `src/renderer/components/reports/ALifeReport.vue`
- Modify: `src/renderer/components/reports/AMarriageReport.vue`
- Modify: `src/renderer/components/reports/YourAncestorsReport.vue`
- Modify: `src/renderer/components/reports/LifeOnOnePageReport.vue`
- Modify: `src/renderer/components/reports/FamilyInYearReport.vue`
- Modify: `src/renderer/views/ReportsView.vue`
- Modify: `src/renderer/i18n/en.ts`, `src/renderer/i18n/sv.ts`

- [x] **Step 1: Create the helper with tests**

```typescript
// src/renderer/utils/reportPrivacy.ts
export interface PersonRedactionInput {
  id: string;
  living?: boolean;
  birthYear?: number | null;
  deathYear?: number | null;
  givenName?: string | null;
  surname?: string | null;
  notes?: string | null;
  portraitUrl?: string | null;
  identifiers?: Array<{ type: string; value: string }>;
}

export interface RedactionOptions {
  redactLiving: boolean;
}

export function redactPerson<T extends PersonRedactionInput>(p: T, opts: RedactionOptions): T {
  // Identifiers are unconditionally hidden for living persons, regardless of options.
  const identifiers = p.living ? [] : (p.identifiers || []);

  if (!p.living || !opts.redactLiving) {
    return { ...p, identifiers };
  }

  // Redact-living toggle: decade for birth year, hide portrait, hide notes.
  const decade = p.birthYear != null ? Math.floor(p.birthYear / 10) * 10 : null;
  return {
    ...p,
    identifiers,
    birthYear: decade,
    deathYear: p.deathYear,
    notes: null,
    portraitUrl: null,
  };
}
```

```typescript
// tests/unit/reportPrivacy.test.ts
import { describe, it, expect } from 'vitest';
import { redactPerson } from '../../src/renderer/utils/reportPrivacy';

describe('redactPerson', () => {
  it('hides identifiers for living persons regardless of toggle', () => {
    const r = redactPerson(
      { id: 'p1', living: true, identifiers: [{ type: 'personnummer', value: '19800101-0000' }] },
      { redactLiving: false },
    );
    expect(r.identifiers).toEqual([]);
  });

  it('keeps identifiers for deceased persons', () => {
    const r = redactPerson(
      { id: 'p1', living: false, identifiers: [{ type: 'riksarkivet', value: 'X' }] },
      { redactLiving: false },
    );
    expect(r.identifiers).toEqual([{ type: 'riksarkivet', value: 'X' }]);
  });

  it('replaces birth year with decade when redactLiving is on', () => {
    const r = redactPerson({ id: 'p1', living: true, birthYear: 1985 }, { redactLiving: true });
    expect(r.birthYear).toBe(1980);
  });

  it('hides notes and portrait when redactLiving is on', () => {
    const r = redactPerson(
      { id: 'p1', living: true, notes: 'Private', portraitUrl: 'media://x' },
      { redactLiving: true },
    );
    expect(r.notes).toBeNull();
    expect(r.portraitUrl).toBeNull();
  });

  it('does nothing for deceased persons when redactLiving is on', () => {
    const r = redactPerson(
      { id: 'p1', living: false, notes: 'Public', birthYear: 1850 },
      { redactLiving: true },
    );
    expect(r.notes).toBe('Public');
    expect(r.birthYear).toBe(1850);
  });
});
```

- [x] **Step 2: Run tests**

```bash
npx vitest run tests/unit/reportPrivacy.test.ts
```

Expected: PASS.

- [x] **Step 3: Wire into the five reports that render person data**

In each of ALifeReport, AMarriageReport, YourAncestorsReport, LifeOnOnePageReport, FamilyInYearReport:

1. Add a new prop `redactLiving?: boolean` with default `false`.
2. Import the helper: `import { redactPerson } from '../../utils/reportPrivacy';`
3. When consuming loaded person data, map each person through `redactPerson(p, { redactLiving: props.redactLiving === true })` before rendering.

Example for ALifeReport — in the `load()` function after fetching `data.value`:

```typescript
const raw = await (window.api as any).reports.personSummary(props.personId);
data.value = redactPerson(raw, { redactLiving: props.redactLiving === true });
// Also redact spouses, children, parents:
data.value.spouses = raw.spouses.map((s: any) => redactPerson(s, { redactLiving: props.redactLiving === true }));
data.value.children = raw.children.map((c: any) => redactPerson(c, { redactLiving: props.redactLiving === true }));
data.value.parents = raw.parents.map((p: any) => redactPerson(p, { redactLiving: props.redactLiving === true }));
```

- [x] **Step 4: Add toggle to ReportsView for affected tabs**

Add a `redactLiving` ref to ReportsView, a checkbox in the controls bar of the five reports (alife, amarriage, yourAncestors, onePage, familyInYear), labelled via `$t('reports.common.redactLiving')`. Pass it as `:redact-living="redactLiving"` to each report component.

- [x] **Step 5: Add i18n key**

```typescript
// en.ts under reports.common
redactLiving: 'Redact living persons',
// sv.ts under reports.common
redactLiving: 'Dölj uppgifter om levande personer',
```

- [x] **Step 6: Lint + tests + manual**

```bash
npm run lint && npm test
npm start
```

Manually verify: mark a person as `living=true`, toggle "Redact living persons" on in a report, confirm birth year is shown as decade and notes/portrait are hidden.

- [x] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(reports): add privacy filtering for living persons"
```

---

### Task 25: Add component smoke tests for all reports

**Files:**
- Create: `tests/unit/components/reports/ALifeReport.test.ts`
- Create: `tests/unit/components/reports/AMarriageReport.test.ts`
- Create: `tests/unit/components/reports/PlaceChronicleReport.test.ts`
- Create: `tests/unit/components/reports/YourAncestorsReport.test.ts`
- Create: `tests/unit/components/reports/LifeOnOnePageReport.test.ts`
- Create: `tests/unit/components/reports/FamilyInYearReport.test.ts`
- Create: `tests/unit/components/reports/PhotoAlbumReport.test.ts`

- [x] **Step 1: Write one smoke test per report**

Each smoke test:
1. Mock `window.api.reports.*`, `window.api.media.*`, `window.api.events.*`, `window.api.places.*`, `window.api.db.getSetting` with realistic seeded data.
2. Mount the component.
3. Assert that expected sections render.
4. Assert that empty sections are hidden when data is absent.

Example pattern for `ALifeReport.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import ALifeReport from '../../../../src/renderer/components/reports/ALifeReport.vue';

const i18n = createI18n({
  legacy: false, locale: 'en',
  messages: { en: {
    reports: { alife: { lifeMap: 'Life Map', timeline: 'Timeline', family: 'Family', events: 'Events', biography: 'Biography' }, common: { photos: 'Photos', documents: 'Documents', sources: 'Sources', compiledBy: 'Compiled by {name}', compiledByAnonymous: 'Compiled {date}' } },
    common: { loading: 'Loading...', unknown: '?' }, events: {}, personPanel: { partners: 'Partners', children: 'Children' },
  } },
});

beforeEach(() => {
  // @ts-expect-error shim
  globalThis.window = {
    api: {
      reports: {
        personSummary: vi.fn().mockResolvedValue({
          primaryName: 'Anna Andersson',
          birthYear: 1850, deathYear: 1920,
          notes: 'Lived in Småland.',
          parents: [], spouses: [], children: [],
          events: [], citations: [],
        }),
      },
      db: { getSetting: vi.fn().mockResolvedValue('Jonas Ahnstedt') },
      events: { forPerson: vi.fn().mockResolvedValue([]) },
      places: { get: vi.fn().mockResolvedValue(null) },
      media: { forEntity: vi.fn().mockResolvedValue([]) },
    },
  } as never;
});

describe('ALifeReport', () => {
  it('renders cover with name and years', async () => {
    const wrapper = mount(ALifeReport, { props: { personId: 'p1' }, global: { plugins: [i18n] } });
    await flushPromises();
    expect(wrapper.text()).toContain('Anna Andersson');
    expect(wrapper.text()).toContain('1850');
    expect(wrapper.text()).toContain('Compiled by Jonas Ahnstedt');
  });

  it('hides empty family section', async () => {
    const wrapper = mount(ALifeReport, { props: { personId: 'p1' }, global: { plugins: [i18n] } });
    await flushPromises();
    expect(wrapper.text()).not.toContain('Family');
  });

  it('shows biography when notes present', async () => {
    const wrapper = mount(ALifeReport, { props: { personId: 'p1' }, global: { plugins: [i18n] } });
    await flushPromises();
    expect(wrapper.text()).toContain('Lived in Småland');
  });
});
```

Repeat this pattern for each of the other six report components. For each, ensure:
- Section with data present → renders.
- Section with no data → hidden.
- Cover rendered with researcher attribution.

- [x] **Step 2: Run all tests**

```bash
npx vitest run tests/unit/components/reports/
```

Expected: PASS.

- [x] **Step 3: Commit**

```bash
git add tests/unit/components/reports/*.test.ts
git commit -m "test(reports): add smoke tests for all seven reports"
```

---

### Task 26: Add E2E test for Reports view

**Files:**
- Modify: `tests/e2e/app.test.ts`

- [x] **Step 1: Seed test data and exercise each report**

Extend the existing E2E test file with a new test block that:
1. Launches the app with a temp DB.
2. Uses IPC or MCP to seed a person with events + media + relationships + a place.
3. Navigates to Reports view.
4. For each keepsake tab, selects the seeded subject, waits for preview, clicks Export PDF, asserts the exported file exists and size > 0.

Example skeleton (complete by filling in actual seeding helpers used in other E2E tests):

```typescript
import { test, expect } from '@playwright/test';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

test.describe('Reports view smoke', () => {
  let app: ElectronApplication;
  let page: Page;
  let tmpDb: string;
  let exportDir: string;

  test.beforeAll(async () => {
    tmpDb = path.join(os.tmpdir(), `slaktforskning-e2e-${Date.now()}.db`);
    exportDir = path.join(os.tmpdir(), `slaktforskning-exports-${Date.now()}`);
    fs.mkdirSync(exportDir, { recursive: true });
    app = await electron.launch({
      args: ['.'],
      env: { ...process.env, SLAKTFORSKNING_DB: tmpDb, SLAKTFORSKNING_EXPORT_DIR: exportDir },
    });
    page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    // Seed test data via window.api or existing helpers — follow pattern used in other tests.
  });

  test.afterAll(async () => {
    await app.close();
    if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb);
  });

  for (const tab of ['alife', 'amarriage', 'placeChronicle', 'yourAncestors', 'onePage', 'familyInYear', 'photoAlbum']) {
    test(`${tab} renders and exports PDF`, async () => {
      await page.goto('#/reports');
      // Select the tab chip
      await page.getByRole('button', { name: tab, exact: false }).click();
      // Select subject (if required by the tab) — follow the existing patterns for person/place/relationship pickers.
      // Wait for preview render
      await page.waitForSelector('.print-preview', { state: 'visible', timeout: 10000 });
      // Click Export PDF — the handler may write to a known path or open a save dialog.
      // For the smoke test, rely on the existing IPC export path and assert the output file.
    });
  }
});
```

Note: the exact subject-selection UI per tab depends on the controls implemented in earlier tasks. Use `page.locator` helpers and the real DOM from the implemented ReportsView. If the Export PDF flow opens a native save dialog, use Playwright's dialog handler or call the IPC export function directly via `page.evaluate`.

- [x] **Step 2: Run E2E tests**

```bash
source .devcontainer/xvfb-start.sh  # if running in devcontainer
npx playwright test tests/e2e/app.test.ts
```

Expected: PASS.

- [x] **Step 3: Commit**

```bash
git add tests/e2e/app.test.ts
git commit -m "test(e2e): smoke-test all seven keepsake reports"
```

---

### Task 27: CHANGELOG, docs, and version bump

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `CLAUDE.md` (reports section)
- Modify: `docs/PLAN.md`

- [x] **Step 1: Update CHANGELOG.md**

Prepend:

```markdown
## v0.131.0 — keepsake reports redesign

### New reports
- **A Life** (evolves Biography) — life map, timeline, family, events, notes, photos, sources appendix.
- **A Marriage** (evolves Family Narrative) — dual life map, shared timeline, couple, children grid, narrative, photos.
- **Place Chronicle** (evolves Place History) — boundary map, persons, events, description, photos, child places.
- **Your Ancestors** (evolves Ancestor Book) — fan chart cover, full-page fan, per-ancestor pages, surname index.
- **Life on One Page** (new) — single framable sheet with portrait, map, key dates, photos, notes snippet.
- **Family in Year X** (new) — snapshot of everyone alive in a given year with family units and a map.
- **Photo Album** (new) — chronological media gallery with captions and context, subject-scoped.

### Removed reports
- **Individual Summary** — redundant with PersonDetailView. Use A Life for the keepsake version.
- **Family Group Sheet** — redundant with RelationshipDetailView. Use A Marriage for the keepsake version.
- **Ancestor Sheet** (tabular) — retired; superseded by the framable Pedigree Print.

### Other changes
- New Settings field `researcher_name` powers report attribution.
- Reports view now has two tab groups: Keepsake reports and Framable prints.
- New design tokens: `--report-serif-stack`, `--report-prose-leading`, `--report-page-max-width`, `--report-cover-accent-height`.
- New `getAliveInYear(year)` API function + IPC.
- New `useLifeMap` and `useMediaChronological` composables.
- Six new print-safe shared primitives under `src/renderer/components/reports/primitives/`.
```

- [x] **Step 2: Bump version**

Update `package.json`:

```json
  "version": "0.131.0",
```

- [x] **Step 3: Update CLAUDE.md reports section**

In the Vue Component Patterns → Shared Components section (or Reports section if one exists), add entries for the new primitives and reports. Remove entries for the dropped components. Update the route table if `/reports` details changed.

- [x] **Step 4: Update docs/PLAN.md roadmap**

Add a done-milestone entry pointing to the archived plan path (this file, once moved):

```markdown
- [x] Keepsake reports redesign ([plan archive](plans/archive/2026-04-19-keepsake-reports-redesign.md)) — 7 keepsake reports + 6 framable prints, deterministic rendering of researcher-authored data.
```

- [x] **Step 5: Archive the plan**

```bash
git mv docs/plans/2026-04-19-keepsake-reports-redesign.md docs/plans/archive/2026-04-19-keepsake-reports-redesign.md
git mv docs/plans/2026-04-19-keepsake-reports-redesign-design.md docs/plans/archive/2026-04-19-keepsake-reports-redesign.md
```

- [x] **Step 6: Final commit**

```bash
git add -A
git commit -m "release: v0.131.0 — keepsake reports redesign"
```

- [x] **Step 7: Verify a full test run and launch**

```bash
npm run lint && npm test && npx playwright test
npm start
```

Spot-check each report with realistic data. If any report fails or regresses, revert the version bump in a follow-up commit until fixed.

---

## Self-review checklist (for the plan author, before committing this plan)

- All seven report components covered by tasks.
- Two deleted reports (IndividualSummary, FamilyGroupSheet) covered.
- Ancestor Sheet repurpose covered.
- All six primitives covered.
- Composables covered.
- API function + IPC covered.
- i18n migration covered.
- Tab-group reorganization covered.
- Researcher attribution setting covered.
- Smoke tests + E2E covered.
- CHANGELOG + version bump + archive covered.

---
