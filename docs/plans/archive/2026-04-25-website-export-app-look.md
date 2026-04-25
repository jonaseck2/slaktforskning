# Website Export — App-Look Static Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the standalone HTML generator with a read-only Vue SPA that visually matches the application — same sidebar, search, themes, detail layouts — minus editing affordances.

**Architecture:** A new Vite entry (`vite.static.config.ts`) bundles the existing renderer components into a self-contained SPA shipped as `extraResources/dist-static/`. At export time, the IPC handler copies the bundle to the user's chosen folder, generates a `data.json` snapshot scoped to a focus person + N generations, copies/thumbnails media files, and pre-renders reports/prints via a hidden `BrowserWindow`. A `window.api` stub backed by `data.json` answers the same calls the live app makes — most components reuse unchanged. A `readonly` prop on detail/list components hides edit controls.

**Tech Stack:** Electron 41, Vue 3, Vite, TypeScript, lunr (new), node-sqlite3-wasm, Vitest, Playwright.

**Spec:** `docs/plans/2026-04-25-website-export-app-look-design.md`

---

## File Structure

### New files

**Build infra:**
- `vite.static.config.ts` — Vite config for the static SPA build, sets `VITE_STATIC_MODE=true`.

**Static SPA entry:**
- `src/static/main.ts` — Vue bootstrap, installs static-api before mount.
- `src/static/App.vue` — simplified shell: 5-nav sidebar, no badges, no settings/import-export links.
- `src/static/router.ts` — reduced route table.
- `src/static/static-api.ts` — `window.api` stub backed by `data.json`.
- `src/static/stores/uiMode.ts` — Pinia store exposing `isReadOnly`.
- `src/static/views/PersonsListView.vue` — list-only.
- `src/static/views/PlacesListView.vue` — map + list-only.
- `src/static/views/PersonDetailView.vue` — full-page wrapper around `PersonPanel` content (readonly).
- `src/static/views/PlaceDetailView.vue` — full-page wrapper around `PlacePanel` content (readonly).
- `src/static/views/ReportsIndexView.vue` — links to pre-rendered reports.
- `src/static/views/ReportPageView.vue` — iframe of one report.
- `src/static/views/PrintsIndexView.vue` — links to pre-rendered prints.
- `src/static/views/PrintPageView.vue` — iframe of one print.
- `src/static/dev/fixtures.json` — small dev-only data.json for `npm run dev:static`.

**Snapshot generation:**
- `src/api/html_site/scope.ts` — focus person + N up + M down → `Set<personId>`.
- `src/api/html_site/redact.ts` — apply privacy rules to person snapshot.
- `src/api/html_site/snapshot.ts` — build full `data.json` payload from DB.
- `src/api/html_site/thumbnails.ts` — generate ≤800px thumbnails using Electron's `nativeImage`.

**Export orchestration:**
- `src/main/ipc/website-export.ts` — orchestrates copy bundle + write data.json + copy media + pre-render reports.

**Tests:**
- `tests/unit/scope.test.ts`
- `tests/unit/redact.test.ts`
- `tests/unit/snapshot.test.ts`
- `tests/unit/staticApi.test.ts`
- `tests/e2e/website-export.test.ts`

### Modified files

- `src/renderer/components/PersonPanel.vue`, `PlacePanel.vue`, `RelationshipPanel.vue` — accept `readonly` prop.
- `src/renderer/components/EventList.vue`, `PersonNamesTable.vue`, `ResearchTasksTable.vue`, `GroupsTable.vue`, `EntityMediaSection.vue`, `PersonIdentifiersSection.vue`, `PersonChecksSection.vue` — accept `readonly`.
- `src/renderer/views/WebsiteExportView.vue` — replaced with the export dialog.
- `src/renderer/i18n/sv.ts`, `src/renderer/i18n/en.ts` — strings for the new export dialog.
- `src/preload/index.ts` — expose `website.export` channel.
- `src/main/ipc/index.ts` — register the new website-export handler.
- `forge.config.ts` — add `extraResource: ['dist-static']`.
- `package.json` — add `build:static` and `dev:static` scripts, add `lunr` dep.

### Deleted files (Task 22, last)

- `src/api/html_site/generator.ts`
- `src/api/html_site/templates.ts`
- `src/api/html_site/style.ts`

---

## Task 1: Add the lunr dependency and verify install

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install lunr**

```bash
npm install lunr@2.3.9 @types/lunr@2.3.7
```

Expected output: `added 2 packages`.

- [ ] **Step 2: Verify lint passes**

```bash
npm run lint
```

Expected: `0 errors`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add lunr for static-site search index"
```

---

## Task 2: Implement scope.ts (focus person + N up + M down)

**Files:**
- Create: `src/api/html_site/scope.ts`
- Test: `tests/unit/scope.test.ts`

The scope function returns the transitive set of person IDs reachable from a focus person within N ancestor generations and M descendant generations, including spouses of every person reached. Walks `relationships` table.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/scope.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import { createPerson } from '../../src/api/persons';
import { createRelationship } from '../../src/api/relationships';
import { computeScope } from '../../src/api/html_site/scope';

let db: any;
beforeEach(() => { db = createTestDb(); });

describe('computeScope', () => {
  it('returns just the focus person when no relationships and 0 generations', () => {
    const p = createPerson(db, { given_name: 'Anna' });
    const ids = computeScope(db, { focusId: p.id, ancestors: 0, descendants: 0 });
    expect([...ids]).toEqual([p.id]);
  });

  it('includes ancestors up to N generations, plus their spouses', () => {
    const child = createPerson(db, { given_name: 'C' });
    const father = createPerson(db, { given_name: 'F' });
    const mother = createPerson(db, { given_name: 'M' });
    const grandpa = createPerson(db, { given_name: 'G' });
    createRelationship(db, { type: 'parent_child', person1_id: father.id, person2_id: child.id });
    createRelationship(db, { type: 'parent_child', person1_id: mother.id, person2_id: child.id });
    createRelationship(db, { type: 'couple', person1_id: father.id, person2_id: mother.id });
    createRelationship(db, { type: 'parent_child', person1_id: grandpa.id, person2_id: father.id });

    const ids = computeScope(db, { focusId: child.id, ancestors: 1, descendants: 0 });
    expect(ids).toEqual(new Set([child.id, father.id, mother.id]));

    const ids2 = computeScope(db, { focusId: child.id, ancestors: 2, descendants: 0 });
    expect(ids2).toEqual(new Set([child.id, father.id, mother.id, grandpa.id]));
  });

  it('includes descendants up to M generations, plus their spouses', () => {
    const root = createPerson(db, { given_name: 'R' });
    const son = createPerson(db, { given_name: 'S' });
    const daughterInLaw = createPerson(db, { given_name: 'D' });
    const grandchild = createPerson(db, { given_name: 'GC' });
    createRelationship(db, { type: 'parent_child', person1_id: root.id, person2_id: son.id });
    createRelationship(db, { type: 'couple', person1_id: son.id, person2_id: daughterInLaw.id });
    createRelationship(db, { type: 'parent_child', person1_id: son.id, person2_id: grandchild.id });

    const ids = computeScope(db, { focusId: root.id, ancestors: 0, descendants: 1 });
    expect(ids).toEqual(new Set([root.id, son.id, daughterInLaw.id]));

    const ids2 = computeScope(db, { focusId: root.id, ancestors: 0, descendants: 2 });
    expect(ids2).toEqual(new Set([root.id, son.id, daughterInLaw.id, grandchild.id]));
  });

  it('returns ALL persons when everyone=true', () => {
    const a = createPerson(db, { given_name: 'A' });
    const b = createPerson(db, { given_name: 'B' });
    const ids = computeScope(db, { everyone: true });
    expect(ids).toEqual(new Set([a.id, b.id]));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/scope.test.ts
```

