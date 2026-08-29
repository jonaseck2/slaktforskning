# Citation-Level ArkivDigital Image Pointer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A researcher who imported from ArkivDigital can open the exact archive image a citation came from, and that pointer survives an export and re-import.

**Architecture:** The pointer already has a home — `external_identifiers`, shipped v0.273.0, whose `entity_type` CHECK already admits `'citation'`. What is missing is a citation id at collect time. `bulkCreateCitations` generates ids internally and returns `void`, so no caller can attach anything to a row it just inserted. Task 1 gives it the contract `.claude/rules/api.md` already states for bulk functions; every later task rides on that.

**Tech Stack:** TypeScript, Vitest, node-sqlite3-wasm, SQLite, Vue 3.

**Spec:** this file replaces the design spec of the same name. Parent design: [docs/plans/2026-08-23-arkivdigital-import-design.md](2026-08-23-arkivdigital-import-design.md).

**Depends on:** `external_identifiers` and the `arkivdigital` profile, both shipped v0.273.0 by [the arkivdigital profile plan](archive/2026-08-23-arkivdigital-profile.md).

## Global Constraints

- `.claude/rules/api.md`: bulk writes go through `runBatch`. Never `db.prepare(...).run(...)` raw — always `queryOne` / `queryAll` / `runSql` / `runBatch` from `src/api/db.ts`.
- `.claude/rules/performance.md`: no per-row DB call inside a loop over a DB-scale array. This plan touches the importer's hottest buffer and the exporter's hottest emitter — both stay bulk.
- **Prime Directive:** the resolved archive URL is computed at render time and never written to the DB.
- `/export-import/` is gitignored real family data. **Never commit it, never copy it into `tests/fixtures/`.**
- A parallel session owns `docs/unmapped-capture`. Do not touch `normalize.ts`, do not create an `unmapped_data` table. Rebase before every commit.
- Worktree: `git -C <path>`, `npm --prefix <path>`, **vitest needs `--root <abs-worktree-path>`**.
- Stage **by explicit path**. `git add -A` is blocked by a hook.
- The security hook flags the four-letter substring `e-x-e-c-(`. Use `runSql` / `runBatch`, and avoid the literal in source and commit messages.

---

## User goal

A researcher looking at a citation on an event sees a link that opens the archive image that citation was taken from, and still sees it after exporting the tree and importing it again.

### Measured on the four real ArkivDigital exports

| Measure | Count |
|---|---|
| Citation-level `_AID` occurrences (`3 _AID` under an event `2 SOUR`) | 6324 |
| Distinct image ids among them | 3182 |
| Distinct volume ids (`1 _AID` on the SOUR record) | 1418 |
| SOUR records | 2776 |
| SOUR records carrying `1 _URL` | 2762 |

The SOUR record carries a volume id and *one* image URL — for example `1 _AID v25161` with `1 _URL https://www.arkivdigital.se/aid/show/v25161.b276.s528`. That URL names one image out of however many citations hang off the source.

- 2626 source records (96.6 %) reference exactly one distinct image, so today's source-level URL happens to reach it.
- 93 source records reference between 2 and 54 distinct images. **479 images are already unreachable** from the DB, before anything merges.
- After the consolidation step folds 2776 source records onto 1418 volumes, one `_URL` survives per volume. **3182 − 1418 = 1764 images** are then reachable only through the citation pointer.

So the pointer is not decoration for a rare case: consolidation is what makes it load-bearing, and consolidation is [the next plan](2026-08-23-multi-file-import-consolidation.md).

### Where the pointer sits, measured

Every one of the 6324 occurrences is under an **event** citation. Not one sits on a name, a person, or a family citation:

```
4761  INDI.RESI.SOUR._AID      226  INDI.IMMI.SOUR._AID       16  FAM.DIV.SOUR._AID
 467  INDI.BIRT.SOUR._AID      196  FAM.MARR.SOUR._AID        11  INDI.PROB.SOUR._AID
 297  INDI.DEAT.SOUR._AID      131  INDI.EMIG.SOUR._AID        8  INDI.OCCU.SOUR._AID
                                96  INDI.BURI.SOUR._AID        2  INDI.CONF.SOUR._AID
                                92  INDI.CHR.SOUR._AID         2  FAM.EVEN.SOUR._AID
                                19  INDI.EVEN.SOUR._AID
```

`collectEventNode` therefore covers 6324 of 6324. The other three citation sites are still in scope (Task 3) because the declaration being removed is the wildcard `*.SOUR._AID`, and a declaration removed for one host but not the others would re-open the silent drop the accounting contract exists to close.

## Scope

- `bulkCreateCitations` in `src/api/sources.ts` — optional caller-supplied `id`, returns the ids used.
- Four GEDCOM citation-building sites:
  - `src/import/gedcom/event-importer.ts` — `collectEventNode`, event citations (the measured 6324).
  - `src/import/gedcom/phases/individuals.ts` — name-level citations and person-level citations.
  - `src/import/gedcom/phases/families.ts` — family-level citations.
- `src/gedcom/exporter.ts` — `emitCitationBlock` and its six call sites.
- `src/api/gedcom_fidelity_registry.ts` — the three `external_identifiers` reasons that enumerate which systems have an emitting tag.
- `src/import/gedcom/accounting-declared.ts` — delete the `*.SOUR._AID` entry.
- Render-time link resolution: a pure resolver in `src/api/`, consumed by the event-citation surface.

### Scope deviations

