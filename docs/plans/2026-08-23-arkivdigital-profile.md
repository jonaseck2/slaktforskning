# ArkivDigital Import Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An ArkivDigital export imports with its place hierarchy, its archive pointers, and the researcher's own annotations intact, instead of flattened, dropped, and merely reported.

**Architecture:** A new `arkivdigital` import profile, the same shape as `genney.ts` and `holger.ts`. Place hierarchy is built from the explicit `_ADPL` block during `phasePrepPlaces` — level by level, four bulk rounds — so the existing name-keyed `prefetchedPlaces` lookup keeps working and no per-event IPC is added. Archive pointers land in a new generic `external_identifiers` table because round-trip requires somewhere to put them. Every tag this plan models is deleted from `DECLARED_UNMAPPED`, and the accounting gate from the previous plan is what proves nothing regressed into silence.

**Tech Stack:** TypeScript, Vitest, node-sqlite3-wasm, SQLite, Vue 3.

**Spec:** [docs/plans/2026-08-23-arkivdigital-import-design.md](2026-08-23-arkivdigital-import-design.md) — Parts 1, 2 and 3.

**Depends on:** [docs/plans/archive/2026-08-23-importer-tag-accounting.md](archive/2026-08-23-importer-tag-accounting.md), shipped in v0.272.0. Its gate is this plan's completion check.

## Global Constraints

- `CLAUDE.md` Prime Directive: nothing inferred is persisted. Every value this plan stores is printed in the file — `_ADPL` levels, `_AID`, `MAP` coordinates, `_DESC` text. Nothing is resolved from a gazetteer and written back.
- `CLAUDE.md` Prime Directive (cont.): every new column needs a `src/api/gedcom_fidelity_registry.ts` entry under both 5.5.1 and 7.0, or the coverage test fails CI by design.
- `.claude/rules/performance.md`: no per-entity query inside a loop over a DB-scale array. The place hierarchy is resolved in **four bulk rounds**, one per admin level, never one query per place.
- The four ArkivDigital files under `export-import/min släkt/` are a real person's family data. `/export-import/` is gitignored. **Never commit them.** All committed fixtures are synthetic.
- A parallel session owns `docs/unmapped-capture` — the `unmapped_data` verbatim-capture table and normalize-boundary accounting. **Do not touch `normalize.ts`, and do not create an `unmapped_data` table.** This plan removes tags from the unmapped set by modelling them; that plan catches whatever remains. Rebase before every commit.
- **What "declared unmapped" means depends on whether capture has shipped.** Today a declared tag is *named and discarded*. Once `unmapped_data` lands, a declared tag is *named and preserved verbatim*, and re-emitted on export. That applies to every tag left in `DECLARED_UNMAPPED`, not only the three unsampled ones. It does **not** apply to `external_identifiers`, which holds identifiers — `_AID`, `_PARISH_AID` — and is the wrong home for an event or a date qualifier. If capture lands before this plan finishes, nothing here changes: modelling a tag is still strictly better than capturing it, because a captured tag is a blob the app cannot search, display or reason about.
- Working in a worktree: `git -C <path>`, `npm --prefix <path>`, `npm --prefix <path> run typecheck`, and **vitest needs `--root <abs-worktree-path>`**. See `.claude/rules/worktrees.md`.

---

## User goal

A researcher who exports a tree from ArkivDigital imports it and finds:

- Places sit in their real parish and county — `Högnäs` under `Hedesunda` under `Gävleborgs län` under `Sverige` — instead of one flat row named `Högnäs, Hedesunda, Gävleborgs län, Sverige`.
- Two parishes that share a name are two places, because ArkivDigital's parish id says so.
- Their own notes on events — `Trolovningsbarn`, `Felaktigt födelseår i källan` — are on the event.
- Each source carries the ArkivDigital archive pointer that gets them back to the image, and it survives an export and re-import.
- The date they consulted each record is on the citation.

## Scope

The `arkivdigital` profile and everything the 23 `unmapped:pending-arkivdigital-profile` entries in `src/import/gedcom/accounting-declared.ts` name. Full list, grouped by the task that removes each:

**Task group A — places (7 entries):** `*.PLAC._ADPL`, `._LOCALITY`, `._PARISH`, `._PARISH_AID`, `._COUNTY`, `._COUNTRY`, `._JUDICIAL`.

**Task group B — sources and citations (3 entries):** `SOUR._AID`, `*.SOUR._AID`, `*.SOUR.DATA.DATE`.

**Task group C — events, names, media (13 entries):** `*._DESC`, `*._TITLE`, `FAM.CHIL._FREL`, `FAM.CHIL._MREL`, `*.OBJE._POS`, `*.OBJE._PRIM`, `OBJE._FOFN`, `OBJE._SIZE`, `OBJE._OWN`, `OBJE._CAPT`, `OBJE._DESC`, `*._TAG`, `*._TAG.TYPE`.

Each group ends green and shippable. Stopping after A or after B leaves a coherent app.

### Scope deviations

- **`_SEPR`, `_DOMESTIC_PARTNERSHIP`, `_DATE_TEXT` are not implemented.** ArkivDigital documents them; they occur zero times across the four real exports. Implementing against documentation with no sample risks modelling a shape that does not exist. Task 12 adds them to the synthetic fixture and declares them `unmapped:pending-ad-unsampled-tags`, so they are visible rather than assumed absent. They are **not** candidates for `external_identifiers` — an event and a date qualifier are not identifiers. Verbatim capture is what makes them non-destructive, and that is the parallel session's plan, not this one.
- **The consolidation review and multi-file import are not here.** Parts 4-5 of the spec, their own plan. This plan imports one file at a time and leaves the 2776-to-1496 source collapse untouched — sources still import 1:1, which is the design's explicit choice.
- **`person_identifiers` is not folded into `external_identifiers`.** Reasoning in the design spec: it carries a CHECK-validated type list, working call sites, MCP tools and an exporter switch, and ArkivDigital adds nothing to it.
- **The `_PARISH_AID` to gazetteer crosswalk is not here.** Follow-up F1 in the design spec, a spike first.

## Verification

1. **Import the four real ArkivDigital files** (local, gitignored) and assert: `places` has ~1737 rows with `parent_place_id` set on all but the 6 countries; a `SELECT` for parish `Hedesunda` returns a row whose parent is `Gävleborgs län`; the two same-named parishes are two rows distinguished by their `_PARISH_AID`; `citations.date_accessed` is populated on ~6147 rows; ~900 events carry their `_DESC` text; `external_identifiers` holds ~9046 rows.
2. **The accounting gate is still green and 23 entries shorter.** `import-tag-accounting.test.ts` passes with every `unmapped:pending-arkivdigital-profile` entry deleted from `accounting-declared.ts`. This is the mechanical completion check: a modelled tag stops being declared, and if the mapping misses a path the gate fails.
3. **Round-trip.** Export the imported DB and re-import it. Assert `external_identifiers` rows, the place hierarchy, `date_accessed` and `_DESC` all survive. Per-field registry tests for every new column under both 5.5.1 and 7.0.
4. **Query count.** A `tests/unit/export-perf.test.ts`-style assertion: importing a 5000-place AD-shaped file issues under 200 queries, not one per place.
5. **e2e.** `npm run test:e2e:full`, 8 projects, plus the existing `[imports]` project exercising a real AD file end to end.
6. `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` all green with output captured.

