# Holger ElevateDB Direct Import Plan

> **Status:** Research complete, ready to implement.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read the OurKind/Holger ElevateDB binary tables directly — no GEDCOM export step — and import persons, notes, and embedded media into Släktforskning. Follow the Genney Docker pattern: Python extractor in a container outputs NDJSON → TypeScript transform.

---

## Research Findings

### Format: ElevateDB (not DBISAM 4)

The files use `.EDBTbl` / `.EDBIdx` / `.EDBBlb` extensions from **ElevateSoft ElevateDB**, a completely different product from older DBISAM (which used `.dat`). Despite the `dbisam.lck` file in the folder, the data format is ElevateDB.

**No existing open-source reader exists** for `.EDBTbl`:
- `pydbisam` — reads `.dat` files only (older DBISAM). Does NOT support `.EDBTbl`.
- `serbod/DBReader` — GUI-only Delphi `.exe`; its "ElevateDB" entry routes `.edb` to MS Exchange/ESE, not `.EDBTbl`. No Linux build.
- ElevateSoft's own EDBManager — Windows-only GUI, requires login to download trial.

**Plan: Pure Python binary reverse-engineering.** We verified the format is readable and partially decoded it by inspecting the actual files in the test data.

### Files in Test Data

Location: `export-import/wetransfer_testmaterial_2026-04-05_1624/HolgerData/data/ourkind_V8/`

| File | Size | Content |
|------|------|---------|
| `Perstab.EDBTbl` | 56 MB | ~22 000 persons |
| `Vigtab.EDBTbl` | 4.6 MB | vital/marriage events |
| `Anmtab.EDBTbl` | 2.1 MB | note metadata |
| `Anmtab.EDBBlb` | **29 MB** | note blob content (rich text — NOT in GEDCOM) |
| `Mediatab.EDBTbl` | 13 MB | media metadata + external file paths |
| `Mediatab.EDBBlb` | **12 MB** | embedded image BLOBs (NOT in GEDCOM) |
| `Citattab.EDBTbl` | 128 B | citations — empty |
| `Kalltab.EDBTbl` | 160 B | sources — empty |
| `EDBDatabase.EDBCat` | 18 KB | **catalog: all table/column definitions** |
| `Eventfil.txt` | 35 B | plaintext event type config |
| `Gruppfil.txt` | 1.5 KB | plaintext group config |

### Column Schemas (extracted from EDBDatabase.EDBCat)

The catalog is UTF-16 LE binary and lists the following columns:

**Perstab** (persons):
`__RowID`, `fornamn`, `patronym`, `efternamn`, `fodat`, `dopdat`, `fodort`, `fodfs`, `dodat`, `begdat`, `dodort`, `dodfs`, `dodors`, `yrke`, `hemort`, `hemfs`, `anm1`, `anm2`, `ttnamn`, `eenamn`, `dopkod`, `begkod`, `konkod`, `fodatkod`, `dopdatkod`, `dodatkod`, `begdatkod`, `markering`, `sortfalt`, `regtid`, `upptid`, `dbid`, `regid`, `uppid`, `status`

**Vigtab** (vital/marriage events):
`__RowID`, `vigdat`, `vigort`, `vigfs`, `slutdat`, `eventtyp`, `vigdatkod`, `slutdatkod`, `status`

**Anmtab** (annotations):
`__RowID`, `fktabell` (FK → Perstab.__RowID), `anmtext` (blob pointer), `status`

**Mediatab** (media):
`__RowID`, `fktabell` (FK → entity), `medianamn`, `filnamn`, `hojd` (height), `bredd` (width), `cantavla`, `canlista`, `cansedel`, `cstamgraf`, `chtml`, `cextra`, `nantavla`, `nanlista`, `nansedel`, `nstamgraf`, `nhtml`, `nextra`, `mextra`, `mediatext`, `status`

**Citattab** (citations — empty):
`__RowID`, `fktabell`, `fktabell2`, `fkfalt`, `notnr`, `citat`, `status`

**Kalltab** (sources — empty):
`__RowID`, `titel`, `korttext`, `namn`, `utgivare`, `startdat`, `slutdat`, `refkod`, `startdatkod`, `slutdatkod`, `regtid`, `upptid`, `dbid`, `regid`, `uppid`, `status`

### Binary Format Observations (from hex analysis)

Both `.EDBCat` and `.EDBTbl` share the same 16-byte magic:
```
8a 56 92 4d 4e 6e 8b 42 c2 20 c2 b3 ad fd 12 74
```
`.EDBTbl` files have a 3-byte prefix before the magic (appears to be version/type byte + 2-byte flags).