- **The three non-GEDCOM importers keep passing no `id`.** `src/import/rootsmagic/transform.ts:548` is the only other `bulkCreateCitations` caller; the parameter is optional and its behaviour is unchanged. Gramps builds `doc.citations` on its own path and does not call the bulk function.
- **`arkivdigital.image` is round-trip data only.** Nothing in the app reads it to make a decision — not dedup, not place resolution, not search. The multi-file consolidation plan clusters on `system = 'arkivdigital'` (volume), never on the image id, because two citations of the same image are two genuine citations.
- **No gazetteer or correctness work.** Measuring AD place ids against the gazetteers stays [F1 in the parent design](2026-08-23-arkivdigital-import-design.md).
- **Source-level `_URL` is untouched.** It already maps to `sources.url` and round-trips.

## Verification

1. **User-observable:** import an ArkivDigital file, open an event that has a citation, and the citation shows a link that opens that citation's image. Export to GEDCOM, import the export into an empty DB, and the same link is there.
2. A test imports the `arkivdigital.ged` fixture and asserts an `external_identifiers` row with `entity_type = 'citation'`, `system = 'arkivdigital.image'`, `value = 'v100001.b10.s5'`, whose `entity_id` is the citation on the BIRT event.
3. A round-trip test seeds that row, exports, re-imports, and asserts the value survives under both 5.5.1 and 7.0.
4. `import-tag-accounting.test.ts` passes with `*.SOUR._AID` gone from `DECLARED_UNMAPPED`, and its `INDI.BIRT.SOUR._AID` expectation flipped from *reported* to *not reported*.
5. `tests/unit/import-batching.test.ts` stays green — the change must not turn a bulk insert back into per-row IPC.
6. Measured on the four real exports (local, uncommitted): 6324 rows with `system = 'arkivdigital.image'`.

**User-goal-falsifiability check.** If 1–6 all pass, can the goal still be unmet? One way: the link resolves to a URL that ArkivDigital does not serve. Item 1 is a human opening the link once (Task 7 records the result); items 2–6 cannot catch a wrong URL template. That is the residual risk and it is named, not hidden.

---

## Tasks

> **Test helper used throughout.** Neither `readFixture` nor `readDialect` exists today —
> `import-gedcom-dialects.test.ts` builds its own `DIALECTS_DIR` and
> `import-arkivdigital-identifiers.test.ts` inlines a template literal. Add this once, in
> `tests/unit/helpers.ts`, and import it where the tests below call it:
>
> ```ts
> // tests/unit/helpers.ts
> import { readFileSync } from 'node:fs';
> import { join } from 'node:path';
>
> /** Read a fixture under tests/fixtures/gedcom/dialects/ by bare filename. */
> export function readDialect(name: string): string {
>   return readFileSync(join(__dirname, '../fixtures/gedcom/dialects', name), 'utf-8');
> }
> ```
>
> `readFixture` in this plan means the same function; use the one name.

### Task 1 (Tier 1): `bulkCreateCitations` returns the ids it used

**Files:**
- Modify: `src/api/sources.ts`
- Test: `tests/unit/citations-bulk-ids.test.ts` (new)

**Interfaces:**
- Produces: `bulkCreateCitations(db, rows): Promise<string[]>`, rows gain optional `id`.
- Consumed by: `individuals.ts`, `families.ts`, `rootsmagic/transform.ts` (all three currently discard the return — no change required at those sites, verify by compile).

`.claude/rules/api.md` states the contract for bulk variants: *"Return `Promise<string[]>` of assigned ids"* and *"Accept caller-supplied `id`"*. `bulkCreateCitations` is the one bulk function in `src/api/` that does neither.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/citations-bulk-ids.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { bulkCreateCitations, createSource, getCitation } from '../../src/api/sources';
import { queryAll } from '../../src/api/db';
import { createTestDb } from './helpers';

let db: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => { db = await createTestDb(); });

describe('bulkCreateCitations id contract', () => {
  it('returns one id per row, in input order', async () => {
    const src = await createSource(db, { title: 'S' });
    const ids = await bulkCreateCitations(db, [
      { source_id: src.id, page: 'one' },
      { source_id: src.id, page: 'two' },
      { source_id: src.id, page: 'three' },
    ]);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    const pages = await Promise.all(ids.map(async id => (await getCitation(db, id))?.page));
    expect(pages).toEqual(['one', 'two', 'three']);
  });

  it('uses a caller-supplied id verbatim', async () => {
    const src = await createSource(db, { title: 'S' });
    const mine = crypto.randomUUID();
    const ids = await bulkCreateCitations(db, [{ id: mine, source_id: src.id, page: 'p' }]);
    expect(ids).toEqual([mine]);
    expect((await getCitation(db, mine))?.page).toBe('p');
  });

  it('mixes supplied and generated ids in one call', async () => {
    const src = await createSource(db, { title: 'S' });
    const mine = crypto.randomUUID();
    const ids = await bulkCreateCitations(db, [
      { source_id: src.id, page: 'gen' },
      { id: mine, source_id: src.id, page: 'mine' },
    ]);
    expect(ids[1]).toBe(mine);
    expect(ids[0]).not.toBe(mine);
    expect((await queryAll(db, 'SELECT id FROM citations')).length).toBe(2);
  });

  it('returns an empty array for empty input, without touching the DB', async () => {
    expect(await bulkCreateCitations(db, [])).toEqual([]);
  });

  it('still inserts in one batch, not per row', async () => {
    const src = await createSource(db, { title: 'S' });
    const rows = Array.from({ length: 500 }, (_, i) => ({ source_id: src.id, page: `p${i}` }));
    // Guard against a regression to a per-row loop: 500 rows must not cost
    // 500 statement preparations. Same spy `tests/unit/export-perf.test.ts:133`
    // uses — `db.prepare` is the single primitive every query goes through.
    const prepareSpy = vi.spyOn(db, 'prepare');
    await bulkCreateCitations(db, rows);
    const queryCount = prepareSpy.mock.calls.length;
    prepareSpy.mockRestore();
    expect((await queryAll(db, 'SELECT id FROM citations')).length).toBe(500);
    expect(queryCount).toBeLessThan(20);
  });
});
```

> `helpers.ts` exposes no query counter and does not need one — `vi.spyOn(db, 'prepare')`
> is the idiom already in use, and `vi` is in the import list above.

- [ ] **Step 2: Run the test — confirm it fails**

`npm test -- citations-bulk-ids` → the first test fails on `expect(ids).toHaveLength(3)` because the function returns `undefined`.

- [ ] **Step 3: Implement**

```ts
// src/api/sources.ts — replace the existing bulkCreateCitations
/**
 * Bulk-insert citations rows. One batched INSERT for N rows — used by the
 * GEDCOM importer to collapse per-event / per-name / per-person SOUR loop
 * IPC into one call.
 *
 * Accepts a caller-supplied `id` and returns the ids used, per the bulk
 * contract in `.claude/rules/api.md`. The importer needs the id before the
 * flush so it can collect rows that point at the citation — an ArkivDigital
 * image pointer, for one — without a read-back query.
 */
