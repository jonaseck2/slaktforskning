/**
 * Shared types for the GEDCOM import pipeline.
 *
 * ImportContext holds all state maps that survive across import phases.
 * Every phase function receives the context as a parameter instead of
 * closing over local variables.
 */

import type { Database } from 'node-sqlite3-wasm';
import type { GedcomNode } from '../../gedcom/parser';
import type { Place } from '../../api/types';
import type { ImportOptions } from './import-core';

/** Mutable context threaded through all import phases. */
export interface ImportContext {
  db: Database;
  tree: GedcomNode[];
  /** Original parsed tree (pre-normalization). Phases that need the raw 7.0
   *  structure — notably T04's SNOTE @Nx@ pointers, which `normalize.ts`
   *  rewrites as inline NOTE text on entities — read from this map.
   *  Always non-null on the live import path; left optional for legacy
   *  tests that build a context manually. */
  originalTree?: GedcomNode[];
  options: ImportOptions | undefined;
  isGenney: boolean;
  isHolger: boolean;
  isArkivDigital: boolean;
  /** ArkivDigital `_PARISH_AID` values collected by phasePrepPlaces, flushed to
   *  `external_identifiers` once the table exists. Round-trip only — nothing in
   *  the app reads these to make a decision. */
  placeExternalIds?: Array<{ placeId: string; externalId: string }>;
  resolvePlaceFn: (db: Database, name: string) => Promise<Place>;
  /** Pre-resolved place map (set by phasePrepPlaces). Keyed by normalized
   *  name. Replaces the per-event IPC roundtrip of `findOrCreatePlace`
   *  with a Map.get() inside resolvePlaceFn. */
  prefetchedPlaces?: Map<string, Place>;
  /** Pre-resolved inline-OBJE map (set by phasePrepInlineMedia). Keyed by
   *  the OBJE GedcomNode itself. Replaces every per-event
   *  `createMedia(...)` IPC inside `importObjeNode` with a Map.get(). */
  inlineMediaMap?: Map<GedcomNode, string>;

  // ── Maps built & consumed across phases ──────────────────────────────────
  noteMap: Map<string, string>;                         // xref → note text (legacy: text-into-entity-`notes`-column path; populated for top-level NOTE records and, on 7.0, also for SNOTE records via normalize.ts)
  /** xref → noteId from `notes` table (T04). Populated by phaseNotes from
   *  the original pre-normalize tree's top-level SNOTE records.
   *  phaseNoteLinks reads this to build `note_links` rows for SNOTE @Nx@
   *  pointer children on entities. */
  noteIdMap: Map<string, string>;
  objeMap: Map<string, string>;                         // xref → app media UUID
  repoMap: Map<string, string>;                         // xref → app repository id
  grpMap: Map<string, string>;                          // xref → app group id
  sourceMap: Map<string, string>;                       // xref → app source id
  personMap: Map<string, string>;                       // xref → app person id
  placeIdMap: Map<string, string>;                      // old place UUID → current DB place UUID
  eventIdMap: Map<string, string>;                      // old event UUID → current DB event UUID
  holgerAdoptionMap: Map<string, Map<string, string>>; // personXref → familyXref → subtype

  // ── ASSO data collected during Phase 2 for Phase 4 ───────────────────────
  assoData: Array<{ personId: string; assoNode: GedcomNode }>;

  // ── Report accumulators ──────────────────────────────────────────────────
  skippedTags: Map<string, number>;
  ldsCount: number;
  tranCount: number;
  noCount: number;
  assoDropCount: number;
  holgerRemarkCount: number;
  /** Count of INDI records imported with no NAME tag — preserved with allowNameless. */
  namelessPersonCount: number;
  firstPersonId: string | null;
  submitterNames: string[];
  /** Contact info from the first SUBM record that has a NAME — used to populate researcher_* settings. */
  submitterContact: { address?: string; phone?: string; email?: string } | null;
  /** Warnings from `_GROUP_LINK` REFs that didn't dereference (dangling xref). */
  groupLinkWarnings: string[];
}