**Data section starts at offset 0x4000 (16384 bytes).** Everything before is header/free-page lists (zeros).

Record structure (observed, not yet fully mapped):
- Records begin with a row header containing `__RowID` as a 4-byte integer
- Fields are tagged:
  - Null field: `00 00 00 00 00...` (fixed-width slot, all zeros)
  - String value: `01 <len_u16_le> 00 <len × UTF-16 LE chars>`
  - Single-byte value: `01 01 00 <byte_value> 00`
- All text is UTF-16 LE
- Date values are ISO strings (`1945-03-13`), stored as 10-char UTF-16 strings
- Record size is **fixed per table** — needs to be determined by empirical testing (Phase 1 task)

The Vigtab person-link is not obvious from column names alone. It may be via `__RowID` used as an FK in a separate table, or stored in an index. This needs investigation in Phase 1.

### Value-Add vs GEDCOM

| Data | GEDCOM | ElevateDB | Delta |
|------|--------|-----------|-------|
| Persons (names, sex, dates, places) | ✅ 22 221 INDI | ✅ Perstab | same |
| Notes per person (`anm1`, `anm2`) | ✅ NOTE records | ✅ Anmtab | same-ish |
| **Rich-text annotations (blob)** | ❌ | ✅ Anmtab.EDBBlb (29 MB) | **NEW** |
| **Embedded media images** | ❌ | ✅ Mediatab.EDBBlb (12 MB) | **NEW** |
| Couple/family events | ✅ FAM events | ✅ Vigtab | needs linkage |
| Sources | ❌ empty | ❌ empty | same |
| Citations | ❌ empty | ❌ empty | same |

**Bottom line:** Primary value is the Anmtab blobs (rich notes) and Mediatab blobs (embedded images). This is data the GEDCOM path cannot provide.

---

## Architecture

```
HolgerData/data/ourkind_V8/
  └── *.EDBTbl, *.EDBBlb, EDBDatabase.EDBCat
        │
        ▼  Docker: python:3.12-slim
  src/import/holger/EDBExtractor.py
        │  reads EDBCat → schema
        │  iterates EDBTbl records → UTF-16 LE fields
        │  reads EDBBlb blob offsets → base64 media
        │  outputs NDJSON to stdout
        ▼
  src/import/holger/transform.ts  (TypeScript)
        │  maps Perstab → Person + PersonName
        │  maps Anmtab blobs → notes on persons
        │  maps Mediatab → Media + MediaLink
        ▼
  api/ functions (same as Genney)
```

**Docker image:** `python:3.12-slim` — no dependencies beyond the standard library. No ElevateSoft tools required.

---

## File Map

| File | Change |
|------|--------|
| `src/import/holger/EDBExtractor.py` | **Create** — Python binary reader, outputs NDJSON |
| `src/import/holger/transform.ts` | **Create** — TypeScript transform: EDB rows → api/ calls |
| `src/import/holger/index.ts` | **Modify** — add `runEDB()` path alongside existing GEDCOM path |
| `src/mcp/createServer.ts` | **Modify** — expose `import_holger_edb` tool |
| `src/main/ipc.ts` | **Modify** — add `import:holgerEdbRun` handler |
| `src/preload/index.ts` | **Modify** — expose `window.api.import.holgerEdbRun` |
| `src/renderer/views/ImportExportView.vue` | **Modify** — add EDB import path to Holger section |
| `tests/unit/import-holger-edb.test.ts` | **Create** — unit tests for transform layer |

---

## Task 1: Reverse-engineer record layout (EDBExtractor spike)

This is the highest-risk task. Do it first; all other tasks depend on it.

**Approach:** Write a Python script that cross-validates extracted data against the known GEDCOM (22 000+ persons). Find person "Bengt Gunnar" (visible in hex at 0x4028) and map all fields.

- [ ] **Step 1: Write `EDBExtractor.py` spike** — iterate records starting at 0x4000, try candidate record sizes, find the size where field count and RowID sequence make sense.