export async function bulkCreateCitations(
  db: Database,
  rows: Array<{
    id?: string;
    source_id: string;
    event_id?: string | null;
    person_id?: string | null;
    relationship_id?: string | null;
    place_id?: string | null;
    person_name_id?: string | null;
    page?: string;
    confidence?: number;
    transcription?: string;
    notes?: string;
    date_accessed?: string;
  }>,
): Promise<string[]> {
  if (rows.length === 0) return [];
  const ids: string[] = new Array(rows.length);
  const params: unknown[][] = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const id = r.id ?? uuid();
    ids[i] = id;
    params[i] = [
      id,
      r.source_id,
      r.page ?? '',
      r.date_accessed ?? '',
      r.confidence ?? 0,
      r.transcription ?? '',
      r.notes ?? '',
      r.event_id ?? null,
      r.person_id ?? null,
      r.relationship_id ?? null,
      r.place_id ?? null,
      r.person_name_id ?? null,
    ];
  }
  await runBatch(
    db,
    'INSERT INTO citations (id, source_id, page, date_accessed, confidence, transcription, notes, event_id, person_id, relationship_id, place_id, person_name_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    params,
  );
  return ids;
}
```

- [ ] **Step 4: Verify**
  - `npm test -- citations-bulk-ids` green.
  - `npx vue-tsc --noEmit --ignoreDeprecations 6.0` clean — proves the three existing call sites still compile against the widened signature.
  - `npm test -- import-batching` green.

- [ ] **Step 5: Commit** — `feat(api): bulkCreateCitations accepts and returns ids`

---

### Task 2 (Tier 1): the event importer collects the citation-level `_AID`

**Files:**
- Modify: `src/import/gedcom/event-importer.ts`
- Modify: `src/import/gedcom/phases/individuals.ts`
- Modify: `src/import/gedcom/phases/families.ts`
- Test: `tests/unit/import-arkivdigital-identifiers.test.ts` (extend)

**Interfaces:**
- `EventCollectResult.citationRows[]` gains `id: string`.
- `EventCollectResult` gains `citationExternalIds: ExternalIdentifierInput[]`.

`getChild` marks the node consumed (`node-utils.ts`), so reading `_AID` here is what removes it from the unaccounted set. That is the whole mechanism — no separate bookkeeping call.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/import-arkivdigital-identifiers.test.ts — append
import { getExternalIdentifiersByEntityType } from '../../src/api/external_identifiers';
import type { ExternalIdentifier } from '../../src/api/external_identifiers';

// getExternalIdentifiersByEntityType returns Map<entity_id, ExternalIdentifier[]>,
// not a flat array. Flatten once here rather than at every call site.
async function identsFor(db: Parameters<typeof getExternalIdentifiersByEntityType>[0], type: string): Promise<ExternalIdentifier[]> {
  return [...(await getExternalIdentifiersByEntityType(db, type)).values()].flat();
}
import { queryAll } from '../../src/api/db';

describe('citation-level image pointer', () => {
  it('stores the image _AID against the citation it sits under', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(readDialect('arkivdigital.ged')));

    const idents = await identsFor(db, 'citation');
    expect(idents).toHaveLength(1);
    expect(idents[0].system).toBe('arkivdigital.image');
    expect(idents[0].value).toBe('v100001.b10.s5');

    // entity_id points at a real citation, and that citation is the one on
    // the BIRT event — not the source-level row, not some other citation.
    const cit = await queryAll<{ id: string; page: string; event_id: string | null }>(
      db, 'SELECT id, page, event_id FROM citations WHERE id = ?', [idents[0].entity_id]);
    expect(cit).toHaveLength(1);
    expect(cit[0].page).toBe('5');
    expect(cit[0].event_id).not.toBeNull();
  });

  it('leaves the volume pointer on the source, distinct from the image pointer', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(readDialect('arkivdigital.ged')));
    const onSource = await identsFor(db, 'source');
    expect(onSource.map(i => [i.system, i.value])).toContainEqual(['arkivdigital', 'v100001']);
  });

  it('does not invent a row when the citation has no _AID', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(`0 HEAD
1 SOUR Arkiv_Digital
1 GEDC
2 VERS 5.5.1
2 FORM LINEAGE-LINKED
1 CHAR UTF-8
0 @S1@ SOUR
1 TITL Plain source
0 @I1@ INDI
1 NAME A /B/
1 BIRT
2 DATE 1880
2 SOUR @S1@
3 PAGE 7
0 TRLR
`));
    expect(await identsFor(db, 'citation')).toEqual([]);
  });
});
```

> `readDialect` is the helper defined at the top of this Tasks section. `arkivdigital.ged`
> lives under `tests/fixtures/gedcom/dialects/`.
>
> **`getExternalIdentifiersByEntityType` returns `Map<entity_id, ExternalIdentifier[]>`,
> not an array.** The `identsFor` helper above flattens it; every test below uses that.

