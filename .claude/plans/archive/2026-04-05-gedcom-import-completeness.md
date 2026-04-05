# Plan: GEDCOM Import Completeness

## Goal

Zero data loss when importing OurKind-20260405-Komplett.ged (HOLGER 8.0, 22k persons).
Covers the four remaining gaps identified in the gap analysis: CAUS, ENGA, ADOP, and TITL.
OBJE (media) is covered by a separate plan (`2026-04-05-gedcom-media-import.md`).

## Gap Summary

| GEDCOM Tag | Count in file | Current handling | Fix |
|---|---|---|---|
| `CAUS` under events | 517 | Silently dropped | Extract into `event.cause` (field exists) |
| `ENGA` on INDI | 521 | Not in event tag map | Add to `PERSON_EVENT_TAGS` as `'engagement'` |
| `ADOP` on INDI | 72 | Not in event tag map | Add to `PERSON_EVENT_TAGS` as `'adoption'` |
| `TITL` on INDI | 4,827 | Silently dropped | Create `'occupation'` event; value → description |
| `TYPE` subtag on events | ~600 | Silently dropped | Append to event description |
| Top-level `NOTE` xrefs | unknown | Returns raw xref string | Resolve from noteMap |

---

## Data Model Changes

### New event types: `engagement` and `adoption`

These fit naturally alongside the 22 existing event types. `event_type` is a TEXT column — no migration needed. Only the TypeScript constants and i18n need updates.

**`src/renderer/constants/eventTypes.ts`:**
```typescript
export const EVENT_TYPE_VALUES = [
  'birth', 'death', 'marriage', 'divorce', 'christening', 'burial',
  'baptism', 'confirmation', 'ordination', 'census', 'immigration',
  'emigration', 'naturalization', 'occupation', 'residence', 'education',
  'graduation', 'military', 'retirement', 'will', 'probate', 'mention',
  'engagement', 'adoption',   // ← new
  'other',
] as const;
```

`PERSON_EVENT_TYPE_VALUES` and `RELATIONSHIP_EVENT_TYPE_VALUES` are derived from `EVENT_TYPE_VALUES` via filter; no changes needed there. Both `engagement` and `adoption` should be available as person events (not relationship events), so verify neither is excluded by the relationship filter.

**`src/renderer/locales/sv.ts`** (Swedish):
```
engagement: 'Förlovning',
adoption: 'Adoption',
```

**`src/renderer/locales/en.ts`** (English):
```
engagement: 'Engagement',
adoption: 'Adoption',
```

### Exporter tag mapping

Add to `EVENT_TYPE_TO_TAG` in `src/gedcom/exporter.ts`:
```typescript
engagement: 'ENGA',
adoption:   'ADOP',
```

---

## Importer Changes (`src/gedcom/importer.ts`)

### 1. Add `ENGA` and `ADOP` to `PERSON_EVENT_TAGS`
```typescript
const PERSON_EVENT_TAGS: Record<string, string> = {
  BIRT: 'birth', DEAT: 'death', CHR: 'christening', BURI: 'burial',
  BAPM: 'baptism', CONF: 'confirmation', OCCU: 'occupation',
  RESI: 'residence', EDUC: 'education', EMIG: 'emigration',
  IMMI: 'immigration', NATU: 'naturalization', CENS: 'census',
  PROB: 'probate', WILL: 'will', GRAD: 'graduation', RETI: 'retirement',
  ENGA: 'engagement',   // ← new
  ADOP: 'adoption',     // ← new
  EVEN: 'other',
};
```

### 2. Extract `CAUS` in `importEventNode`

In the `createEvent` call, add:
```typescript
const causeValue = getChild(evNode, 'CAUS')?.value ?? null;

const event = createEvent(db, {
  ...
  cause: causeValue,           // ← new
  description: noteValue,
});
```

### 3. Extract `TYPE` subtag in `importEventNode`

`TYPE` qualifies generic `EVEN` tags and also provides context for ENGA ("Sambo", "Partner"). Store it by prepending to description if present:

```typescript
const typeValue = getChild(evNode, 'TYPE')?.value ?? '';
const noteRaw   = getChild(evNode, 'NOTE')?.value ?? '';
const noteValue = typeValue && noteRaw
  ? `${typeValue}: ${noteRaw}`
  : typeValue || noteRaw;
```

### 4. Handle `TITL` at level 1 on INDI

TITL directly on INDI is a standalone title/occupation (e.g. "Sömmerska, bondmora"). No date or place. Create an occupation event with TITL value as description.

