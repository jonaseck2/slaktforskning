import type { Database } from 'node-sqlite3-wasm';
import { listPersons } from '../api/persons';
import { listSources } from '../api/sources';
import { listGroups } from '../api/groups';
import type { Place, Citation, Repository, Media } from '../api/types';
// Bulk prefetch — every per-entity lookup the loops below need is fetched
// once and grouped into Maps. Per-row api/ getters inside the persons /
// couples / sources loops are IPC round-trips through the Tauri db-shim and
// are banned by .claude/rules/performance.md.
import { prefetchExportData, mediaEntityKey, type ExportPrefetch } from './export-prefetch';
import type { ExportOptions } from '../api/export_options';
import { applyExportOptions } from '../api/export_options';
import { getDbSetting } from '../api/db_settings';
import { formatGedcomDate, isStandardGedcomDate } from './date';
// T02 GEDCOM-alignment per-concept emitters (stubs; filled by Phase 2 tasks).
// Wired here so the orchestration surface exists — Phase 2 fills function
// bodies without re-touching exporter.ts.
import { emitNotesForEntity, emitSharedNoteRecords, resetNoteXrefs } from './exporters/notes-emitter';
import { emitPersonAssociations } from './exporters/assoc-emitter';
import { emitNegationsForEntity } from './exporters/negation-emitter';
import { emitNameTranslations, emitPlaceTranslations } from './exporters/translations-emitter';
import { emitSourceCoverageEvents } from './exporters/coverage-emitter';

export interface ExportReport {
  persons: number;
  families: number;
  events: number;
  sources: number;
  excluded: {
    category: string;
    count: number;
    reason: string;
  }[];
  /**
   * Per-row disclosure of authored data dropped on export. Added in T03 for
   * the GEDCOM-alignment plan: when a 5.5.1 FAM cannot carry every
   * parent_child link to a child (multi-parent triad — 3+ parents), the
   * extra parent_child rows are dropped and one warning is appended here
   * per dropped row. Empty on a fully-faithful export.
   *
   * Per-version contract: 7.0 emits ASSO ROLE PARENT for extras (lossless,
   * no warning); 5.5.1 has no spec slot, drops + warns (lossy).
   */
  warnings: string[];
}

const EVENT_TYPE_TO_TAG: Record<string, string> = {
  birth: 'BIRT', death: 'DEAT', christening: 'CHR', burial: 'BURI',
  baptism: 'BAPM', confirmation: 'CONF', occupation: 'OCCU',
  residence: 'RESI', education: 'EDUC', emigration: 'EMIG',
  immigration: 'IMMI', naturalization: 'NATU', census: 'CENS',
  probate: 'PROB', will: 'WILL', graduation: 'GRAD', retirement: 'RETI',
  marriage: 'MARR', divorce: 'DIV', engagement: 'ENGA', adoption: 'ADOP',
  // GEDCOM 5.5/5.5.1 standard tags. _SEPR / _MILT are non-standard but
  // widely emitted (FTM, RootsMagic).
  cremation: 'CREM', bar_mitzvah: 'BARM', bas_mitzvah: 'BASM',
  annulment: 'ANUL', marriage_license: 'MARL', separation: '_SEPR',
  ordination: 'ORDN', military: '_MILT',
  // Fact-shaped event types — line value is emitted on the same line as the tag.
  title: 'TITL', religion: 'RELI', description: 'DSCR', fact: 'FACT',
  other: 'EVEN',
};

function capitalizeFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * Emit the `_ADPL` hierarchy block reconstructed from `parent_place_id`.
 *
 * Without this the export emits only the leaf name, and a place stored as
 * Sverige > Gävleborgs län > Valbo > Bäck comes back from a re-import as a
 * single row named 'Bäck' — measured: four rows collapse to one. Rebuilding the
 * block from stored parent links is deterministic derivation, not inference.
 *
 * ArkivDigital-shaped on purpose: `_ADPL` is where the levels came from and
 * where the importer reads them back. Nothing else consumes them.
 */
function emitAdplBlock(
  lines: string[],
  place: Place,
  subLevel: number,
  placeById: Map<string, Place>,
  externalIdsByEntity: Map<string, Array<{ system: string; value: string }>>,
): void {
  const TAG_BY_TYPE: Record<string, string> = {
    country: '_COUNTRY',
    admin1: '_COUNTY',
    parish: '_PARISH',
    locality: '_LOCALITY',
  };

  // Walk leaf → root, guarding against a cycle in parent_place_id.
  const chain: Place[] = [];
  const seen = new Set<string>();
  let cur: Place | undefined = place;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.push(cur);
    cur = cur.parent_place_id ? placeById.get(cur.parent_place_id) : undefined;
  }
  const typed = chain.filter(p => p.place_type && TAG_BY_TYPE[p.place_type]);
  if (typed.length === 0) return;

  lines.push(`${subLevel} _ADPL`);
  // Emit leaf → root, matching the order ArkivDigital writes.
  for (const node of typed) {
    const tag = TAG_BY_TYPE[node.place_type!];
    lines.push(`${subLevel + 1} ${tag} ${node.name}`);
    if (node.place_type === 'parish') {
      // mediaEntityKey joins with a NUL byte, not a space — hand-building the
      // key here silently never matched.
      const parishId = (externalIdsByEntity.get(mediaEntityKey('place', node.id)) ?? [])
        .find(e => e.system === 'arkivdigital.parish');
      if (parishId) lines.push(`${subLevel + 1} _PARISH_AID ${parishId.value}`);
      const harad = /^Härad: (.+)$/m.exec(node.notes ?? '');
      if (harad) lines.push(`${subLevel + 1} _JUDICIAL ${harad[1]}`);
    }
  }
}

/** Emit MAP/ADDR/custom sub-tags under a PLAC tag. subLevel = level of the sub-tags (PLAC_level + 1). */
function emitPlaceSubTags(
  lines: string[],
  place: Place,
  subLevel: number,
  placeById?: Map<string, Place>,
  externalIdsByEntity?: Map<string, Array<{ system: string; value: string }>>,
): void {
  if (placeById && externalIdsByEntity && place.parent_place_id) {
    emitAdplBlock(lines, place, subLevel, placeById, externalIdsByEntity);
  }
  if (place.latitude != null && place.longitude != null) {
    const latDir = place.latitude >= 0 ? 'N' : 'S';
    const lonDir = place.longitude >= 0 ? 'E' : 'W';
    lines.push(`${subLevel} MAP`);
    lines.push(`${subLevel + 1} LATI ${latDir}${Math.abs(place.latitude).toFixed(5)}`);
    lines.push(`${subLevel + 1} LONG ${lonDir}${Math.abs(place.longitude).toFixed(5)}`);
  }
  if (place.street || place.postal_code || place.city || place.country) {
    lines.push(`${subLevel} ADDR`);
    if (place.street) lines.push(`${subLevel + 1} ADR1 ${place.street}`);
    if (place.postal_code) lines.push(`${subLevel + 1} POST ${place.postal_code}`);
    if (place.city) lines.push(`${subLevel + 1} CITY ${place.city}`);
    if (place.country) lines.push(`${subLevel + 1} CTRY ${place.country}`);
  }
  if (place.place_type) lines.push(`${subLevel} _PTYPE ${place.place_type}`);
  if (place.notes) lines.push(`${subLevel} _PNOTES ${place.notes}`);
  if (place.date_from) lines.push(`${subLevel} _DATE_FROM ${place.date_from}`);
  if (place.date_to) lines.push(`${subLevel} _DATE_TO ${place.date_to}`);
  // Always write _PLAC_ID so the importer can deduplicate on re-import
  lines.push(`${subLevel} _PLAC_ID ${place.id}`);
}