- [ ] **Step 2: Run the test — confirm it fails**

`npm test -- import-arkivdigital-identifiers` → `expect(idents).toHaveLength(1)` receives `0`.

- [ ] **Step 3: Implement — `event-importer.ts`**

```ts
// src/import/gedcom/event-importer.ts — EventCollectResult
import type { ExternalIdentifierInput } from '../../api/external_identifiers';

export interface EventCollectResult {
  eventRow: { /* unchanged */ };
  citationRows: Array<{
    id: string;
    source_id: string;
    event_id: string;
    page: string;
    confidence: 0 | 1 | 2 | 3;
    transcription?: string;
    notes?: string;
    date_accessed?: string;
  }>;
  /**
   * ArkivDigital's image pointer, `3 _AID v191316.b580.s52`, keyed to the
   * citation ids above. Round-trip only — nothing in the app reads it to make
   * a decision; a render layer turns it into an archive link at display time.
   */
  citationExternalIds: ExternalIdentifierInput[];
  mediaLinkRows: Array<{ /* unchanged */ }>;
}
```

```ts
// src/import/gedcom/event-importer.ts — inside collectEventNode, replacing the
// existing citation loop
  const citationRows: EventCollectResult['citationRows'] = [];
  const citationExternalIds: EventCollectResult['citationExternalIds'] = [];
  for (const sour of getChildren(evNode, 'SOUR')) {
    const srcId = sourceMap.get(sour.value) ?? sourceMap.get(sour.xref ?? '');
    if (srcId) {
      const quay = parseInt(getChild(sour, 'QUAY')?.value ?? '2', 10);
      const page = getChild(sour, 'PAGE')?.value ?? '';
      const dataNode = getChild(sour, 'DATA');
      const transcription = dataNode ? getChild(dataNode, 'TEXT')?.value ?? '' : '';
      const citNotes = getChild(sour, 'NOTE')?.value ?? '';
      const date_accessed = getChild(sour, '_ACCESSED')?.value
        ?? (dataNode ? getChild(dataNode, 'DATE')?.value ?? '' : '');
      const citationId = uuid();
      citationRows.push({
        id: citationId,
        source_id: srcId,
        event_id: eventId,
        page,
        confidence: Math.min(3, Math.max(0, quay)) as 0 | 1 | 2 | 3,
        transcription: transcription || undefined,
        notes: citNotes || undefined,
        date_accessed: date_accessed || undefined,
      });
      // ArkivDigital's image pointer. The SOUR record's `1 _AID` names the
      // volume; this names the image and page inside it. 6324 occurrences
      // across four real exports, every one under an event citation.
      const imageAid = getChild(sour, '_AID')?.value?.trim();
      if (imageAid) {
        citationExternalIds.push({
          entity_type: 'citation',
          entity_id: citationId,
          system: 'arkivdigital.image',
          value: imageAid,
        });
      }
    }
  }
```

Add `citationExternalIds` to the returned object alongside `citationRows`.

- [ ] **Step 4: Implement — thread the buffer through both phases**

In `src/import/gedcom/phases/individuals.ts`, beside `citationBuffer`:

```ts
  const citationExternalIdBuffer: ExternalIdentifierInput[] = [];
```

At the event-collect site (`citationBuffer.push(...collected.citationRows)`):

```ts
        citationBuffer.push(...collected.citationRows);
        citationExternalIdBuffer.push(...collected.citationExternalIds);
```

At the flush, after `bulkCreateCitations`:

```ts
  if (citationBuffer.length > 0) {
    ctx.options?.onProgress?.(`Skriver ${citationBuffer.length} källhänvisningar (1 / 1)…`);
    await bulkCreateCitations(ctx.db, citationBuffer);
  }
  // Citation-level ArkivDigital image pointers. One bulk call for the whole
  // pass — `.claude/rules/performance.md`, never per citation.
  if (citationExternalIdBuffer.length > 0) {
    await bulkAddExternalIdentifiers(ctx.db, citationExternalIdBuffer);
  }
```

Apply the identical three edits in `src/import/gedcom/phases/families.ts`.

Widen `citationBuffer`'s inline row type in both files with `id?: string;` so the spread from `collected.citationRows` type-checks.

- [ ] **Step 5: Verify**
  - `npm test -- import-arkivdigital-identifiers` green.
  - `npm test -- import-batching` green — the two new `bulkAddExternalIdentifiers` calls are one each per phase, not per citation.
  - `npm test -- import-arkivdigital` (all five AD suites) green.

- [ ] **Step 6: Commit** — `feat(import): map the ArkivDigital citation-level image pointer`

---

### Task 3 (Tier 1): the three non-event citation sites allocate ids and read `_AID`

**Files:**
- Modify: `src/import/gedcom/phases/individuals.ts` (name-level, person-level)
- Modify: `src/import/gedcom/phases/families.ts` (family-level)
- Test: `tests/unit/import-arkivdigital-identifiers.test.ts` (extend)

Zero of the 6324 real occurrences sit here. This task exists because Task 6 deletes a **wildcard** declaration: `*.SOUR._AID` covers every host, and leaving three hosts unread while deleting the declaration that named them re-opens the silent drop.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/import-arkivdigital-identifiers.test.ts — append
const NON_EVENT_HOSTS = `0 HEAD
1 SOUR Arkiv_Digital
1 GEDC
2 VERS 5.5.1
2 FORM LINEAGE-LINKED
1 CHAR UTF-8
0 @S1@ SOUR
1 TITL A source
1 _AID v900
0 @I1@ INDI
1 NAME Erik /Hedqvist/
2 SOUR @S1@
3 PAGE n1
3 _AID v900.b1.s1
1 SOUR @S1@
2 PAGE p1
2 _AID v900.b2.s2
1 FAMS @F1@
0 @I2@ INDI
1 NAME Anna /Ersdotter/
1 FAMS @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 SOUR @S1@
2 PAGE f1
2 _AID v900.b3.s3
0 TRLR
`;

