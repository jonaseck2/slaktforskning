/**
 * Core GEDCOM import orchestrator.
 *
 * This file creates the ImportContext, calls each phase in order, and builds
 * the final validation report. All phase logic lives in ./phases.ts; helpers
 * are in ./node-utils.ts, ./place-resolver.ts, ./event-importer.ts, and
 * ./obje-importer.ts. Shared state is threaded via ImportContext (./import-types.ts).
 *
 * Phases:
 *   0   NOTE top-level records -> noteMap
 *   0.5 OBJE top-level records -> objeMap
 *   0.7 REPO records -> repoMap
 *   0.8 _GRP records (Genney only) -> grpMap
 *   1   SOUR records -> sourceMap
 *   2   INDI records -> personMap (+ holgerAdoptionMap for Holger)
 *   3   FAM records -> couple + parent_child relationships + family events
 *   4   ASSO post-processing -> event participants + sibling/godparent relationships
 *   5   _PLAC records -> place-level citations
 *   6   _TODO records (Genney only) -> research tasks
 *   SUBM  Submitter name collection
 */

import type { Database } from 'node-sqlite3-wasm';
import type { GedcomNode } from '../../gedcom/parser';
import { findOrCreatePlace } from '../../api/places';
import { getDbSetting, setDbSetting } from '../../api/db_settings';
import { queryOne, queryAll, runSql } from '../../api/db';
import { detectGedcomVersion } from './detect';
import type { GedcomVersion } from './detect';
import { normalizeForImport } from './normalize';
import { resolvePlaceFn as genneyResolvePlaceFn } from './profiles/genney';
import type { ImportContext } from './import-types';
import {
  PERSON_EVENT_TAGS, FAMILY_EVENT_TAGS,
  phaseNotes, phaseObje, phaseRepo, phaseGroups, phasePrepPlaces, phasePrepInlineMedia,
  phaseSources, phaseIndividuals, phaseFamilies,
  phaseAsso, phasePlaceCitations, phaseGroupRecords, phaseTodos, phaseSubmitters,
  // T02 GEDCOM-alignment new phases (stubs; filled by Phase 2).
  phaseNegations, phaseTranslations, phaseCoverage,
} from './phases';

// ── Public types (re-exported via index.ts) ─────────────────────────────────

export interface ImportOptions {
  /** Import profile. 'genney' enables Genney 4.1-specific extensions:
   *  Swedish hierarchical places, patronymic detection, _UID/_YHAPLOGROUP/_MHAPLOGROUP tags. */
  profile?: 'genney' | 'holger';
  /** Local directory for remapping Windows-style OBJE FILE paths (Holger exports).
   *  e.g. 'C:\\OurKind\\Media\\P12\\photo.jpg' -> '{mediaDir}/P12/photo.jpg' */
  mediaDir?: string;
  /** Called with a human-readable status string at phase boundaries and
   *  periodically inside the slow row-iteration phases (every ~100 rows).
   *  Forwarded to the renderer via the per-importer progress channel
   *  (`import:holgerProgress` etc.) so the UI bar can update mid-import. */
  onProgress?: (msg: string) => void;
}

export interface ImportReport {
  version: GedcomVersion;
  persons: number;
  families: number;
  events: Record<string, number>;   // event_type -> count
  sources: number;
  places: number;
  citations: number;
  repositories: number;
  groups: number;
  researchTasks: number;
  skipped: { tag: string; count: number }[];  // unrecognised level-1 INDI/FAM tags (alias for tagStats)
  warnings: string[];                          // e.g. "12 OBJE records skipped"
  /** DB id of the tree subject, if auto-matched from SUBM or first INDI. */
  defaultPersonId?: string;
  /** Raw SUBM NAME value from the GEDCOM file, if present. */
  submitterName?: string;
}

export interface UnmappedItem {
  category: string;   // e.g. "REPO records", "LDS ordinances", "SUBM records"
  count: number;
  example?: string;   // first occurrence for debugging
}