/**
 * Emit a SOUR citation block at the given base level (2 for event/name citations,
 * 1 for person/fam/place). `hostKind` plus `version` decide how transcription is
 * carried so that it round-trips on every host kind under at least one version.
 *
 * Carriers, by version × host:
 *   - event / name       → standard DATA/TEXT under SOUR (lossless under both
 *                          5.5.1 and 7.0 — the importer reads DATA/TEXT in
 *                          phaseEvents and the NAME-level citation loop).
 *   - person / family /  → custom `_TRANS` sub-tag under SOUR, v7.0 only. The
 *     place                non-event/name citation phases of the importer do
 *                          not read DATA/TEXT back, so transcription would
 *                          otherwise drop. Under 5.5.1 we still skip — see the
 *                          gedcom_fidelity_registry entry for the rationale
 *                          (third-party 5.5.1 parsers are stricter about
 *                          unknown sub-tags inside SOUR cites).
 *
 * Option A is intentional: we emit `_TRANS` ONLY for non-event/non-name hosts
 * under 7.0 — never alongside DATA/TEXT, and never under 5.5.1. That keeps the
 * file minimal and removes any "which one wins on import" ambiguity.
 */
function emitCitationBlock(
  lines: string[],
  cit: Citation,
  srcXr: string,
  baseLevel: number,
  version: '5.5.1' | '7.0',
  hostKind: 'event' | 'name' | 'person' | 'relationship' | 'place',
): void {
  lines.push(`${baseLevel} SOUR ${srcXr}`);
  if (cit.page) lines.push(`${baseLevel + 1} PAGE ${cit.page}`);
  lines.push(`${baseLevel + 1} QUAY ${cit.confidence}`);
  if (cit.transcription) {
    if (hostKind === 'event' || hostKind === 'name') {
      // Standard DATA/TEXT — already round-trips on both versions.
      lines.push(`${baseLevel + 1} DATA`, `${baseLevel + 2} TEXT ${cit.transcription}`);
    } else if (version === '7.0') {
      // Custom _TRANS — v7.0 carrier for person / relationship / place hosts.
      // Multi-line transcription splits across CONT continuation so embedded
      // newlines round-trip byte-identical (e.g. parish-record blocks with
      // multiple witness lines).
      const tLines = cit.transcription.split(/\r?\n/);
      lines.push(`${baseLevel + 1} _TRANS ${tLines[0]}`);
      for (let i = 1; i < tLines.length; i++) {
        lines.push(`${baseLevel + 2} CONT ${tLines[i]}`);
      }
    }
    // 5.5.1 + non-event/name: transcription is intentionally dropped — see
    // gedcom_fidelity_registry.ts citations.transcription v551 entry.
  }
  if (cit.notes) lines.push(`${baseLevel + 1} NOTE ${cit.notes}`);
  if (cit.date_accessed) lines.push(`${baseLevel + 1} _ACCESSED ${cit.date_accessed}`);
}

/** Emit inline OBJE blocks for all media linked to an entity. baseLevel = 1 for INDI/FAM, 2 for events. */
function emitMediaBlocks(lines: string[], pre: ExportPrefetch, entityType: 'person' | 'relationship' | 'event' | 'source', entityId: string, baseLevel: number): void {
  const mediaItems = pre.mediaByEntity.get(mediaEntityKey(entityType, entityId)) ?? [];
  for (const m of mediaItems) {
    lines.push(`${baseLevel} OBJE`);
    if (m.format) lines.push(`${baseLevel + 1} FORM ${m.format}`);
    if (m.file_ref) lines.push(`${baseLevel + 1} FILE ${m.file_ref}`);
    if (m.title) lines.push(`${baseLevel + 1} TITL ${m.title}`);
    if (m.notes) lines.push(`${baseLevel + 1} NOTE ${m.notes}`);
  }
}

/**
 * Notes round-trip helper. The importer prepends `TYPE: <value>` as the first
 * line of notes when the source GEDCOM had a `2 TYPE` sub-tag, so the exporter
 * can recover and re-emit the TYPE without a dedicated DB column. Returns the
 * recovered TYPE (if any) and the remaining notes with the marker stripped.
 */
function extractGedcomTypeFromNotes(notes: string): { type: string | null; rest: string } {
  if (!notes) return { type: null, rest: '' };
  const lines = notes.split(/\r?\n/);
  const first = lines[0] ?? '';
  const m = first.match(/^TYPE: (.+)$/);
  if (!m) return { type: null, rest: notes };
  // Strip the TYPE line and the optional blank separator line that the
  // importer inserts between TYPE and the user-authored note body.
  let consumed = 1;
  if (lines[1] === '') consumed = 2;
  const rest = lines.slice(consumed).join('\n');
  return { type: m[1], rest };
}

function emitDate(
  lines: string[], date_type: string, date_value: string | null,
  date_value_end: string | null, date_original: string, level: number,
  version: '5.5.1' | '7.0',
): void {
  const dateStr = formatGedcomDate(date_type, date_value, date_value_end, date_original);
  if (!dateStr) return;
  if (version === '7.0' && date_original && !isStandardGedcomDate(date_original)) {
    lines.push(`${level} DATE`);
    lines.push(`${level + 1} PHRASE ${date_original}`);
  } else {
    lines.push(`${level} DATE ${dateStr}`);
  }
}

/**
 * Optional progress reporting. Matches the importer's convention
 * (`src/import/gedcom/import-core.ts` — `onProgress?: (msg: string) => void`):
 * a human-readable status string emitted at phase boundaries and periodically
 * inside the slow person loop. Forwarded to the renderer so the export
 * progress bar can advance mid-export instead of appearing frozen. Optional —
 * omitting it is a no-op with zero behaviour change.
 */
export type ExportProgressFn = (msg: string) => void;