describe('image pointer on non-event citation hosts', () => {
  it('stores one row per host, each against its own citation', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(NON_EVENT_HOSTS));
    const idents = await identsFor(db, 'citation');
    expect(idents.map(i => i.value).sort())
      .toEqual(['v900.b1.s1', 'v900.b2.s2', 'v900.b3.s3']);

    const byId = new Map(
      (await queryAll<{ id: string; page: string; person_id: string | null; person_name_id: string | null; relationship_id: string | null }>(
        db, 'SELECT id, page, person_id, person_name_id, relationship_id FROM citations'))
        .map(c => [c.id, c]));
    const pageOf = (v: string): string => byId.get(idents.find(i => i.value === v)!.entity_id)!.page;
    expect(pageOf('v900.b1.s1')).toBe('n1');
    expect(pageOf('v900.b2.s2')).toBe('p1');
    expect(pageOf('v900.b3.s3')).toBe('f1');

    expect(byId.get(idents.find(i => i.value === 'v900.b1.s1')!.entity_id)!.person_name_id).not.toBeNull();
    expect(byId.get(idents.find(i => i.value === 'v900.b2.s2')!.entity_id)!.person_id).not.toBeNull();
    expect(byId.get(idents.find(i => i.value === 'v900.b3.s3')!.entity_id)!.relationship_id).not.toBeNull();
  });

  it('reports nothing unaccounted for this file', async () => {
    const db = await createTestDb();
    const report = await importGedcom(db, parseGedcom(NON_EVENT_HOSTS));
    const undeclared = (report.unaccountedFor ?? []).filter(u => !matchDeclared(u.path));
    expect(undeclared).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test — confirm it fails**

Three `_AID` values expected, zero found.

- [ ] **Step 3: Implement**

The same three-line shape at each of the three sites. Name-level, in `individuals.ts`:

```ts
        const citationId = uuid();
        citationBuffer.push({
          id: citationId,
          source_id: srcId,
          person_name_id: pn.id,
          page,
          confidence: Math.min(3, Math.max(0, quay)) as 0 | 1 | 2 | 3,
          notes: citNotes || undefined,
          transcription: transcription || undefined,
          date_accessed: date_accessed || undefined,
        });
        const nameAid = getChild(sour, '_AID')?.value?.trim();
        if (nameAid) {
          citationExternalIdBuffer.push({
            entity_type: 'citation', entity_id: citationId,
            system: 'arkivdigital.image', value: nameAid,
          });
        }
```

Person-level in `individuals.ts` and family-level in `families.ts` take the same edit, differing only in which owner column the row sets (`person_id` / `relationship_id`).

- [ ] **Step 4: Verify** — `npm test -- import-arkivdigital-identifiers` green; `npm test -- import-gedcom` green.

- [ ] **Step 5: Commit** — `feat(import): read the image pointer on every citation host`

---

### Task 4 (Tier 1): the exporter writes the pointer back under the citation

**Files:**
- Modify: `src/gedcom/exporter.ts`
- Test: `tests/unit/import-arkivdigital-identifiers.test.ts` (extend — the source-level `_AID` export tests already live there; there is no `export-arkivdigital.test.ts`)

**Interfaces:**
- `emitCitationBlock` gains a seventh parameter `externalIds: ExternalIdentifier[] = []`.
- Six call sites pass `pre.externalIdsByEntity.get(mediaEntityKey('citation', cit.id)) ?? []`.

`mediaEntityKey` joins with a NUL byte, not the space its doc comment shows. **Call the function; never hand-build the key.** That mistake silently dropped `_PARISH_AID` from the export once already.

- [ ] **Step 1: Write the failing test**

```ts
// export side
describe('citation-level _AID export', () => {
  it('emits the image pointer under the citation, one level below SOUR', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(readDialect('arkivdigital.ged')));
    const { ged } = await exportGedcom(db, '5.5.1');
    const lines = ged.split('\n');
    const i = lines.findIndex(l => l.trim() === '3 _AID v100001.b10.s5');
    expect(i, 'citation-level _AID missing from the export').toBeGreaterThan(-1);
    // It must sit inside the `2 SOUR` block, not float at the wrong level.
    const owner = lines.slice(0, i).reverse().find(l => /^[0-2] /.test(l.trim()));
    expect(owner?.trim().startsWith('2 SOUR')).toBe(true);
  });

  it('keeps the volume pointer on the SOUR record', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(readDialect('arkivdigital.ged')));
    const { ged } = await exportGedcom(db, '5.5.1');
    expect(ged).toContain('\n1 _AID v100001\n');
  });

  it('emits nothing for a citation with no identifier', async () => {
    const db = await createTestDb();
    const src = await createSource(db, { title: 'S' });
    const p = await createPerson(db, {});
    await bulkCreateCitations(db, [{ source_id: src.id, person_id: p.id, page: 'x' }]);
    const { ged } = await exportGedcom(db, '5.5.1');
    expect(ged).not.toContain('_AID');
  });
});
```

- [ ] **Step 2: Run the test — confirm it fails** (the `3 _AID` line is absent).

- [ ] **Step 3: Implement**

`exporter.ts` imports `Place, Citation, Repository, Media` from `../api/types` but not
`ExternalIdentifier` — add it to the existing import from `../api/external_identifiers`.

```ts
// src/gedcom/exporter.ts
import type { ExternalIdentifier } from '../api/external_identifiers';

function emitCitationBlock(
  lines: string[],
  cit: Citation,
  srcXr: string,
  baseLevel: number,
  version: '5.5.1' | '7.0',
  hostKind: 'event' | 'name' | 'person' | 'relationship' | 'place',
  externalIds: ExternalIdentifier[] = [],
): void {
  // … existing body unchanged, through the _ACCESSED line …
  if (cit.date_accessed) lines.push(`${baseLevel + 1} _ACCESSED ${cit.date_accessed}`);
  // ArkivDigital's image pointer. Round-trip only — written back exactly as it
  // arrived so the researcher keeps their route to the image. Sub-tag order
  // inside a SOUR block is not significant in either GEDCOM version.
  for (const ident of externalIds) {
    if (ident.system === 'arkivdigital.image') {
      lines.push(`${baseLevel + 1} _AID ${ident.value}`);
    }
  }
}
```

Then each of the six call sites — lines 640, 723, 826, 991, 1004, 1091 in the current file — takes the extra argument:

```ts
          if (srcXr) emitCitationBlock(
            lines, cit, srcXr, 2, version, 'event',
            pre.externalIdsByEntity.get(mediaEntityKey('citation', cit.id)) ?? [],
          );
```

- [ ] **Step 4: Verify**
  - New export tests green.
  - `npm test -- export-perf` green — `externalIdsByEntity` is already prefetched in one query (`export-prefetch.ts:240`), so the query budget is unchanged. Confirm the assertion still holds rather than assuming it.

- [ ] **Step 5: Commit** — `feat(export): re-emit the ArkivDigital image pointer under its citation`

---

### Task 5 (Tier 1): round-trip and fidelity registry

**Files:**
- Modify: `src/api/gedcom_fidelity_registry.ts`
- Test: `tests/unit/gedcom-roundtrip-*.test.ts` (the suite that owns per-field round-trips)

The three `external_identifiers` reasons currently enumerate two (entity_type, system) pairs. A third now exists, and a reason that lists the wrong set is the shrug the registry exists to prevent.

- [ ] **Step 1: Write the failing test**

```ts
it('a citation image pointer survives DB → GEDCOM → DB', async () => {
  for (const version of ['5.5.1', '7.0'] as const) {
    const db = await createTestDb();
    const src = await createSource(db, { title: 'Valbo C:15' });
    const p = await createPerson(db, {});
    const ev = await createEvent(db, { event_type: 'birth', date_original: '1879' });
    await addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });
    const [citId] = await bulkCreateCitations(db, [
      { source_id: src.id, event_id: ev.id, page: '52' },
    ]);
    await bulkAddExternalIdentifiers(db, [
      { entity_type: 'citation', entity_id: citId, system: 'arkivdigital.image', value: 'v191316.b580.s52' },
    ]);

    const { ged } = await exportGedcom(db, version);
    const back = await createTestDb();
    await importGedcom(back, parseGedcom(ged));

    const idents = await identsFor(back, 'citation');
    expect(idents.map(i => i.value), `lost under ${version}`).toEqual(['v191316.b580.s52']);
    expect(idents[0].system).toBe('arkivdigital.image');
  }
});
```

> The re-import only reaches `collectEventNode` if the exported file is detected as ArkivDigital-shaped or the tag read is unconditional. **It is unconditional** — Task 2 reads `_AID` in `collectEventNode` with no profile gate, the same way the source-level `_AID` is read in `phases/sources.ts`. If this test fails because a profile gate was added, remove the gate rather than the test: an app-produced export does not carry `1 SOUR Arkiv_Digital` in its header.

- [ ] **Step 2: Run the test — confirm it fails**, then implement.

- [ ] **Step 3: Update the registry reasons**

```ts
  // ----- external_identifiers -----
  // Round-trip storage for source-format ids. Three (entity_type, system)
  // pairs have a tag to travel in today:
  //   source   + arkivdigital        → `1 _AID` on the SOUR record
  //   place    + arkivdigital.parish → `_PARISH_AID` inside the rebuilt _ADPL block
  //   citation + arkivdigital.image  → `_AID` inside the citation's SOUR block
  // Verified by tests/unit/import-arkivdigital-identifiers.test.ts.
  //
  // Still `lossy`, not `lossless`: the columns are generic, and a row with any
  // other system — a Gramps handle, a Genney RID — has no tag to carry it and
  // does not come back. Claiming lossless here would be an overclaim the
  // per-field test correctly refuses.
  'external_identifiers.entity_type': {
    v551: { kind: 'lossy', reason: 'only source, place and citation rows have an emitting tag; other entity types are dropped', expectedAfterRoundTrip: () => null },
    v70:  { kind: 'lossy', reason: 'only source, place and citation rows have an emitting tag; other entity types are dropped', expectedAfterRoundTrip: () => null },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  'external_identifiers.system': {
    v551: { kind: 'lossy', reason: 'only the arkivdigital, arkivdigital.parish and arkivdigital.image systems have an emitting tag', expectedAfterRoundTrip: () => null },
    v70:  { kind: 'lossy', reason: 'only the arkivdigital, arkivdigital.parish and arkivdigital.image systems have an emitting tag', expectedAfterRoundTrip: () => null },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
```

`external_identifiers.value` stays `lossless` — it is the payload of all three tags.

- [ ] **Step 4: Verify** — the registry schema-introspection test and the per-field round-trip suite both green. `tests/helpers/gedcom_fidelity.ts` needs no change: its seeder builds a `source` row and the `entity_type` sentinel is `'place'`, both still valid.

- [ ] **Step 5: Commit** — `test(gedcom): round-trip the citation image pointer, correct the registry reasons`

---

### Task 6 (Tier 1): delete the declaration, tighten the gate

**Files:**
- Modify: `src/import/gedcom/accounting-declared.ts`
- Modify: `tests/unit/import-tag-accounting.test.ts`

- [ ] **Step 1: Flip the gate test first**

In `import-tag-accounting.test.ts`, the assertion

```ts
    expect(paths.get('INDI.BIRT.SOUR._AID')).toBe(1);
```

moves into the *not-reported* list in the test below it, and its enclosing `it` name changes from "names the ArkivDigital tags the importer still does not read" to reflect that nothing remains:

```ts
  it('reports nothing unaccounted for on an ArkivDigital-shaped file', async () => {
    const report = await importGedcom(db, parseGedcom(AD_SHAPED));
    const undeclared = (report.unaccountedFor ?? []).filter(u => !matchDeclared(u.path));
    expect(
      undeclared,
      'every tag in AD_SHAPED is now either read or declared:\n' +
      undeclared.map(u => `  ${u.count}  ${u.path}`).join('\n'),
    ).toEqual([]);
  });
```

and add `'INDI.BIRT.SOUR._AID'` to the existing "no longer reports the tags the arkivdigital profile now maps" array.

- [ ] **Step 2: Run — confirm it fails** while the declaration still exists (the path is declared, so `undeclared` is empty and the *first* form passes vacuously; the added entry in the not-reported list is what fails, because the tag is reported until Task 2 landed). If Tasks 2–3 are already in, this step is the confirmation that the declaration is now dead weight.

- [ ] **Step 3: Delete the declaration**

Remove from `DECLARED_UNMAPPED`:

```ts
  { path: '*.SOUR._AID',              reason: 'unmapped:pending-ad-citation-aid — …' },
```

- [ ] **Step 4: Verify**
  - `npm test -- import-tag-accounting` green, including the per-fixture gate over all 19+ fixtures.
  - `npm test -- import-tag-accounting-declared` green — the `unmapped:pending-` prefix test no longer has an entry naming this plan.
  - Grep the repo for `pending-ad-citation-aid`: zero hits outside `docs/plans/archive/`.

- [ ] **Step 5: Commit** — `feat(import): the citation image pointer is mapped, not declared`

---

### Task 7 (Tier 1): resolve the pointer to a link at render time

**Files:**
- Create: `src/api/external_identifier_links.ts`
- Test: `tests/unit/external-identifier-links.test.ts`
- Modify: `src/renderer/composables/useEventCitations.ts`
- Modify: `src/renderer/components/modals/EventModal.vue`
- Modify: `src/renderer/i18n/en.ts`, `src/renderer/i18n/sv.ts`

**Prime Directive:** the URL is derived on every render and never persisted. No column, no cache in the DB.

The existing `arkivdigital-aid` rule in `src/api/link-rules/sv.ts` does **not** apply: its pattern requires the literal `AID:` prefix (`'AID:\\s*v(\\d+)\\.b(\\d+)(?:\\.s\\d+)?'`) and matches inside free text. A stored identifier value is a bare `v191316.b580.s52`, and it is a field, not prose. Widening the free-text rule to match bare `v…b…` strings would linkify unrelated text; a field resolver is the correct shape.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/external-identifier-links.test.ts
import { describe, it, expect } from 'vitest';
import { resolveExternalIdentifierUrl } from '../../src/api/external_identifier_links';

describe('resolveExternalIdentifierUrl', () => {
  it('turns an image pointer into a volume+image URL', () => {
    expect(resolveExternalIdentifierUrl('arkivdigital.image', 'v191316.b580.s52'))
      .toBe('https://app.arkivdigital.se/volume/v191316?image=580');
  });

  it('accepts an image pointer with no page part', () => {
    expect(resolveExternalIdentifierUrl('arkivdigital.image', 'v191316.b580'))
      .toBe('https://app.arkivdigital.se/volume/v191316?image=580');
  });

  it('turns a volume pointer into a volume URL', () => {
    expect(resolveExternalIdentifierUrl('arkivdigital', 'v191316'))
      .toBe('https://app.arkivdigital.se/volume/v191316');
  });

  it('returns null for a system it does not know', () => {
    expect(resolveExternalIdentifierUrl('gramps.handle', 'abc123')).toBeNull();
  });

  it('returns null for a value that does not match the system shape', () => {
    expect(resolveExternalIdentifierUrl('arkivdigital.image', 'not-an-aid')).toBeNull();
    expect(resolveExternalIdentifierUrl('arkivdigital', '')).toBeNull();
  });

  it('does not build a URL from user text that merely contains an id', () => {
    expect(resolveExternalIdentifierUrl('arkivdigital.image', 'see v1.b2 for context')).toBeNull();
  });
});
```

- [ ] **Step 2: Run — confirm it fails** (module does not exist).

- [ ] **Step 3: Implement**

```ts
// src/api/external_identifier_links.ts
/**
 * Render-time resolution of an `external_identifiers` row to a URL.
 *
 * Prime Directive: the result is computed on every render and never written
 * back. The DB stores what the import file said — `v191316.b580.s52` — and
 * nothing else. If ArkivDigital changes its URL shape, this function changes
 * and every stored pointer resolves correctly the next time it is drawn.
 *
 * Anchored patterns only: the value is a field, not prose. `src/api/link-rules/`
 * is the free-text linkifier and is a different mechanism with different risks.
 */

const AD_IMAGE = /^v(\d+)\.b(\d+)(?:\.s\d+)?$/;
const AD_VOLUME = /^v(\d+)$/;

export function resolveExternalIdentifierUrl(system: string, value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (system === 'arkivdigital.image') {
    const m = AD_IMAGE.exec(v);
    return m ? `https://app.arkivdigital.se/volume/v${m[1]}?image=${m[2]}` : null;
  }
  if (system === 'arkivdigital') {
    const m = AD_VOLUME.exec(v);
    return m ? `https://app.arkivdigital.se/volume/v${m[1]}` : null;
  }
  return null;
}
```

- [ ] **Step 4: Surface it on the event citation**

`useEventCitations.ts` already loads a display row per citation from `citations.forEvent` + `sources.get`. Extend that row with the resolved link:

```ts
  const idents = await window.api.externalIdentifiers.forEntity('citation', c.id) as ExternalIdentifier[];
  const archive = idents
    .map(i => ({ system: i.system, url: resolveExternalIdentifierUrl(i.system, i.value), value: i.value }))
    .find(x => x.url !== null);
```

Three things the executor must not skip:

1. **`window.api.externalIdentifiers` does not exist.** Verified — `tauri-window-api.ts` has
   no such domain. Add one beside `api.citations` (line 292), binding `forEntity` to
   `getExternalIdentifiers` from `src/api/external_identifiers.ts` in the same
   `readOnly(...)` shape as `citations.forEvent` (line 296). That is a new IPC surface, so
   it also needs its entry in `docs/IPC_REFERENCE.md`.
2. **`useEventCitations` takes its fetchers by injection.** It already receives a
   `sourceGet`-style dependency and hydrates `CitationRow.sourceTitle` through it (around
   line 127). Add the identifier fetcher the same way — as an injected function — rather
   than reaching for `window.api` inside the composable, which would break its tests.
   `CitationRow` (line 36) is the interface that gains the field; `MergedCitationRow`
   (line 56) carries it through to the template.
3. **Do not fetch per citation in a loop over a DB-scale array.** An event has a handful of
   citations, so per-citation is bounded here — but if the same display shape is later
   reused on a list of events, add a bulk getter first. Record which choice was made in the
   commit.

In `EventModal.vue`, render the link beside the citation's page, label from i18n:

```vue
<a
  v-if="cit.archiveUrl"
  :href="cit.archiveUrl"
  target="_blank"
  rel="noopener"
  class="archive-link"
>{{ $t('citations.openArchiveImage') }}</a>
```

i18n keys, both locales — per the product principle *"prefers explicit text to icons"*, this is a text link, not an icon:

```ts
// en.ts   citations: { …, openArchiveImage: 'Open archive image' }
// sv.ts   citations: { …, openArchiveImage: 'Öppna arkivbild' }
```

- [ ] **Step 5: Verify**
  - `npm test -- external-identifier-links` green.
  - A component test mounts the citation row with an `arkivdigital.image` identifier and asserts an anchor with the expected `href`; and with a `gramps.handle` identifier asserts no anchor.
  - **(Tier 4 — human-required):** open the app, import an ArkivDigital file, click one link, confirm ArkivDigital serves that image. *Alternative agent-completable path: none — the target is a paid third-party service behind a login the agent cannot reach. Degraded outcome if skipped: ship it, and change Verification §1 from "the link opens the image" to "the link resolves to the URL shape ArkivDigital's own `_URL` values use", which the unit test already asserts against `v25161.b276.s528`-style real values. Record in the commit which of the two happened.*

- [ ] **Step 6: Commit** — `feat(ui): link a citation to its ArkivDigital image`

---

### Task 8 (Tier 1): measure against the real corpus

**Files:** none committed. This task produces evidence for the close-out.

- [ ] **Step 1: Import each of the four real exports into a scratch DB** (`export-import/min släkt/*.ged`, gitignored — never copy into `tests/`).

- [ ] **Step 2: Record the counts**

```sql
SELECT system, COUNT(*) FROM external_identifiers GROUP BY system;
-- expect: arkivdigital 1418-ish volumes, arkivdigital.parish ~3057 rows as
--         before, arkivdigital.image 6324 across the four files
SELECT COUNT(*) FROM external_identifiers ei
  JOIN citations c ON c.id = ei.entity_id
 WHERE ei.entity_type = 'citation';
-- expect: 6324 — every image pointer resolves to a real citation row
SELECT COUNT(*) FROM external_identifiers
 WHERE entity_type = 'citation'
   AND entity_id NOT IN (SELECT id FROM citations);
-- expect: 0 — no orphan
```

- [ ] **Step 3: Re-run the corpus sweep** — `npx tsx scripts/accounting-over-samples.ts "export-import/min släkt"` and confirm no `*.SOUR._AID` path appears.

- [ ] **Step 4: Paste the numbers into the close-out commit message.** Assertions are not evidence — `.claude/rules/plans.md` "Verification discipline at close-out".

---

### T-final (Tier 1): close out

- [ ] **Invoke the `/close-out` skill.** It walks the 6+1 steps, refuses partial work, and captures evidence.

---

## Self-review checklist

- [ ] Every task has a tier tag; the one Tier 4 step carries its degraded outcome.
- [ ] No self-referential tasks.
- [ ] Every task ends in a commit or a recorded measurement.
- [ ] No file from `export-import/` committed.
- [ ] No change to `normalize.ts`, no `unmapped_data` table.
- [ ] The resolved URL is never written to the DB.
- [ ] `bulkCreateCitations` still issues one batched INSERT — asserted, not assumed.
- [ ] `*.SOUR._AID` is gone from `DECLARED_UNMAPPED` and no test references `pending-ad-citation-aid`.
- [ ] `npm test`, `npm run lint`, `npx vue-tsc --noEmit --ignoreDeprecations 6.0`, `npm run build`, `npm run test:e2e:full` green with output captured.

## Failure modes / RCA reference

- **The reason that named this plan pointed at a plan that did not exist.** `unmapped:pending-ad-citation-aid` was written into `accounting-declared.ts` before the file it names was filed — caught by post-close hygiene on 2026-08-23, fixed by commit `00c13144`. The `unmapped:pending-<plan>` prefix is only honest if the plan is on disk.
- **`mediaEntityKey` joins with a NUL byte, not the space its doc comment shows.** Hand-building the key silently dropped `_PARISH_AID` from the export during the arkivdigital profile work. Task 4 calls the function.
- **Reading a report and calling it coverage.** The 2026-08-23 breach was `ctx.skippedTags` read as if it were a census. Task 8's counts are a census over the whole corpus, not the top of a list.
