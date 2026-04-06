#!/usr/bin/env python3
"""
ElevateDB (.EDBTbl) binary reader for OurKind/Holger genealogy databases.

Usage:
    python3 EDBExtractor.py --db-path /path/to/ourkind_V8

Outputs NDJSON to stdout — one JSON object per row, with a "type" field
identifying the source table. Errors go to stderr.

Record format (reverse-engineered from binary analysis of Perstab.EDBTbl):
  - Fixed-size records, table-specific record size
  - 17-byte record header: flags(5) + physical_seq(4) + row_id(4) + pad(4)
  - Field data after header: tagged UTF-16 LE strings
  - String field slot: 0x01 <u16_len_le> <utf16_chars> [padding zeros]
  - Null/absent field slot: starts with 0x00 or tag=0x01 with len=0

Confirmed offsets for Perstab (record_size=2632):
  fornamn=37, patronym=200, efternamn=363, konkod=526, fodat=531,
  dopdat=574, fodort=617, fodfs=780, dodat=943, begdat=986,
  dodort=1029, dodfs=1192, dodors=1355, yrke=1518, hemort=1681,
  hemfs=1844, anm1=2007, anm2=2170
"""
import sys
import os
import json
import struct
import argparse

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

EDB_DATA_OFFSET = 0x4000  # All EDBTbl/EDBBlb data sections start here

# Record header layout (same for all tables):
#   bytes 0-4:  status flags (0x00 = active, other = deleted/overflow)
#   bytes 5-8:  physical sequence counter (u32 LE)
#   bytes 9-12: table RowID (u32 LE) — this is the user-visible __RowID
#   bytes 13-16: reserved/padding
HEADER_SIZE = 17
ROWID_OFFSET = 9  # within record header

# Perstab field offsets and slot sizes (offset from record start, slot_bytes)
# Slot format: 1 byte tag + 2 bytes u16 length + length*2 bytes UTF-16 LE + zeros to fill slot
# String fields: slot_bytes = 1 + 2 + max_chars * 2 (max_chars determined empirically)
PERSTAB_RECORD_SIZE = 2632

PERSTAB_FIELDS = {
    # Column name: (offset_from_record_start, slot_bytes)
    # String fields (slot = 1+2+80*2 = 163 bytes, max 80 UTF-16 chars)
    'fornamn':   (37,   163),  # given name
    'patronym':  (200,  163),  # patronym (Svensson style)
    'efternamn': (363,  163),  # surname
    # Sex code (slot = 1+2+1*2 = 5 bytes, max 1 char: 'M' or 'F')
    'konkod':    (526,  5),
    # Date fields (slot = 1+2+20*2 = 43 bytes, max 20 chars, ISO format YYYY-MM-DD)
    'fodat':     (531,  43),   # birth date
    'dopdat':    (574,  43),   # baptism date
    # Place fields (163 bytes, max 80 chars)
    'fodort':    (617,  163),  # birth place
    'fodfs':     (780,  163),  # birth parish (födelseförsamling)
    # More dates (43 bytes)
    'dodat':     (943,  43),   # death date
    'begdat':    (986,  43),   # burial date
    # More places (163 bytes)
    'dodort':    (1029, 163),  # death place
    'dodfs':     (1192, 163),  # death parish
    'dodors':    (1355, 163),  # cause of death (dödsorsak)
    # Occupation and home (163 bytes)
    'yrke':      (1518, 163),  # occupation
    'hemort':    (1681, 163),  # home parish (hemort/hemförsamling)
    'hemfs':     (1844, 163),  # home parish full
    # Inline notes (163 bytes, max 80 chars each)
    'anm1':      (2007, 163),  # annotation 1
    'anm2':      (2170, 163),  # annotation 2
}

# Vigtab (vital/couple events) — columns: __RowID, vigdat, vigort, vigfs,
# slutdat, eventtyp, vigdatkod, slutdatkod, status
# Person linkage is stored in the index file (.EDBIdx), not in the table data.
# Record size determined by: 4,786,128 data bytes / 648 = 7,385.7 (not exact).
# Vigtab linkage to persons requires decoding the EDBIdx which is deferred.
# For now we emit Vigtab rows with their event data but no person FK.
VIGTAB_RECORD_SIZE = None  # Not yet determined — skipped in MVP

