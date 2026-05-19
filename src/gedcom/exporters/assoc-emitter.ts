/**
 * Person-to-person association emitter — T02 scaffold; filled by T05.
 *
 * Carries `person_associations` (godparent, friend, colleague, enemy,
 * neighbor, other) as GEDCOM `ASSO` substructures under the owning INDI.
 *
 * Distinct from the existing exporter code that emits `ASSO` for sibling /
 * godparent / other *relationships* (rows in the `relationships` table) —
 * those continue to flow through the FAM-export path. This module covers
 * the per-person-authored ASSO links that don't belong on a FAM.
 *
 * GEDCOM 5.5.1 + 7.0 both have ASSO/RELA; the emitter is identical across
 * versions for the basic shape.
 */

import type { Database } from 'node-sqlite3-wasm';

/**
 * Emit `ASSO @Ix@` blocks for every `person_associations` row where
 * `person_id = ownerPersonId`. Each row produces:
 *
 *     <baseLevel>   ASSO @Ix@
 *     <baseLevel+1> RELA <role>
 *     <baseLevel+1> NOTE <notes>   (optional, multi-line via CONT)
 *
 * The XREF is looked up from the exporter-supplied `personXref` map (same
 * map used by the FAM/INDI emission code).
 *
 * **T02 stub:** no emission. T05 implements.
 */
export async function emitPersonAssociations(
  _db: Database,
  _ownerPersonId: string,
  _baseLevel: number,
  _version: '5.5.1' | '7.0',
  _personXref: Map<string, string>,
  _lines: string[],
): Promise<void> {
  // T05 implements.
}