Expected: FAIL with "Cannot find module '.../scope'".

- [ ] **Step 3: Implement scope.ts**

Create `src/api/html_site/scope.ts`:

```typescript
import type { Database } from 'node-sqlite3-wasm';
import { queryAll } from '../db';

export interface ScopeOptions {
  focusId?: string;
  ancestors?: number;
  descendants?: number;
  everyone?: boolean;
}

export function computeScope(db: Database, opts: ScopeOptions): Set<string> {
  if (opts.everyone) {
    const rows = queryAll<{ id: string }>(db, 'SELECT id FROM persons');
    return new Set(rows.map(r => r.id));
  }
  if (!opts.focusId) return new Set();

  const result = new Set<string>([opts.focusId]);
  const ancestors = opts.ancestors ?? 0;
  const descendants = opts.descendants ?? 0;

  let frontier = new Set<string>([opts.focusId]);
  for (let g = 0; g < ancestors; g++) {
    const next = new Set<string>();
    for (const id of frontier) {
      const parents = queryAll<{ person1_id: string }>(
        db,
        "SELECT person1_id FROM relationships WHERE type='parent_child' AND person2_id=?",
        [id]
      );
      for (const p of parents) {
        if (p.person1_id && !result.has(p.person1_id)) {
          result.add(p.person1_id);
          next.add(p.person1_id);
        }
      }
    }
    frontier = next;
    if (frontier.size === 0) break;
  }

  frontier = new Set<string>([opts.focusId]);
  for (let g = 0; g < descendants; g++) {
    const next = new Set<string>();
    for (const id of frontier) {
      const children = queryAll<{ person2_id: string }>(
        db,
        "SELECT person2_id FROM relationships WHERE type='parent_child' AND person1_id=?",
        [id]
      );
      for (const c of children) {
        if (c.person2_id && !result.has(c.person2_id)) {
          result.add(c.person2_id);
          next.add(c.person2_id);
        }
      }
    }
    frontier = next;
    if (frontier.size === 0) break;
  }

  // Add spouses of everyone in scope
  const inScope = [...result];
  for (const id of inScope) {
    const couples = queryAll<{ person1_id: string; person2_id: string }>(
      db,
      "SELECT person1_id, person2_id FROM relationships WHERE type='couple' AND (person1_id=? OR person2_id=?)",
      [id, id]
    );
    for (const c of couples) {
      if (c.person1_id && c.person1_id !== id) result.add(c.person1_id);
      if (c.person2_id && c.person2_id !== id) result.add(c.person2_id);
    }
  }

  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/scope.test.ts
```

Expected: 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/api/html_site/scope.ts tests/unit/scope.test.ts
git commit -m "feat(html_site): scope computation for focus person + N gens"
```

---

## Task 3: Implement redact.ts (privacy rules for living persons)

**Files:**
- Create: `src/api/html_site/redact.ts`
- Test: `tests/unit/redact.test.ts`

Redaction rules for `living=true` persons:
- Keep id, sex, preferred name.
- Birth year floored to decade (e.g. 1985 → 1980, displayed "1980s").
- Drop death date entirely.
- Drop notes, identifiers, citations, media, events.

The function returns a new shallow object; it does not mutate the DB.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/redact.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { redactPerson, decadeFloor } from '../../src/api/html_site/redact';

describe('decadeFloor', () => {
  it('floors year to decade', () => {
    expect(decadeFloor(1985)).toBe(1980);
    expect(decadeFloor(1980)).toBe(1980);
    expect(decadeFloor(2003)).toBe(2000);
  });
});

describe('redactPerson', () => {
  const livingPerson = {
    id: 'p1',
    sex: 'F' as const,
    living: true,
    notes: 'private notes',
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    given_name: 'Anna',
    surname: 'Andersson',
    birth_year: 1985,
    death_year: null,
  };

  it('redacts a living person, keeping name + sex + decade-floored birth', () => {
    const r = redactPerson(livingPerson);
    expect(r.id).toBe('p1');
    expect(r.sex).toBe('F');
    expect(r.living).toBe(true);
    expect(r.given_name).toBe('Anna');
    expect(r.surname).toBe('Andersson');
    expect(r.birth_year).toBe(1980);
    expect(r.notes).toBe('');
    expect(r.redacted).toBe(true);
  });

  it('returns the input unchanged when not living', () => {
    const p = { ...livingPerson, living: false };
    const r = redactPerson(p);
    expect(r.notes).toBe('private notes');
    expect(r.birth_year).toBe(1985);
    expect(r.redacted).toBe(false);
  });

  it('handles missing birth_year gracefully', () => {
    const p = { ...livingPerson, birth_year: null };
    const r = redactPerson(p);
    expect(r.birth_year).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/redact.test.ts
```

Expected: FAIL with "Cannot find module '.../redact'".

- [ ] **Step 3: Implement redact.ts**

Create `src/api/html_site/redact.ts`:

```typescript
export interface RedactablePerson {
  id: string;
  sex: 'M' | 'F' | 'U';
  living: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
  given_name?: string;
  surname?: string;
  birth_year?: number | null;
  death_year?: number | null;
}

export interface RedactedPerson extends RedactablePerson {
  redacted: boolean;
}

export function decadeFloor(year: number): number {
  return Math.floor(year / 10) * 10;
}

export function redactPerson(p: RedactablePerson): RedactedPerson {
  if (!p.living) return { ...p, redacted: false };
  return {
    ...p,
    notes: '',
    birth_year: p.birth_year != null ? decadeFloor(p.birth_year) : null,
    death_year: null,
    redacted: true,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/redact.test.ts
```