# Anmtab (annotations / long notes) — columns: __RowID, fktabell, anmtext, status
# Record size = 49 bytes, blob pointers into Anmtab.EDBBlb
ANMTAB_RECORD_SIZE = 49

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def read_u32(data: bytes, pos: int) -> int:
    return struct.unpack_from('<I', data, pos)[0]


def read_str_field(data: bytes, rec_start: int, offset: int) -> str | None:
    """
    Read a tagged UTF-16 LE string field at rec_start + offset.

    Returns:
        None  — field is absent (tag != 0x01)
        ''    — field is present but empty (length == 0)
        str   — decoded UTF-16 LE string
    """
    pos = rec_start + offset
    if pos >= len(data):
        return None
    tag = data[pos]
    if tag != 0x01:
        return None  # null / absent
    length = struct.unpack_from('<H', data, pos + 1)[0]
    if length == 0:
        return ''
    byte_count = length * 2
    end = pos + 3 + byte_count
    if end > len(data):
        return None
    return data[pos + 3:end].decode('utf-16-le', errors='replace')


def is_active_record(data: bytes, rec_start: int) -> bool:
    """
    Return True if the record is not deleted.
    Active records have status bytes (0-4) all zero.
    """
    return all(b == 0 for b in data[rec_start:rec_start + 5])


# ---------------------------------------------------------------------------
# Perstab reader
# ---------------------------------------------------------------------------

def read_perstab(path: str) -> list[dict]:
    """Read all active person records from Perstab.EDBTbl."""
    with open(path, 'rb') as f:
        data = f.read()

    data_section = data[EDB_DATA_OFFSET:]
    record_size = PERSTAB_RECORD_SIZE
    n_records = len(data_section) // record_size

    log(f"Perstab: {len(data):,} bytes, {n_records:,} records")

    rows = []
    skipped = 0

    for i in range(n_records):
        rec_start = i * record_size

        if not is_active_record(data_section, rec_start):
            skipped += 1
            continue

        row_id = read_u32(data_section, rec_start + ROWID_OFFSET)
        if row_id == 0:
            skipped += 1
            continue

        row: dict = {'__RowID': row_id}

        for col, (offset, _slot) in PERSTAB_FIELDS.items():
            val = read_str_field(data_section, rec_start, offset)
            if val:  # omit None and empty strings to keep NDJSON compact
                row[col] = val

        rows.append(row)

    log(f"Perstab: {len(rows):,} active rows, {skipped:,} skipped")
    return rows


# ---------------------------------------------------------------------------
# Vigtab reader (event date/place only — person linkage deferred)
# ---------------------------------------------------------------------------

def read_vigtab(path: str) -> list[dict]:
    """
    Read vital/marriage event records from Vigtab.EDBTbl.

    Person linkage (FK to Perstab) is stored in the .EDBIdx index and
    is not yet decoded. Rows are emitted with their date/place data only.
    The transform layer can correlate via the Vigtab RowID if needed.
    """
    with open(path, 'rb') as f:
        data = f.read()

    data_section = data[EDB_DATA_OFFSET:]

    # Vigtab record size is not cleanly determined yet.
    # From empirical analysis: dates appear at fixed offset 42 within records.
    # Attempt sizes that produce a clean record count from the data section.
    data_bytes = len(data_section)
    record_size = None
    for candidate in range(200, 1500):
        if data_bytes % candidate == 0:
            # Quick sanity: check that offset 42 in record 0 looks like a date tag
            if len(data_section) > 45 and data_section[42] == 0x01:
                n = data_bytes // candidate
                if 1000 < n < 50000:
                    record_size = candidate
                    break

    if record_size is None:
        log('Vigtab: could not determine record size — skipping')
        return []

    n_records = data_bytes // record_size
    log(f"Vigtab: {len(data):,} bytes, record_size={record_size}, {n_records:,} records")

    # Vigtab field offsets (to be confirmed; date at 42 is empirically verified)
    # Columns: __RowID, vigdat, vigort, vigfs, slutdat, eventtyp, vigdatkod, slutdatkod, status
    VIGTAB_DATE_OFFSET = 42   # vigdat (marriage date)

    rows = []
    for i in range(n_records):
        rec_start = i * record_size

        if not is_active_record(data_section, rec_start):
            continue

        row_id = read_u32(data_section, rec_start + ROWID_OFFSET)
        if row_id == 0:
            continue

        # The two u32 values in the header bytes 5-12 appear to be person RowIDs
        # for the two partners. This needs further validation.
        person1_id = read_u32(data_section, rec_start + 5)
        person2_id = read_u32(data_section, rec_start + 9)

        row: dict = {
            '__RowID': row_id,
            '__person1_id': person1_id,
            '__person2_id': person2_id,
        }

        vigdat = read_str_field(data_section, rec_start, VIGTAB_DATE_OFFSET)
        if vigdat:
            row['vigdat'] = vigdat

        # vigort (marriage place) is likely at offset 42 + 43 = 85
        vigort = read_str_field(data_section, rec_start, 85)
        if vigort:
            row['vigort'] = vigort

        rows.append(row)

    log(f"Vigtab: {len(rows):,} active rows")
    return rows


