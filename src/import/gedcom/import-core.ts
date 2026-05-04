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
import { detectGedcomVersion } from './detect';
import type { GedcomVersion } from './detect';
import { normalizeForImport } from './normalize';
import { resolvePlaceFn as genneyResolvePlaceFn } from './profiles/genney';
import type { ImportContext } from './import-types';
import {
  PERSON_EVENT_TAGS, FAMILY_EVENT_TAGS,
  phaseNotes, phaseObje, phaseRepo, phaseGroups,
  phaseSources, phaseIndividuals, phaseFamilies,
  phaseAsso, phasePlaceCitations, phaseTodos, phaseSubmitters,
} from './phases';

// ── Public types (re-exported via index.ts) ─────────────────────────────────

export interface ImportOptions {
  /** Import profile. 'genney' enables Genney 4.1-specific extensions:
   *  Swedish hierarchical places, patronymic detection, _UID/_YHAPLOGROUP/_MHAPLOGROUP tags. */
  profile?: 'genney' | 'holger';
  /** Local directory for remapping Windows-style OBJE FILE paths (Holger exports).
   *  e.g. 'C:\\OurKind\\Media\\P12\\photo.jpg' -> '{mediaDir}/P12/photo.jpg' */
  mediaDir?: string;
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
    firstPersonId: null,
    submitterNames: [],
  };
}

// ── doImportGedcom: run all phases ──────────────────────────────────────────

function doImportGedcom(
  db: Database,
  tree: GedcomNode[],
  options?: ImportOptions,
): { skipped: { tag: string; count: number }[]; warnings: string[]; ldsCount: number; tranCount: number; noCount: number; assoDrop: number; holgerRemarkCount: number; firstPersonId: string | null; submitterNames: string[] } {
  const ctx = createImportContext(db, tree, options);

  const runPhase = (name: string, fn: (c: typeof ctx) => void) => {
    const t = Date.now();
    fn(ctx);
    console.log(`[import-timing]   phase ${name} — ${Date.now() - t}ms`);
  };
  runPhase('notes',          phaseNotes);
  runPhase('obje',           phaseObje);
  runPhase('repo',           phaseRepo);
  runPhase('groups',         phaseGroups);
  runPhase('sources',        phaseSources);
  runPhase('individuals',    phaseIndividuals);
  runPhase('families',       phaseFamilies);
  runPhase('asso',           phaseAsso);
  runPhase('placeCitations', phasePlaceCitations);
  runPhase('todos',          phaseTodos);
  runPhase('submitters',     phaseSubmitters);
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
    firstPersonId: ctx.firstPersonId,
    submitterNames: ctx.submitterNames,
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

/** Prepare, run once, finalize immediately -- avoids leaking WASM heap memory. */
function runSql(db: Database, sql: string): void {
  const stmt = db.prepare(sql);
  try { stmt.run([]); } finally { (stmt as unknown as { finalize(): void }).finalize(); }
}
function queryOne<T>(db: Database, sql: string): T {
  const stmt = db.prepare(sql);
  try { return stmt.get([]) as T; }
  finally { (stmt as unknown as { finalize(): void }).finalize(); }
}
function queryAll<T>(db: Database, sql: string): T[] {
  const stmt = db.prepare(sql);
  try { return stmt.all([]) as T[]; }
  finally { (stmt as unknown as { finalize(): void }).finalize(); }
}

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

export function importGedcom(db: Database, tree: GedcomNode[], options?: ImportOptions): ValidationReport {
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

  // Snapshot row counts before import (each statement finalized immediately)
  const personsBefore        = queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM persons').n;
  const familiesBefore       = queryOne<{ n: number }>(db, "SELECT COUNT(*) as n FROM relationships WHERE type='couple'").n;
  const sourcesBefore        = queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM sources').n;
  const placesBefore         = queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM places').n;
  const citationsBefore      = queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM citations').n;
  const reposBefore          = queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM repositories').n;
  const groupsBefore         = queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM groups').n;
  const researchTasksBefore  = queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM research_tasks').n;
  const evBeforeRows         = queryAll<{ event_type: string; cnt: number }>(db, 'SELECT event_type, COUNT(*) as cnt FROM events GROUP BY event_type');
  const evBefore             = new Map<string, number>(evBeforeRows.map(r => [r.event_type, r.cnt]));

  const version = detectGedcomVersion(tree);
  const normalizedTree = normalizeForImport(tree, version);

  const { proxy: cachedDb, finalize: finalizeCache } = withStatementCache(db);
  runSql(db, 'BEGIN');
  let partial: { skipped: { tag: string; count: number }[]; warnings: string[]; ldsCount: number; tranCount: number; noCount: number; assoDrop: number; holgerRemarkCount: number; firstPersonId: string | null; submitterNames: string[] };
  try {
    partial = doImportGedcom(cachedDb, normalizedTree, options);
    runSql(db, 'COMMIT');
  } catch (err) {
    runSql(db, 'ROLLBACK');
    throw err;
  } finally {
    finalizeCache(); // free all compiled statements from the WASM heap
    runSql(db, 'PRAGMA shrink_memory'); // release SQLite page cache back to WASM heap
  }

  // Snapshot row counts after import (each statement finalized immediately)
  const personsAfter        = queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM persons').n;
  const familiesAfter       = queryOne<{ n: number }>(db, "SELECT COUNT(*) as n FROM relationships WHERE type='couple'").n;
  const sourcesAfter        = queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM sources').n;
  const placesAfter         = queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM places').n;
  const citationsAfter      = queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM citations').n;
  const reposAfter          = queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM repositories').n;
  const groupsAfter         = queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM groups').n;
  const researchTasksAfter  = queryOne<{ n: number }>(db, 'SELECT COUNT(*) as n FROM research_tasks').n;
  const evAfterRows         = queryAll<{ event_type: string; cnt: number }>(db, 'SELECT event_type, COUNT(*) as cnt FROM events GROUP BY event_type');

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
        const rows = stmt.all(q.params) as { person_id: string }[];
        if (rows.length === 1) {
          setDbSetting(db, 'default_person_id', rows[0].person_id);
          break outer;
        }
      } finally {
        (stmt as unknown as { finalize(): void }).finalize();
      }
    }
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
    // defaultPersonId: from SUBM match if available, otherwise firstPersonId fallback
    ...((() => {
      const submMatch = getDbSetting(db, 'default_person_id');
      if (submMatch) return { defaultPersonId: submMatch };
      if (partial.firstPersonId != null) return { defaultPersonId: partial.firstPersonId };
      return {};
    })()),
    ...(partial.submitterNames.length > 0 ? { submitterName: partial.submitterNames[0] } : {}),
  };
}