Expected: 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/api/html_site/redact.ts tests/unit/redact.test.ts
git commit -m "feat(html_site): living-person redaction"
```

---

## Task 4: Implement snapshot.ts (build data.json)

**Files:**
- Create: `src/api/html_site/snapshot.ts`
- Test: `tests/unit/snapshot.test.ts`

Builds a single in-memory JSON object containing all data needed to render the static site. Loads in bulk from SQLite (no per-entity queries), filters by scope, applies redaction, and emits the structured payload from the design doc.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/snapshot.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import { createPerson } from '../../src/api/persons';
import { createRelationship } from '../../src/api/relationships';
import { buildSnapshot } from '../../src/api/html_site/snapshot';

let db: any;
beforeEach(() => { db = createTestDb(); });

describe('buildSnapshot', () => {
  it('produces all top-level keys', () => {
    const p = createPerson(db, { given_name: 'A' });
    const snap = buildSnapshot(db, {
      siteTitle: 'Test',
      focusPersonId: p.id,
      scope: { everyone: true },
      options: { includeMedia: false, includeReports: false, includePrints: false, excludeLiving: false, redactLiving: true },
    });
    expect(Object.keys(snap)).toEqual(expect.arrayContaining([
      'meta', 'persons', 'personNames', 'personIds', 'relationships',
      'events', 'eventParticipants', 'places', 'sources', 'citations',
      'media', 'mediaLinks', 'mediaRegions', 'settings',
    ]));
    expect(snap.persons.length).toBe(1);
    expect(snap.meta.focusPersonId).toBe(p.id);
  });

  it('drops persons outside scope and their relationships', () => {
    const focus = createPerson(db, { given_name: 'F' });
    const stranger = createPerson(db, { given_name: 'S' });
    createRelationship(db, { type: 'parent_child', person1_id: stranger.id, person2_id: focus.id });
    const snap = buildSnapshot(db, {
      siteTitle: 'Test',
      focusPersonId: focus.id,
      scope: { focusId: focus.id, ancestors: 0, descendants: 0 },
      options: { includeMedia: false, includeReports: false, includePrints: false, excludeLiving: false, redactLiving: false },
    });
    expect(snap.persons.map(p => p.id)).toEqual([focus.id]);
    expect(snap.relationships.length).toBe(0);
  });

  it('excludes living persons when excludeLiving=true', () => {
    const dead = createPerson(db, { given_name: 'D' });
    const alive = createPerson(db, { given_name: 'A' });
    db.exec(`UPDATE persons SET living=1 WHERE id='${alive.id}'`);
    const snap = buildSnapshot(db, {
      siteTitle: 'T',
      focusPersonId: dead.id,
      scope: { everyone: true },
      options: { includeMedia: false, includeReports: false, includePrints: false, excludeLiving: true, redactLiving: false },
    });
    expect(snap.persons.map(p => p.id)).toEqual([dead.id]);
  });

  it('redacts living persons when redactLiving=true', () => {
    const focus = createPerson(db, { given_name: 'F', surname: 'X' });
    db.exec(`UPDATE persons SET living=1, notes='secret' WHERE id='${focus.id}'`);
    const snap = buildSnapshot(db, {
      siteTitle: 'T',
      focusPersonId: focus.id,
      scope: { everyone: true },
      options: { includeMedia: false, includeReports: false, includePrints: false, excludeLiving: false, redactLiving: true },
    });
    expect(snap.persons[0].notes).toBe('');
    expect(snap.persons[0].redacted).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/snapshot.test.ts
```

Expected: FAIL with "Cannot find module '.../snapshot'".

- [ ] **Step 3: Implement snapshot.ts**

Create `src/api/html_site/snapshot.ts`:

```typescript
import type { Database } from 'node-sqlite3-wasm';
import { queryAll } from '../db';
import { computeScope, type ScopeOptions } from './scope';
import { redactPerson } from './redact';
import type {
  Person, PersonName, PersonIdentifier, Relationship, GenealogyEvent,
  EventParticipant, Place, Source, Citation, Media, MediaLink, MediaRegion,
} from '../types';

export interface SnapshotOptions {
  siteTitle: string;
  focusPersonId: string;
  scope: ScopeOptions;
  options: {
    includeMedia: boolean;
    includeReports: boolean;
    includePrints: boolean;
    excludeLiving: boolean;
    redactLiving: boolean;
  };
  researcherName?: string;
}

export interface Snapshot {
  meta: {
    siteTitle: string;
    focusPersonId: string;
    exportedAt: string;
    researcherName: string;
    scope: ScopeOptions;
    options: SnapshotOptions['options'];
  };
  persons: Array<Person & { redacted?: boolean }>;
  personNames: PersonName[];
  personIds: PersonIdentifier[];
  relationships: Relationship[];
  events: GenealogyEvent[];
  eventParticipants: EventParticipant[];
  places: Place[];
  sources: Source[];
  citations: Citation[];
  media: Media[];
  mediaLinks: MediaLink[];
  mediaRegions: MediaRegion[];
  settings: Record<string, unknown>;
}

export function buildSnapshot(db: Database, opts: SnapshotOptions): Snapshot {
  const scopeIds = computeScope(db, opts.scope);

  let persons = queryAll<Person>(db, 'SELECT * FROM persons');
  persons = persons.filter(p => scopeIds.has(p.id));
  if (opts.options.excludeLiving) persons = persons.filter(p => !p.living);
  const personIdSet = new Set(persons.map(p => p.id));

  const finalPersons = opts.options.redactLiving
    ? persons.map(p => redactPerson(p as never) as Person & { redacted?: boolean })
    : persons;

  const personNames = queryAll<PersonName>(db, 'SELECT * FROM person_names ORDER BY sort_order')
    .filter(n => personIdSet.has(n.person_id));

  const personIdsRows = queryAll<PersonIdentifier>(db, 'SELECT * FROM person_identifiers')
    .filter(i => personIdSet.has(i.person_id));

  const relationships = queryAll<Relationship>(db, 'SELECT * FROM relationships')
    .filter(r => (r.person1_id == null || personIdSet.has(r.person1_id)) &&
                 (r.person2_id == null || personIdSet.has(r.person2_id)));

  const eventParticipants = queryAll<EventParticipant>(db, 'SELECT * FROM event_participants')
    .filter(ep => personIdSet.has(ep.person_id));
  const eventIdSet = new Set(eventParticipants.map(ep => ep.event_id));

  const events = queryAll<GenealogyEvent>(db, 'SELECT * FROM events')
    .filter(e => eventIdSet.has(e.id));

  const placeIds = new Set<string>();
  for (const e of events) if (e.place_id) placeIds.add(e.place_id);
  const places = queryAll<Place>(db, 'SELECT * FROM places').filter(p => placeIds.has(p.id));

  const citations = queryAll<Citation>(db, 'SELECT * FROM citations').filter(c =>
    (c.person_id && personIdSet.has(c.person_id)) ||
    (c.event_id && eventIdSet.has(c.event_id)) ||
    (c.place_id && placeIds.has(c.place_id))
  );
  const sourceIds = new Set(citations.map(c => c.source_id));
  const sources = queryAll<Source>(db, 'SELECT * FROM sources').filter(s => sourceIds.has(s.id));

  let media: Media[] = [];
  let mediaLinks: MediaLink[] = [];
  let mediaRegions: MediaRegion[] = [];
  if (opts.options.includeMedia) {
    mediaLinks = queryAll<MediaLink>(db, 'SELECT * FROM media_links').filter(ml =>
      (ml.entity_type === 'person' && personIdSet.has(ml.entity_id)) ||
      (ml.entity_type === 'place' && placeIds.has(ml.entity_id)) ||
      (ml.entity_type === 'event' && eventIdSet.has(ml.entity_id))
    );
    const mediaIds = new Set(mediaLinks.map(ml => ml.media_id));
    media = queryAll<Media>(db, 'SELECT * FROM media').filter(m => mediaIds.has(m.id));
    mediaRegions = queryAll<MediaRegion>(db, 'SELECT * FROM media_regions')
      .filter(r => mediaIds.has(r.media_id) && (!r.person_id || personIdSet.has(r.person_id)));
  }

  return {
    meta: {
      siteTitle: opts.siteTitle,
      focusPersonId: opts.focusPersonId,
      exportedAt: new Date().toISOString(),
      researcherName: opts.researcherName ?? '',
      scope: opts.scope,
      options: opts.options,
    },
    persons: finalPersons,
    personNames,
    personIds: personIdsRows,
    relationships,
    events,
    eventParticipants,
    places,
    sources,
    citations,
    media,
    mediaLinks,
    mediaRegions,
    settings: {},
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/snapshot.test.ts
```