**User-goal-falsifiability check:** if all six pass, can the goal be unmet? One way — the hierarchy could be built correctly but rendered as a flat list in the Places panel, so the researcher never sees it. Task 11 checks the Places tree in the running app, which is why item 5 alone is not enough.

## File Structure

| File | Responsibility |
|---|---|
| `src/import/gedcom/profiles/arkivdigital.ts` *(new)* | Profile predicates and pure mappers: is-this-an-AD-file, `_ADPL` to typed levels, `_FREL`/`_MREL` to subtype. No DB access, so it is unit-testable without a database. |
| `src/api/places_hierarchy.ts` *(new)* | `bulkResolveHierarchy(db, chains)` — resolves N ordered `(name, type, externalId?)` chains level by level in four bulk rounds. Generic, not AD-specific; Gramps and Genney can use it later. |
| `src/api/external_identifiers.ts` *(new)* | CRUD over the new table. `bulkAddExternalIdentifiers`, `getExternalIdentifiers(entityType, entityId)`. |
| `src/api/schema.ts` *(modify)* | The `external_identifiers` table plus its migration guard. |
| `src/import/gedcom/phases/prep-places.ts` *(modify)* | AD branch: build hierarchy from `_ADPL`, populate `prefetchedPlaces` keyed by the PLAC display string so nothing downstream changes. |
| `src/import/gedcom/phases/sources.ts` *(modify)* | `_AID` to `external_identifiers`. |
| `src/import/gedcom/event-importer.ts` *(modify)* | `_DESC` to event notes, `DATA.DATE` to `citations.date_accessed`, citation `_AID` to `external_identifiers`. |
| `src/gedcom/exporter.ts` *(modify)* | Re-emit `_AID` on SOUR, reconstruct `_ADPL` from the stored hierarchy. |
| `src/api/gedcom_fidelity_registry.ts` *(modify)* | Entries for every `external_identifiers` column. |
| `src/import/gedcom/accounting-declared.ts` *(modify)* | Delete each entry as its tag becomes modelled. |

`arkivdigital.ts` holds no DB access on purpose — the AD-specific decisions are pure functions, and everything that touches SQLite lives in reusable `src/api/` modules.

---

## Tasks

### Task 1 (Tier 1): Detect an ArkivDigital file

**Files:**
- Create: `src/import/gedcom/profiles/arkivdigital.ts`
- Test: `tests/unit/import-arkivdigital-profile.test.ts`

**Interfaces:**
- Produces: `isArkivDigital(tree: GedcomNode[]): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/import-arkivdigital-profile.test.ts
import { describe, it, expect } from 'vitest';
import { parseGedcom } from '../../src/gedcom/parser';
import { isArkivDigital } from '../../src/import/gedcom/profiles/arkivdigital';

const HEAD = (sour: string) => parseGedcom(`0 HEAD
1 SOUR ${sour}
1 GEDC
2 VERS 5.5.1
0 TRLR
`);

describe('isArkivDigital', () => {
  it('recognises the ArkivDigital header signature', () => {
    expect(isArkivDigital(HEAD('Arkiv_Digital'))).toBe(true);
  });

  it('is case- and separator-tolerant, because vendors drift', () => {
    expect(isArkivDigital(HEAD('arkiv_digital'))).toBe(true);
    expect(isArkivDigital(HEAD('ArkivDigital'))).toBe(true);
  });

  it('does not claim another vendor file', () => {
    for (const s of ['Gramps', 'RootsMagic', 'Genney', 'Holger', 'MyHeritage']) {
      expect(isArkivDigital(HEAD(s)), s).toBe(false);
    }
  });

  it('returns false when HEAD.SOUR is absent', () => {
    expect(isArkivDigital(parseGedcom('0 HEAD\n0 TRLR\n'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm --prefix <wt> exec -- vitest run --root <wt> tests/unit/import-arkivdigital-profile.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/import/gedcom/profiles/arkivdigital.ts
/**
 * ArkivDigital-specific import profile.
 *
 * ArkivDigital is Sweden's dominant church-archive service; its GEDCOM 5.5.1
 * export carries a documented set of custom tags. Handled here:
 *
 *  - _ADPL         explicit place hierarchy (country/county/parish/locality)
 *  - _PARISH_AID   ArkivDigital's parish id — 335 distinct ids for 333 names,
 *                  so the name alone cannot identify a parish
 *  - _AID          archive pointer, volume-level on SOUR and image-level on the citation
 *  - _DESC         the researcher's own annotation on an event
 *  - _TITLE        occupation or title
 *  - _FREL/_MREL   parent relation type
 *
 * Everything here is a pure function. DB access lives in src/api/ so the
 * ArkivDigital decisions stay testable without a database.
 */
import type { GedcomNode } from '../../../gedcom/parser';

/** Matches 'Arkiv_Digital', 'ArkivDigital', any case. */
export function isArkivDigital(tree: GedcomNode[]): boolean {
  const head = tree.find(n => n.tag === 'HEAD');
  const sour = head?.children.find(n => n.tag === 'SOUR')?.value ?? '';
  return sour.replace(/[_\s-]/g, '').toLowerCase() === 'arkivdigital';
}
```

- [ ] **Step 4: Run it and watch it pass**

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/import/gedcom/profiles/arkivdigital.ts tests/unit/import-arkivdigital-profile.test.ts
git commit -m "feat(import): detect ArkivDigital GEDCOM files"
```

---

### Task 2 (Tier 1): Parse `_ADPL` into typed levels

**Files:**
- Modify: `src/import/gedcom/profiles/arkivdigital.ts`
- Test: `tests/unit/import-arkivdigital-profile.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface PlaceLevel { name: string; type: 'country' | 'admin1' | 'parish' | 'locality'; externalId?: string }
  export function parseAdpl(placNode: GedcomNode): PlaceLevel[] | null
  ```
  Returns outermost-first (`country` through `locality`), or `null` when the PLAC has no `_ADPL`.

- [ ] **Step 1: Write the failing test**

```ts
// append to tests/unit/import-arkivdigital-profile.test.ts
import { parseAdpl } from '../../src/import/gedcom/profiles/arkivdigital';
import type { GedcomNode } from '../../src/gedcom/parser';

function placOf(ged: string): GedcomNode {
  const found: GedcomNode[] = [];
  const walk = (ns: GedcomNode[]) => { for (const n of ns) { if (n.tag === 'PLAC') found.push(n); walk(n.children); } };
  walk(parseGedcom(ged));
  return found[0];
}