After the person events loop in the INDI processing block:
```typescript
for (const titlNode of getChildren(node, 'TITL')) {
  if (!titlNode.value) continue;
  const event = createEvent(db, {
    event_type: 'occupation',
    date_type: 'unknown',
    date_value: null,
    date_value_end: null,
    date_original: '',
    place_id: null,
    relationship_id: null,
    description: titlNode.value,
  });
  addEventParticipant(db, { event_id: event.id, person_id: person.id, role: 'primary' });
}
```

Note: TITL also appears as a child of SOUR records (source title) — this loop only applies at the INDI level and is unambiguous since `node` here is the INDI GedcomNode.

### 5. Top-level NOTE xref resolution

Top-level NOTE records (`0 @N1@ NOTE text`) are referenced from INDI/FAM/events as `1 NOTE @N1@`. Currently `getChild(node, 'NOTE')?.value` returns the raw xref string instead of the note content.

Build a `noteMap: Map<string, string>` during the first pass:
```typescript
const noteMap = new Map<string, string>();
for (const node of tree) {
  if (node.tag !== 'NOTE' || !node.xref) continue;
  noteMap.set(node.xref, node.value ?? '');
}
```

Add a helper to resolve NOTE values:
```typescript
function resolveNote(node: GedcomNode, noteMap: Map<string, string>): string {
  const noteNode = getChild(node, 'NOTE');
  if (!noteNode) return '';
  const val = noteNode.value ?? '';
  if (val.startsWith('@') && val.endsWith('@')) {
    return noteMap.get(val) ?? '';
  }
  return val;
}
```

Use `resolveNote(evNode, noteMap)` in `importEventNode` instead of the inline `getChild(evNode, 'NOTE')?.value ?? ''`.
Use it similarly for INDI-level notes: `const personNote = resolveNote(node, noteMap);`

Pass `noteMap` through to `importEventNode` (add as parameter).

---

## Export Changes (`src/gedcom/exporter.ts`)

- Add `engagement: 'ENGA'` and `adoption: 'ADOP'` to `EVENT_TYPE_TO_TAG`
- The existing event emission loop (DATE, NOTE, CAUS, citations) already handles `cause` — no change needed there

---

## Tests (`tests/unit/gedcom.test.ts` — add new describe block)

```typescript
describe('GEDCOM import completeness', () => {
  it('imports CAUS under DEAT as event.cause', () => {
    const ged = `
0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME Per /Persson/
1 DEAT
2 DATE 19 MAR 1953
2 PLAC Stockholm
2 CAUS Skelettcancer
0 TRLR`;
    importGedcom(db, ged);
    const persons = listPersons(db);
    const events = getEventsForPerson(db, persons[0].id);
    const death = events.find(e => e.event_type === 'death')!;
    expect(death.cause).toBe('Skelettcancer');
  });

  it('imports ENGA as engagement event', () => {
    const ged = `
0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME Anna /Svensson/
1 ENGA
2 TYPE Sambo
2 DATE ABT 2020
0 TRLR`;
    importGedcom(db, ged);
    const persons = listPersons(db);
    const events = getEventsForPerson(db, persons[0].id);
    const eng = events.find(e => e.event_type === 'engagement')!;
    expect(eng).toBeDefined();
    expect(eng.description).toBe('Sambo');
  });

  it('imports ADOP as adoption event', () => {
    const ged = `
0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME Karl /Johansson/
1 ADOP
2 TYPE Fosterbarn
2 DATE 1955
0 TRLR`;
    importGedcom(db, ged);
    const persons = listPersons(db);
    const events = getEventsForPerson(db, persons[0].id);
    const adop = events.find(e => e.event_type === 'adoption')!;
    expect(adop).toBeDefined();
  });

  it('imports TITL on INDI as occupation event', () => {
    const ged = `
0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME Britta /Nilsson/
1 TITL Sömmerska, bondmora
0 TRLR`;
    importGedcom(db, ged);
    const persons = listPersons(db);
    const events = getEventsForPerson(db, persons[0].id);
    const occ = events.find(e => e.event_type === 'occupation')!;
    expect(occ.description).toBe('Sömmerska, bondmora');
  });

  it('resolves top-level NOTE xref to content', () => {
    const ged = `