Expected: 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/api/html_site/snapshot.ts tests/unit/snapshot.test.ts
git commit -m "feat(html_site): build scoped data.json snapshot"
```

---

## Task 5: Add the static-mode UI store

**Files:**
- Create: `src/static/stores/uiMode.ts`

- [ ] **Step 1: Create the store**

```typescript
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useUiModeStore = defineStore('uiMode', () => {
  const isReadOnly = ref<boolean>(import.meta.env.VITE_STATIC_MODE === 'true');
  return { isReadOnly };
});
```

- [ ] **Step 2: Lint check**

```bash
npm run lint
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/static/stores/uiMode.ts
git commit -m "feat(static): add ui-mode pinia store for readonly flag"
```

---

## Task 6: Wire the readonly prop into PersonPanel

**Files:**
- Modify: `src/renderer/components/PersonPanel.vue`

This task adds the `readonly` prop and gates every edit/delete/add button with `v-if="!readonly"`. The panel still renders all the data sections — it just hides controls.

- [ ] **Step 1: Read the current PersonPanel.vue**

Read the file. Identify every button, dropdown, and inline edit affordance.

- [ ] **Step 2: Add the prop and gate the controls**

In `<script setup>`:

```typescript
const props = defineProps<{
  personId: string | null;
  readonly?: boolean;
}>();
```

Wrap every `<button>`, `<EntityModal>` trigger, "Edit", "Delete", "+ Add" element with `v-if="!props.readonly"`. Also disable the section that opens `PersonModal` (the header pencil/edit button).

- [ ] **Step 3: Verify the live app still works in non-readonly mode**

```bash
npm run lint
npx vitest run
```

Expected: 0 lint errors, all tests pass.

Manually: `npm start`, open a person, confirm Edit/Add/Delete still work.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/PersonPanel.vue
git commit -m "feat(renderer): readonly prop on PersonPanel"
```

---

## Task 7: Add readonly to PlacePanel and RelationshipPanel

**Files:**
- Modify: `src/renderer/components/PlacePanel.vue`
- Modify: `src/renderer/components/RelationshipPanel.vue`

Same pattern as Task 6.

- [ ] **Step 1: Add readonly prop to both panels and gate buttons**

```typescript
const props = defineProps<{
  placeId: string | null;
  readonly?: boolean;
}>();
```

(and equivalent for RelationshipPanel with `relationshipId`)

Gate every edit/delete/add control with `v-if="!props.readonly"`.

- [ ] **Step 2: Lint + test**

```bash
npm run lint && npx vitest run
```

Expected: 0 errors, tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/PlacePanel.vue src/renderer/components/RelationshipPanel.vue
git commit -m "feat(renderer): readonly prop on PlacePanel and RelationshipPanel"
```

---

## Task 8: Add readonly to all reusable section/table components

**Files:**
- Modify: `src/renderer/components/EventList.vue`
- Modify: `src/renderer/components/PersonNamesTable.vue`
- Modify: `src/renderer/components/ResearchTasksTable.vue`
- Modify: `src/renderer/components/GroupsTable.vue`
- Modify: `src/renderer/components/EntityMediaSection.vue`
- Modify: `src/renderer/components/PersonIdentifiersSection.vue`
- Modify: `src/renderer/components/PersonChecksSection.vue`

Each component:

- [ ] **Step 1: Add `readonly?: boolean` to defineProps**

- [ ] **Step 2: Hide every action button with `v-if="!props.readonly"`**

  - "+ Add" buttons in headers
  - Per-row "Edit"/"Delete"/"Up"/"Down"/"Unlink" buttons
  - Modal triggers

- [ ] **Step 3: Lint and run unit tests**

```bash
npm run lint && npx vitest run
```

Expected: 0 errors, all tests pass.

- [ ] **Step 4: Manually verify the live app — all controls still appear by default**

```bash
npm start
```

Click through Persons → person → Names, Events, Identifiers, Media, Checks. All buttons should still appear.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/EventList.vue src/renderer/components/PersonNamesTable.vue src/renderer/components/ResearchTasksTable.vue src/renderer/components/GroupsTable.vue src/renderer/components/EntityMediaSection.vue src/renderer/components/PersonIdentifiersSection.vue src/renderer/components/PersonChecksSection.vue
git commit -m "feat(renderer): readonly prop on shared section/table components"
```

---

## Task 9: Implement static-api stub (persons + names + identifiers)

**Files:**
- Create: `src/static/static-api.ts`
- Test: `tests/unit/staticApi.test.ts`

The stub installs a global `window.api` matching the live IPC surface for read-only methods. Backed by a Snapshot loaded from `data.json`. Build indices on init for O(1) lookup.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/staticApi.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { installStaticApiWith } from '../../src/static/static-api';
import type { Snapshot } from '../../src/api/html_site/snapshot';

const fixture: Snapshot = {
  meta: {
    siteTitle: 'T', focusPersonId: 'p1', exportedAt: '', researcherName: '',
    scope: { everyone: true },
    options: { includeMedia: false, includeReports: false, includePrints: false, excludeLiving: false, redactLiving: false },
  },
  persons: [
    { id: 'p1', sex: 'F', living: false, notes: '', created_at: '', updated_at: '' },
    { id: 'p2', sex: 'M', living: false, notes: '', created_at: '', updated_at: '' },
  ] as never,
  personNames: [
    { id: 'n1', person_id: 'p1', given_name: 'Anna', surname: 'A', name_type: 'birth', sort_order: 0 },
    { id: 'n2', person_id: 'p2', given_name: 'Björn', surname: 'B', name_type: 'birth', sort_order: 0 },
  ] as never,
  personIds: [], relationships: [], events: [], eventParticipants: [],
  places: [], sources: [], citations: [], media: [], mediaLinks: [], mediaRegions: [],
  settings: {},
};

beforeEach(() => {
  (globalThis as { api?: unknown }).api = undefined;
  installStaticApiWith(fixture);
});