export interface ValidationReport extends ImportReport {
  // Raw file counts (before import -- derived from the node tree)
  rawCounts: {
    individuals: number;
    families: number;
    sources: number;
    repositories: number;   // REPO level-0 records
    notes: number;          // level-0 NOTE/SNOTE records
    objects: number;        // OBJE level-0 records
    submitters: number;     // SUBM records (always dropped)
  };
  // Tags seen in the file that we didn't handle (replaces 'skipped')
  tagStats: {
    tag: string;
    occurrences: number;
  }[];
  // Structured list of data categories that couldn't be stored
  unmappedData: UnmappedItem[];
  // Known model limitations hit during this import
  modelLimitations: string[];
}

// ── Import context factory ──────────────────────────────────────────────────

function createImportContext(db: Database, tree: GedcomNode[], options?: ImportOptions): ImportContext {
  const isGenney = options?.profile === 'genney';
  const isHolger = options?.profile === 'holger';
  const resolvePlaceFn = isGenney ? genneyResolvePlaceFn : findOrCreatePlace;

  return {
    db,
    tree,
    options,
    isGenney,
    isHolger,
    resolvePlaceFn,

    noteMap: new Map(),
    objeMap: new Map(),
    repoMap: new Map(),
    grpMap: new Map(),
    sourceMap: new Map(),
    personMap: new Map(),
    placeIdMap: new Map(),
    eventIdMap: new Map(),
    holgerAdoptionMap: new Map(),

    assoData: [],

    skippedTags: new Map(),
    ldsCount: 0,
    tranCount: 0,
    noCount: 0,
    assoDropCount: 0,
    holgerRemarkCount: 0,
    namelessPersonCount: 0,
    firstPersonId: null,
    submitterNames: [],
    submitterContact: null,
    groupLinkWarnings: [],
  };
}

// ── doImportGedcom: run all phases ──────────────────────────────────────────