0 HEAD
1 GEDC
2 VERS 5.5.1
0 @N1@ NOTE This is a shared note.
0 @I1@ INDI
1 NAME Olof /Berg/
1 NOTE @N1@
0 TRLR`;
    importGedcom(db, ged);
    const persons = listPersons(db);
    expect(persons[0].notes).toBe('This is a shared note.');
  });

  it('roundtrips engagement via GEDCOM export and re-import', () => {
    const person = createPerson(db, { given_name: 'Test', surname: 'Person' });
    createEvent(db, { event_type: 'engagement', date_type: 'exact', date_value: '2020-01-01', date_original: '2020' });
    // ... add participant, export, verify ENGA tag present
    const ged = exportGedcom(db);
    expect(ged).toContain('1 ENGA');
  });
});
```

---

## Import Report

After import, display a summary of what was and wasn't imported. This surfaces unrecognised tags from the specific file so the user knows what to expect.

### What to report

**Successfully imported** (counts):
- Persons, families/couples, events by type (birth, death, marriage, engagement, adoption, …)
- Citations, places, sources

**Skipped / not imported**:
- `OBJE` records — deferred until Media Attachments feature
- Any unrecognised level-1 INDI or FAM tags not in the known tag set
- Count of NOTE xrefs that couldn't be resolved

### Implementation

The importer function currently returns `void`. Change it to return an `ImportReport` object:

```typescript
interface ImportReport {
  persons: number;
  families: number;
  events: Record<string, number>;   // event_type → count
  sources: number;
  places: number;
  citations: number;
  skipped: { tag: string; count: number }[];  // unrecognised tags
  warnings: string[];                          // e.g. "12 OBJE records skipped (media not yet supported)"
}
```

During import, accumulate skipped tag counts. For OBJE specifically, add a fixed warning string. For any other level-1 INDI/FAM tag not handled, push to the skipped array.

### UI display

The import is triggered from the Electron main process (`ipc.ts`, channel `gedcom:import`). Currently it returns `{ success: boolean, error?: string }`. Extend it to return the full `ImportReport` on success.

In the renderer (likely `DatabaseView.vue` or wherever the import button lives), after import succeeds, show a modal or expandable result panel:

```
Import complete
───────────────────────────────
22,221 persons
7,700 families
51,234 events (birth: 18,927, death: 7,591, marriage: 6,776, …)
1 source, 28,000 places, 45,000 citations

Skipped:
• 11,976 OBJE (media not yet supported)
• 4 unrecognised tags: _HOLGER_X (3), _CUSTOM (1)
```

### Exporter

No change to export needed for the report — it's import-only.

---

## Files Changed

- `src/renderer/constants/eventTypes.ts` — add `'engagement'`, `'adoption'` to EVENT_TYPE_VALUES
- `src/renderer/locales/sv.ts` — add Swedish labels
- `src/renderer/locales/en.ts` — add English labels
- `src/gedcom/importer.ts` — ENGA/ADOP in PERSON_EVENT_TAGS; CAUS extraction; TYPE subtag; TITL handler; noteMap for top-level NOTE resolution; accumulate `ImportReport`
- `src/gedcom/exporter.ts` — ENGA/ADOP in EVENT_TYPE_TO_TAG
- `src/main/ipc.ts` — `gedcom:import` returns `ImportReport` on success
- Renderer import UI — show result modal/panel with counts and skipped tags
- `tests/unit/gedcom.test.ts` — 6 new tests + ImportReport shape test

---

## Tasks

- [x] Add `'engagement'` and `'adoption'` to `EVENT_TYPE_VALUES` in eventTypes.ts
- [x] Add Swedish + English i18n labels for both types
- [x] Add `ENGA: 'engagement'` and `ADOP: 'adoption'` to `PERSON_EVENT_TAGS` in importer
- [x] Extract `CAUS` in `importEventNode` → `event.cause`
- [x] Extract `TYPE` subtag in `importEventNode` → prepend to description
- [x] Add `TITL` handler in INDI processing block → `'occupation'` event
- [x] Build `noteMap` in first pass; add `resolveNote` helper; update all NOTE reads
- [x] Add `engagement: 'ENGA'` and `adoption: 'ADOP'` to `EVENT_TYPE_TO_TAG` in exporter
- [x] Tests: CAUS import
- [x] Tests: ENGA import with TYPE
- [x] Tests: ADOP import
- [x] Tests: TITL import
- [x] Tests: top-level NOTE xref resolution
- [x] Tests: engagement roundtrip export
- [x] Change importer return type to `ImportReport`; accumulate counts and skipped tags
- [x] Update `gedcom:import` IPC handler to return report on success
- [x] Renderer: show import result modal/panel with counts and skipped-tag list
- [x] Tests: ImportReport shape (counts correct, OBJE in skipped)
- [x] Run `npm test` — all tests pass
- [x] Commit + version bump (patch)