describe('static-api', () => {
  it('persons.listPage returns the snapshot persons', async () => {
    const result = await (globalThis as never).api.persons.listPage(10, 0);
    expect(result.total).toBe(2);
    expect(result.persons).toHaveLength(2);
  });

  it('persons.search returns matches by given_name', async () => {
    const result = await (globalThis as never).api.persons.search('Anna');
    expect(result).toHaveLength(1);
    expect(result[0].given_name).toBe('Anna');
  });

  it('persons.getNames returns names for a person id', async () => {
    const names = await (globalThis as never).api.persons.getNames('p1');
    expect(names).toHaveLength(1);
    expect(names[0].given_name).toBe('Anna');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/staticApi.test.ts
```

Expected: FAIL with "Cannot find module '.../static-api'".

- [ ] **Step 3: Implement persons + names + identifiers slices of the stub**

Create `src/static/static-api.ts`:

```typescript
import type { Snapshot } from '../api/html_site/snapshot';

interface Indices {
  personById: Map<string, Snapshot['persons'][number]>;
  namesByPerson: Map<string, Snapshot['personNames']>;
  idsByPerson: Map<string, Snapshot['personIds']>;
}

function buildIndices(s: Snapshot): Indices {
  const personById = new Map(s.persons.map(p => [p.id, p]));
  const namesByPerson = new Map<string, Snapshot['personNames']>();
  for (const n of s.personNames) {
    const list = namesByPerson.get(n.person_id) ?? [];
    list.push(n);
    namesByPerson.set(n.person_id, list);
  }
  const idsByPerson = new Map<string, Snapshot['personIds']>();
  for (const i of s.personIds) {
    const list = idsByPerson.get(i.person_id) ?? [];
    list.push(i);
    idsByPerson.set(i.person_id, list);
  }
  return { personById, namesByPerson, idsByPerson };
}

export function installStaticApiWith(snapshot: Snapshot): void {
  const idx = buildIndices(snapshot);

  const personsApi = {
    async listPage(limit: number, offset: number) {
      const all = snapshot.persons.map(p => {
        const name = idx.namesByPerson.get(p.id)?.[0];
        return { ...p, given_name: name?.given_name ?? '', surname: name?.surname ?? '' };
      });
      return { persons: all.slice(offset, offset + limit), total: all.length };
    },
    async get(id: string) {
      return idx.personById.get(id) ?? null;
    },
    async getNames(personId: string) {
      return idx.namesByPerson.get(personId) ?? [];
    },
    async getIdentifiers(personId: string) {
      return idx.idsByPerson.get(personId) ?? [];
    },
    async search(q: string) {
      const ql = q.toLowerCase();
      return snapshot.persons
        .map(p => {
          const name = idx.namesByPerson.get(p.id)?.[0];
          return { ...p, given_name: name?.given_name ?? '', surname: name?.surname ?? '' };
        })
        .filter(p =>
          (p.given_name && p.given_name.toLowerCase().includes(ql)) ||
          (p.surname && p.surname.toLowerCase().includes(ql))
        );
    },
  };

  (globalThis as { api: unknown }).api = {
    persons: personsApi,
  };
}

export async function installStaticApi(): Promise<void> {
  const res = await fetch('./data.json');
  const snap = (await res.json()) as Snapshot;
  installStaticApiWith(snap);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/staticApi.test.ts
```

Expected: 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/static/static-api.ts tests/unit/staticApi.test.ts
git commit -m "feat(static): static-api stub for persons + names + identifiers"
```

---

## Task 10: Extend static-api with places, events, sources, citations, relationships, media

**Files:**
- Modify: `src/static/static-api.ts`
- Modify: `tests/unit/staticApi.test.ts`

- [ ] **Step 1: Extend the test fixture**

Add events, places, sources, citations, media, mediaLinks to the fixture in `tests/unit/staticApi.test.ts`. Add tests covering:
- `places.list()` returns all places
- `events.getEventsForPerson(personId)` joins via event_participants
- `relationships.getOfPerson(personId)` returns rels touching that person
- `citations.getCitationsForPerson(personId)` returns matching citations
- `media.getForEntity('person', personId)` joins via media_links

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/unit/staticApi.test.ts
```

Expected: FAIL with "places is not defined" or similar.

- [ ] **Step 3: Implement the additional slices**

Extend `src/static/static-api.ts` with `placesApi`, `eventsApi`, `sourcesApi`, `citationsApi`, `relationshipsApi`, `mediaApi`. Build matching indices in `buildIndices()`.

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/unit/staticApi.test.ts
```

Expected: all tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/static/static-api.ts tests/unit/staticApi.test.ts
git commit -m "feat(static): add places/events/sources/citations/relationships/media to static-api"
```

---

## Task 11: Add lunr search index to static-api

**Files:**
- Modify: `src/static/static-api.ts`
- Modify: `tests/unit/staticApi.test.ts`

- [ ] **Step 1: Add a test for fuzzy search**

Add to `tests/unit/staticApi.test.ts`:

```typescript
it('persons.search uses fuzzy matching via lunr', async () => {
  const result = await (globalThis as never).api.persons.search('Ana');
  expect(result.length).toBeGreaterThanOrEqual(1);
  expect(result[0].given_name).toBe('Anna');
});
```

- [ ] **Step 2: Replace the simple `includes` filter with lunr**

In `static-api.ts`, build a lunr index in `buildIndices()`:

```typescript
import lunr from 'lunr';

const index = lunr(function () {
  this.ref('id');
  this.field('given_name');
  this.field('surname');
  for (const p of snapshot.persons) {
    const name = namesByPerson.get(p.id)?.[0];
    this.add({ id: p.id, given_name: name?.given_name ?? '', surname: name?.surname ?? '' });
  }
});
```

Replace the search method:

```typescript
async search(q: string) {
  const hits = index.search(q + '*');
  return hits.map(h => idx.personById.get(h.ref)).filter(Boolean) as Snapshot['persons'];
},
```

- [ ] **Step 3: Run tests to confirm they pass**

```bash
npx vitest run tests/unit/staticApi.test.ts
```

Expected: all tests passing.

- [ ] **Step 4: Commit**

```bash
git add src/static/static-api.ts tests/unit/staticApi.test.ts
git commit -m "feat(static): lunr search index in static-api"
```

---

## Task 12: Create the static-mode router

**Files:**
- Create: `src/static/router.ts`

- [ ] **Step 1: Create the router**

```typescript
import { createRouter, createWebHashHistory } from 'vue-router';

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/persons' },
    { path: '/persons', component: () => import('./views/PersonsListView.vue') },
    { path: '/persons/:id', component: () => import('./views/PersonDetailView.vue') },
    { path: '/places', component: () => import('./views/PlacesListView.vue') },
    { path: '/places/:id', component: () => import('./views/PlaceDetailView.vue') },
    { path: '/media', component: () => import('../renderer/views/MediaView.vue') },
    { path: '/reports', component: () => import('./views/ReportsIndexView.vue') },
    { path: '/reports/:slug', component: () => import('./views/ReportPageView.vue') },
    { path: '/prints', component: () => import('./views/PrintsIndexView.vue') },
    { path: '/prints/:slug', component: () => import('./views/PrintPageView.vue') },
    { path: '/search', component: () => import('../renderer/views/SearchView.vue') },
  ],
});
```

- [ ] **Step 2: Lint**

```bash
npm run lint
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/static/router.ts
git commit -m "feat(static): static-mode router with reduced route set"
```

---

## Task 13: Create the static-mode App shell

**Files:**
- Create: `src/static/App.vue`

A simplified version of the renderer's App.vue: 5-nav sidebar (People, Places, Media, Reports, Frameable Prints), search input, focus-person indicator, settings panel (theme/appearance/text size/language). No badges. No Quality/Tasks. No import-export. Settings link removed.

- [ ] **Step 1: Implement App.vue**

Copy `src/renderer/App.vue`. Strip out the irrelevant nav links, badges, undo/redo handlers, data-changed handlers. Keep theme/appearance/text-size/language switchers. Replace `loadDefaultPerson` etc. with: read `meta.focusPersonId` from `window.api.db.getSetting('default_person_id')` and set the focus store.

(Full code omitted from plan — adapt the existing App.vue, deleting roughly half of it. Keep the design tokens and styling identical.)

- [ ] **Step 2: Lint**

```bash
npm run lint
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/static/App.vue
git commit -m "feat(static): static-mode App shell with 5-nav sidebar"
```

---

## Task 14: Create static-mode entry main.ts

**Files:**
- Create: `src/static/main.ts`
- Create: `src/static/dev/fixtures.json` (small dev fixture)

- [ ] **Step 1: Create main.ts**

```typescript
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { router } from './router';
import { i18n } from '../renderer/i18n';
import { installStaticApi } from './static-api';
import App from './App.vue';
import { vNarrate } from '../renderer/directives/narrate';
import '../renderer/styles/tokens.css';
import '../renderer/styles/shared.css';

await installStaticApi();

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(i18n);
app.directive('narrate', vNarrate);
app.mount('#app');
```

- [ ] **Step 2: Create dev fixture**

`src/static/dev/fixtures.json` — a small fixture with 2-3 persons, 1 place, 1 event:

```json
{
  "meta": { "siteTitle": "Dev Fixture", "focusPersonId": "p1", "exportedAt": "2026-04-25T00:00:00Z", "researcherName": "Dev", "scope": { "everyone": true }, "options": { "includeMedia": false, "includeReports": false, "includePrints": false, "excludeLiving": false, "redactLiving": false } },
  "persons": [{ "id": "p1", "sex": "F", "living": false, "notes": "", "created_at": "", "updated_at": "" }],
  "personNames": [{ "id": "n1", "person_id": "p1", "given_name": "Anna", "surname": "Andersson", "name_type": "birth", "sort_order": 0 }],
  "personIds": [], "relationships": [], "events": [], "eventParticipants": [],
  "places": [], "sources": [], "citations": [], "media": [], "mediaLinks": [], "mediaRegions": [],
  "settings": {}
}
```

- [ ] **Step 3: Commit**

```bash
git add src/static/main.ts src/static/dev/fixtures.json
git commit -m "feat(static): static-mode entry + dev fixture"
```

---

## Task 15: Create vite.static.config.ts and npm scripts

**Files:**
- Create: `vite.static.config.ts`
- Create: `src/static/index.html`
- Modify: `package.json`

- [ ] **Step 1: Create the Vite config**

```typescript
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  root: path.resolve(__dirname, 'src/static'),
  plugins: [vue()],
  define: { 'import.meta.env.VITE_STATIC_MODE': JSON.stringify('true') },
  build: {
    outDir: path.resolve(__dirname, 'dist-static'),
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    port: 5174,
    fs: { allow: [path.resolve(__dirname, '..')] },
  },
});
```

- [ ] **Step 2: Create the HTML entry**

`src/static/index.html`:

```html
<!doctype html>
<html lang="sv">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Family Tree</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