const FULL = `0 @I1@ INDI
1 BIRT
2 PLAC Högnäs, Hedesunda, Gävleborgs län, Sverige
3 _ADPL
4 _LOCALITY Högnäs
4 _PARISH_AID a3096
4 _PARISH Hedesunda
4 _COUNTY Gävleborgs län
4 _COUNTRY Sverige
`;

describe('parseAdpl', () => {
  it('returns levels outermost-first with the parish id attached', () => {
    expect(parseAdpl(placOf(FULL))).toEqual([
      { name: 'Sverige', type: 'country' },
      { name: 'Gävleborgs län', type: 'admin1' },
      { name: 'Hedesunda', type: 'parish', externalId: 'a3096' },
      { name: 'Högnäs', type: 'locality' },
    ]);
  });

  it('skips levels the block omits — a country-only place is one level', () => {
    const ged = `0 @I1@ INDI\n1 BIRT\n2 PLAC Sverige\n3 _ADPL\n4 _COUNTRY Sverige\n`;
    expect(parseAdpl(placOf(ged))).toEqual([{ name: 'Sverige', type: 'country' }]);
  });

  it('carries _JUDICIAL as a parish attribute, not its own level', () => {
    const ged = `0 @I1@ INDI\n1 PROB\n2 PLAC Valbo\n3 _ADPL\n4 _PARISH Valbo\n4 _JUDICIAL Gästriklands östra tingslags häradsrätt\n4 _COUNTRY Sverige\n`;
    const levels = parseAdpl(placOf(ged));
    expect(levels?.map(l => l.type)).toEqual(['country', 'parish']);
  });

  it('returns null when the PLAC has no _ADPL block', () => {
    expect(parseAdpl(placOf('0 @I1@ INDI\n1 BIRT\n2 PLAC Nowhere\n'))).toBeNull();
  });

  it('ignores empty level values rather than creating a nameless place', () => {
    const ged = `0 @I1@ INDI\n1 BIRT\n2 PLAC X\n3 _ADPL\n4 _LOCALITY\n4 _PARISH Valbo\n4 _COUNTRY Sverige\n`;
    expect(parseAdpl(placOf(ged))?.map(l => l.name)).toEqual(['Sverige', 'Valbo']);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — `parseAdpl is not a function`.

- [ ] **Step 3: Implement**

```ts
// append to src/import/gedcom/profiles/arkivdigital.ts

export interface PlaceLevel {
  name: string;
  type: 'country' | 'admin1' | 'parish' | 'locality';
  externalId?: string;
}

/**
 * Reads the _ADPL block into ordered levels, outermost first.
 *
 * ArkivDigital hands us the hierarchy explicitly, which is strictly better than
 * splitting the PLAC display string on commas: a locality name can itself
 * contain commas ('Moroten 2&3 Gotlandsgatan 84, Renstjärnasgatan 49-51, ...'),
 * and _PARISH_AID distinguishes two parishes that share a name.
 *
 * _JUDICIAL (härad) is an attribute of the parish, not a level of its own —
 * a judicial district is not a container the locality sits inside.
 */
export function parseAdpl(placNode: GedcomNode): PlaceLevel[] | null {
  const adpl = placNode.children.find(c => c.tag === '_ADPL');
  if (!adpl) return null;

  const val = (tag: string): string => adpl.children.find(c => c.tag === tag)?.value?.trim() ?? '';
  const country = val('_COUNTRY');
  const county = val('_COUNTY');
  const parish = val('_PARISH');
  const parishAid = val('_PARISH_AID');
  const locality = val('_LOCALITY');

  const levels: PlaceLevel[] = [];
  if (country) levels.push({ name: country, type: 'country' });
  if (county) levels.push({ name: county, type: 'admin1' });
  if (parish) levels.push(parishAid ? { name: parish, type: 'parish', externalId: parishAid } : { name: parish, type: 'parish' });
  if (locality) levels.push({ name: locality, type: 'locality' });
  return levels;
}
```

- [ ] **Step 4: Run it and watch it pass**

Expected: PASS, 5 new tests.

- [ ] **Step 5: Commit**

```bash
git add src/import/gedcom/profiles/arkivdigital.ts tests/unit/import-arkivdigital-profile.test.ts
git commit -m "feat(import): parse the ArkivDigital _ADPL place hierarchy"
```

---

### Task 3 (Tier 1): Bulk hierarchical place resolution

**Files:**
- Create: `src/api/places_hierarchy.ts`
- Test: `tests/unit/places-hierarchy.test.ts`

**Interfaces:**
- Consumes: `PlaceLevel` from Task 2 structurally — this module declares its own equivalent so `src/api/` does not depend on an importer profile.
- Produces:
  ```ts
  export interface HierarchyLevel { name: string; type: string | null; externalId?: string }
  export function bulkResolveHierarchy(db: Database, chains: HierarchyLevel[][]): Promise<Map<string, Place>>
  ```
  Returns a map keyed by the joined chain (`levels.map(l => l.name).join(' > ')`) to the innermost `Place`.

**Performance contract.** `.claude/rules/performance.md`. Resolve level by level: all countries in one round, then all counties, then parishes, then localities. Four rounds regardless of place count. Never one query per chain.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/places-hierarchy.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { bulkResolveHierarchy } from '../../src/api/places_hierarchy';
import { queryAll } from '../../src/api/db';
import { createTestDb } from './helpers';

let db: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => { db = await createTestDb(); });

const SVERIGE = { name: 'Sverige', type: 'country' };
const GAVLE = { name: 'Gävleborgs län', type: 'admin1' };

describe('bulkResolveHierarchy', () => {
  it('creates each level once and chains parent_place_id', async () => {
    await bulkResolveHierarchy(db, [
      [SVERIGE, GAVLE, { name: 'Hedesunda', type: 'parish' }, { name: 'Högnäs', type: 'locality' }],
      [SVERIGE, GAVLE, { name: 'Hedesunda', type: 'parish' }, { name: 'Bäck', type: 'locality' }],
    ]);
    const rows = await queryAll<{ id: string; name: string; parent_place_id: string | null }>(
      db, 'SELECT id, name, parent_place_id FROM places ORDER BY name');
    expect(rows.map(r => r.name)).toEqual(['Bäck', 'Gävleborgs län', 'Hedesunda', 'Högnäs', 'Sverige']);
    const idOf = (n: string) => rows.find(r => r.name === n)!.id;
    const parentOf = (n: string) => rows.find(r => r.name === n)!.parent_place_id;
    expect(parentOf('Sverige')).toBeNull();
    expect(parentOf('Gävleborgs län')).toBe(idOf('Sverige'));
    expect(parentOf('Hedesunda')).toBe(idOf('Gävleborgs län'));
    expect(parentOf('Högnäs')).toBe(idOf('Hedesunda'));
  });

  it('keys the returned map by the joined chain and returns the innermost place', async () => {
    const chain = [SVERIGE, GAVLE, { name: 'Valbo', type: 'parish' }];
    const map = await bulkResolveHierarchy(db, [chain]);
    expect(map.get(chain.map(l => l.name).join(' > '))!.name).toBe('Valbo');
  });

  it('keeps two same-named parishes apart when their externalId differs', async () => {
    await bulkResolveHierarchy(db, [
      [SVERIGE, { name: 'A län', type: 'admin1' }, { name: 'Hov', type: 'parish', externalId: 'a1' }],
      [SVERIGE, { name: 'B län', type: 'admin1' }, { name: 'Hov', type: 'parish', externalId: 'a2' }],
    ]);
    const hovs = await queryAll<{ id: string }>(db, "SELECT id FROM places WHERE name = 'Hov'");
    expect(hovs, 'two distinct parishes share the name Hov').toHaveLength(2);
  });

  it('is idempotent — resolving the same chains twice adds no rows', async () => {
    const chains = [[SVERIGE, GAVLE, { name: 'Valbo', type: 'parish' }]];
    await bulkResolveHierarchy(db, chains);
    const before = (await queryAll<{ c: number }>(db, 'SELECT COUNT(*) c FROM places'))[0].c;
    await bulkResolveHierarchy(db, chains);
    const after = (await queryAll<{ c: number }>(db, 'SELECT COUNT(*) c FROM places'))[0].c;
    expect(after).toBe(before);
  });

  it('issues a bounded number of queries regardless of chain count', async () => {
    const chains = Array.from({ length: 500 }, (_, i) => [
      SVERIGE, GAVLE, { name: `Parish${i % 50}`, type: 'parish' }, { name: `Loc${i}`, type: 'locality' },
    ]);
    const spy = vi.spyOn(db, 'prepare');
    await bulkResolveHierarchy(db, chains);
    expect(spy.mock.calls.length, 'query count must be O(levels), not O(chains)').toBeLessThan(40);
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Resolve level by level. For each level index `i`, collect every distinct `(parentId, name, externalId)` at that depth across all chains, issue one chunked `SELECT` for the existing rows and one bulk `INSERT` for the missing ones, then use the resulting ids as the parents for level `i + 1`. Identity at a level is `(parent_place_id, normalized_name, externalId ?? '')` — the `externalId` term is what keeps two same-named parishes in different counties apart. Reuse the `CHUNK = 800` bind-limit pattern from `bulkResolvePlaces` in `src/api/places.ts:45`.

The `externalId` is persisted via Task 5's `external_identifiers`; until that exists, return it to the caller alongside the resolved place so Task 6 can flush it. Keep map insertion in chain input order so the result is stable.

- [ ] **Step 4: Run it and watch it pass**

Expected: PASS, 5 tests, including the query-count assertion.

- [ ] **Step 5: Commit**

```bash
git add src/api/places_hierarchy.ts tests/unit/places-hierarchy.test.ts
git commit -m "feat(api): bulk hierarchical place resolution, four rounds not N queries"
```

---

### Task 4 (Tier 1): Wire the hierarchy into the import

**Files:**
- Modify: `src/import/gedcom/phases/prep-places.ts`, `src/import/gedcom/import-core.ts`, `src/import/gedcom/import-types.ts`
- Test: `tests/unit/import-arkivdigital-places.test.ts`

**Interfaces:**
- Consumes: `isArkivDigital`, `parseAdpl`, `bulkResolveHierarchy`.
- Produces: `ImportContext.isArkivDigital: boolean`; `phasePrepPlaces` populates `prefetchedPlaces` keyed by the PLAC display string for AD files.

Keying by the display string is what makes this change local. `event-importer.ts` still calls `resolvePlaceFn(db, placeName)` with the PLAC value and still gets a `Map.get` hit — it never learns the hierarchy exists.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/import-arkivdigital-places.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';
import { queryAll } from '../../src/api/db';
import { createTestDb } from './helpers';

let db: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => { db = await createTestDb(); });

const AD = `0 HEAD
1 SOUR Arkiv_Digital
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Erik /Hedqvist/
1 BIRT
2 DATE 07 JUN 1879
2 PLAC Högnäs, Hedesunda, Gävleborgs län, Sverige
3 _ADPL
4 _LOCALITY Högnäs
4 _PARISH_AID a3096
4 _PARISH Hedesunda
4 _COUNTY Gävleborgs län
4 _COUNTRY Sverige
1 RESI
2 PLAC Bäck, Valbo, Gävleborgs län, Sverige
3 _ADPL
4 _LOCALITY Bäck
4 _PARISH_AID a3134
4 _PARISH Valbo
4 _COUNTY Gävleborgs län
4 _COUNTRY Sverige
0 TRLR
`;

describe('ArkivDigital place hierarchy', () => {
  it('builds a real tree instead of one flat row per display string', async () => {
    await importGedcom(db, parseGedcom(AD));
    const rows = await queryAll<{ id: string; name: string; parent_place_id: string | null }>(
      db, 'SELECT id, name, parent_place_id FROM places');
    const byName = new Map(rows.map(r => [r.name, r]));
    expect([...byName.keys()].sort()).toEqual(
      ['Bäck', 'Gävleborgs län', 'Hedesunda', 'Högnäs', 'Sverige', 'Valbo']);
    expect(byName.get('Högnäs')!.parent_place_id).toBe(byName.get('Hedesunda')!.id);
    expect(byName.get('Hedesunda')!.parent_place_id).toBe(byName.get('Gävleborgs län')!.id);
    expect(byName.get('Gävleborgs län')!.parent_place_id).toBe(byName.get('Sverige')!.id);
    expect(byName.get('Sverige')!.parent_place_id).toBeNull();
  });

  it('does not keep the flattened display string as a place of its own', async () => {
    await importGedcom(db, parseGedcom(AD));
    const flat = await queryAll(db, "SELECT id FROM places WHERE name LIKE '%,%'");
    expect(flat, 'the comma-joined display string became a place row').toHaveLength(0);
  });

  it('points each event at the innermost place', async () => {
    await importGedcom(db, parseGedcom(AD));
    const rows = await queryAll<{ event_type: string; name: string }>(db,
      'SELECT e.event_type, p.name FROM events e JOIN places p ON p.id = e.place_id ORDER BY e.event_type');
    expect(rows).toEqual([
      { event_type: 'birth', name: 'Högnäs' },
      { event_type: 'residence', name: 'Bäck' },
    ]);
  });

  it('leaves non-ArkivDigital files on the flat resolver', async () => {
    const plain = AD.replace('1 SOUR Arkiv_Digital', '1 SOUR SomeOtherApp');
    await importGedcom(db, parseGedcom(plain));
    const flat = await queryAll(db, "SELECT id FROM places WHERE name LIKE '%,%'");
    expect(flat.length, 'plain GEDCOM should still store the display string').toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL on the first test — six place names expected, two found (the flat display strings).

- [ ] **Step 3: Implement**

Add `isArkivDigital: boolean` to `ImportContext` in `import-types.ts` and set it in `createImportContext` from `isArkivDigital(tree)` in `import-core.ts:110-118`, beside `isGenney` and `isHolger`.

In `phasePrepPlaces`, branch before the existing walk: when `ctx.isArkivDigital`, walk PLAC nodes, call `parseAdpl` on each, collect the chains, call `bulkResolveHierarchy`, then populate `ctx.prefetchedPlaces` keyed by the normalized PLAC display string mapping to the innermost place. PLAC nodes with no `_ADPL` fall through to the existing flat path in the same pass, so a mixed file works.

Leave the `if (ctx.isGenney) return;` guard as is.

- [ ] **Step 4: Run it and watch it pass**

Expected: PASS, 4 tests.

- [ ] **Step 5: Confirm the accounting gate still passes**

Run: `npm --prefix <wt> exec -- vitest run --root <wt> tests/unit/import-tag-accounting.test.ts`
Expected: PASS — the `_ADPL` entries are still declared. Deleting them is Task 6, once the ids are stored too.

- [ ] **Step 6: Commit**

```bash
git add src/import/gedcom/phases/prep-places.ts src/import/gedcom/import-core.ts src/import/gedcom/import-types.ts tests/unit/import-arkivdigital-places.test.ts
git commit -m "feat(import): build the ArkivDigital place hierarchy at prep time"
```

---

### Task 5 (Tier 1): `external_identifiers` table

**Files:**
- Modify: `src/api/schema.ts`
- Create: `src/api/external_identifiers.ts`
- Modify: `src/api/gedcom_fidelity_registry.ts`
- Test: `tests/unit/external-identifiers.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ExternalIdentifier { id: string; entity_type: string; entity_id: string; system: string; value: string; created_at: string }
  export function bulkAddExternalIdentifiers(db: Database, rows: Array<Omit<ExternalIdentifier, 'id' | 'created_at'>>): Promise<void>
  export function getExternalIdentifiers(db: Database, entityType: string, entityId: string): Promise<ExternalIdentifier[]>
  ```

**Why this table exists is round-trip, not dedup.** Under the registry contract a representable value cannot be declared `excluded`, and `_AID` is a plain custom tag. It must be stored to round-trip. The precedent is `person_identifiers`, which exists for exactly this reason.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/external-identifiers.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { bulkAddExternalIdentifiers, getExternalIdentifiers } from '../../src/api/external_identifiers';
import { createSource } from '../../src/api/sources';
import { createTestDb } from './helpers';

let db: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => { db = await createTestDb(); });

describe('external_identifiers', () => {
  it('stores and reads back an identifier for a source', async () => {
    const src = await createSource(db, { title: 'Valbo (X) C:15' });
    await bulkAddExternalIdentifiers(db, [
      { entity_type: 'source', entity_id: src.id, system: 'arkivdigital', value: 'v191316' },
    ]);
    const got = await getExternalIdentifiers(db, 'source', src.id);
    expect(got.map(g => [g.system, g.value])).toEqual([['arkivdigital', 'v191316']]);
  });

  it('is idempotent on the entity/system/value tuple', async () => {
    const src = await createSource(db, { title: 'X' });
    const row = { entity_type: 'source', entity_id: src.id, system: 'arkivdigital', value: 'v1' };
    await bulkAddExternalIdentifiers(db, [row]);
    await bulkAddExternalIdentifiers(db, [row]);
    expect(await getExternalIdentifiers(db, 'source', src.id)).toHaveLength(1);
  });

  it('keeps two systems on the same entity apart', async () => {
    const src = await createSource(db, { title: 'X' });
    await bulkAddExternalIdentifiers(db, [
      { entity_type: 'source', entity_id: src.id, system: 'arkivdigital', value: 'v1' },
      { entity_type: 'source', entity_id: src.id, system: 'gramps.handle', value: 'h1' },
    ]);
    expect(await getExternalIdentifiers(db, 'source', src.id)).toHaveLength(2);
  });

  it('rejects an entity_type outside the allowed set', async () => {
    await expect(bulkAddExternalIdentifiers(db, [
      { entity_type: 'banana', entity_id: 'x', system: 's', value: 'v' },
    ])).rejects.toThrow();
  });

  it('inserts in one statement per chunk, not one per row', async () => {
    const src = await createSource(db, { title: 'X' });
    const rows = Array.from({ length: 300 }, (_, i) => ({
      entity_type: 'source', entity_id: src.id, system: 'arkivdigital', value: `v${i}`,
    }));
    const spy = vi.spyOn(db, 'prepare');
    await bulkAddExternalIdentifiers(db, rows);
    expect(spy.mock.calls.length, 'must not be one INSERT per row').toBeLessThan(20);
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — module not found.

- [ ] **Step 3: Add the table to `src/api/schema.ts`**

Inside the main `CREATE TABLE IF NOT EXISTS` block, beside `person_identifiers`:

```sql
CREATE TABLE IF NOT EXISTS external_identifiers (
  id          TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('source','place','citation','media','repository')),
  entity_id   TEXT NOT NULL,
  system      TEXT NOT NULL,
  value       TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(entity_type, entity_id, system, value)
);
CREATE INDEX IF NOT EXISTS idx_external_identifiers_entity ON external_identifiers(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_external_identifiers_lookup ON external_identifiers(system, value);
```

No `REFERENCES` clause — the table spans five entity types and SQLite has no polymorphic foreign key. The lookup index is what makes exact dedup a single indexed scan when Parts 4-5 need it.

- [ ] **Step 4: Implement `src/api/external_identifiers.ts`**

`bulkAddExternalIdentifiers` uses `INSERT OR IGNORE` with multi-row VALUES, chunked to stay under the 999-bind cap — the same shape as `bulkCreateSources`. `getExternalIdentifiers` is a single indexed `SELECT`.

- [ ] **Step 5: Add registry entries**

In `src/api/gedcom_fidelity_registry.ts`, beside the `person_identifiers` block:

```ts
'external_identifiers.id':          { v551: UUID_PK_VIA_XREF, v70: UUID_PK_VIA_XREF },
'external_identifiers.entity_type': { v551: { kind: 'lossless' }, v70: { kind: 'lossless' }, ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES } },
'external_identifiers.entity_id':   { v551: UUID_FK_VIA_XREF, v70: UUID_FK_VIA_XREF },
'external_identifiers.system':      { v551: { kind: 'lossless' }, v70: { kind: 'lossless' }, ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES } },
'external_identifiers.value':       { v551: { kind: 'lossless' }, v70: { kind: 'lossless' }, ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES } },
'external_identifiers.created_at':  { v551: AUDIT_TS_EXCLUDED, v70: AUDIT_TS_EXCLUDED },
```

These are `lossless` only once Task 6 emits and re-reads them. Write the entries here and let the per-field test fail until Task 6 lands — that failure is the reminder, not a bug.

- [ ] **Step 6: Run the tests**

Run the new test plus `tests/unit/gedcom-fidelity-registry-coverage.test.ts`.
Expected: the new test PASSES, coverage PASSES, and `gedcom-fidelity-per-field.test.ts` FAILS on the new columns until Task 6.

- [ ] **Step 7: Commit**

```bash
git add src/api/schema.ts src/api/external_identifiers.ts src/api/gedcom_fidelity_registry.ts tests/unit/external-identifiers.test.ts
git commit -m "feat(api): external_identifiers table for source and place archive ids"
```

---

### Task 6 (Tier 1): Store and round-trip `_AID` and the parish id

**Files:**
- Modify: `src/import/gedcom/phases/sources.ts`, `src/import/gedcom/phases/prep-places.ts`, `src/gedcom/exporter.ts`, `src/gedcom/export-prefetch.ts`, `src/import/gedcom/accounting-declared.ts`
- Test: `tests/unit/import-arkivdigital-identifiers.test.ts`

**Interfaces:**
- Consumes: Task 5's `bulkAddExternalIdentifiers`, Task 3's chain resolution.
- Produces: no new exports. Removes 8 entries from `DECLARED_UNMAPPED` — `SOUR._AID`, `*.SOUR._AID`, and the six `_ADPL` paths other than `._JUDICIAL`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/import-arkivdigital-identifiers.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';
import { exportGedcom } from '../../src/gedcom/exporter';
import { queryAll } from '../../src/api/db';
import { createTestDb } from './helpers';

let db: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => { db = await createTestDb(); });

const AD = `0 HEAD
1 SOUR Arkiv_Digital
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @S1@ SOUR
1 TITL ArkivDigital: Valbo (X) C:15 (1920-1928)
1 _AID v191316
1 _URL https://www.arkivdigital.se/aid/show/v191316.b580.s52
0 @I1@ INDI
1 NAME Erik /Hedqvist/
1 BIRT
2 PLAC Bäck, Valbo, Gävleborgs län, Sverige
3 _ADPL
4 _LOCALITY Bäck
4 _PARISH_AID a3134
4 _PARISH Valbo
4 _COUNTY Gävleborgs län
4 _COUNTRY Sverige
2 SOUR @S1@
3 PAGE 52
3 _AID v191316.b580.s52
0 TRLR
`;

describe('ArkivDigital archive pointers', () => {
  it('stores the volume _AID against the source', async () => {
    await importGedcom(db, parseGedcom(AD));
    const rows = await queryAll<{ system: string; value: string }>(db,
      "SELECT system, value FROM external_identifiers WHERE entity_type = 'source'");
    expect(rows).toEqual([{ system: 'arkivdigital', value: 'v191316' }]);
  });

  it('stores _PARISH_AID against the parish place', async () => {
    await importGedcom(db, parseGedcom(AD));
    const rows = await queryAll<{ value: string; name: string }>(db,
      `SELECT ei.value, p.name FROM external_identifiers ei
       JOIN places p ON p.id = ei.entity_id WHERE ei.entity_type = 'place'`);
    expect(rows).toEqual([{ value: 'a3134', name: 'Valbo' }]);
  });

  it('re-emits _AID on the exported SOUR record', async () => {
    await importGedcom(db, parseGedcom(AD));
    const { ged } = await exportGedcom(db, '5.5.1');
    expect(ged).toMatch(/^1 _AID v191316$/m);
  });

  it('survives a full round-trip', async () => {
    await importGedcom(db, parseGedcom(AD));
    const { ged } = await exportGedcom(db, '5.5.1');
    const db2 = await createTestDb();
    await importGedcom(db2, parseGedcom(ged));
    const rows = await queryAll<{ system: string; value: string }>(db2,
      "SELECT system, value FROM external_identifiers WHERE entity_type = 'source'");
    expect(rows, 'the archive pointer did not survive export and re-import').toEqual([
      { system: 'arkivdigital', value: 'v191316' },
    ]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — `external_identifiers` is empty.

- [ ] **Step 3: Store on import**

`phaseSources`: read `_AID` off each SOUR node and collect `{ entity_type: 'source', entity_id, system: 'arkivdigital', value }`, flushed with one `bulkAddExternalIdentifiers` after the bulk source insert — the same collect-then-flush shape as `repoLinks`.

`phasePrepPlaces` AD branch: collect the parish-level `externalId` from each chain and flush once with `system: 'arkivdigital.parish'`.

- [ ] **Step 4: Re-emit on export**

In the SOUR emitter at `src/gedcom/exporter.ts:340`, beside `_URL` and `_STYPE`, emit `1 _AID <value>` for the `arkivdigital` identifier. Prefetch identifiers by entity into a Map before the loop — `.claude/rules/performance.md` forbids a per-source fetch here. Extend `ExportPrefetch` in `src/gedcom/export-prefetch.ts` with `externalIdentifiersByEntity` rather than adding a per-entity query, and add its query-count assertion to `tests/unit/export-perf.test.ts`.

Reconstruct the `_ADPL` block when emitting PLAC: walk `parent_place_id` up from the event's place, map the levels back to `_LOCALITY` / `_PARISH` / `_COUNTY` / `_COUNTRY`, and attach `_PARISH_AID` from the parish's identifier. This is deterministic derivation from stored values, not inference.

- [ ] **Step 5: Delete the 8 declared entries**

Remove `SOUR._AID`, `*.SOUR._AID`, `*.PLAC._ADPL`, `._LOCALITY`, `._PARISH`, `._PARISH_AID`, `._COUNTY`, `._COUNTRY` from `DECLARED_UNMAPPED`. Leave `._JUDICIAL` for Task 7.

- [ ] **Step 6: Run the tests**

Run the new test, `import-tag-accounting.test.ts`, `gedcom-fidelity-per-field.test.ts` and `export-perf.test.ts`.
Expected: all PASS. The accounting gate passing with those 8 entries gone is the proof the mapping is complete.

- [ ] **Step 7: Commit**

```bash
git add src/import/gedcom/ src/gedcom/ tests/unit/import-arkivdigital-identifiers.test.ts
git commit -m "feat(import): round-trip ArkivDigital archive pointers"
```

---

### Task 7 (Tier 1): `_JUDICIAL` on the parish

**Files:**
- Modify: `src/import/gedcom/profiles/arkivdigital.ts`, `src/import/gedcom/phases/prep-places.ts`, `src/gedcom/exporter.ts`, `src/import/gedcom/accounting-declared.ts`
- Test: `tests/unit/import-arkivdigital-places.test.ts`

**Interfaces:** `parseAdpl` gains a sibling `parseAdplJudicial(placNode): string | null`. Removes 1 declared entry.

`_JUDICIAL` is the härad (judicial district) of a probate. It is an attribute of the parish, not a container. It goes in `places.notes` on the parish row, prefixed `Härad: `, because `places` has no dedicated column and adding one for eight occurrences across four files is not warranted.

- [ ] **Step 1: Write the failing test**

```ts
// append to tests/unit/import-arkivdigital-places.test.ts
it('records the härad on the parish', async () => {
  const ged = `0 HEAD
1 SOUR Arkiv_Digital
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 PROB
2 PLAC Valbo, Gävleborgs län, Sverige
3 _ADPL
4 _PARISH Valbo
4 _COUNTY Gävleborgs län
4 _JUDICIAL Gästriklands östra tingslags häradsrätt
4 _COUNTRY Sverige
0 TRLR
`;
  await importGedcom(db, parseGedcom(ged));
  const rows = await queryAll<{ notes: string }>(db, "SELECT notes FROM places WHERE name = 'Valbo'");
  expect(rows[0].notes).toContain('Gästriklands östra tingslags häradsrätt');
});
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — notes is the empty string.

- [ ] **Step 3: Implement**

Return the `_JUDICIAL` value from the profile, set it on the parish row during resolution, and emit `4 _JUDICIAL <value>` when reconstructing `_ADPL` on export. Delete `*.PLAC._ADPL._JUDICIAL` from `DECLARED_UNMAPPED`.

- [ ] **Step 4: Run the tests and the gate**

Expected: PASS, both.

- [ ] **Step 5: Commit**

```bash
git add src/import/gedcom/ src/gedcom/exporter.ts tests/unit/import-arkivdigital-places.test.ts
git commit -m "feat(import): keep the härad from ArkivDigital probate places"
```

---

### Task 8 (Tier 1): Citation access date and image pointer

**Files:**
- Modify: `src/import/gedcom/event-importer.ts`, `src/import/gedcom/accounting-declared.ts`
- Test: `tests/unit/import-arkivdigital-citations.test.ts`

**Interfaces:** none new. Removes 1 declared entry, `*.SOUR.DATA.DATE`.

`citations.date_accessed` already exists and is empty on every imported row. `SOUR.DATA.DATE` is the date the researcher looked at the record — 6147 occurrences across the four files.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/import-arkivdigital-citations.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';
import { queryAll } from '../../src/api/db';
import { createTestDb } from './helpers';

let db: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => { db = await createTestDb(); });

const AD = `0 HEAD
1 SOUR Arkiv_Digital
1 GEDC
2 VERS 5.5.1
0 @S1@ SOUR
1 TITL Valbo C:15
0 @I1@ INDI
1 NAME Erik /Hedqvist/
1 BIRT
2 DATE 1879
2 SOUR @S1@
3 PAGE 52
3 DATA
4 DATE 18 JAN 2022
4 TEXT ArkivDigital: Valbo C:15 Bild 580 / sid 52
3 _AID v191316.b580.s52
0 TRLR
`;

describe('ArkivDigital citations', () => {
  it('records the date the researcher consulted the record', async () => {
    await importGedcom(db, parseGedcom(AD));
    const rows = await queryAll<{ date_accessed: string }>(db, 'SELECT date_accessed FROM citations');
    expect(rows[0].date_accessed).toBe('18 JAN 2022');
  });

  it('keeps the page and the transcription alongside it', async () => {
    await importGedcom(db, parseGedcom(AD));
    const rows = await queryAll<{ page: string; transcription: string }>(db,
      'SELECT page, transcription FROM citations');
    expect(rows[0].page).toBe('52');
    expect(rows[0].transcription).toContain('Bild 580');
  });

  it('stores the image pointer against the citation', async () => {
    await importGedcom(db, parseGedcom(AD));
    const rows = await queryAll<{ system: string; value: string }>(db,
      "SELECT system, value FROM external_identifiers WHERE entity_type = 'citation'");
    expect(rows).toEqual([{ system: 'arkivdigital.image', value: 'v191316.b580.s52' }]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — `date_accessed` is the empty string.

- [ ] **Step 3: Implement**

In the citation builder in `event-importer.ts`, read `DATA > DATE` into `date_accessed` and the citation-level `_AID` into an `external_identifiers` row with `system: 'arkivdigital.image'`. Collect and flush in bulk with the citations, never per citation.

Delete `*.SOUR.DATA.DATE` from `DECLARED_UNMAPPED`.

- [ ] **Step 4: Run the tests and the gate**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/import/gedcom/ tests/unit/import-arkivdigital-citations.test.ts
git commit -m "feat(import): keep citation access dates and image pointers"
```

---

### Task 9 (Tier 1): `_DESC` and `_TITLE`

**Files:**
- Modify: `src/import/gedcom/event-importer.ts`, `src/import/gedcom/phases/individuals.ts`, `src/import/gedcom/accounting-declared.ts`
- Test: `tests/unit/import-arkivdigital-annotations.test.ts`

**Interfaces:** none new. Removes 2 declared entries.

`_DESC` is the researcher's own words — `Trolovningsbarn`, `Felaktigt födelseår i källan`, `Fade enl. muntl. erkännande inför dopförättaren Karl Petrus Lundberg`. 900 occurrences. This is the tag whose silent loss made the whole accounting effort necessary.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/import-arkivdigital-annotations.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';
import { queryAll } from '../../src/api/db';
import { createTestDb } from './helpers';

let db: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => { db = await createTestDb(); });

const AD = `0 HEAD
1 SOUR Arkiv_Digital
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME Olof /Skänk/
1 _TITLE Soldat
1 BIRT
2 DATE 1785
2 _DESC Trolovningsbarn
1 DEAT
2 DATE 1850
2 _DESC Felaktigt födelseår i källan
2 _DESC Andra raden
0 TRLR
`;

describe('ArkivDigital annotations', () => {
  it('keeps the researcher note on the event', async () => {
    await importGedcom(db, parseGedcom(AD));
    const rows = await queryAll<{ notes: string }>(db,
      "SELECT notes FROM events WHERE event_type = 'birth'");
    expect(rows[0].notes).toContain('Trolovningsbarn');
  });

  it('keeps every _DESC when an event carries more than one', async () => {
    await importGedcom(db, parseGedcom(AD));
    const rows = await queryAll<{ notes: string }>(db,
      "SELECT notes FROM events WHERE event_type = 'death'");
    expect(rows[0].notes).toContain('Felaktigt födelseår i källan');
    expect(rows[0].notes, 'the second _DESC was discarded').toContain('Andra raden');
  });

  it('records the person title as an occupation event', async () => {
    await importGedcom(db, parseGedcom(AD));
    const rows = await queryAll<{ value: string }>(db,
      "SELECT value FROM events WHERE event_type = 'occupation'");
    expect(rows.map(r => r.value)).toContain('Soldat');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — event notes are empty.

- [ ] **Step 3: Implement**

In `collectEventNode`, append every `_DESC` child's value to the event's note parts, joined on newline so a second `_DESC` cannot overwrite the first. In `phaseIndividuals`, map a level-1 `_TITLE` to an occupation event with the value set, and drop `_TITLE` from the skipped-tag path since it is now handled.

Delete `*._DESC` and `*._TITLE` from `DECLARED_UNMAPPED`.

- [ ] **Step 4: Run the tests and the gate**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/import/gedcom/ tests/unit/import-arkivdigital-annotations.test.ts
git commit -m "feat(import): keep ArkivDigital event annotations and titles"
```

---

### Task 10 (Tier 1): Parent relation types, note labels, media fields

**Files:**
- Modify: `src/import/gedcom/profiles/arkivdigital.ts`, `src/import/gedcom/phases/families.ts`, `src/import/gedcom/obje-importer.ts`, `src/import/gedcom/accounting-declared.ts`
- Test: `tests/unit/import-arkivdigital-profile.test.ts`, `tests/unit/import-arkivdigital-media.test.ts`

**Interfaces:**
- Produces: `export function adParentRelSubtype(value: string): string` — maps `Biological` / `Adopted` / `Foster` / `Step` to the app's `parent_child` subtypes, defaulting to `biological`.

Removes the remaining 11 declared entries.

- [ ] **Step 1: Write the failing test for the relation mapper**

```ts
// append to tests/unit/import-arkivdigital-profile.test.ts
import { adParentRelSubtype } from '../../src/import/gedcom/profiles/arkivdigital';

describe('adParentRelSubtype', () => {
  it('maps the values ArkivDigital emits', () => {
    expect(adParentRelSubtype('Biological')).toBe('biological');
    expect(adParentRelSubtype('Adopted')).toBe('adopted');
    expect(adParentRelSubtype('Foster')).toBe('foster');
  });
  it('is case-insensitive', () => {
    expect(adParentRelSubtype('adopted')).toBe('adopted');
  });
  it('defaults to biological for an unknown value rather than throwing', () => {
    expect(adParentRelSubtype('Something')).toBe('biological');
  });
});
```

- [ ] **Step 2: Write the failing media test**

Create `tests/unit/import-arkivdigital-media.test.ts` asserting, against a fixture carrying `_FOFN` / `_SIZE` / `_OWN` / `_CAPT` / `_PRIM` / `_POS`, that each value lands in a column that exists on `media` or `media_regions`. **First read the two table definitions and write assertions only against real columns.** Any field with no home is handled in Step 4, not by inventing a column.

- [ ] **Step 3: Run and watch them fail**

- [ ] **Step 4: Implement, deleting each declared entry as its tag lands**

Work one tag at a time, re-running `import-tag-accounting.test.ts` after each deletion. A tag whose entry is deleted before it is modelled fails the gate immediately, which is the intended feedback.

For any OBJE field with no column to hold it, do **not** add a column for a handful of occurrences — change its reason to `excluded:not-relevant — <why>` with the occurrence count. Deleting an entry is not the only correct outcome; converting `unmapped:pending-` to a permanent `excluded:` reason is equally valid and must be a deliberate, written call.

- [ ] **Step 5: Confirm no pending entries remain**

```bash
grep -c "unmapped:pending-arkivdigital-profile" src/import/gedcom/accounting-declared.ts
```
Expected: `0`.

- [ ] **Step 6: Run the full suite**

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/import/gedcom/ tests/unit/
git commit -m "feat(import): parent relation types, note labels and media metadata"
```

---

### Task 11 (Tier 1): Verify against the real files and the running app

**Files:** none created — measurement against gitignored local data plus the running app.

- [ ] **Step 1: Import all four real files and assert the numbers**

Reuse `scripts/import-row-counts.ts`, extended to print the place-hierarchy depth histogram, `external_identifiers` counts by system, the `date_accessed` fill rate, and the count of events carrying `_DESC` text.

Expected: ~1737 places with `parent_place_id` non-null on all but 6; ~9046 `external_identifiers`; ~6147 `date_accessed`; ~900 events with annotation text; **zero** places whose name contains a comma.

- [ ] **Step 2: Confirm the two same-named parishes are distinct**

```sql
SELECT name, COUNT(*) FROM places WHERE place_type = 'parish' GROUP BY name HAVING COUNT(*) > 1;
```
Expected: exactly the parish name that has two `_PARISH_AID` values, with count 2. This is the case the display string cannot express.

- [ ] **Step 3: Verify the Places tree in the running app**

Per the user-goal-falsifiability check. Switch to a scratch database, import one AD file, open the Places view, and confirm the tree renders as a tree — `Sverige` expandable to counties, counties to parishes, parishes to localities.

`ui_screenshot` returned correctly-sized but unpainted images during the previous plan; if that recurs, capture the DOM structure via `ui_eval` instead and say plainly which was used.

**Restore the original database afterwards.**

- [ ] **Step 4: Query-count check on import**

Extend the `export-perf.test.ts` spy pattern to the import path with a 5000-place synthetic AD file and assert the budget holds.

- [ ] **Step 5: Record all output for the close-out commit**

---

### Task 12 (Tier 1): Unsampled ArkivDigital tags, declared not assumed

**Files:**
- Modify: `tests/fixtures/gedcom/dialects/arkivdigital.ged`, `src/import/gedcom/accounting-declared.ts`
- Create: `docs/plans/2026-08-23-ad-unsampled-tags.md`

`_SEPR`, `_DOMESTIC_PARTNERSHIP` and `_DATE_TEXT` are documented by ArkivDigital and occur zero times in the four real exports. Per the Scope deviation they are not implemented — but they must be visible.

- [ ] **Step 1: Add all three to the synthetic fixture**

A `_SEPR` event on the FAM, a `_DOMESTIC_PARTNERSHIP` event, and a `_DATE_TEXT` under a DATE.

- [ ] **Step 2: Run the gate and watch it fail**

Expected: FAIL, naming the three new paths. That failure is the mechanism working.

- [ ] **Step 3: Declare them**

Reason: `unmapped:pending-ad-unsampled-tags — documented by ArkivDigital, zero occurrences across the four real exports; modelling against documentation with no sample risks the wrong shape`.

Note in the follow-up plan that these are events and a date qualifier, so `external_identifiers` is not their home. Until verbatim capture ships they are named and discarded; after it ships they are named and preserved. Neither state is the same as modelled, which is what the follow-up delivers once a real sample exists.

- [ ] **Step 4: File `docs/plans/2026-08-23-ad-unsampled-tags.md`**

So no `pending-` reason points at a plan that does not exist. It should say what sample would unblock it: an ArkivDigital export containing a separation, a cohabitation, or a free-text date.

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/gedcom/dialects/arkivdigital.ged src/import/gedcom/accounting-declared.ts docs/plans/2026-08-23-ad-unsampled-tags.md
git commit -m "test(import): make the unsampled ArkivDigital tags visible"
```

---

### Task 13 (Tier 1): Close out

- [ ] **T-final (Tier 1)** — Invoke `/close-out` skill. The skill walks the 6+1 steps, refuses partial, captures evidence.

---

## Self-review checklist

- [ ] Every task has a tier tag.
- [ ] No self-referential tasks.
- [ ] Every task ends in a commit or a recorded measurement.
- [ ] `grep -c "unmapped:pending-arkivdigital-profile" src/import/gedcom/accounting-declared.ts` returns 0.
- [ ] Every `unmapped:pending-<plan>` reason still in the file names a plan that exists.
- [ ] No file from `export-import/` committed.
- [ ] No change to `normalize.ts`, and no `unmapped_data` table — the parallel session owns both.
- [ ] Registry entries exist for every `external_identifiers` column and the per-field test passes.
- [ ] Import and export query counts are O(tables), not O(places).
- [ ] `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:e2e:full` green with output captured.