```python
#!/usr/bin/env python3
"""ElevateDB EDBTbl reader - spike / investigation script."""
import struct, sys, json

EDB_DATA_OFFSET = 0x4000
EDB_MAGIC = bytes([0x8a, 0x56, 0x92, 0x4d, 0x4e, 0x6e, 0x8b, 0x42,
                   0xc2, 0x20, 0xc2, 0xb3, 0xad, 0xfd, 0x12, 0x74])

def read_u16(data, pos):
    return struct.unpack_from('<H', data, pos)[0]

def read_u32(data, pos):
    return struct.unpack_from('<I', data, pos)[0]

def read_utf16_field(data, pos):
    """Read a tagged field at pos. Returns (value, bytes_consumed)."""
    if data[pos] == 0x00:
        return None, 1  # null indicator
    if data[pos] != 0x01:
        return None, 1  # unknown tag
    # String field: 01 <len_u16_le> 00 <utf16 chars>
    length = read_u16(data, pos + 1)
    end = pos + 3 + length * 2
    text = data[pos + 3:end].decode('utf-16-le', errors='replace')
    return text, 3 + length * 2

def probe_record_size(data, col_count):
    """Try to infer record size from repeated RowID sequence."""
    start = EDB_DATA_OFFSET
    # The first few bytes should be the row header
    # Try sizes from 256 to 4096 in steps of 16
    for rec_size in range(256, 4096, 16):
        ids = []
        pos = start
        for _ in range(5):
            if pos + 8 > len(data):
                break
            # RowID appears to be a u32 at some offset in the record header
            # Try reading u32 at offsets 4,8,12 of each candidate record
            for offset in [4, 8, 12]:
                val = read_u32(data, pos + offset)
                if 1 <= val <= 100000:
                    ids.append(val)
                    break
            pos += rec_size
        if len(ids) == 5 and ids == sorted(ids) and ids[1] == ids[0] + 1:
            return rec_size, ids
    return None, []

if __name__ == '__main__':
    path = sys.argv[1]
    with open(path, 'rb') as f:
        data = f.read()
    
    print(f"File size: {len(data):,} bytes", file=sys.stderr)
    
    # Probe record size
    rec_size, sample_ids = probe_record_size(data, 35)
    print(f"Inferred record size: {rec_size} bytes", file=sys.stderr)
    print(f"Sample RowIDs: {sample_ids}", file=sys.stderr)
    
    if rec_size:
        # Dump first 3 records as raw bytes for field mapping
        for i in range(3):
            pos = EDB_DATA_OFFSET + i * rec_size
            print(json.dumps({
                "record": i,
                "offset": hex(pos),
                "hex": data[pos:pos+rec_size].hex(),
            }))
```

- [ ] **Step 2: Map field offsets for Perstab** — using the dump above and the known column list, determine the byte offset of each field within a record. Check: `fornamn` = "Bengt Gunnar" is at 0x4028, RowID = 0x62 = 98 is at some header offset.

- [ ] **Step 3: Validate with 10 known persons** — cross-reference extracted names/dates against the GEDCOM.

- [ ] **Step 4: Map Vigtab field offsets and person linkage** — Vigtab has no obvious FK column. Check if person RowIDs appear in prefix bytes of Vigtab records (likely RowIDs of the two persons of a couple).

- [ ] **Step 5: Map Anmtab blob pointer** — understand how `fktabell` and blob offset/length are stored in Anmtab records. Verify a note text matches between EDBBlb read and what the GEDCOM NOTE contains.

- [ ] **Step 6: Map Mediatab blob pointer** — same as Anmtab but for image BLOBs. Verify JPEG/PNG magic bytes in the extracted blob data.

---

## Task 2: Build EDBExtractor.py (Docker-ready)

Only start after Task 1 completes.

- [ ] **Step 1: Implement catalog reader** — parse `EDBDatabase.EDBCat` to extract table list + column names, verify against known schema above.

- [ ] **Step 2: Implement Perstab reader** — iterate all records, extract all 35 columns per record, emit NDJSON:
```json
{"table": "PERSTAB", "rows": [{"__RowID": 98, "fornamn": "Bengt Gunnar", "efternamn": "Persson", ...}, ...]}
```

- [ ] **Step 3: Implement Vigtab reader** — extract events with person linkage.

- [ ] **Step 4: Implement Anmtab reader with blob** — read blob offsets from EDBTbl, fetch blob text from EDBBlb, emit note text keyed by person RowID.

- [ ] **Step 5: Implement Mediatab reader with blob** — read blob offsets, emit base64-encoded image data keyed by person RowID.

- [ ] **Step 6: Handle Gruppfil.txt** — parse the plaintext group file (already plain CSV-ish format) and add a `GROUPS` table to NDJSON output.