- [ ] **Step 3: Add npm scripts**

In `package.json`, add to scripts:

```json
"build:static": "vite build --config vite.static.config.ts",
"dev:static": "vite --config vite.static.config.ts"
```

- [ ] **Step 4: Test the build**

```bash
npm run build:static
```

Expected: produces `dist-static/index.html` + `dist-static/assets/*.js`.

```bash
ls dist-static/
```

- [ ] **Step 5: Commit**

```bash
git add vite.static.config.ts src/static/index.html package.json package-lock.json
git commit -m "feat(static): vite config and npm scripts for static build"
```

---

## Task 16: Create PersonsListView and PlacesListView

**Files:**
- Create: `src/static/views/PersonsListView.vue`
- Create: `src/static/views/PlacesListView.vue`

These are list-only — no side panel, no panel-resize handle. Reuse the existing `PersonsListTab.vue` and the list portion of `PlacesView.vue`.

- [ ] **Step 1: PersonsListView**

```vue
<template>
  <div class="static-list-view">
    <PersonsListTab :readonly="true" @select="goTo" />
  </div>
</template>
<script setup lang="ts">
import { useRouter } from 'vue-router';
import PersonsListTab from '../../renderer/views/PersonsListTab.vue';

const router = useRouter();
function goTo(personId: string) {
  router.push(`/persons/${personId}`);
}
</script>
<style scoped>
.static-list-view { padding: var(--space-lg); }
</style>
```

If `PersonsListTab` doesn't already emit a `select` event with the personId, modify it (Task 16b inline below) to do so when readonly.

- [ ] **Step 2: PlacesListView**

```vue
<template>
  <div class="static-list-view">
    <!-- map + list tabs from PlacesView, no panel -->
  </div>
</template>
```

(Implementation: extract the map+list tabs from PlacesView into a shared sub-component PlacesListAndMap.vue, used by both PlacesView and PlacesListView.)

- [ ] **Step 3: Lint**

```bash
npm run lint
```

- [ ] **Step 4: Commit**

```bash
git add src/static/views/PersonsListView.vue src/static/views/PlacesListView.vue src/renderer/views/PersonsListTab.vue
git commit -m "feat(static): persons and places list views"
```

---

## Task 17: Create PersonDetailView and PlaceDetailView

**Files:**
- Create: `src/static/views/PersonDetailView.vue`
- Create: `src/static/views/PlaceDetailView.vue`

Full-page wrappers around `PersonPanel` / `PlacePanel` content with `:readonly="true"`.

- [ ] **Step 1: PersonDetailView**

```vue
<template>
  <div class="static-detail-view">
    <PersonPanel
      :person-id="personId"
      :readonly="true"
      @close="$router.push('/persons')"
    />
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import PersonPanel from '../../renderer/components/PersonPanel.vue';

const route = useRoute();
const personId = computed(() => route.params.id as string);
</script>
<style scoped>
.static-detail-view {
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--space-lg);
}
</style>
```

- [ ] **Step 2: PlaceDetailView (analogous)**

- [ ] **Step 3: Lint**

```bash
npm run lint
```

- [ ] **Step 4: Manual verification with npm run dev:static**

```bash
npm run dev:static
```

Open http://localhost:5174 — verify person detail loads from fixture data.

- [ ] **Step 5: Commit**

```bash
git add src/static/views/PersonDetailView.vue src/static/views/PlaceDetailView.vue
git commit -m "feat(static): person and place full-page detail views"
```

---

## Task 18: Create reports + prints index/page views

**Files:**
- Create: `src/static/views/ReportsIndexView.vue`
- Create: `src/static/views/ReportPageView.vue`
- Create: `src/static/views/PrintsIndexView.vue`
- Create: `src/static/views/PrintPageView.vue`

ReportsIndexView lists pre-rendered reports as cards, each linking to `/reports/:slug`. ReportPageView renders an `<iframe src="./reports/<slug>.html">` plus a download button for the PDF.

- [ ] **Step 1: Implement all four views**

```vue
<!-- ReportsIndexView.vue -->
<template>
  <div class="reports-index">
    <h2>{{ $t('reports.nav') }}</h2>
    <div class="card-grid">
      <router-link v-for="r in reports" :key="r.slug" :to="`/reports/${r.slug}`" class="report-card">
        <h3>{{ r.title }}</h3>
        <p>{{ r.subject }}</p>
      </router-link>
    </div>
  </div>
</template>
<script setup lang="ts">
const reports = [
  { slug: 'a-life', title: 'A Life', subject: 'Focus person' },
  { slug: 'your-ancestors', title: 'Your Ancestors', subject: 'Focus person' },
  { slug: 'life-on-one-page', title: 'Life on One Page', subject: 'Focus person' },
  { slug: 'photo-album', title: 'Photo Album', subject: 'Focus person' },
];
</script>
```

```vue
<!-- ReportPageView.vue -->
<template>
  <div class="report-page">
    <div class="report-toolbar">
      <a :href="`./reports/${slug}.pdf`" download>{{ $t('reports.downloadPdf') }}</a>
    </div>
    <iframe :src="`./reports/${slug}.html`" class="report-frame"></iframe>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
const route = useRoute();
const slug = computed(() => route.params.slug as string);
</script>
<style scoped>
.report-frame { width: 100%; height: calc(100vh - 80px); border: 0; }
</style>
```

(Prints variants identical with `prints/` paths and a different report list.)

- [ ] **Step 2: Lint + commit**

```bash
npm run lint
git add src/static/views/ReportsIndexView.vue src/static/views/ReportPageView.vue src/static/views/PrintsIndexView.vue src/static/views/PrintPageView.vue
git commit -m "feat(static): reports and prints index + page views"
```

---

## Task 19: Implement thumbnails.ts

**Files:**
- Create: `src/api/html_site/thumbnails.ts`

Generates a ≤800px-on-the-longest-side thumbnail of an image. Uses Electron's `nativeImage`.

- [ ] **Step 1: Implement**