# ---------------------------------------------------------------------------
# Anmtab reader (inline note text only — blob content deferred)
# ---------------------------------------------------------------------------

def read_anmtab(path: str) -> list[dict]:
    """
    Read annotation metadata from Anmtab.EDBTbl.

    The actual rich-text content is in Anmtab.EDBBlb (30 MB).
    Blob decoding is deferred; for now only the FK to Perstab is extracted.
    """
    with open(path, 'rb') as f:
        data = f.read()

    data_section = data[EDB_DATA_OFFSET:]
    record_size = ANMTAB_RECORD_SIZE
    n_records = len(data_section) // record_size

    log(f"Anmtab: {len(data):,} bytes, {n_records:,} records")

    # Anmtab header: same 17-byte structure as Perstab.
    # fktabell (FK to Perstab.__RowID) is stored at a fixed offset after the header.
    # From binary analysis: the FK appears at header bytes 5-8 (same position as
    # the physical sequence counter in Perstab — but here it holds the person ID).
    # bytes 5-8 = person RowID, bytes 9-12 = Anmtab own RowID
    ANMTAB_PERSON_ID_OFFSET = 5   # u32 LE within record header

    rows = []
    skipped = 0
    for i in range(n_records):
        rec_start = i * record_size

        if not is_active_record(data_section, rec_start):
            skipped += 1
            continue

        row_id = read_u32(data_section, rec_start + ROWID_OFFSET)
        person_id = read_u32(data_section, rec_start + ANMTAB_PERSON_ID_OFFSET)

        if row_id == 0 or person_id == 0:
            skipped += 1
            continue

        rows.append({'__RowID': row_id, 'fktabell': person_id})

    log(f"Anmtab: {len(rows):,} active rows, {skipped:,} skipped")
    return rows


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def log(msg: str) -> None:
    print(msg, file=sys.stderr)


def emit(obj: dict) -> None:
    print(json.dumps(obj, ensure_ascii=False))


def main() -> None:
    parser = argparse.ArgumentParser(description='Extract OurKind ElevateDB tables to NDJSON')
    parser.add_argument('--db-path', required=True,
                        help='Path to the OurKind database directory (containing *.EDBTbl)')
    args = parser.parse_args()

    db_path = args.db_path
    if not os.path.isdir(db_path):
        log(f'ERROR: --db-path is not a directory: {db_path}')
        sys.exit(1)

    def tbl(name: str) -> str:
        return os.path.join(db_path, name)

    # --- Perstab ---
    perstab_path = tbl('Perstab.EDBTbl')
    if not os.path.exists(perstab_path):
        log(f'ERROR: Perstab.EDBTbl not found in {db_path}')
        sys.exit(1)

    persons = read_perstab(perstab_path)
    for row in persons:
        emit({'type': 'perstab', **row})

    # --- Vigtab ---
    vigtab_path = tbl('Vigtab.EDBTbl')
    if os.path.exists(vigtab_path):
        for row in read_vigtab(vigtab_path):
            emit({'type': 'vigtab', **row})
    else:
        log('Vigtab.EDBTbl not found — skipping couple events')

    # --- Anmtab (metadata only, blobs deferred) ---
    anmtab_path = tbl('Anmtab.EDBTbl')
    if os.path.exists(anmtab_path):
        for row in read_anmtab(anmtab_path):
            emit({'type': 'anmtab', **row})
    else:
        log('Anmtab.EDBTbl not found — skipping notes')

    log('Done.')


if __name__ == '__main__':
    main()