- [ ] **Step 7: Docker integration** — confirm script runs cleanly inside `python:3.12-slim` with only stdlib. Add invocation to `index.ts` alongside the existing `runDocker()` function.

**Docker command** (follows Genney pattern exactly):
```
docker run --rm \
  -v <workDir>:/work \
  -v <holgerDataDir>:/data:ro \
  python:3.12-slim \
  python3 /work/EDBExtractor.py --db-path /data
```

---

## Task 3: TypeScript transform layer

- [ ] **Step 1: Define `HolgerEdbTables` type** — mirroring the NDJSON structure emitted by EDBExtractor.

- [ ] **Step 2: Write `transformHolgerEdb(db, tables)`** — maps:

| EDB field | Our model |
|-----------|-----------|
| `Perstab.fornamn` + `efternamn` | `PersonName.given_name` + `surname` (type=`birth`) |
| `Perstab.patronym` | `PersonName.given_name` prefix (Swedish: "son av") |
| `Perstab.ttnamn` | `PersonName` (type=`aka`) if non-empty |
| `Perstab.eenamn` | `PersonName` (type=`married`) if non-empty |
| `Perstab.fodat` + `fodatkod` | birth `GenealogyEvent.date_value` + `date_type` |
| `Perstab.dopdat` + `dopdatkod` | baptism event |
| `Perstab.dodat` + `dodatkod` | death event |
| `Perstab.begdat` + `begdatkod` | burial event |
| `Perstab.fodort` + `fodfs` | birth `place_address` (or `findOrCreate`) |
| `Perstab.yrke` | occupation event |
| `Perstab.hemort` + `hemfs` | residence event |
| `Perstab.anm1` + `anm2` | `Person.notes` (short notes inline) |
| `Anmtab.anmtext` (blob) | appended to `Person.notes` |
| `Mediatab` (blob) | `Media` + `MediaLink` |
| `Vigtab` rows | couple or person events (after linkage resolved) |
| `Gruppfil.txt` group | `Group` + `GroupMember` |

**Date type codes** (from `dopkod`, `fodatkod`, etc.) — investigate what values Holger uses. Map to our `date_type` values (`exact`, `about`, `before`, `after`, `between`, `calculated`, `unknown`).

- [ ] **Step 3: Write unit tests** — use in-memory SQLite, feed fixture NDJSON, assert persons + events + media created correctly.

- [ ] **Step 4: Full integration test** — run extractor against real test data, check counts match GEDCOM import counts.

---

## Task 4: Wire into index.ts, IPC, MCP, UI

- [ ] **Step 1: Add `runEDB()` to `src/import/holger/index.ts`** — detects whether user supplied a directory with `EDBDatabase.EDBCat` (EDB path) or a `.ged`/`.zip` (existing GEDCOM path), routes accordingly.

- [ ] **Step 2: IPC handlers** — add `import:holgerEdbRun` channel in `ipc.ts`.

- [ ] **Step 3: Preload** — expose as `window.api.import.holgerEdbRun`.

- [ ] **Step 4: MCP tool** — add `import_holger_edb` tool in `createServer.ts`.

- [ ] **Step 5: UI** — add "Import from HolgerData folder" button in `ImportExportView.vue` Holger section. Show Docker pull progress as per Genney pattern.

---

## Task 5: Documentation

- [ ] Update `CLAUDE.md` MCP tool list with `import_holger_edb`
- [ ] Update `README.md` to mention direct ElevateDB import
- [ ] Update `.claude/PLAN.md` roadmap

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Record size varies between EDB table versions | Medium | High | Probe multiple candidate sizes; fail with clear error |
| Person-Vigtab linkage is indirect | Medium | Medium | Fall back: skip Vigtab until linkage understood |
| Some blob data is encrypted (Blowfish) | Low | Medium | Check `EDBCat` for encryption flags before reading |
| 29 MB Anmtab blob contains binary (not plain UTF-16) | Medium | Low | Detect encoding per blob; fall back to Latin-1 |
| `Mediatab.EDBBlb` images are in a non-standard wrapper | Low | Low | Check JPEG/PNG magic bytes; extract raw if possible |

---

## Test Data

Location confirmed: `export-import/wetransfer_testmaterial_2026-04-05_1624/HolgerData/data/ourkind_V8/`

Known fixture value (for test assertions):
- Person RowID = 98 (`0x62`), given name = `Bengt Gunnar`, birth date = `1945-03-13`, sex = `M`, birth place = `Solna`, parish = `Solna fs (B)`, occupation = `Ideallt arbete, Datakonsult`