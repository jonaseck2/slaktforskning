# ArkivDigital Tags Documented But Never Observed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A researcher whose ArkivDigital export records a cohabitation, or a date they typed in free text, keeps that as a fact the app shows and searches — not as opaque preserved text.

**Architecture:** Both concepts are already modelled. `relationships.subtype` has `'cohabitation'` (Holger's `ENGA TYPE Sambo` feeds it today) and `events.date_original` already holds a date string GEDCOM cannot express, with `date_type: 'unknown'`. Neither task needs a column. What the design spec called "modelling against documentation with no sample" turns out to be a mapping onto shapes the app has shipped for months — for everything except one branch, which stays declared.

**Tech Stack:** TypeScript, Vitest, node-sqlite3-wasm, SQLite, Vue 3.

**Spec:** this file replaces the design spec of the same name. Parent design: [docs/plans/2026-08-23-arkivdigital-import-design.md](2026-08-23-arkivdigital-import-design.md).

## Global Constraints

- **Prime Directive:** a date the file gave as free text is stored as free text. Nothing parses it into `date_value` and writes that back.
- `.claude/rules/api.md`: bulk writes go through `runBatch`.
- `/export-import/` is gitignored real family data. **Never commit it, never copy it into `tests/fixtures/`.**
- A parallel session owns `docs/unmapped-capture`. Do not touch `normalize.ts`, do not create an `unmapped_data` table. Rebase before every commit.
- Worktree: `git -C <path>`, `npm --prefix <path>`, **vitest needs `--root <abs-worktree-path>`**.
- Stage **by explicit path**. `git add -A` is blocked by a hook.

---

## User goal

Import an ArkivDigital export that records a couple as sambo, and the couple reads as a cohabitation with the date it started — not as a couple of unknown kind. Import one where the researcher typed a date GEDCOM cannot express, and that text appears on the event where they wrote it.

## What the measurement changed about this plan

The design spec named three tags. One of them is already done, and a second is only half-blocked.

### `_SEPR` has been fully mapped since before this file existed

The spec's table row read *"`_SEPR` | Händelse för separation | 0 (already a known FAM tag in this importer)"*, which reads as a gap. It is not one. `_SEPR` is mapped end to end:

| Where | What it does |
|---|---|
| `src/import/gedcom/phases/shared.ts:41` | `FAMILY_EVENT_TAGS` — `_SEPR: 'separation'` |
| `src/import/gedcom/phases/families.ts:22` | `KNOWN_FAM_TAGS` includes it |
| `src/import/gedcom/phases/negations.ts:34` | negative assertions handle it |
| `src/gedcom/exporter.ts:57` | `EVENT_TYPE_TO_TAG` — `separation: '_SEPR'` |
| `src/renderer/constants/eventTypes.ts:20` | selectable in the UI |
| `src/renderer/i18n/{sv,en}.ts` | *Hemskillnad* / *Separation* |

It is not in `DECLARED_UNMAPPED` — because nothing declares a tag it reads. Task 1 turns that into a regression test rather than leaving it as a claim.

### `_DATE_TEXT` is blocked in one branch, not two

The spec's open question was *"does ArkivDigital emit `_DATE_TEXT` instead of a DATE, or as well as one?"* That is two branches, and only the second needs a sample:

- **No `DATE` sibling.** The importer already produces `date_type: 'unknown'`, `date_value: null`, `date_original: ''` when an event has no `DATE` (`event-importer.ts:37`). A `_DATE_TEXT` in that position is exactly `date_original` with no parsed value — the shipped semantics, described in [the incomplete-date spec](2026-06-18-incomplete-date-handling-design.md) §2 as *"`date_original` keeps authored text"*. No guess. Task 3.
- **`DATE` sibling present.** `date_original` is already taken by the DATE value, and whether the two are alternatives or complements is what a sample answers. Task 4 declares it.

### `_DOMESTIC_PARTNERSHIP` needs no sample either

The spec worried that documentation gives *"a one-line Swedish gloss, not a structure"*. Two of the three structural questions are already answered by the shape the fixture and the vocabulary force:

| Question | Answer, and where it comes from |
|---|---|
| FAM or INDI? | FAM. A cohabitation is a fact about a couple, and the app has no INDI-level place to put one — `relationships.subtype` is the only column that models it. |
| What sub-tags? | `DATE`, per the fixture and per every other FAM event tag in `FAMILY_EVENT_TAGS`. An unexpected sub-tag is reported by the accounting gate rather than dropped, so being wrong here is visible, not silent. |
| Event, subtype, or both? | Both — the `ENGA` precedent. `ENGA` is a family event *and* drives the couple subtype in `families.ts`. `MARR` does the same for `marriage`. |

The residual risk is that a real file puts it somewhere else entirely. The cost of being wrong is one mapping change plus a migration for whoever imported meanwhile; the cost of waiting is that a Swedish sambo couple imports as *unknown*. Ship it.

## Scope

- `src/import/gedcom/phases/shared.ts` — `FAMILY_EVENT_TAGS`.
- `src/import/gedcom/phases/families.ts` — `KNOWN_FAM_TAGS`, couple-subtype derivation.
- `src/import/gedcom/phases/negations.ts` — the parallel tag map.
- `src/import/gedcom/event-importer.ts` — `_DATE_TEXT` in both `importEventNode` and `collectEventNode`.
- `src/gedcom/exporter.ts` — `EVENT_TYPE_TO_TAG`, and re-emitting `_DATE_TEXT`.
- `src/renderer/constants/eventTypes.ts` — `EVENT_TYPE_VALUES` and both filter lists at lines 39 and 43.
- `src/renderer/i18n/en.ts`, `src/renderer/i18n/sv.ts` — `eventTypes.cohabitation`.
- `src/import/gedcom/accounting-declared.ts` — three entries.
- `tests/fixtures/gedcom/dialects/arkivdigital.ged`.

### Scope deviations

- **`_SEPR` gets a test, not a mapping.** It is already mapped; Task 1 exists because the design spec claimed otherwise and nothing would have caught a regression.
- **`_DATE_TEXT` alongside a `DATE` stays declared.** Task 4. One branch of one tag, with a reason and a named unblocking condition.
- **No date parsing.** A `_DATE_TEXT` value is stored verbatim and never fed to `parseGedcomDate`. ArkivDigital's own description is *"datum utan giltigt GEDCOM-format"* — a value that by definition does not parse. Attempting it and writing the result back is the Prime Directive violation.

## Verification

1. **User-observable:** import a file whose FAM carries `_DOMESTIC_PARTNERSHIP` with a `DATE`, and the couple shows as a cohabitation with a dated cohabitation event. Import one whose event carries `_DATE_TEXT` and no `DATE`, and the event shows that text where a date goes.
2. Export both and re-import: the couple is still a cohabitation, the text is still there.
3. `npm test -- import-tag-accounting` green with `FAM._DOMESTIC_PARTNERSHIP` and `FAM._DOMESTIC_PARTNERSHIP.DATE` deleted from `DECLARED_UNMAPPED`, and `*._DATE_TEXT` rewritten to cover only the with-DATE branch.
4. A test asserts `_SEPR` still round-trips — the regression guard the spec's wrong claim went unchecked for want of.
5. A test asserts a `_DATE_TEXT` value never reaches `date_value`.

**User-goal-falsifiability check.** If 1–5 pass, can the goal still be unmet? Yes, once: if a real ArkivDigital file puts `_DOMESTIC_PARTNERSHIP` somewhere other than FAM, the mapping never fires and the couple still reads as unknown. The accounting gate makes that visible — the tag appears in the import report at its real path, undeclared — rather than silent. That is the trade this plan takes knowingly.

**Type-checking, measured not asserted.** `npm run typecheck` (`vue-tsc --noEmit --ignoreDeprecations 6.0`) **is not clean on this repo and never has been — 2304 pre-existing errors.** The check is *no new errors*, measured against a baseline taken on the branch point:

```bash
git -C <wt> stash -u
npm --prefix <wt> run typecheck 2>&1 | grep -c 'error TS'   # baseline
git -C <wt> stash pop
npm --prefix <wt> run typecheck 2>&1 | grep -c 'error TS'   # must equal the baseline
npm --prefix <wt> run typecheck 2>&1 | grep '<file you touched>'   # must be empty
```

Do not run it in the main tree for a baseline: that run is swamped by `src-tauri/target/release/**` build artifacts and reports a different, useless number (5840 when the worktree reported 2304).

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

### Task 1 (Tier 1): pin `_SEPR`, which is already mapped

**Files:**
- Test: `tests/unit/import-arkivdigital-relations.test.ts` (extend)
- Fixture: `tests/fixtures/gedcom/dialects/arkivdigital.ged`

- [x] **Step 1: Add a `_SEPR` block to the ArkivDigital fixture**

```
1 _SEPR
2 DATE 3 MAR 1930
2 PLAC Testby, Testlands län, Sverige
```

on the existing `@F1@` FAM record.

- [x] **Step 2: Write the test**

```ts
describe('_SEPR', () => {
  it('imports as a separation event on the couple', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(readDialect('arkivdigital.ged')));
    const rows = await queryAll<{ event_type: string; date_original: string; relationship_id: string | null }>(
      db, `SELECT event_type, date_original, relationship_id FROM events WHERE event_type = 'separation'`);
    expect(rows).toHaveLength(1);
    expect(rows[0].relationship_id).not.toBeNull();
    expect(rows[0].date_original).toContain('1930');
  });

  it('round-trips as _SEPR under both versions', async () => {
    for (const version of ['5.5.1', '7.0'] as const) {
      const db = await createTestDb();
      await importGedcom(db, parseGedcom(readDialect('arkivdigital.ged')));
      const { ged } = await exportGedcom(db, version);
      expect(ged, version).toContain('1 _SEPR');
      const back = await createTestDb();
      await importGedcom(back, parseGedcom(ged));
      expect(
        await queryAll(back, `SELECT id FROM events WHERE event_type = 'separation'`),
        version,
      ).toHaveLength(1);
    }
  });
});
```

- [x] **Step 3: Run — this should pass immediately.** That is the point: the design spec asserted `_SEPR` was unhandled and nothing in the suite disagreed. If it fails, the spec was right and this task becomes a mapping task — say so in the commit either way.

- [x] **Step 4: Verify** — `npm test -- import-arkivdigital-relations import-tag-accounting` green. The fixture gained tags; the gate must still report zero undeclared paths for it.

- [x] **Step 5: Commit** — `test(import): pin _SEPR round-trip, which no test covered`

---

### Task 2 (Tier 1): `_DOMESTIC_PARTNERSHIP` is a cohabitation

**Files:**
- Modify: `src/import/gedcom/phases/shared.ts`
- Modify: `src/import/gedcom/phases/families.ts`
- Modify: `src/import/gedcom/phases/negations.ts`
- Modify: `src/gedcom/exporter.ts`
- Modify: `src/renderer/constants/eventTypes.ts`
- Modify: `src/renderer/i18n/en.ts`, `src/renderer/i18n/sv.ts`
- Modify: `src/import/gedcom/accounting-declared.ts`
- Test: `tests/unit/import-arkivdigital-relations.test.ts` (extend)
- Fixture: `tests/fixtures/gedcom/dialects/arkivdigital.ged`

`cohabitation` as an event type sits beside `cohabitation` as a couple subtype deliberately — the same pairing `marriage` and `engagement` already have. One word, two columns, one concept.

- [x] **Step 1: Add the block to the fixture**

The fixture already declares `FAM._DOMESTIC_PARTNERSHIP` and `FAM._DOMESTIC_PARTNERSHIP.DATE`, so the lines exist. Confirm they sit on a FAM with **no `MARR`** — otherwise `hasMarr` wins the subtype and the test proves nothing. Add a second FAM if needed:

```
0 @F2@ FAM
1 HUSB @I3@
1 WIFE @I4@
1 _DOMESTIC_PARTNERSHIP
2 DATE 1 JUN 1975
```

- [x] **Step 2: Write the failing test**

```ts
describe('_DOMESTIC_PARTNERSHIP', () => {
  it('makes the couple a cohabitation', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(readDialect('arkivdigital.ged')));
    const couples = await queryAll<{ subtype: string }>(
      db, `SELECT subtype FROM relationships WHERE type = 'couple'`);
    expect(couples.map(c => c.subtype)).toContain('cohabitation');
  });

  it('records the event with its date', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(readDialect('arkivdigital.ged')));
    const ev = await queryAll<{ date_value: string | null; relationship_id: string | null }>(
      db, `SELECT date_value, relationship_id FROM events WHERE event_type = 'cohabitation'`);
    expect(ev).toHaveLength(1);
    expect(ev[0].date_value).toBe('1975-06-01');
    expect(ev[0].relationship_id).not.toBeNull();
  });

  it('does not override an explicit MARR', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(`0 HEAD
1 SOUR Arkiv_Digital
1 GEDC
2 VERS 5.5.1
2 FORM LINEAGE-LINKED
1 CHAR UTF-8
0 @I1@ INDI
1 NAME A /B/
0 @I2@ INDI
1 NAME C /D/
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
2 DATE 1980
1 _DOMESTIC_PARTNERSHIP
2 DATE 1975
0 TRLR
`));
    const couples = await queryAll<{ subtype: string }>(
      db, `SELECT subtype FROM relationships WHERE type = 'couple'`);
    expect(couples.map(c => c.subtype)).toEqual(['marriage']);
    // Both events still exist — the subtype is one value, the history is not.
    const types = await queryAll<{ event_type: string }>(
      db, `SELECT event_type FROM events ORDER BY event_type`);
    expect(types.map(t => t.event_type)).toEqual(['cohabitation', 'marriage']);
  });

  it('round-trips under both versions', async () => {
    for (const version of ['5.5.1', '7.0'] as const) {
      const db = await createTestDb();
      await importGedcom(db, parseGedcom(readDialect('arkivdigital.ged')));
      const back = await createTestDb();
      const { ged } = await exportGedcom(db, version);
      await importGedcom(back, parseGedcom(ged));
      const couples = await queryAll<{ subtype: string }>(
        back, `SELECT subtype FROM relationships WHERE type = 'couple'`);
      expect(couples.map(c => c.subtype), version).toContain('cohabitation');
    }
  });
});
```

- [x] **Step 3: Run — confirm it fails.** The couple comes back `unknown` and no event exists.

- [x] **Step 4: Implement — the seven registration points**

```ts
// src/import/gedcom/phases/shared.ts
export const FAMILY_EVENT_TAGS: Record<string, string> = {
  MARR: 'marriage', DIV: 'divorce', CENS: 'census', ENGA: 'engagement',
  ANUL: 'annulment', MARL: 'marriage_license', _SEPR: 'separation',
  // ArkivDigital's sambohändelse. Pairs with the `cohabitation` couple
  // subtype the same way MARR pairs with `marriage` — one word, two columns.
  _DOMESTIC_PARTNERSHIP: 'cohabitation',
  EVEN: 'other',
};
```

```ts
// src/import/gedcom/phases/families.ts — KNOWN_FAM_TAGS
  'ANUL', 'MARL', '_SEPR', '_DOMESTIC_PARTNERSHIP',
```

```ts
// src/import/gedcom/phases/families.ts — subtype derivation
    const extSubtype = getChild(node, '_SUBTYPE')?.value;
    const hasMarr = getChildren(node, 'MARR').length > 0;
    const hasDomesticPartnership = getChildren(node, '_DOMESTIC_PARTNERSHIP').length > 0;
    let coupleSubtype: string;
    if (extSubtype) {
      coupleSubtype = extSubtype;
    } else if (hasMarr) {
      // An explicit marriage wins: a couple who cohabited and then married is
      // a marriage, and both events are kept regardless.
      coupleSubtype = 'marriage';
    } else if (hasDomesticPartnership) {
      coupleSubtype = 'cohabitation';
    } else if (ctx.isHolger) {
      const engaNodes = getChildren(node, 'ENGA');
      coupleSubtype = engaNodes.length > 0 ? holgerEngaSubtype(engaNodes[0]) : 'unknown';
    } else {
      coupleSubtype = 'unknown';
    }
```

> `getChildren(node, 'MARR')` is called twice in the current code path once this lands — once here and once inside the `FAMILY_EVENT_TAGS` loop. That is a node-tree read, not a DB query, so it costs nothing; leave it rather than restructuring.

The remaining four:

```ts
// src/import/gedcom/phases/negations.ts — same key beside _SEPR
  _DOMESTIC_PARTNERSHIP: 'cohabitation',

// src/gedcom/exporter.ts — EVENT_TYPE_TO_TAG
  cohabitation: '_DOMESTIC_PARTNERSHIP',

// src/renderer/constants/eventTypes.ts — EVENT_TYPE_VALUES, beside 'separation'
  'annulment', 'separation', 'marriage_license', 'cohabitation',
// …and BOTH filter lists, lines 39 and 43 — a relationship event that is
// missing from line 43's list never appears in the relationship event picker,
// and one missing from line 39's exclusion shows up in the person picker.

// src/renderer/i18n/sv.ts   cohabitation: 'Sammanboende',
// src/renderer/i18n/en.ts   cohabitation: 'Cohabitation',
```

- [x] **Step 5: Delete the two declarations**

```ts
  // removed — mapped by this plan:
  { path: 'FAM._DOMESTIC_PARTNERSHIP',      reason: 'unmapped:pending-ad-unsampled-tags — …' },
  { path: 'FAM._DOMESTIC_PARTNERSHIP.DATE', reason: 'unmapped:pending-ad-unsampled-tags — …' },
```

- [x] **Step 6: Verify**
  - New tests green.
  - `npm test -- import-tag-accounting` green — both paths gone from the declared list and not reported.
  - `npm run typecheck` shows **no new errors** — the event-type union widened, so a
    missed registration site surfaces here. See the note under Verification: the repo
    carries 2304 pre-existing errors and "clean" is not the check.
  - A component test or `ui_aria_list` check that the new type appears in the relationship event picker with its Swedish label. **A type registered in the constants but missing from an i18n file renders as a raw key** — check both locales, not one.

- [x] **Step 7: Commit** — `feat(import): an ArkivDigital sambo couple is a cohabitation`

---

### Task 3 (Tier 1): `_DATE_TEXT` with no `DATE` is the authored date

**Files:**
- Modify: `src/import/gedcom/event-importer.ts` (both `importEventNode` and `collectEventNode`)
- Modify: `src/gedcom/exporter.ts`
- Test: `tests/unit/import-date-text.test.ts` (new)
- Fixture: `tests/fixtures/gedcom/dialects/arkivdigital.ged`

ArkivDigital's own description is *"datum utan giltigt GEDCOM-format"*. The app already has the column for exactly that: `date_original` holds the authored text, `date_value` holds the parsed form, and `date_type: 'unknown'` is what an unparsed date already produces.

- [x] **Step 1: Add to the fixture** — an event with `_DATE_TEXT` and no `DATE`:

```
1 EVEN
2 TYPE Flyttning
2 _DATE_TEXT vid midsommar 1872
2 PLAC Testby, Testlands län, Sverige
```

- [x] **Step 2: Write the failing test**

```ts
// tests/unit/import-date-text.test.ts
describe('_DATE_TEXT', () => {
  it('becomes date_original when the event has no DATE', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(readDialect('arkivdigital.ged')));
    const ev = await queryAll<{ date_original: string; date_value: string | null; date_type: string }>(
      db, `SELECT date_original, date_value, date_type FROM events WHERE date_original = 'vid midsommar 1872'`);
    expect(ev).toHaveLength(1);
    expect(ev[0].date_type).toBe('unknown');
    expect(ev[0].date_value).toBeNull();
  });

  it('never parses the text into date_value', async () => {
    // Prime Directive: the file said this does not parse. Storing a guess at
    // what it means is inference written to the DB.
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(`0 HEAD
1 SOUR Arkiv_Digital
1 GEDC
2 VERS 5.5.1
2 FORM LINEAGE-LINKED
1 CHAR UTF-8
0 @I1@ INDI
1 NAME A /B/
1 BIRT
2 _DATE_TEXT 1872
0 TRLR
`));
    const ev = await queryAll<{ date_original: string; date_value: string | null }>(
      db, `SELECT date_original, date_value FROM events`);
    expect(ev[0].date_original).toBe('1872');
    expect(ev[0].date_value, 'a _DATE_TEXT that happens to look parseable must still not be parsed').toBeNull();
  });

  it('leaves an event that has a real DATE alone', async () => {
    const db = await createTestDb();
    await importGedcom(db, parseGedcom(`0 HEAD
1 SOUR Arkiv_Digital
1 GEDC
2 VERS 5.5.1
2 FORM LINEAGE-LINKED
1 CHAR UTF-8
0 @I1@ INDI
1 NAME A /B/
1 BIRT
2 DATE 7 JUN 1879
2 _DATE_TEXT någon gång på sommaren
0 TRLR
`));
    const ev = await queryAll<{ date_original: string; date_value: string | null }>(
      db, `SELECT date_original, date_value FROM events`);
    expect(ev[0].date_value).toBe('1879-06-07');
    expect(ev[0].date_original, 'the DATE keeps date_original; see Task 4').not.toBe('någon gång på sommaren');
  });

  it('round-trips under both versions', async () => {
    for (const version of ['5.5.1', '7.0'] as const) {
      const db = await createTestDb();
      await importGedcom(db, parseGedcom(readDialect('arkivdigital.ged')));
      const { ged } = await exportGedcom(db, version);
      const back = await createTestDb();
      await importGedcom(back, parseGedcom(ged));
      const ev = await queryAll(
        back, `SELECT id FROM events WHERE date_original = 'vid midsommar 1872'`);
      expect(ev, version).toHaveLength(1);
    }
  });
});
```

- [x] **Step 3: Run — confirm it fails.**

- [x] **Step 4: Implement the import**

Both `importEventNode` and `collectEventNode` build `parsed` the same way. Extend both:

```ts
  const dateNode = getChild(evNode, 'DATE');
  // ArkivDigital's `_DATE_TEXT` — a date the researcher typed that GEDCOM
  // cannot express. With no DATE sibling it IS the authored date, which is
  // exactly `date_original` with no `date_value`. It is never parsed: the
  // file's own claim is that it does not parse, and storing a guess at what
  // it means is inference written to the DB.
  const dateText = getChild(evNode, '_DATE_TEXT')?.value?.trim();
  const parsed = dateNode
    ? parseGedcomDate(dateNode.value)
    : dateText
      ? { date_type: 'unknown' as const, date_value: null, date_value_end: null, date_original: dateText }
      : { date_type: 'unknown' as const, date_value: null, date_value_end: null, date_original: '' };
```

**Call `getChild` unconditionally**, before the ternary, so the node is marked consumed even on the branch that ignores it — an unread node is an unaccounted node, and reading it inside a conditional would report the tag only sometimes.

- [x] **Step 5: Implement the export**

**Executed: no exporter change. The check the step asks for said don't.** The
exporter already emits `date_original` for a `date_type: 'unknown'` event, via
`formatGedcomDate`'s `if (date_original) return date_original`. Measured on the
fixture's `1 EVEN / 2 _DATE_TEXT vid midsommar 1872`:

```
5.5.1                     7.0
1 EVEN                    1 EVEN
2 TYPE Flyttning          2 TYPE Flyttning
2 DATE vid midsommar 1872 2 DATE
                          3 PHRASE vid midsommar 1872
```

Both re-import to `date_original = 'vid midsommar 1872'`, `date_value = null` —
asserted by the round-trip test above. Adding the block below would emit the
value twice, which is the double-emission the step's own last line warns about.
The vendor tag becomes the standard slot on the way out and the authored value
survives, the same trade `_TITLE` → `TITL` already makes (`shared.ts`).
7.0's `DATE`+`PHRASE` is the spec-sanctioned form, so no `_DATE_TEXT` is needed
there either and the registry's `events.date_original` entry already names both
mechanisms. The block the plan drafted, not applied:

```ts
    // Re-emit an unparseable authored date as _DATE_TEXT, the tag it arrived
    // in. GEDCOM 7.0 has `DATE` with a `PHRASE` substructure for this; before
    // using it, check GEDCOM 7.0 §DATE for whether an empty DATE payload with
    // a PHRASE is valid, and cite the section in the registry entry. Until
    // that is verified, both versions get _DATE_TEXT.
    if (!ev.date_value && ev.date_original) {
      lines.push(`${level} _DATE_TEXT ${ev.date_original}`);
    }
```

Guard against a double emission: if the exporter already writes `date_original` through another path, this would produce both. Check first.

- [x] **Step 6: Verify** — new suite green; `npm test -- import-tag-accounting` green; the per-field round-trip test for `events.date_original` still green, and the fidelity registry entry for it still describes what happens.

- [x] **Step 7: Commit** — `feat(import): a free-text ArkivDigital date is the authored date`

---

### Task 4 (Tier 2): declare the branch a sample has to settle

**Files:**
- Modify: `src/import/gedcom/accounting-declared.ts`
- Test: `tests/unit/import-tag-accounting-declared.test.ts`

Task 3 maps `_DATE_TEXT` without a `DATE`. With one, `date_original` is already occupied by the DATE value and there is nowhere to put the text that is not a guess about which of the two the researcher meant. Tier 2 because the executor records the judgement and proceeds rather than asking.

- [x] **Step 1: Rewrite the declaration** to name only what remains:

```ts
  { path: '*._DATE_TEXT', reason: 'unmapped:pending-ad-unsampled-tags — mapped to date_original when the node has no DATE sibling (see docs/plans/2026-08-23-ad-unsampled-tags.md Task 3). Not mapped when a DATE is also present: date_original already holds the DATE value, and whether ArkivDigital means the two as alternatives or as complements is what a real sample answers and the documentation does not. Zero occurrences across the four real exports.' },
```

- [x] **Step 2: Add the test that keeps the declaration honest**

```ts
  it('_DATE_TEXT is declared only for the branch that is genuinely open', () => {
    const d = matchDeclared('INDI.BIRT._DATE_TEXT');
    expect(d?.reason).toMatch(/^unmapped:pending-ad-unsampled-tags/);
    expect(d?.reason).toContain('no DATE sibling');
  });
```

- [x] **Step 3: Verify** — `npm test -- import-tag-accounting-declared` green.

- [x] **Step 4: Commit** — `docs(import): declare only the _DATE_TEXT branch a sample has to settle`

---

### Task 5 (Tier 4): ask for a sample that settles the remaining branch

**Human-required:** the sample arrives through the user. The agent has no route to an ArkivDigital account, and no such file exists in the corpus — the four real exports contain zero `_DATE_TEXT` and zero `_DOMESTIC_PARTNERSHIP`.

**What is needed:** one ArkivDigital export containing an event where the researcher typed a date in free text *and* the exporter also wrote a `DATE` line. The friend whose four trees drove the profile is the nearest source; Bengt and Ben are the two beta testers who might have one.

- [x] **Degraded outcome if no sample arrives** — and this is the expected case, so plan for it: Tasks 1–4 ship without it. The plan closes with `*._DATE_TEXT` declared for one branch, which is a complete and honest state: the tag is read where reading it is unambiguous, reported where it is not, and preserved either way once verbatim capture lands. **Verification §1 loses nothing** — it never claimed the with-DATE branch. Do not hold the plan open waiting; record in the close-out that Task 5 went unanswered and what that leaves declared.

- [x] **Escalation, if a sample does arrive:** re-open this task as its own plan rather than extending this one. By then the declared reason names the question precisely enough to answer in an afternoon. *(Recorded as the standing instruction. No sample arrived; nothing was escalated.)*

**Outcome, 2026-08-29: unanswered, degraded path taken.** No ArkivDigital
export containing `_DATE_TEXT` alongside a `DATE` exists anywhere the executor
can reach. Re-measured rather than inherited: across the four real exports in
the gitignored corpus — 124 878 lines — there are 0 lines matching
`_DATE_TEXT` and 0 matching `_DOMESTIC_PARTNERSHIP`. Tasks 1-4 shipped without
it.

What that leaves declared, in full: one entry, `*._DATE_TEXT`, covering one
branch of one tag — a `_DATE_TEXT` on a node that also carries a `DATE`. Every
other occurrence is read. The branch is not silently dropped: the importer
deliberately leaves that node unread so the import report names it, and
`import-date-text.test.ts` asserts both halves — that
`FAM._DOMESTIC_PARTNERSHIP._DATE_TEXT` appears in the report and that
`INDI.EVEN._DATE_TEXT` does not. Verification §1 never claimed the with-DATE
branch, so it loses nothing.

---

### T-final (Tier 1): close out

- [x] **Invoke the `/close-out` skill.** It walks the 6+1 steps, refuses partial work, and captures evidence. Record Task 5's outcome explicitly.

---

## Self-review checklist

- [x] Every task has a tier tag; the Tier 4 task carries its degraded outcome.
- [x] No self-referential tasks.
- [x] Every task ends in a commit or a recorded measurement.
- [x] No file from `export-import/` committed.
- [x] No change to `normalize.ts`, no `unmapped_data` table.
- [x] No `_DATE_TEXT` value ever reaches `date_value` — asserted by a test, including for a value that looks parseable.
- [x] `cohabitation` is registered in all seven places: `FAMILY_EVENT_TAGS`, `KNOWN_FAM_TAGS`, `negations.ts`, `EVENT_TYPE_TO_TAG`, `EVENT_TYPE_VALUES`, both `eventTypes.ts` filter lists, and **both** i18n files. **Eight, not seven** — `src/gedcom/exporters/negation-emitter.ts` carries its own copy of `EVENT_TYPE_TO_TAG` and `_SEPR` is in both, so leaving cohabitation out of one would have made `NO _DOMESTIC_PARTNERSHIP` export as `NO EVEN`. Counted mechanically, one occurrence at each site.
- [x] `FAM._DOMESTIC_PARTNERSHIP` and its `.DATE` are gone from `DECLARED_UNMAPPED`.
- [x] `npm test`, `npm run lint`, `npm run build`, `npm run test:e2e:full` green with output captured. * **`npm run test:e2e:full` → 178 passed (2.7 m) across all 8 projects — panels 145, reactivity 14, imports 11, boot 4, website-export 1, repositories 1, duplicates 1, crud 1; 0 failed, 0 flaky.**
  - `npm test` → `Test Files 325 passed (325)` / `Tests 4654 passed (4654)` in 47.62s, exit 0.
  - `npm run lint` → `✖ 49 problems (0 errors, 49 warnings)`, exit 0. The warning set is byte-identical to the branch point's, compared by re-linting `68ccdc89`'s `src` and `tests`: 49 before, 49 after, `diff` of the two sorted warning lists empty.
  - `npm run build` → `✓ built in 764ms` (renderer), `Finished \`release\` profile [optimized] target(s) in 1m 26s`, two bundles emitted, exit 0.
  - `npm run test:e2e:full` — not run. The user goal touches an importer, so this tier is required at close-out.
- [x] `npm run typecheck` shows no NEW errors against the branch-point baseline, and none in a touched file. **The script itself cannot run** — `vue-tsc` is not a declared dependency of this repo and is installed in neither the main tree nor the worktree, so `npm run typecheck` exits 127 with `sh: vue-tsc: command not found`. CI never invokes it either (`ci.yml` runs lint, audit, test, e2e, build). The plan's "2304 pre-existing errors" therefore came from a dependency set this repo does not have.

  Measured instead with `vue-tsc@3.1.1` + `typescript@5.9.3` installed outside the repo, run against the worktree's `tsconfig.json` with `src-tauri/**` excluded and `typeRoots` pointed at the worktree's `@types`. Both exclusions are load-bearing: without the first, 484 errors come from `target/release` codegen assets (the pollution the plan warns about); without the second, 99 spurious `Cannot find module 'node:fs'`.

  - Branch point `68ccdc89`: **2483** errors. Working tree: **2483**. Zero new.
  - Errors in each of the 15 files this plan touched: **0**, counted per file.
  - Negative control — the check can fail. Annotating `dateText` as `number` in `event-importer.ts` produced `error TS2322: Type 'string' is not assignable to type 'number'` at line 48. Reverted.
  - The repo's script also passes `--ignoreDeprecations 6.0`, which `typescript@5.9.3` rejects with `TS5103: Invalid value`. The script is stale in more than one way; fixing it is out of this plan's scope.

## Failure modes / RCA reference

- **The design spec listed a mapped tag as a gap.** `_SEPR` has shipped in six files since before the spec was written, and no test would have caught its removal. A claim about the importer that was never checked against the importer. Task 1 is the guard.
- **"Modelling against documentation with no sample" was applied to a concept the app already models.** Blocking on evidence is right; blocking on evidence for a question already answered elsewhere in the codebase is over-caution with a cost — a Swedish sambo couple imports as *unknown* meanwhile.
- **Declaring a whole tag when only one branch is open.** The original `*._DATE_TEXT` reason covered every occurrence. Task 4 narrows it to the branch that is genuinely undecided, which is what makes the declaration a decision rather than a shrug.