```typescript
import { nativeImage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

const MAX_DIM = 800;

export async function generateThumbnail(srcPath: string, destPath: string): Promise<void> {
  const img = nativeImage.createFromPath(srcPath);
  if (img.isEmpty()) {
    fs.copyFileSync(srcPath, destPath);
    return;
  }
  const size = img.getSize();
  const longest = Math.max(size.width, size.height);
  if (longest <= MAX_DIM) {
    fs.copyFileSync(srcPath, destPath);
    return;
  }
  const scale = MAX_DIM / longest;
  const resized = img.resize({
    width: Math.round(size.width * scale),
    height: Math.round(size.height * scale),
    quality: 'good',
  });
  const ext = path.extname(destPath).toLowerCase();
  const buf = ext === '.png' ? resized.toPNG() : resized.toJPEG(85);
  fs.writeFileSync(destPath, buf);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/api/html_site/thumbnails.ts
git commit -m "feat(html_site): media thumbnail generator using nativeImage"
```

---

## Task 20: Implement website-export IPC handler

**Files:**
- Create: `src/main/ipc/website-export.ts`
- Modify: `src/main/ipc/index.ts`
- Modify: `src/preload/index.ts`

Orchestrates: choose folder → copy `dist-static` → write `data.json` → copy media + thumbnails → pre-render reports/prints via hidden BrowserWindow.

- [ ] **Step 1: Implement the handler**

```typescript
import { dialog, BrowserWindow, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { wrapHandler } from './wrap-handler';
import { callWorker } from './worker-client';
import { generateThumbnail } from '../../api/html_site/thumbnails';

const REPORT_SLUGS = ['a-life', 'your-ancestors', 'life-on-one-page', 'photo-album'];
const PRINT_SLUGS = ['pedigree', 'hourglass', 'descendant', 'fan-chart', 'timeline'];

export function registerWebsiteExport() {
  wrapHandler('website:export', async (_e, opts: never) => {
    const dir = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    if (dir.canceled || !dir.filePaths[0]) return { canceled: true };
    const out = dir.filePaths[0];

    // 1. Copy dist-static bundle
    const bundleSrc = path.join(process.resourcesPath, 'dist-static');
    fs.cpSync(bundleSrc, out, { recursive: true });

    // 2. Build snapshot via worker
    const snapshot = await callWorker('website:buildSnapshot', opts);
    fs.writeFileSync(path.join(out, 'data.json'), JSON.stringify(snapshot));

    // 3. Copy media + thumbnails
    if ((opts as { options: { includeMedia: boolean } }).options.includeMedia) {
      fs.mkdirSync(path.join(out, 'media', 'full'), { recursive: true });
      fs.mkdirSync(path.join(out, 'media', 'thumb'), { recursive: true });
      for (const m of (snapshot as never).media) {
        if (!m.file_ref) continue;
        const src = m.file_ref;
        if (!fs.existsSync(src)) continue;
        const ext = path.extname(src);
        const fullDest = path.join(out, 'media', 'full', `${m.id}${ext}`);
        const thumbDest = path.join(out, 'media', 'thumb', `${m.id}${ext}`);
        fs.copyFileSync(src, fullDest);
        await generateThumbnail(src, thumbDest);
      }
    }

    // 4. Pre-render reports
    if ((opts as { options: { includeReports: boolean } }).options.includeReports) {
      fs.mkdirSync(path.join(out, 'reports'), { recursive: true });
      for (const slug of REPORT_SLUGS) {
        await prerender(out, 'reports', slug);
      }
    }
    if ((opts as { options: { includePrints: boolean } }).options.includePrints) {
      fs.mkdirSync(path.join(out, 'prints'), { recursive: true });
      for (const slug of PRINT_SLUGS) {
        await prerender(out, 'prints', slug);
      }
    }
    return { canceled: false, outputDir: out };
  });
}

async function prerender(outDir: string, type: 'reports' | 'prints', slug: string): Promise<void> {
  const win = new BrowserWindow({ show: false, width: 1200, height: 1600, webPreferences: { sandbox: false } });
  await win.loadURL(`file://${path.join(outDir, 'index.html')}#/${type}/${slug}?prerender=1`);
  await new Promise(r => setTimeout(r, 1500)); // settle
  const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML');
  fs.writeFileSync(path.join(outDir, type, `${slug}.html`), html);
  const pdf = await win.webContents.printToPDF({});
  fs.writeFileSync(path.join(outDir, type, `${slug}.pdf`), pdf);
  win.close();
}
```

Add a worker handler in `src/main/db-worker.ts`:

```typescript
'website:buildSnapshot': (opts) => buildSnapshot(getDb(), opts),
```

(import `buildSnapshot` from `../api/html_site/snapshot`.)

- [ ] **Step 2: Wire up registerWebsiteExport in src/main/ipc/index.ts**

- [ ] **Step 3: Expose in preload**

In `src/preload/index.ts`:

```typescript
website: {
  export: (opts: never) => ipcRenderer.invoke('website:export', opts),
},
```

- [ ] **Step 4: Lint**

```bash
npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/website-export.ts src/main/ipc/index.ts src/preload/index.ts src/main/db-worker.ts
git commit -m "feat: website export IPC handler with snapshot + media + prerender"
```

---

## Task 21: Replace WebsiteExportView.vue with the new export dialog

**Files:**
- Modify: `src/renderer/views/WebsiteExportView.vue`
- Modify: `src/renderer/i18n/sv.ts`, `en.ts`

- [ ] **Step 1: Replace the view**

```vue
<template>
  <div class="website-export-view">
    <h2>{{ $t('htmlSite.title') }}</h2>

    <section>
      <h3>{{ $t('htmlSite.subject') }}</h3>
      <PersonPicker v-model="focusPersonId" />
      <p class="hint">{{ $t('htmlSite.subjectHint') }}</p>
    </section>

    <section>
      <h3>{{ $t('htmlSite.scope') }}</h3>
      <label><input type="radio" v-model="scopeMode" value="focus" /> {{ $t('htmlSite.scopeFocus') }}</label>
      <label><input type="radio" v-model="scopeMode" value="everyone" /> {{ $t('htmlSite.scopeEveryone') }}</label>
      <div v-if="scopeMode === 'focus'" class="indent">
        <label>{{ $t('htmlSite.ancestors') }} <select v-model.number="ancestors">
          <option v-for="n in [3,4,5,6,7,8,9,10]" :key="n" :value="n">{{ n }}</option>
        </select></label>
        <label>{{ $t('htmlSite.descendants') }} <select v-model.number="descendants">
          <option v-for="n in [1,2,3,4,5,6]" :key="n" :value="n">{{ n }}</option>
        </select></label>
      </div>
    </section>

    <section>
      <h3>{{ $t('htmlSite.privacy') }}</h3>
      <label><input type="checkbox" v-model="excludeLiving" /> {{ $t('htmlSite.excludeLiving') }}</label>
      <label><input type="checkbox" v-model="redactLiving" /> {{ $t('htmlSite.redactLiving') }}</label>
    </section>

    <section>
      <h3>{{ $t('htmlSite.include') }}</h3>
      <label><input type="checkbox" v-model="includeMedia" /> {{ $t('htmlSite.includeMedia') }}</label>
      <label><input type="checkbox" v-model="includeReports" /> {{ $t('htmlSite.includeReports') }}</label>
      <label><input type="checkbox" v-model="includePrints" /> {{ $t('htmlSite.includePrints') }}</label>
    </section>

    <section>
      <h3>{{ $t('htmlSite.site') }}</h3>
      <label>{{ $t('htmlSite.siteTitle') }} <input v-model="siteTitle" /></label>
    </section>

    <button class="primary" :disabled="exporting || !focusPersonId" @click="exportSite">
      {{ exporting ? $t('htmlSite.exporting') : $t('htmlSite.export') }}
    </button>
  </div>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import PersonPicker from '../components/PersonPicker.vue';
