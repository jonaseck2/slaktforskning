# Plan: GEDCOM Media Import/Export

## Depends On
**Media Attachments feature** (`.claude/plans/2026-04-04-media.md`) must be fully implemented first:
- `media` table with `is_missing` column must exist
- `createMedia`, `addMediaLink`, `getMediaForEntity` API functions must be available via IPC
- `media:getFilePath` IPC channel must exist (needed for export to resolve absolute paths)

---

## Context

GEDCOM 5.5.1 carries media references via `OBJE` records. The OurKind test file contains ~12,000 such references, all silently dropped by the current importer. This plan wires OBJE into the existing media layer.

GEDCOM media appears in two forms:

**Inline OBJE** (HOLGER, OurKind, most 5.5.1 exporters — used in test file):
```
1 OBJE
2 FORM JPG
2 FILE C:\OurKind\Media\P2P\photo.jpg
2 TITL Portrait 1923
2 NOTE Caption text here.
3 CONT Second caption line.
```

**Top-level + reference** (standard 5.5.1, GEDCOM 7.0):
```
0 @M1@ OBJE
1 FILE /path/to/photo.jpg
1 FORM JPG
1 TITL Portrait
0 @I1@ INDI
...
1 OBJE @M1@
```

Both patterns must be handled.

---

## Data Model

No new tables needed. Uses the existing `media` + `media_links` tables.

`file_ref` stores the path verbatim from the FILE tag. Since GEDCOM paths from foreign tools are typically Windows absolute paths pointing to a machine we don't have access to, all imported media will be marked `is_missing = 1`. The user can later re-link files through the UI once the Media feature is live.

`entity_type` mapping for `media_links`:
| GEDCOM context | entity_type |
|---|---|
| Under INDI | `person` |
| Under FAM | `relationship` |
| Under an event node | `event` |

---

## Import Changes (`src/gedcom/importer.ts`)

### Pass 1 — Top-level OBJE records
Before processing INDI/FAM, scan for `0 @Mx@ OBJE` top-level records. Build an `objeMap: Map<string, string>` from GEDCOM xref → internal media UUID.

For each top-level OBJE node:
```typescript
const file = getChild(node, 'FILE')?.value ?? '';
const form = getChild(node, 'FORM')?.value ?? null;
const titl = getChild(node, 'TITL')?.value ?? null;
const note = getChild(node, 'NOTE')?.value ?? '';
const media = createMedia(db, {
  file_ref: file || null,
  title: titl ?? file,
  format: form,
  notes: note || null,
  is_printable: false,
  is_missing: 1,
});
objeMap.set(node.xref!, media.id);
```

### Inline OBJE helper
```typescript
function importObjeNode(
  db: Database,
  objeNode: GedcomNode,
  objeMap: Map<string, string>,
): string | null {
  // Reference to top-level record: `1 OBJE @M1@`
  if (objeNode.value?.startsWith('@')) {
    return objeMap.get(objeNode.value) ?? null;
  }
  // Inline embedded OBJE
  const file = getChild(objeNode, 'FILE')?.value ?? '';
  const form = getChild(objeNode, 'FORM')?.value ?? null;
  const titl = getChild(objeNode, 'TITL')?.value ?? null;
  const note = getChild(objeNode, 'NOTE')?.value ?? '';
  const media = createMedia(db, {
    file_ref: file || null,
    title: titl ?? file,
    format: form,
    notes: note || null,
    is_printable: false,
    is_missing: 1,
  });
  return media.id;
}
```

### INDI processing — after person events loop
```typescript
for (const objeNode of getChildren(node, 'OBJE')) {
  const mediaId = importObjeNode(db, objeNode, objeMap);
  if (mediaId) addMediaLink(db, { media_id: mediaId, entity_type: 'person', entity_id: person.id });
}
```

### FAM processing — after family events loop
```typescript
for (const objeNode of getChildren(node, 'OBJE')) {
  const mediaId = importObjeNode(db, objeNode, objeMap);
  if (mediaId) addMediaLink(db, { media_id: mediaId, entity_type: 'relationship', entity_id: couple.id });
}
```

### Event processing — inside `importEventNode`, after citations loop
```typescript
for (const objeNode of getChildren(evNode, 'OBJE')) {
  const mediaId = importObjeNode(db, objeNode, objeMap);
  if (mediaId) addMediaLink(db, { media_id: mediaId, entity_type: 'event', entity_id: event.id });
}
```

Note: `importEventNode` signature gains `objeMap: Map<string, string>` as a parameter.

---

## Export Changes (`src/gedcom/exporter.ts`)

Add `getMediaForEntity` import. After the existing person identifiers block in each INDI:

```typescript
const personMedia = getMediaForEntity(db, 'person', p.id);
for (const m of personMedia) {
  lines.push(`1 OBJE`);
  if (m.format) lines.push(`2 FORM ${m.format}`);
  if (m.file_ref) lines.push(`2 FILE ${m.file_ref}`);
  if (m.title) lines.push(`2 TITL ${m.title}`);
  if (m.notes) lines.push(`2 NOTE ${m.notes}`);
}
```

Similarly after couple metadata in each FAM:
```typescript
const famMedia = getMediaForEntity(db, 'relationship', rel.id);
for (const m of famMedia) {
  lines.push(`1 OBJE`);
  if (m.format) lines.push(`2 FORM ${m.format}`);
  if (m.file_ref) lines.push(`2 FILE ${m.file_ref}`);
  if (m.title) lines.push(`2 TITL ${m.title}`);
  if (m.notes) lines.push(`2 NOTE ${m.notes}`);
}
```

Event media: inside the person/family event loops, after each `2 NOTE` line:
```typescript
const evMedia = getMediaForEntity(db, 'event', ev.id);
for (const m of evMedia) {
  lines.push(`2 OBJE`);
  if (m.format) lines.push(`3 FORM ${m.format}`);
  if (m.file_ref) lines.push(`3 FILE ${m.file_ref}`);
  if (m.title) lines.push(`3 TITL ${m.title}`);
  if (m.notes) lines.push(`3 NOTE ${m.notes}`);
}
```

---

## Schema change

Add `is_missing INTEGER NOT NULL DEFAULT 0` to the `media` table in `src/api/schema.ts`.
Update `createMedia` in `src/api/media.ts` to accept and store `is_missing`.
Update the `Media` type in `src/api/types.ts`.

(This column is also required by the Genney import described in the media plan.)

---

## API change

`createMedia` signature gains `is_missing?: boolean` (default `false`, stored as 0/1).

---

## Tests (`tests/unit/gedcom.test.ts` — add new describe block)

```typescript
describe('GEDCOM media import', () => {
  it('imports inline OBJE on INDI and links to person', () => {
    const ged = `
0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME Bengt /Persson/
1 OBJE
2 FORM JPG
2 FILE C:\\Photos\\bengt.jpg
2 TITL Portrait
2 NOTE Studio photo 1950
0 TRLR`;
    importGedcom(db, ged);
    const persons = listPersons(db);
    expect(persons).toHaveLength(1);
    const media = getMediaForEntity(db, 'person', persons[0].id);
    expect(media).toHaveLength(1);
    expect(media[0].file_ref).toBe('C:\\Photos\\bengt.jpg');
    expect(media[0].format).toBe('JPG');
    expect(media[0].title).toBe('Portrait');
    expect(media[0].is_missing).toBe(1);
  });

  it('imports top-level OBJE referenced from INDI', () => {
    const ged = `
0 HEAD
1 GEDC
2 VERS 5.5.1
0 @M1@ OBJE
1 FILE /photos/portrait.png
1 FORM PNG
1 TITL Family photo
0 @I1@ INDI
1 NAME Anna /Svensson/
1 OBJE @M1@
0 TRLR`;
    importGedcom(db, ged);
    const persons = listPersons(db);
    const media = getMediaForEntity(db, 'person', persons[0].id);
    expect(media).toHaveLength(1);
    expect(media[0].file_ref).toBe('/photos/portrait.png');
    expect(media[0].is_missing).toBe(1);
  });

  it('roundtrips person media through export and re-import', () => {
    const person = createPerson(db, { given_name: 'Test', surname: 'Person' });
    createMedia(db, { title: 'Photo', file_ref: '/test.jpg', format: 'JPG', is_missing: false });
    // ... add media link, export, re-import, verify
  });
});
```

---

## Files Changed

- `src/api/types.ts` — add `is_missing: number` to `Media`
- `src/api/schema.ts` — add `is_missing` column to media DDL
- `src/api/media.ts` — `createMedia` accepts `is_missing`
- `src/gedcom/importer.ts` — top-level OBJE pass, `importObjeNode` helper, INDI/FAM/event OBJE loops
- `src/gedcom/exporter.ts` — emit OBJE blocks for person/family/event media
- `tests/unit/gedcom.test.ts` — three new tests

---

## Tasks

- [ ] Schema: add `is_missing INTEGER NOT NULL DEFAULT 0` to media table DDL
- [ ] Types: add `is_missing: number` to `Media` type
- [ ] API: update `createMedia` to accept and store `is_missing`
- [ ] Importer: Pass 1 — collect top-level `0 @Mx@ OBJE` records into `objeMap`
- [ ] Importer: add `importObjeNode` helper function
- [ ] Importer: add OBJE loops in INDI, FAM, and `importEventNode`
- [ ] Exporter: emit OBJE blocks for person, family, and event media
- [ ] Tests: inline OBJE on INDI
- [ ] Tests: top-level OBJE reference from INDI
- [ ] Tests: export roundtrip for person media
- [ ] Run `npm test` — all tests pass
- [ ] Commit + version bump (patch)