export async function exportGedcom(
  db: Database,
  version: '5.5.1' | '7.0' = '5.5.1',
  exportOptions?: ExportOptions,
  onProgress?: ExportProgressFn,
): Promise<{ ged: string; report: ExportReport }> {
  const lines: string[] = [];

  // Resolve export options into a filtered dataset descriptor
  const filterResult = exportOptions ? await applyExportOptions(db, exportOptions) : null;
  const allowedPersonIds = filterResult?.personIds ?? null; // null = include all
  const includeMedia = filterResult?.includeMedia ?? true;
  const includeNotes = filterResult?.includeNotes ?? true;
  const includeSources = filterResult?.includeSources ?? true;

  // One bulk fetch per table, grouped into Maps — replaces per-entity api/
  // getters inside the persons / couples / sources / groups loops below.
  const pre = await prefetchExportData(db, { includeSources, includeMedia, includeNotes });

  if (version === '7.0') {
    lines.push('0 HEAD', '1 GEDC', '2 VERS 7.0');
  } else {
    lines.push('0 HEAD', '1 GEDC', '2 VERS 5.5.1', '1 CHAR UTF-8');
  }

  // T09: HEAD originating-app preservation. If a previous import captured
  // metadata from the source file's HEAD (SOUR/NAME/CORP/VERS/LANG/COPR),
  // re-emit it as a custom `1 _ORIG_SOUR <json>` extension line on the HEAD
  // block so a subsequent round-trip can recover it. Both versions accept
  // unknown extension tags (`_` prefix) — neither spec rejects them.
  // Emitted as a single JSON line; round-trip parser reads it back via the
  // header-metadata phase. See src/import/gedcom/phases/header-metadata.ts.
  const headerMetadataJson = await getDbSetting(db, 'header_metadata');
  if (headerMetadataJson && headerMetadataJson.trim()) {
    // Strip newlines defensively — `_ORIG_SOUR` is a single-line tag.
    const oneLine = headerMetadataJson.replace(/[\r\n]+/g, ' ');
    lines.push(`1 _ORIG_SOUR ${oneLine}`);
  }

  // ── SUBM: write the researcher (genealogist filing this file) ─────────────
  // Per GEDCOM spec, SUBM identifies the submitter — the person filing the
  // file — not the proband / tree subject. The proband is tracked separately
  // via `default_person_id` (used for startup nav and import-time matching);
  // it has no native GEDCOM 5.5.1 tag and is not exported here.
  const researcherName = await getDbSetting(db, 'researcher_name');
  if (researcherName && researcherName.trim()) {
    const researcherAddress = await getDbSetting(db, 'researcher_address');
    const researcherPhone   = await getDbSetting(db, 'researcher_phone');
    const researcherEmail   = await getDbSetting(db, 'researcher_email');
    lines.push('1 SUBM @SUBM@');
    lines.push(`0 @SUBM@ SUBM`);
    lines.push(`1 NAME ${researcherName.trim()}`);
    if (researcherAddress && researcherAddress.trim()) {
      // GEDCOM ADDR supports continuation lines via CONT — split on newline.
      const addrLines = researcherAddress.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      if (addrLines.length > 0) {
        lines.push(`1 ADDR ${addrLines[0]}`);
        for (let i = 1; i < addrLines.length; i++) {
          lines.push(`2 CONT ${addrLines[i]}`);
        }
      }
    }
    if (researcherPhone && researcherPhone.trim()) lines.push(`1 PHON ${researcherPhone.trim()}`);
    if (researcherEmail && researcherEmail.trim()) lines.push(`1 EMAIL ${researcherEmail.trim()}`);
  } else {
    // Fall back to default_person_id for backwards-compat with files that
    // expect a SUBM NAME (e.g. Holger imports). This preserves round-trip
    // behaviour for users who haven't filled in researcher info yet.
    const defaultPersonId = await getDbSetting(db, 'default_person_id');
    if (defaultPersonId) {
      const names = pre.namesByPersonId.get(defaultPersonId) ?? [];
      const primary = names.find(n => n.preferred_name) ?? names[0];
      if (primary) {
        const fullName = [primary.given_name, primary.surname].filter(Boolean).join(' ');
        lines.push('1 SUBM @SUBM@');
        lines.push(`0 @SUBM@ SUBM`);
        lines.push(`1 NAME ${fullName}`);
      }
    }
  }

  // ── Repositories ───────────────────────────────────────────────────────────
  onProgress?.('Exporting sources…');
  const sources = includeSources ? await listSources(db) : [];
  // Collect all repositories used by any source, deduplicated by repo id.
  // Per-source rows come from the prefetched source_repositories join.
  const repoXref = new Map<string, string>();
  const allRepos = new Map<string, Repository>();
  for (const src of sources) {
    for (const repo of pre.reposBySourceId.get(src.id) ?? []) {
      if (!allRepos.has(repo.id)) {
        allRepos.set(repo.id, repo);
      }
    }
  }
  let repoCounter = 0;
  for (const [repoId, repo] of allRepos) {
    repoCounter++;
    const xr = `@R${repoCounter}@`;
    repoXref.set(repoId, xr);
    lines.push(`0 ${xr} REPO`);
    lines.push(`1 NAME ${repo.name}`);
    // If any address sub-field is present, emit a 1 ADDR parent line so the
    // 2 CITY / POST / STAE / CTRY children are properly scoped (otherwise they
    // would attach to the preceding 1 NAME and the importer would not read them
    // back as repository address fields). When address itself is empty we emit
    // a bare ADDR with empty value as the parent slot.
    if (repo.address || repo.city || repo.postal_code || repo.state || repo.country) {
      lines.push(`1 ADDR ${repo.address ?? ''}`);
      if (repo.city) lines.push(`2 CITY ${repo.city}`);
      if (repo.postal_code) lines.push(`2 POST ${repo.postal_code}`);
      if (repo.state) lines.push(`2 STAE ${repo.state}`);
      if (repo.country) lines.push(`2 CTRY ${repo.country}`);
    }
    if (repo.phone) lines.push(`1 PHON ${repo.phone}`);
    if (repo.email) lines.push(`1 EMAIL ${repo.email}`);
    if (repo.web) lines.push(`1 WWW ${repo.web}`);
    if (repo.notes) lines.push(`1 NOTE ${repo.notes}`);
    // T04: shared notes attached to this repository
    if (includeNotes) await emitNotesForEntity(db, 'repository', repo.id, 1, version, lines, pre.notesByEntity.get(mediaEntityKey('repository', repo.id)) ?? []);
  }

  // ── Sources ────────────────────────────────────────────────────────────────
  const sourceXref = new Map<string, string>();
  // T08: converted from `sources.forEach` to `for-of` so the async
  // `emitSourceCoverageEvents` call below can be awaited (forEach swallows
  // returned promises).
  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    const xr = `@S${i + 1}@`;
    sourceXref.set(src.id, xr);
    lines.push(`0 ${xr} SOUR`);
    if (src.title) lines.push(`1 TITL ${src.title}`);
    if (src.author) lines.push(`1 AUTH ${src.author}`);
    if (src.publication_info) lines.push(`1 PUBL ${src.publication_info}`);
    // T02: legacy `sources.repository` free-text column was dropped — REPO
    // structures are emitted below via structured `source_repositories` joins.
    if (src.url) lines.push(`1 _URL ${src.url}`);
    // ArkivDigital archive pointer. Round-trip only — the app never reads this
    // to make a decision; the importer stores what the file said and the
    // exporter writes it back so the researcher keeps their route to the image.
    for (const ident of pre.externalIdsByEntity.get(mediaEntityKey('source', src.id)) ?? []) {
      if (ident.system === 'arkivdigital') lines.push(`1 _AID ${ident.value}`);
    }
    // source_type is exported as a raw enum string via the custom _STYPE sub-tag.
    // Lossless under both 5.5.1 and 7.0 — the importer reads _STYPE back verbatim,
    // and unknown enum values (e.g. future additions like passenger_list,
    // probate_inventory, genealogist, peerage_register, encyclopedia) flow through
    // automatically because no static enum map gates the value on either side.
    if (src.source_type) lines.push(`1 _STYPE ${src.source_type}`);
    // Source-level free-text fields. Lossless via custom sub-tags — neither
    // GEDCOM 5.5.1 nor 7.0 reserves a standard tag here for the genealogist's
    // own abstract / call-number authored on the source row (`REPO.CALN` is the
    // *repository's* call-number, a different concept on a different table).
    // Long abstracts get split across CONT continuation lines so the value
    // round-trips byte-identical through GEDCOM line-length conventions.
    if (src.abstract) {
      const abstractLines = src.abstract.split(/\r?\n/);
      lines.push(`1 _ABSTRACT ${abstractLines[0]}`);
      for (let i = 1; i < abstractLines.length; i++) {
        lines.push(`2 CONT ${abstractLines[i]}`);
      }
    }
    if (src.call_number) {
      const callLines = src.call_number.split(/\r?\n/);
      lines.push(`1 _CALL ${callLines[0]}`);
      for (let i = 1; i < callLines.length; i++) {
        lines.push(`2 CONT ${callLines[i]}`);
      }
    }
    // Link to structured REPO records (prefetched join rows)
    const linkedRepos = pre.reposBySourceId.get(src.id) ?? [];
    for (const repo of linkedRepos) {
      const repoXr = repoXref.get(repo.id);
      if (repoXr) lines.push(`1 REPO ${repoXr}`);
    }
    // T08: emit SOUR/DATA/EVEN coverage events (lossless under 5.5.1 + 7.0).
    await emitSourceCoverageEvents(db, src.id, 1, version, lines, pre.coverageBySourceId.get(src.id) ?? [], pre.placeById);
    // Rapport 104 (framing B): emit OBJE under SOUR for media→source links so
    // they round-trip. `OBJE` under SOURCE_RECORD is spec-legal in 5.5.1 and 7.0.
    if (includeMedia) emitMediaBlocks(lines, pre, 'source', src.id, 1);
  }

  // T04: reset the SNOTE xref allocator at the top of every export so
  // back-to-back exports do not share state. The top-level SNOTE record
  // block itself is emitted AFTER every per-entity emitNotesForEntity call
  // has run (just before TRLR below) — the xref allocator needs to see
  // every reference before the records can be emitted.
  resetNoteXrefs();

  // ── Persons ────────────────────────────────────────────────────────────────
  onProgress?.('Exporting persons…');
  const allPersons = await listPersons(db);
  const persons = allowedPersonIds
    ? allPersons.filter(p => allowedPersonIds.has(p.id))
    : allPersons;
  // Build the full xref map BEFORE emitting any INDI records so that ASSO blocks
  // that reference persons appearing later in the list resolve correctly.
  const personXref = new Map<string, string>();
  persons.forEach((p, i) => personXref.set(p.id, `@I${i + 1}@`));

  // ── T03 pre-compute: FAM xrefs + orphan-FAM grouping ──────────────────────
  // INDI emission needs FAMC / FAMS pointers that reference FAM xrefs the
  // exporter doesn't allocate until the couples loop runs (further down).
  // Pre-fetch relationships and allocate every FAM xref up front:
  //   - couples → @F1@..@Fc@
  //   - orphan parent_child rows (parent in no couple) → @F(c+1)@..
  // Two collections feed both the INDI block (FAMC / FAMS lines) and the
  // FAM emission block (orphan-FAM body).
  const relationships = pre.allRelationships;
  const couples = relationships.filter(r => {
    if (r.type !== 'couple') return false;
    if (!allowedPersonIds) return true;
    const p1In = r.person1_id ? allowedPersonIds.has(r.person1_id) : false;
    const p2In = r.person2_id ? allowedPersonIds.has(r.person2_id) : false;
    return p1In || p2In;
  });
  // couples → FAM xref. Allocated dense per couple-row position so the
  // existing couples loop below can re-derive the same xref via index.
  const coupleXref = new Map<string, string>();
  couples.forEach((c, i) => coupleXref.set(c.id, `@F${i + 1}@`));

  // ── O(N) index maps — built once, eliminate O(N²/N³) inner loops ──────────
  // personsInAnyCouple / couplesByPersonId: O(couples)
  const personsInAnyCouple = new Set<string>();
  const couplesByPersonId = new Map<string, typeof couples>();
  for (const c of couples) {
    for (const pid of [c.person1_id, c.person2_id]) {
      if (!pid) continue;
      personsInAnyCouple.add(pid);
      const cs = couplesByPersonId.get(pid) ?? []; cs.push(c); couplesByPersonId.set(pid, cs);
    }
  }

  // Orphan parent_child rows: a parent whose person1_id is in NO couple,
  // AND whose link to the child is not already representable via a couple
  // FAM (the multi-parent triad case — see below). Group by parent so one
  // orphan FAM can carry all children of a never-coupled parent.
  //
  // Multi-parent triad: a 3rd parent of a child whose other two parents
  // ARE in a couple together gets carried on the couple FAM via ASSO
  // ROLE PARENT (7.0) or warning-and-drop (5.5.1). Emitting an orphan
  // single-parent FAM for them in addition would double-link the child
  // and break the per-version classification (the file would imply two
  // distinct FAM contexts for the same child). The right shape is: the
  // couple FAM owns the link on 7.0 via ASSO; on 5.5.1 it's dropped.
  // We exclude such parents from orphan-FAM allocation by checking
  // whether the (parent, child) link's "other parents" form a couple.
  const parentChildRels = relationships.filter(r => r.type === 'parent_child');
  // childrenByParentId / parentsByChildId: O(parentChildRels)
  const childrenByParentId = new Map<string, string[]>();
  const parentsByChildId   = new Map<string, string[]>();
  for (const r of parentChildRels) {
    if (!r.person1_id || !r.person2_id) continue;
    const kids = childrenByParentId.get(r.person1_id) ?? []; kids.push(r.person2_id); childrenByParentId.set(r.person1_id, kids);
    const pars = parentsByChildId.get(r.person2_id) ?? []; pars.push(r.person1_id); parentsByChildId.set(r.person2_id, pars);
  }
  const orphanByParentId = new Map<string, Array<{ childId: string; subtype: string }>>();
  for (const pc of parentChildRels) {
    if (!pc.person1_id || !pc.person2_id) continue;
    if (allowedPersonIds && !allowedPersonIds.has(pc.person1_id)) continue;
    if (allowedPersonIds && !allowedPersonIds.has(pc.person2_id)) continue;
    const parentId = pc.person1_id;
    const childId  = pc.person2_id;
    // O(1) via pre-built set (replaces couples.some — was O(couples) per row)
    if (personsInAnyCouple.has(parentId)) continue;
    // Is another pair of this child's parents already in a couple (multi-parent triad)?
    // O(other_parents × avg_couples_per_person) — effectively O(1) for real trees
    const otherParents = (parentsByChildId.get(childId) ?? []).filter(id => id !== parentId);
    const hostedByCouple = otherParents.some(otherPid =>
      (couplesByPersonId.get(otherPid) ?? []).some(c => {
        const partnerId = c.person1_id === otherPid ? c.person2_id : c.person1_id;
        return partnerId && otherParents.includes(partnerId);
      })
    );
    if (hostedByCouple) continue;
    const entry = orphanByParentId.get(parentId) ?? [];
    entry.push({ childId, subtype: pc.subtype ?? 'biological' });
    orphanByParentId.set(parentId, entry);
  }
  const orphanFamilyByPersonId = new Map<string, string>(); // parent → FAM xref
  const orphanFamilyByChildId = new Map<string, string[]>(); // child → list of orphan FAM xrefs (a child can have several single-parent FAMs if multiple parents are uncoupled)
  let orphanFamCounter = couples.length;
  for (const [parentId, kids] of orphanByParentId) {
    orphanFamCounter++;
    const xr = `@F${orphanFamCounter}@`;
    orphanFamilyByPersonId.set(parentId, xr);
    for (const { childId } of kids) {
      const list = orphanFamilyByChildId.get(childId) ?? [];
      list.push(xr);
      orphanFamilyByChildId.set(childId, list);
    }
  }

  // ── FAMC / FAMS / children lookup maps — O(couples + parentChildRels) ────────
  // Replaces O(persons × couples × parentChildRels) inner loops in INDI emission
  // and O(couples × parentChildRels) scans in FAM emission.
  const childToCoupleXrefs  = new Map<string, string[]>();  // childId  → famXrefs
  const personToFamsXrefs   = new Map<string, string[]>();  // personId → famXrefs
  const childrenByCoupleId  = new Map<string, Set<string>>(); // coupleId → childIds
  const parentChildByChildId = new Map<string, typeof parentChildRels>(); // childId → pc rows

  for (const r of parentChildRels) {
    if (!r.person2_id) continue;
    const arr = parentChildByChildId.get(r.person2_id) ?? []; arr.push(r); parentChildByChildId.set(r.person2_id, arr);
  }
  for (let ci = 0; ci < couples.length; ci++) {
    const c   = couples[ci];
    const fxr = `@F${ci + 1}@`;
    for (const pid of [c.person1_id, c.person2_id]) {
      if (!pid) continue;
      const a = personToFamsXrefs.get(pid) ?? []; a.push(fxr); personToFamsXrefs.set(pid, a);
    }
    const childSet = new Set<string>();
    for (const pid of [c.person1_id, c.person2_id]) {
      if (!pid) continue;
      for (const cid of (childrenByParentId.get(pid) ?? [])) {
        if (!allowedPersonIds || allowedPersonIds.has(cid)) childSet.add(cid);
      }
    }
    childrenByCoupleId.set(c.id, childSet);
    for (const cid of childSet) {
      const a = childToCoupleXrefs.get(cid) ?? []; a.push(fxr); childToCoupleXrefs.set(cid, a);
    }
  }

  // Warnings collected during this export (T03: dropped extra parents on
  // 5.5.1 multi-parent triad). Attached to the final ExportReport.
  const warnings: string[] = [];

  for (let i = 0; i < persons.length; i++) {
    const p = persons[i];
    // Periodic progress inside the slow INDI loop (every ~500 persons) so the
    // UI bar advances on large trees rather than appearing frozen.
    if (onProgress && i > 0 && i % 500 === 0) {
      onProgress(`Exported ${i} / ${persons.length} persons`);
    }
    const xr = `@I${i + 1}@`;
    lines.push(`0 ${xr} INDI`);

    const names = pre.namesByPersonId.get(p.id) ?? [];
    for (const n of names) {
      const rawGiven = n.given_name ?? '';
      // Encode tilltalsnamn as asterisk in NAME for Genney compatibility
      let given = rawGiven;
      if (n.preferred_name && rawGiven) {
        given = rawGiven.replace(
          new RegExp(`(^|\\s)(${n.preferred_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(\\s|$)`),
          `$1$2*$3`,
        ).trimEnd();
      }
      const sur = n.surname ? `/${n.surname}/` : '';
      const nameStr = `${given} ${sur}`.trim();
      lines.push(`1 NAME ${nameStr}`);
      if (n.name_prefix) lines.push(`2 NPFX ${n.name_prefix}`);
      if (n.name_suffix) lines.push(`2 NSFX ${n.name_suffix}`);
      if (n.name_type && n.name_type !== 'birth') {
        let nameType = n.name_type.toUpperCase();
        if (version === '7.0' && nameType === 'ALIAS') nameType = 'AKA';
        lines.push(`2 TYPE ${nameType}`);
      }
      // Extended name fields — nickname as NICK (standard GEDCOM)
      if (n.nickname) lines.push(`2 NICK ${n.nickname}`);
      if (n.patronymic_base) lines.push(`2 _PATR ${n.patronymic_base}`);
      if (n.name_qualifier) lines.push(`2 _NQUAL ${n.name_qualifier}`);
      if (n.date_from) lines.push(`2 _DATE_FROM ${n.date_from}`);
      if (n.date_to) lines.push(`2 _DATE_TO ${n.date_to}`);
      // Name-level citations: emit as SOUR sub-tag under NAME (allowed by both
      // 5.5.1 and 7.0 NAME_PIECE structure). Importer routes these back into
      // citations.person_name_id.
      if (includeSources) {
        const nameCitations = pre.citationsByPersonNameId.get(n.id) ?? [];
        for (const cit of nameCitations) {
          const srcXr = sourceXref.get(cit.source_id);
          if (srcXr) emitCitationBlock(lines, cit, srcXr, 2, version, 'name');
        }
      }
      // T07 — NAME TRAN: 7.0 lossless; 5.5.1 degrades to additional 1 NAME blocks (handled inside emitter).
      await emitNameTranslations(db, n.id, 2, version, lines, { warnings }, pre.nameTranslationsByNameId.get(n.id) ?? []);
    }

    // T09 — Sex X (intersex): GEDCOM 7.0 spec allows X; 5.5.1 only M/F/U.
    // On 5.5.1, downgrade to U and disclose via warning.
    if (p.sex === 'X' && version === '5.5.1') {
      lines.push(`1 SEX U`);
      warnings.push(`Person ${p.id} sex=X downgraded to U for 5.5.1 (X not in 5.5.1 spec).`);
    } else {
      lines.push(`1 SEX ${p.sex}`);
    }

    // ── T03 FAMC / FAMS pointers ────────────────────────────────────────
    // O(1) map lookups — pre-built above to eliminate O(persons × couples) scan.
    for (const fxr of (childToCoupleXrefs.get(p.id) ?? [])) lines.push(`1 FAMC ${fxr}`);
    for (const fxr of (orphanFamilyByChildId.get(p.id) ?? []))  lines.push(`1 FAMC ${fxr}`);
    for (const fxr of (personToFamsXrefs.get(p.id) ?? []))      lines.push(`1 FAMS ${fxr}`);
    const orphanFams = orphanFamilyByPersonId.get(p.id);
    if (orphanFams) lines.push(`1 FAMS ${orphanFams}`);

    if (includeNotes && p.notes) lines.push(`1 NOTE ${p.notes}`);

    // Person events — only emit events where this person is the PRIMARY participant.
    // Non-primary participant roles are captured as ASSO blocks instead.
    const events = pre.eventsByPersonId.get(p.id) ?? [];
    const assoLines: string[] = [];
    for (const ev of events) {
      if (ev.relationship_id) continue;
      // T06: negation events are emitted by emitNegationsForEntity as `NO X`,
      // not as a regular event tag. Skip them here.
      if (ev.is_negation) continue;
      const participants = pre.participantsByEventId.get(ev.id) ?? [];
      const isPrimary = participants.some(part => part.person_id === p.id && part.role === 'primary');
      // Skip events where this person is a secondary participant — those events
      // are owned by another person and will be emitted under their INDI.
      if (!isPrimary) continue;

      const tag = EVENT_TYPE_TO_TAG[ev.event_type] ?? 'EVEN';
      const lineValueFirstLine = ev.value ? ev.value.split(/\r?\n/)[0] : '';
      lines.push(`1 ${tag}${lineValueFirstLine ? ' ' + lineValueFirstLine : ''}`);
      // Multi-line value continuation per GEDCOM 5.5.1.
      if (ev.value && ev.value.includes('\n')) {
        const continuationLines = ev.value.split(/\r?\n/).slice(1);
        for (const cont of continuationLines) lines.push(`2 CONT ${cont}`);
      }
      // Recover the GEDCOM TYPE from the notes prefix (importer marker).
      const { type: gedcomType, rest: notesBody } = extractGedcomTypeFromNotes(ev.notes ?? '');
      if (gedcomType) lines.push(`2 TYPE ${gedcomType}`);
      emitDate(lines, ev.date_type, ev.date_value, ev.date_value_end, ev.date_original, 2, version);
      // Write _EVID so importer can match ASSO blocks back to this event across databases
      lines.push(`2 _EVID ${ev.id}`);
      let emittedPlac = false;
      if (ev.place_id) {
        const place = pre.placeById.get(ev.place_id);
        if (place) {
          lines.push(`2 PLAC ${place.name}`);
          emitPlaceSubTags(lines, place, 3, pre.placeById, pre.externalIdsByEntity);
          // T07 — PLAC TRAN: 7.0 lossless; 5.5.1 drops + warns (no PLAC TRAN slot).
          await emitPlaceTranslations(db, place.id, 3, version, lines, { warnings }, pre.placeTranslationsByPlaceId.get(place.id) ?? []);
          emittedPlac = true;
        }
      }
      // Event-specific free-text address. Lossless via custom _PLAC_ADDR sub-tag.
      // Sits under PLAC at level 3 when a PLAC line was emitted; otherwise at level 2
      // directly under the event so authored address data survives even when no place
      // is attached. Distinct from the place's standalone ADDR/CITY/POST sub-tags.
      if (ev.place_address) {
        if (emittedPlac) {
          lines.push(`3 _PLAC_ADDR ${ev.place_address}`);
        } else {
          lines.push(`2 _PLAC_ADDR ${ev.place_address}`);
        }
      }
      if (includeNotes && notesBody) lines.push(`2 NOTE ${notesBody}`);
      if (ev.cause) lines.push(`2 CAUS ${ev.cause}`);
      if (includeSources) {
        const citations = pre.citationsByEventId.get(ev.id) ?? [];
        for (const cit of citations) {
          const srcXr = sourceXref.get(cit.source_id);
          if (srcXr) emitCitationBlock(lines, cit, srcXr, 2, version, 'event');
        }
      }
      if (includeMedia) emitMediaBlocks(lines, pre, 'event', ev.id, 2);
      // T04: shared notes attached to this event
      if (includeNotes) await emitNotesForEntity(db, 'event', ev.id, 2, version, lines, pre.notesByEntity.get(mediaEntityKey('event', ev.id)) ?? []);
      // Collect ASSO blocks for non-primary participants in this event
      for (const part of participants) {
        if (part.person_id === p.id) continue;
        const partXr = personXref.get(part.person_id);
        if (partXr) {
          assoLines.push(
            `1 ASSO ${partXr}`,
            `2 RELA ${capitalizeFirst(part.role)}`,
            `2 _EVID ${ev.id}`,
          );
        }
      }
    }

    // External identifiers
    const identifiers = pre.identifiersByPersonId.get(p.id) ?? [];
    for (const ident of identifiers) {
      const refTag = version === '7.0' ? 'EXID' : 'REFN';
      switch (ident.identifier_type) {
        case 'refn':
          lines.push(`1 REFN ${ident.identifier_value}`);
          break;
        case 'rin':
          lines.push(`1 RIN ${ident.identifier_value}`);
          break;
        case 'uid':
          // _UID is GEDCOM 5.5 non-standard but ubiquitous; bare UID is
          // GEDCOM 7.0 standard. Emit the version-appropriate tag so the
          // resulting file validates against its declared GEDCOM version.
          lines.push(`1 ${version === '7.0' ? 'UID' : '_UID'} ${ident.identifier_value}`);
          break;
        case 'afn':
          // GEDCOM 5.5/5.5.1 standard tag.
          lines.push(`1 AFN ${ident.identifier_value}`);
          break;
        case 'ssn':
          // GEDCOM 5.5 standard tag. Privacy-sensitive; the user authored it.
          lines.push(`1 SSN ${ident.identifier_value}`);
          break;
        case 'familysearch':
          lines.push(`1 ${refTag} ${ident.identifier_value}`);
          lines.push(`2 TYPE FamilySearch`);
          break;
        case 'ancestry':
          lines.push(`1 ${refTag} ${ident.identifier_value}`);
          lines.push(`2 TYPE Ancestry`);
          break;
        case 'riksarkivet':
          lines.push(`1 ${refTag} ${ident.identifier_value}`);
          lines.push(`2 TYPE Riksarkivet`);
          break;
        case 'personnummer':
          lines.push(`1 ${refTag} ${ident.identifier_value}`);
          lines.push(`2 TYPE Personnummer`);
          break;
        default: // 'other'
          lines.push(`1 ${refTag} ${ident.identifier_value}`);
          lines.push(`2 TYPE Other`);
          break;
      }
    }

    // ASSO blocks for sibling / godparent / other relationships
    const personRels = pre.relationshipsByPersonId.get(p.id) ?? [];
    for (const rel of personRels) {
      if (rel.type !== 'sibling' && rel.type !== 'godparent' && rel.type !== 'other') continue;
      const otherId = rel.person1_id === p.id ? rel.person2_id : rel.person1_id;
      if (!otherId) continue;
      const otherXr = personXref.get(otherId);
      if (otherXr) {
        assoLines.push(`1 ASSO ${otherXr}`, `2 RELA ${capitalizeFirst(rel.type)}`);
        // Custom 2 _RELA_NOTE sub-tag carries the genealogist's note on the
        // relationship. ASSO has no standard NOTE child the importer reads
        // back, so couple notes ride _RELNOTES on FAM and the sibling /
        // godparent / other branch rides _RELA_NOTE here. Multi-line notes
        // get split across CONT continuation lines so embedded newlines
        // round-trip byte-identical. Emitted under both endpoints' ASSO
        // blocks (the exporter writes the relationship under each person);
        // the importer's deduplication ensures only one DB row results.
        if (includeNotes && rel.notes) {
          const noteLines = rel.notes.split(/\r?\n/);
          assoLines.push(`2 _RELA_NOTE ${noteLines[0]}`);
          for (let i = 1; i < noteLines.length; i++) {
            assoLines.push(`3 CONT ${noteLines[i]}`);
          }
        }
      }
    }

    // Emit all collected ASSO blocks
    lines.push(...assoLines);

    // Person-level citations (not tied to any specific event)
    if (includeSources) {
      const personCitations = pre.citationsByPersonId.get(p.id) ?? [];
      for (const cit of personCitations) {
        const srcXr = sourceXref.get(cit.source_id);
        if (srcXr) emitCitationBlock(lines, cit, srcXr, 1, version, 'person');
      }
    }

    // Person-level media
    if (includeMedia) emitMediaBlocks(lines, pre, 'person', p.id, 1);

    // T02 per-concept emitter hooks (stubs until Phase 2). The orchestration
    // surface exists so T04–T07 can fill the bodies without re-touching the
    // INDI block here.
    await emitNotesForEntity(db, 'person', p.id, 1, version, lines, pre.notesByEntity.get(mediaEntityKey('person', p.id)) ?? []);
    await emitPersonAssociations(db, p.id, 1, version, personXref, lines, pre.associationsByPersonId.get(p.id) ?? []);
    await emitNegationsForEntity(db, 'person', p.id, 1, version, lines, warnings, events);
  }

  // ── Families ───────────────────────────────────────────────────────────────
  // `relationships`, `couples`, `parentChildRels`, `coupleXref`,
  // `orphanFamilyByPersonId`, `orphanFamilyByChildId`, `orphanByParentId`
  // and `warnings` were all populated above (before the persons loop) so
  // INDI emission could write FAMC / FAMS pointers. The couple-FAM loop
  // here re-uses them; no second `listRelationships` query.
  onProgress?.('Exporting families…');
  for (let i = 0; i < couples.length; i++) {
    const rel = couples[i];
    const xr = `@F${i + 1}@`;
    lines.push(`0 ${xr} FAM`);
    if (rel.person1_id) {
      const p1xr = personXref.get(rel.person1_id);
      if (p1xr) lines.push(`1 HUSB ${p1xr}`);
    }
    if (rel.person2_id) {
      const p2xr = personXref.get(rel.person2_id);
      if (p2xr) lines.push(`1 WIFE ${p2xr}`);
    }

    // Children + PEDI sub-tag (T03 per-parent correctness).
    //
    // For each unique child appearing under this FAM (the import side
    // creates one parent_child row per parent slot, so a child of two
    // parents in this FAM has two rows), we emit a single CHIL line and
    // then collect ALL parent_child rows for that child whose parent is
    // in this FAM's HUSB/WIFE pair. The non-biological subtypes are
    // emitted per-parent — on 7.0 disambiguated with a custom `3 _PARENT`
    // sub-tag pointing at the relevant parent INDI xref, on 5.5.1 emitted
    // unambiguously when all non-biological rows agree (typical case),
    // and unconditionally for any non-biological row (the importer reads
    // a single PEDI per CHIL — semantic merge is acceptable and tracked
    // in the registry).
    const childIds = childrenByCoupleId.get(rel.id) ?? new Set<string>();
    for (const childId of childIds) {
      const cxr = personXref.get(childId);
      if (!cxr) continue;
      lines.push(`1 CHIL ${cxr}`);
      // Collect BOTH parent_child rows (one per parent) for this child in
      // this couple's HUSB/WIFE pair. Sort so non-biological subtypes are
      // emitted FIRST: the importer reads a single PEDI per CHIL (first
      // wins), so a non-biological subtype on one parent must take
      // precedence over the other parent's biological default when
      // re-importing. The custom `3 _PARENT` disambiguator below lets a
      // future importer enhancement recover full per-parent fidelity.
      const pcRelsForChild = (parentChildByChildId.get(childId) ?? [])
        .filter(r => r.person1_id === rel.person1_id || r.person1_id === rel.person2_id)
        .slice()
        .sort((a, b) => {
          const aBio = a.subtype === 'biological' || !a.subtype ? 1 : 0;
          const bBio = b.subtype === 'biological' || !b.subtype ? 1 : 0;
          return aBio - bBio;
        });
      for (const pcRel of pcRelsForChild) {
        if (!pcRel.subtype) continue;
        // Map 'biological' → 'birth' (standard GEDCOM PEDI value); other
        // subtypes pass through. Uppercase on 7.0. Emitting `birth` /
        // `BIRTH` explicitly is allowed under both versions even though
        // it's the implicit default — preserved for fidelity with pre-T03
        // exports and for parsers that don't infer the default.
        let pedi = pcRel.subtype === 'biological' ? 'birth' : pcRel.subtype;
        if (version === '7.0') pedi = pedi.toUpperCase();
        lines.push(`2 PEDI ${pedi}`);
        if (version === '7.0' && pcRelsForChild.length > 1 && pcRel.person1_id) {
          // Disambiguate WHICH parent this PEDI refers to. Custom
          // `3 _PARENT @Ix@` sub-tag — round-trippable as long as the
          // importer reads it (a future enhancement; today only the FAM
          // PEDI is read, so this is a write-only audit trail).
          const parentXref = personXref.get(pcRel.person1_id);
          if (parentXref) lines.push(`3 _PARENT ${parentXref}`);
        }
      }

      // ── T03 multi-parent triad: extras via ASSO ROLE PARENT (7.0) /
      //                                       warning (5.5.1) ──────────
      const extraParents = (parentChildByChildId.get(childId) ?? []).filter(r =>
        r.person1_id !== rel.person1_id && r.person1_id !== rel.person2_id
      );
      for (const extra of extraParents) {
        if (!extra.person1_id) continue;
        // O(1) via pre-built couplesByPersonId (replaces couples.some — was O(couples))
        const extraInAnotherCouple = (couplesByPersonId.get(extra.person1_id) ?? []).some(c => c.id !== rel.id);
        if (extraInAnotherCouple) continue;
        const extraXref = personXref.get(extra.person1_id);
        if (!extraXref) continue;
        if (version === '7.0') {
          lines.push(`1 ASSO ${extraXref}`);
          lines.push(`2 ROLE PARENT`);
          if (extra.subtype && extra.subtype !== 'biological') {
            // Custom _PEDI sub-tag carries the subtype on the extra
            // parent's ASSO link (uppercase per 7.0 convention).
            lines.push(`2 _PEDI ${extra.subtype.toUpperCase()}`);
          }
        } else {
          // 5.5.1 has no spec-conformant slot. Drop + disclose per-row.
          warnings.push(
            `Extra parent dropped (5.5.1 spec limit): person ${extra.person1_id} ` +
            `is a ${extra.subtype ?? 'biological'} parent of ${childId} but the FAM ` +
            `already carries 2 parents (HUSB / WIFE). On 7.0 this would round-trip ` +
            `via ASSO ROLE PARENT.`
          );
        }
      }
    }

    // Couple metadata
    if (rel.subtype) lines.push(`1 _SUBTYPE ${rel.subtype}`);
    if (includeNotes && rel.notes) lines.push(`1 _RELNOTES ${rel.notes}`);

    // Family events
    const famEvents = pre.eventsByRelationshipId.get(rel.id) ?? [];
    for (const ev of famEvents) {
      // T06: negation events handled by emitNegationsForEntity below.
      if (ev.is_negation) continue;
      const tag = EVENT_TYPE_TO_TAG[ev.event_type] ?? 'EVEN';
      const lineValueFirstLine = ev.value ? ev.value.split(/\r?\n/)[0] : '';
      lines.push(`1 ${tag}${lineValueFirstLine ? ' ' + lineValueFirstLine : ''}`);
      if (ev.value && ev.value.includes('\n')) {
        const continuationLines = ev.value.split(/\r?\n/).slice(1);
        for (const cont of continuationLines) lines.push(`2 CONT ${cont}`);
      }
      const { type: gedcomType, rest: notesBody } = extractGedcomTypeFromNotes(ev.notes ?? '');
      if (gedcomType) lines.push(`2 TYPE ${gedcomType}`);
      emitDate(lines, ev.date_type, ev.date_value, ev.date_value_end, ev.date_original, 2, version);
      lines.push(`2 _EVID ${ev.id}`);
      let emittedPlac = false;
      if (ev.place_id) {
        const place = pre.placeById.get(ev.place_id);
        if (place) {
          lines.push(`2 PLAC ${place.name}`);
          emitPlaceSubTags(lines, place, 3, pre.placeById, pre.externalIdsByEntity);
          // T07 — PLAC TRAN: 7.0 lossless; 5.5.1 drops + warns (no PLAC TRAN slot).
          await emitPlaceTranslations(db, place.id, 3, version, lines, { warnings }, pre.placeTranslationsByPlaceId.get(place.id) ?? []);
          emittedPlac = true;
        }
      }
      // See INDI-event emitter for rationale on level-3-vs-2 placement.
      if (ev.place_address) {
        if (emittedPlac) {
          lines.push(`3 _PLAC_ADDR ${ev.place_address}`);
        } else {
          lines.push(`2 _PLAC_ADDR ${ev.place_address}`);
        }
      }
      if (includeNotes && notesBody) lines.push(`2 NOTE ${notesBody}`);
      if (ev.cause) lines.push(`2 CAUS ${ev.cause}`);
      if (includeSources) {
        const citations = pre.citationsByEventId.get(ev.id) ?? [];
        for (const cit of citations) {
          const srcXr = sourceXref.get(cit.source_id);
          if (srcXr) emitCitationBlock(lines, cit, srcXr, 2, version, 'event');
        }
      }
      if (includeMedia) emitMediaBlocks(lines, pre, 'event', ev.id, 2);
      // T04: shared notes attached to this family event
      if (includeNotes) await emitNotesForEntity(db, 'event', ev.id, 2, version, lines, pre.notesByEntity.get(mediaEntityKey('event', ev.id)) ?? []);
    }

    // Relationship-level citations
    if (includeSources) {
      const relCitations = pre.citationsByRelationshipId.get(rel.id) ?? [];
      for (const cit of relCitations) {
        const srcXr = sourceXref.get(cit.source_id);
        if (srcXr) emitCitationBlock(lines, cit, srcXr, 1, version, 'relationship');
      }
    }

    // Relationship-level media
    if (includeMedia) emitMediaBlocks(lines, pre, 'relationship', rel.id, 1);

    // T02 per-concept emitter hooks — relationship-level notes + negations
    // (stubs until T04 / T06).
    await emitNotesForEntity(db, 'relationship', rel.id, 1, version, lines, pre.notesByEntity.get(mediaEntityKey('relationship', rel.id)) ?? []);
    await emitNegationsForEntity(db, 'relationship', rel.id, 1, version, lines, warnings, famEvents);
  }

  // ── T03 orphan single-parent FAM records ────────────────────────────────
  //
  // A parent_child row whose parent is in NO couple needs its OWN FAM so
  // the parent ↔ child link survives a GEDCOM round-trip. We use a
  // sex-appropriate HUSB / WIFE slot for the single parent: persons with
  // sex='M' go to HUSB; F/X/U go to WIFE (HUSB is conventionally the
  // earlier slot in 5.5.1 readers but the GEDCOM spec is sex-agnostic
  // about which slot a single parent occupies — F to WIFE is the
  // genealogist-intuitive default and keeps the file readable by
  // strictness-checking parsers that expect WIFE to be female).
  const personById = new Map(persons.map(p => [p.id, p]));
  for (const [parentId, kids] of orphanByParentId) {
    const xr = orphanFamilyByPersonId.get(parentId);
    if (!xr) continue;
    lines.push(`0 ${xr} FAM`);
    const parentXref = personXref.get(parentId);
    const parent = personById.get(parentId);
    if (parentXref) {
      const slot = parent?.sex === 'M' ? 'HUSB' : 'WIFE';
      lines.push(`1 ${slot} ${parentXref}`);
    }
    for (const { childId, subtype } of kids) {
      const cxr = personXref.get(childId);
      if (!cxr) continue;
      lines.push(`1 CHIL ${cxr}`);
      if (subtype && subtype !== 'biological') {
        let pedi = subtype;
        if (version === '7.0') pedi = pedi.toUpperCase();
        lines.push(`2 PEDI ${pedi}`);
      }
    }
  }

  // ── Top-level _PLAC and OBJE records for places / media reachable from
  //    citations or groups. Both kinds are emitted as level-0 custom (_PLAC)
  //    or standard (OBJE) records before _GROUP so that _GROUP_LINK xrefs
  //    have something to point at. Other apps skip unrecognised level-0
  //    record types per GEDCOM 5.5.1 spec.
  // ─────────────────────────────────────────────────────────────────────────

  // Determine which places and media need top-level records. Sources of demand:
  //   - place-level citations (existing behaviour)
  //   - group_links (entity_type ∈ person/place/media) — new in this plan
  onProgress?.('Exporting places, media and groups…');
  const allGroups = await listGroups(db);
  const groupLinksByGroup = pre.groupLinksByGroupId;
  const groupLinkedPlaceIds = new Set<string>();
  const groupLinkedMediaIds = new Set<string>();
  for (const grp of allGroups) {
    const links = groupLinksByGroup.get(grp.id) ?? [];
    for (const link of links) {
      if (link.entity_type === 'place') groupLinkedPlaceIds.add(link.entity_id);
      else if (link.entity_type === 'media') groupLinkedMediaIds.add(link.entity_id);
    }
  }

  // Build the set of place ids that need a `_PLAC` top-level record.
  const placeXref = new Map<string, string>();
  if (includeSources || groupLinkedPlaceIds.size > 0) {
    const allPlaces = pre.allPlaces;
    let placeCounter = 0;
    for (const place of allPlaces) {
      const placeCitations = includeSources ? (pre.citationsByPlaceId.get(place.id) ?? []) : [];
      const isGroupLinked = groupLinkedPlaceIds.has(place.id);
      if (placeCitations.length === 0 && !isGroupLinked) continue;
      placeCounter++;
      const pxr = `@P${placeCounter}@`;
      placeXref.set(place.id, pxr);
      lines.push(`0 ${pxr} _PLAC`);
      // NAME allows the importer to create the place by name when UUID lookup fails (cross-DB import)
      lines.push(`1 NAME ${place.name}`);
      lines.push(`1 _PLAC_ID ${place.id}`);
      for (const cit of placeCitations) {
        const srcXr = sourceXref.get(cit.source_id);
        if (srcXr) emitCitationBlock(lines, cit, srcXr, 1, version, 'place');
      }
    }
  }

  // Top-level OBJE records for media linked from groups. Inline OBJE blocks
  // (under INDI/FAM/event) carry no xref so they can't be referenced from
  // _GROUP_LINK; we emit a dedicated top-level record per group-linked media
  // and tag it with `_OBJE_ID` (the source DB UUID) so the importer can
  // deduplicate when a media is linked from both a person and a group.
  const mediaXref = new Map<string, string>();
  if (groupLinkedMediaIds.size > 0 && includeMedia) {
    let mediaCounter = 0;
    for (const mediaId of groupLinkedMediaIds) {
      const m: Media | null = pre.mediaById.get(mediaId) ?? null;
      if (!m) continue;
      mediaCounter++;
      const mxr = `@M${mediaCounter}@`;
      mediaXref.set(m.id, mxr);
      lines.push(`0 ${mxr} OBJE`);
      if (m.format) lines.push(`1 FORM ${m.format}`);
      if (m.file_ref) lines.push(`1 FILE ${m.file_ref}`);
      if (m.title) lines.push(`1 TITL ${m.title}`);
      if (m.notes) lines.push(`1 NOTE ${m.notes}`);
    }
  }

  // ── Top-level _GROUP records ───────────────────────────────────────────────
  // Each `_GROUP` carries the user's group (name + notes) and a `_GROUP_LINK`
  // sub-record per member. The link encodes its host entity kind in
  // `2 TYPE person|place|media` and resolves the host via `2 REF @xref@`.
  // Polymorphic xref resolution: persons → INDI xref map; places → _PLAC xref
  // map (built above); media → OBJE xref map (built above for group-linked
  // media). Members whose host has no xref (e.g. a place that wasn't seeded
  // because it had no citations *and* no group link, which can only happen
  // mid-export if listPlaces ever returns a stale set) are skipped — the
  // importer surfaces this asymmetrically via warnings if it ever happens.
  if (allGroups.length > 0) {
    let groupCounter = 0;
    for (const grp of allGroups) {
      groupCounter++;
      const gxr = `@G${groupCounter}@`;
      lines.push(`0 ${gxr} _GROUP`);
      if (grp.name) lines.push(`1 NAME ${grp.name}`);
      if (grp.notes) {
        const noteLines = grp.notes.split(/\r?\n/);
        lines.push(`1 NOTE ${noteLines[0]}`);
        for (let i = 1; i < noteLines.length; i++) {
          lines.push(`2 CONT ${noteLines[i]}`);
        }
      }
      const links = groupLinksByGroup.get(grp.id) ?? [];
      for (const link of links) {
        let refXr: string | undefined;
        if (link.entity_type === 'person') refXr = personXref.get(link.entity_id);
        else if (link.entity_type === 'place') refXr = placeXref.get(link.entity_id);
        else if (link.entity_type === 'media') refXr = mediaXref.get(link.entity_id);
        if (!refXr) continue;
        lines.push(`1 _GROUP_LINK`);
        lines.push(`2 TYPE ${link.entity_type}`);
        lines.push(`2 REF ${refXr}`);
      }
    }
  }

  // T04: emit top-level SNOTE records (7.0) for every SNOTE @Nx@ xref
  // allocated by emitNotesForEntity above, OR push shared-note disclosure
  // warnings (5.5.1). Must run AFTER every per-entity emit call so the
  // xref allocator has seen every reference, and BEFORE the 0 TRLR terminator.
  if (includeNotes) {
    await emitSharedNoteRecords(db, version, lines, { warnings }, pre.allNotes, pre.noteLinksByNoteId);
  }

  lines.push('0 TRLR');

  // ── Build ExportReport ─────────────────────────────────────────────────────
  const researchTaskCount = ((db.get('SELECT COUNT(*) as n FROM research_tasks') as { n: number } | undefined)?.n ?? 0);

  const excluded: ExportReport['excluded'] = [];
  if (researchTaskCount > 0) excluded.push({
    category: 'Research Tasks',
    count: researchTaskCount,
    reason: 'No equivalent concept in GEDCOM 5.5.1',
  });
  // events.place_address: now lossless via custom _PLAC_ADDR sub-tag (see emit sites above).
  // groups / group_links: now lossless via custom _GROUP / _GROUP_LINK records (see emit sites above).

  // Count total events exported (across all persons and couples)
  const totalEventCount = ((db.get('SELECT COUNT(*) as n FROM events') as { n: number } | undefined)?.n ?? 0);

  const report: ExportReport = {
    persons: persons.length,
    families: couples.length + orphanByParentId.size,
    events: totalEventCount,
    sources: sources.length,
    warnings,
    excluded,
  };

  return { ged: lines.join('\n') + '\n', report };
}