import { useToast } from '../composables/useToast';

const focusPersonId = ref<string | null>(null);
const scopeMode = ref<'focus' | 'everyone'>('focus');
const ancestors = ref(5);
const descendants = ref(3);
const excludeLiving = ref(false);
const redactLiving = ref(true);
const includeMedia = ref(true);
const includeReports = ref(true);
const includePrints = ref(true);
const siteTitle = ref('Family Tree');
const exporting = ref(false);
const toast = useToast();

onMounted(async () => {
  const id = await window.api.db.getSetting('default_person_id');
  if (id) focusPersonId.value = id as string;
});

async function exportSite() {
  exporting.value = true;
  try {
    const res = await window.api.website.export({
      siteTitle: siteTitle.value,
      focusPersonId: focusPersonId.value,
      scope: scopeMode.value === 'everyone' ? { everyone: true } : { focusId: focusPersonId.value, ancestors: ancestors.value, descendants: descendants.value },
      options: { includeMedia: includeMedia.value, includeReports: includeReports.value, includePrints: includePrints.value, excludeLiving: excludeLiving.value, redactLiving: redactLiving.value },
    });
    if (!res.canceled) toast.success(`Exported to ${res.outputDir}`);
  } catch (e) {
    toast.error(`Export failed: ${(e as Error).message}`);
  } finally {
    exporting.value = false;
  }
}
</script>
```

- [ ] **Step 2: Add i18n strings**

Add `htmlSite.subject`, `htmlSite.subjectHint`, `htmlSite.scope`, `htmlSite.scopeFocus`, `htmlSite.scopeEveryone`, `htmlSite.ancestors`, `htmlSite.descendants`, `htmlSite.privacy`, `htmlSite.excludeLiving`, `htmlSite.redactLiving`, `htmlSite.include`, `htmlSite.includeMedia`, `htmlSite.includeReports`, `htmlSite.includePrints`, `htmlSite.site`, `htmlSite.siteTitle`, `htmlSite.export`, `htmlSite.exporting` to both `sv.ts` and `en.ts`.

- [ ] **Step 3: Lint + manual verification**

```bash
npm run lint && npm start
```

Navigate to /website. Confirm dialog renders, all controls work.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/views/WebsiteExportView.vue src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "feat(renderer): new website export dialog"
```

---

## Task 22: Delete the old html_site generator

**Files:**
- Delete: `src/api/html_site/generator.ts`
- Delete: `src/api/html_site/templates.ts`
- Delete: `src/api/html_site/style.ts`
- Modify: `src/main/ipc/utility.ts` (or wherever the old export was wired)

- [ ] **Step 1: Find and remove call sites**

```bash
grep -r "generateHtmlSite\|html_site/generator\|html_site/templates\|html_site/style" src/ --include="*.ts" --include="*.vue"
```

Remove every reference. Update IPC handler to call only the new `website:export` channel.

- [ ] **Step 2: Delete the files**

```bash
rm src/api/html_site/generator.ts src/api/html_site/templates.ts src/api/html_site/style.ts
```

- [ ] **Step 3: Run all tests**

```bash
npm run lint && npx vitest run
```

Expected: 0 errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(html_site): remove old standalone HTML generator"
```

---

## Task 23: Wire dist-static into the packaged app

**Files:**
- Modify: `forge.config.ts`
- Modify: `package.json` (build script)

- [ ] **Step 1: Add prebuild hook**

In `package.json` scripts, add a `prepackage` hook that runs `npm run build:static` before packaging:

```json
"prepackage": "npm run build:static",
"premake": "npm run build:static",
```

- [ ] **Step 2: Add extraResources to forge.config.ts**

```typescript
packagerConfig: {
  // ...existing config...
  extraResource: ['./dist-static'],
},
```

- [ ] **Step 3: Verify package**

```bash
npm run package
```

Verify the packaged app contains `Resources/dist-static/index.html`.

```bash
find out/ -name dist-static -type d
```

- [ ] **Step 4: Commit**

```bash
git add forge.config.ts package.json
git commit -m "build: bundle dist-static as extraResources"
```

---

## Task 24: E2E test for the full export flow

**Files:**
- Create: `tests/e2e/website-export.test.ts`

- [ ] **Step 1: Write the e2e test**

```typescript
import { test, expect, _electron as electron } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

test('website export produces a working static site', async () => {
  const dbPath = path.join(os.tmpdir(), `slakt-export-${Date.now()}.db`);
  const outDir = path.join(os.tmpdir(), `slakt-export-out-${Date.now()}`);
  fs.mkdirSync(outDir, { recursive: true });

  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, SLAKTFORSKNING_DB: dbPath, SLAKTFORSKNING_E2E_OUT: outDir },
  });

  const page = await app.firstWindow();
  // Seed: create a focus person via window.api in the page context
  await page.evaluate(async () => {
    const p = await (window as never).api.persons.create({ given_name: 'Test', surname: 'Person' });
    await (window as never).api.db.setSetting('default_person_id', p.id);
  });

  // Trigger export programmatically
  const result = await page.evaluate(async (out) => {
    return await (window as never).api.website.export({
      siteTitle: 'E2E Test',
      focusPersonId: (await (window as never).api.db.getSetting('default_person_id')),
      scope: { everyone: true },
      options: { includeMedia: false, includeReports: false, includePrints: false, excludeLiving: false, redactLiving: true },
      _outputDir: out,  // test override path
    });
  }, outDir);

  await app.close();

  expect(fs.existsSync(path.join(outDir, 'index.html'))).toBe(true);
  expect(fs.existsSync(path.join(outDir, 'data.json'))).toBe(true);
  const data = JSON.parse(fs.readFileSync(path.join(outDir, 'data.json'), 'utf-8'));
  expect(data.persons.length).toBeGreaterThanOrEqual(1);
  expect(data.persons[0].given_name).toBe('Test');
});
```

The test override path requires `website-export.ts` to honor `_outputDir` when set (skip dialog).

- [ ] **Step 2: Run the test**

```bash
npx playwright test tests/e2e/website-export.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/website-export.test.ts src/main/ipc/website-export.ts
git commit -m "test(e2e): full website export flow"
```

---

## Task 25: Update docs and bump version

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/PLAN.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json` (version 0.146.0)

- [ ] **Step 1: Update CLAUDE.md**

Replace the `html_site/` directory listing with the new file map (snapshot.ts, scope.ts, redact.ts, thumbnails.ts). Add a `src/static/` section to the file map. Mention `npm run build:static` and `dev:static` in the commands list.

- [ ] **Step 2: Update PLAN.md**

Mark the milestone done; remove the heading.

- [ ] **Step 3: Add CHANGELOG entry**

```markdown
## v0.146.0 — App-look website export

The website export now produces a read-only Vue SPA that visually matches the application — same sidebar, search, themes, detail layouts. Optional sections for media, reports, and frameable prints. Focus-person scope filter and living-person privacy controls.
```

- [ ] **Step 4: Move design doc to archive**

```bash
mv docs/plans/2026-04-25-website-export-app-look-design.md docs/plans/archive/
mv docs/plans/2026-04-25-website-export-app-look.md docs/plans/archive/
```

- [ ] **Step 5: Bump version + commit**

```json
"version": "0.146.0"
```

```bash
git add CLAUDE.md docs/PLAN.md CHANGELOG.md package.json docs/plans/
git commit -m "docs(v0.146.0): app-look website export"
```

---

## Done.
