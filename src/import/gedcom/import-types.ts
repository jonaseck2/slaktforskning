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
  options: ImportOptions | undefined;
  isGenney: boolean;
  isHolger: boolean;
  resolvePlaceFn: (db: Database, name: string) => Place;

  // ── Maps built & consumed across phases ──────────────────────────────────
  noteMap: Map<string, string>;                         // xref → note text
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
}