async function doImportGedcom(
  db: Database,
  tree: GedcomNode[],
  options?: ImportOptions,
): Promise<{ skipped: { tag: string; count: number }[]; warnings: string[]; ldsCount: number; tranCount: number; noCount: number; assoDrop: number; holgerRemarkCount: number; namelessPersonCount: number; firstPersonId: string | null; submitterNames: string[]; submitterContact: { address?: string; phone?: string; email?: string } | null; groupLinkWarnings: string[] }> {
  const ctx = createImportContext(db, tree, options);

  // Total = 17 phases below (14 legacy + 3 T02-added stubs). Each runPhase
  // call emits a determinate (current / total) tick so the toast bar always
  // shows visible progress, even for fast phases that finish before they
  // emit their own per-row progress (e.g. phaseNotes, phaseAsso). Phases
  // that do emit their own per-row progress overwrite this with
  // finer-grained counts.
  const phaseTotal = 17;
  let phaseIdx = 0;
  const runPhase = async (name: string, fn: (c: typeof ctx) => Promise<void>) => {
    phaseIdx++;
    options?.onProgress?.(`Fas ${phaseIdx}/${phaseTotal}: ${name} (${phaseIdx} / ${phaseTotal})`);
    const t = Date.now();
    await fn(ctx);
    console.log(`[import-timing]   phase ${name} — ${Date.now() - t}ms`);
  };
  await runPhase('notes',          phaseNotes);
  // Place pre-resolution runs after notes (which builds noteMap) but before
  // any phase that touches events / PLAC. Collapses 60-100k+ findOrCreatePlace
  // IPC calls into 2 (one SELECT, one bulk INSERT).
  await runPhase('prepPlaces',     phasePrepPlaces);
  // Inline-OBJE pre-resolution: walk the tree for every OBJE node embedded
  // inside INDI / FAM / event nodes and batch-create the media rows in one
  // INSERT. Holger imports are inline-OBJE heavy (~11k+ records in the
  // reference file, zero top-level OBJE), so without this phase every
  // event-loop pays one createMedia IPC per inline OBJE.
  await runPhase('prepInlineMedia', phasePrepInlineMedia);
  await runPhase('obje',           phaseObje);
  await runPhase('repo',           phaseRepo);
  await runPhase('groups',         phaseGroups);
  await runPhase('sources',        phaseSources);
  // T02 coverage stub runs after sources so source ids exist in sourceMap.
  await runPhase('coverage',       phaseCoverage);
  await runPhase('individuals',    phaseIndividuals);
  await runPhase('families',       phaseFamilies);
  await runPhase('asso',           phaseAsso);
  await runPhase('placeCitations', phasePlaceCitations);
  // T02 translations stub runs after individuals + placeCitations so both
  // person_names and places exist as attachment targets.
  await runPhase('translations',   phaseTranslations);
  // T02 negations stub runs after individuals + families + asso so persons
  // and relationships exist as attachment targets.
  await runPhase('negations',      phaseNegations);
  await runPhase('groupRecords',   phaseGroupRecords);
  await runPhase('todos',          phaseTodos);
  await runPhase('submitters',     phaseSubmitters);
  console.log(`[import-timing]   maps: noteMap=${ctx.noteMap.size} objeMap=${ctx.objeMap.size} sourceMap=${ctx.sourceMap.size} personMap=${ctx.personMap.size} placeIdMap=${ctx.placeIdMap.size}`);

  // Build and return partial report
  const skipped = Array.from(ctx.skippedTags.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
  const warnings: string[] = [];
  return {
    skipped,
    warnings,
    ldsCount: ctx.ldsCount,
    tranCount: ctx.tranCount,
    noCount: ctx.noCount,
    assoDrop: ctx.assoDropCount,
    holgerRemarkCount: ctx.holgerRemarkCount,
    namelessPersonCount: ctx.namelessPersonCount,
    firstPersonId: ctx.firstPersonId,
    submitterNames: ctx.submitterNames,
    submitterContact: ctx.submitterContact,
    groupLinkWarnings: ctx.groupLinkWarnings,
  };
}

// ── Statement cache ─────────────────────────────────────────────────────────

/**
 * Wraps a Database so that db.prepare(sql) compiles each unique SQL string only
 * once per import. The ~50k prepare() calls in a large import otherwise dominate
 * CPU time. All SQLite operations here are synchronous and single-threaded, so
 * reusing a compiled statement across calls is safe.
 * BEGIN/COMMIT/ROLLBACK are called on the real db (not the proxy) so they are
 * never cached.
 *
 * IMPORTANT: Call finalize() after the import to release all compiled statements
 * from the WASM heap. node-sqlite3-wasm prepared statements live in WASM memory;
 * JavaScript GC does not free them. Leaving them alive exhausts the WASM heap and
 * causes subsequent SQLite operations to fail with "out of memory".
 */
function withStatementCache(db: Database): { proxy: Database; finalize(): void } {
  const cache = new Map<string, ReturnType<typeof db.prepare>>();
  // Return a proxy wrapper around the real statement that ignores finalize() calls.
  // This lets callers (e.g. src/api/db.ts helpers) safely call finalize() after each
  // use without killing the cached statement. The cache's own finalize() method
  // cleans up all real statements when the import transaction completes.
  function wrapStatement(stmt: ReturnType<typeof db.prepare>) {
    return new Proxy(stmt, {
      get(target, prop) {
        if (prop === 'finalize') return () => { /* no-op: cache owns the lifetime */ };
        const val = (target as unknown as Record<string | symbol, unknown>)[prop];
        return typeof val === 'function' ? (val as (...a: unknown[]) => unknown).bind(target) : val;
      },
    });
  }
  const proxy = new Proxy(db, {
    get(target, prop) {
      if (prop === 'prepare') {
        return (sql: string) => {
          let stmt = cache.get(sql);
          if (!stmt) { stmt = target.prepare(sql); cache.set(sql, stmt); }
          return wrapStatement(stmt);
        };
      }
      const val = (target as unknown as Record<string | symbol, unknown>)[prop];
      return typeof val === 'function' ? (val as (...a: unknown[]) => unknown).bind(target) : val;
    },
  }) as unknown as Database;
  return {
    proxy,
    finalize() {
      for (const stmt of cache.values()) {
        try { (stmt as unknown as { finalize(): void }).finalize(); } catch { /* ignore */ }
      }
      cache.clear();
    },
  };
}

// Sync local wrappers for runSql / queryOne / queryAll were removed during the
// Tauri-port aftermath: under the Tauri DB shim, prepare()/run()/get()/all()
// are async, so the sync wrappers returned Promises that crashed downstream
// (`evBeforeRows.map is not a function`). The await-aware helpers from
// `src/api/db.ts` work against both backends.

// ── Preview (no DB writes) ──────────────────────────────────────────────────

export interface ImportPreview {
  personCount: number;
  relationshipCount: number;
  eventCount: number;
  sourceCount: number;
  placeCount: number;
  repositoryCount: number;
  warnings: string[];
  estimatedSize: 'small' | 'medium' | 'large';
}

/**
 * Preview what a GEDCOM import would produce without writing to DB.
 * Parses the tree and counts entities; no database writes occur.
 */
export function previewGedcomImport(tree: GedcomNode[]): ImportPreview {
  const warnings: string[] = [];
  let personCount = 0;
  let familyCount = 0;
  let eventCount = 0;
  let sourceCount = 0;
  let repositoryCount = 0;
  const placeNames = new Set<string>();

  for (const node of tree) {
    switch (node.tag) {
      case 'INDI': {
        personCount++;
        // Count person events
        for (const child of node.children) {
          if (PERSON_EVENT_TAGS[child.tag]) eventCount++;
          if (child.tag === 'TITL') eventCount++; // TITL becomes occupation event
        }
        break;
      }
      case 'FAM': {
        familyCount++;
        // Count family events + children (parent_child rels)
        for (const child of node.children) {
          if (FAMILY_EVENT_TAGS[child.tag]) eventCount++;
        }
        break;
      }
      case 'SOUR': {
        if (node.xref) sourceCount++;
        break;
      }
      case 'REPO': {
        if (node.xref) repositoryCount++;
        break;
      }
    }
  }

  // Count approximate relationships: 1 couple per FAM + parent_child for each CHIL
  let relationshipCount = familyCount; // couple relationships
  for (const node of tree) {
    if (node.tag !== 'FAM') continue;
    const husb = node.children.find(c => c.tag === 'HUSB');
    const wife = node.children.find(c => c.tag === 'WIFE');
    const parentCount = (husb ? 1 : 0) + (wife ? 1 : 0);
    const childCount = node.children.filter(c => c.tag === 'CHIL').length;
    relationshipCount += childCount * parentCount; // parent_child rels
  }

  // Estimate unique places by scanning PLAC values
  for (const node of tree) {
    if (node.tag === 'INDI' || node.tag === 'FAM') {
      for (const child of node.children) {
        const plac = child.children?.find(c => c.tag === 'PLAC');
        if (plac?.value) placeNames.add(plac.value);
      }
    }
  }

  // Check for known issues
  const version = detectGedcomVersion(tree);
  if (version === 'unknown') warnings.push('Could not detect GEDCOM version');

  // Check for unknown tags
  const unknownTags = new Map<string, number>();
  const KNOWN_TOP_TAGS = new Set(['HEAD', 'TRLR', 'INDI', 'FAM', 'SOUR', 'NOTE', 'SNOTE', 'OBJE', 'REPO', 'SUBM', '_GRP', '_TODO', '_PLAC']);
  for (const node of tree) {
    if (!KNOWN_TOP_TAGS.has(node.tag) && node.level === 0) {
      unknownTags.set(node.tag, (unknownTags.get(node.tag) ?? 0) + 1);
    }
  }
  for (const [tag, count] of unknownTags) {
    warnings.push(`Unknown top-level tag: ${tag} (${count} occurrences)`);
  }

  const totalEntities = personCount + familyCount + sourceCount;
  const estimatedSize: 'small' | 'medium' | 'large' =
    totalEntities < 50 ? 'small' : totalEntities < 500 ? 'medium' : 'large';

  return {
    personCount,
    relationshipCount,
    eventCount,
    sourceCount,
    placeCount: placeNames.size,
    repositoryCount,
    warnings,
    estimatedSize,
  };
}

// ── Main import entry point ─────────────────────────────────────────────────

export async function importGedcom(db: Database, tree: GedcomNode[], options?: ImportOptions): Promise<ValidationReport> {
  // Compute rawCounts from original (pre-normalization) tree
  const rawCounts = {
    individuals: 0,
    families: 0,
    sources: 0,
    repositories: 0,
    notes: 0,
    objects: 0,
    submitters: 0,
  };
  for (const node of tree) {
    switch (node.tag) {
      case 'INDI': rawCounts.individuals++; break;
      case 'FAM':  rawCounts.families++; break;
      case 'SOUR': rawCounts.sources++; break;
      case 'REPO': rawCounts.repositories++; break;
      case 'NOTE':
      case 'SNOTE': rawCounts.notes++; break;
      case 'OBJE': rawCounts.objects++; break;
      case 'SUBM': rawCounts.submitters++; break;
    }
  }

  // Snapshot row counts before import (each statement finalized immediately).
  // `.n!` non-null asserts the row exists — `SELECT COUNT(*)` always returns one row.
  const personsBefore        = (await queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM persons'))!.n;
  const familiesBefore       = (await queryOne<{ n: number }>(db, "SELECT COUNT(*) as n FROM relationships WHERE type='couple'"))!.n;
  const sourcesBefore        = (await queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM sources'))!.n;
  const placesBefore         = (await queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM places'))!.n;
  const citationsBefore      = (await queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM citations'))!.n;
  const reposBefore          = (await queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM repositories'))!.n;
  const groupsBefore         = (await queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM groups'))!.n;
  const researchTasksBefore  = (await queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM research_tasks'))!.n;
  const evBeforeRows         = await queryAll<{ event_type: string; cnt: number }>(db, 'SELECT event_type, COUNT(*) as cnt FROM events GROUP BY event_type');
  const evBefore             = new Map<string, number>(evBeforeRows.map(r => [r.event_type, r.cnt]));

  const version = detectGedcomVersion(tree);
  const normalizedTree = normalizeForImport(tree, version);

  const { proxy: cachedDb, finalize: finalizeCache } = withStatementCache(db);
  await runSql(db, 'BEGIN');
  let partial: { skipped: { tag: string; count: number }[]; warnings: string[]; ldsCount: number; tranCount: number; noCount: number; assoDrop: number; holgerRemarkCount: number; namelessPersonCount: number; firstPersonId: string | null; submitterNames: string[]; submitterContact: { address?: string; phone?: string; email?: string } | null; groupLinkWarnings: string[] };
  try {
    partial = await doImportGedcom(cachedDb, normalizedTree, options);
    await runSql(db, 'COMMIT');
  } catch (err) {
    await runSql(db, 'ROLLBACK');
    throw err;
  } finally {
    finalizeCache(); // free all compiled statements from the WASM heap
    await runSql(db, 'PRAGMA shrink_memory'); // release SQLite page cache back to WASM heap
  }

  // Snapshot row counts after import (each statement finalized immediately)
  const personsAfter        = (await queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM persons'))!.n;
  const familiesAfter       = (await queryOne<{ n: number }>(db, "SELECT COUNT(*) as n FROM relationships WHERE type='couple'"))!.n;
  const sourcesAfter        = (await queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM sources'))!.n;
  const placesAfter         = (await queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM places'))!.n;
  const citationsAfter      = (await queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM citations'))!.n;
  const reposAfter          = (await queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM repositories'))!.n;
  const groupsAfter         = (await queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM groups'))!.n;
  const researchTasksAfter  = (await queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM research_tasks'))!.n;
  const evAfterRows         = await queryAll<{ event_type: string; cnt: number }>(db, 'SELECT event_type, COUNT(*) as cnt FROM events GROUP BY event_type');

  // Match SUBM name to a person and store as default_person_id
  // Strategies (tried in order, first unique match wins):
  //   1) Full "given surname" exact match
  //   2) preferred_name + surname-starts-with (handles "Linda Ahnstedt" → "Eva Linda Marie" / "Ahnstedt f. Nord")
  //   3) Given-name-only for single-word SUBM names (e.g. "Linda")
  outer:
  for (const rawName of partial.submitterNames) {
    const trimmed = rawName.trim();
    const queries: { sql: string; params: string[] }[] = [
      // 1) Full name exact match
      {
        sql: "SELECT person_id FROM person_names WHERE lower(trim(coalesce(given_name,'') || ' ' || coalesce(surname,''))) = lower(?) LIMIT 2",
        params: [trimmed],
      },
    ];
    // 2) preferred_name + surname prefix match (for "f. Nord" style suffixes)
    const spaceIdx = trimmed.lastIndexOf(' ');
    if (spaceIdx > 0) {
      const submGiven = trimmed.slice(0, spaceIdx);
      const submSurname = trimmed.slice(spaceIdx + 1);
      queries.push({
        sql: "SELECT person_id FROM person_names WHERE lower(trim(preferred_name)) = lower(?) AND lower(surname) LIKE lower(? || '%') LIMIT 2",
        params: [submGiven, submSurname],
      });
    }
    // 3) Given-name-only fallback for single-word SUBM names
    if (!trimmed.includes(' ')) {
      queries.push({
        sql: "SELECT person_id FROM person_names WHERE lower(trim(given_name)) = lower(?) LIMIT 2",
        params: [trimmed],
      });
    }
    for (const q of queries) {
      const stmt = db.prepare(q.sql);
      try {
        const rows = await stmt.all(q.params) as { person_id: string }[];
        if (rows.length === 1) {
          await setDbSetting(db, 'default_person_id', rows[0].person_id);
          break outer;
        }
      } finally {
        (stmt as unknown as { finalize(): void }).finalize();
      }
    }
  }

  // Persist firstPersonId as default_person_id when SUBM matching produced
  // nothing — guarantees the chart has a focal person after import instead
  // of an empty visualization. Never overwrites an existing setting (a user
  // who imports into a populated DB keeps their prior tree subject).
  if (!(await getDbSetting(db, 'default_person_id')) && partial.firstPersonId) {
    await setDbSetting(db, 'default_person_id', partial.firstPersonId);
  }

  // Populate researcher_* settings from the SUBM record. Mirrors the
  // exporter at src/gedcom/exporter.ts:147-187 — closes the round-trip gap
  // where SUBM ADDR/PHON/EMAIL were silently dropped on import.
  // Only writes settings that are currently empty: a user who has typed
  // their own contact info in Settings keeps it on re-import.
  if (partial.submitterNames.length > 0 || partial.submitterContact) {
    const setIfEmpty = async (key: string, value: string | undefined): Promise<void> => {
      if (!value) return;
      const existing = await getDbSetting(db, key);
      if (existing && existing.trim()) return;
      await setDbSetting(db, key, value);
    };
    await setIfEmpty('researcher_name', partial.submitterNames[0]);
    await setIfEmpty('researcher_address', partial.submitterContact?.address);
    await setIfEmpty('researcher_phone', partial.submitterContact?.phone);
    await setIfEmpty('researcher_email', partial.submitterContact?.email);
  }

  const events: Record<string, number> = {};
  for (const r of evAfterRows) {
    const delta = r.cnt - (evBefore.get(r.event_type) ?? 0);
    if (delta > 0) events[r.event_type] = delta;
  }

  // Build unmappedData
  const unmappedData: UnmappedItem[] = [];
  if (partial.ldsCount > 0) {
    unmappedData.push({ category: `LDS ordinances (BAPL, SLGC, CONL, ENDL, SLGS) — not relevant outside LDS context, not imported`, count: partial.ldsCount });
  }
  // TRAN is a GEDCOM 7.0 construct, but we count and warn regardless of version
  // since some extended 5.5.1 dialects also use it.
  if (partial.tranCount > 0) {
    partial.warnings.push(`${partial.tranCount} TRAN translation node(s) converted to 'aka' name entries — translation language/script metadata not preserved`);
  }
  if (partial.noCount > 0) {
    unmappedData.push({ category: `NO negative assertions (GEDCOM 7.0) — no app concept for explicit non-events, not imported`, count: partial.noCount });
  }
  if (partial.assoDrop > 0) {
    unmappedData.push({
      category: `ASSO associations with unrecognised RELA types (e.g. Neighbour, Witness) — no general association concept in app, not imported`,
      count: partial.assoDrop,
    });
  }
  if (partial.holgerRemarkCount > 0) {
    partial.warnings.push(`${partial.holgerRemarkCount} Holger REMA/MISC remarks imported as person notes`);
  }
  if (partial.namelessPersonCount > 0) {
    // Source had INDI records with no NAME tag — preserved as nameless persons
    // because the family reference graph requires them (parent/spouse links).
    // Surfaced via the PERSON_NO_NAME quality check so the user can review.
    partial.warnings.push(`${partial.namelessPersonCount} INDI record(s) had no NAME tag — imported as nameless persons (visible under quality checks)`);
  }
  // Dangling _GROUP_LINK refs (per-link warnings) — disclosed individually so
  // the user knows which group memberships were dropped.
  for (const warning of partial.groupLinkWarnings) {
    partial.warnings.push(warning);
  }
  if (options?.profile === 'holger') {
    const hdpCount = partial.skipped.find(s => s.tag === '_HDP')?.count ?? 0;
    const h8pCount = partial.skipped.find(s => s.tag === '_H8P')?.count ?? 0;
    if (hdpCount + h8pCount > 0) {
      unmappedData.push({
        category: '_HDP / _H8P — Holger internal metadata (sort keys, display IDs, timestamps). All data is present in standard GEDCOM tags; nothing was lost.',
        count: hdpCount + h8pCount,
      });
    }
  }

  // Build modelLimitations
  const modelLimitations: string[] = [];

  // tagStats mirrors skipped (same data, different field name)
  const tagStats = partial.skipped.map(s => ({ tag: s.tag, occurrences: s.count }));

  // defaultPersonId: from SUBM match if available, otherwise firstPersonId fallback
  const submMatch = await getDbSetting(db, 'default_person_id');
  const defaultPersonOverride: { defaultPersonId?: string } =
    submMatch ? { defaultPersonId: submMatch }
      : partial.firstPersonId != null ? { defaultPersonId: partial.firstPersonId }
      : {};

  return {
    version,
    persons:       personsAfter       - personsBefore,
    families:      familiesAfter      - familiesBefore,
    events,
    sources:       sourcesAfter       - sourcesBefore,
    places:        placesAfter        - placesBefore,
    citations:     citationsAfter     - citationsBefore,
    repositories:  reposAfter         - reposBefore,
    groups:        groupsAfter        - groupsBefore,
    researchTasks: researchTasksAfter - researchTasksBefore,
    skipped:       partial.skipped,
    warnings:      partial.warnings,
    rawCounts,
    tagStats,
    unmappedData,
    modelLimitations,
    ...defaultPersonOverride,
    ...(partial.submitterNames.length > 0 ? { submitterName: partial.submitterNames[0] } : {}),
  };
}
