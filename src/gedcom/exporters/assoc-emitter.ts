/**
 * Person-to-person association emitter — T05 implementation.
 *
 * Carries `person_associations` (godparent, friend, colleague, enemy,
 * neighbor, other) as GEDCOM `ASSO` substructures under the owning INDI.
 *
 * Distinct from the exporter code that emits `ASSO` for sibling /
 * godparent / other *relationships* (rows in the `relationships` table —
 * see exporter.ts INDI block around `personRels`). Those continue to
 * flow through the FAM-export / relationships path. This module covers
 * the per-person-authored ASSO links that do NOT belong on a FAM and are
 * NOT mediated by any event.
 *
 * Per-version tag difference:
 *  - 5.5.1: the inner role tag is `RELA`     (`2 RELA <role>`).
 *  - 7.0:   the inner role tag is `ROLE`     (`2 ROLE <role>`). The 7.0
 *           spec renamed RELA → ROLE under ASSO; both versions are
 *           losslessly representable for the six role values we model.
 *
 * Notes:
 *  - The standard ASSO substructure has a NOTE child in both versions,
 *    so we emit `2 NOTE <text>` (with CONT continuation for multi-line)
 *    when the association carries a note. The importer reads this back
 *    into `person_associations.notes`.
 */

import type { Database } from 'node-sqlite3-wasm';
import { getAssociationsForPerson } from '../../api/person_associations';

/**
 * Emit `ASSO @Ix@` blocks for every `person_associations` row where
 * `person_id = ownerPersonId`. Each row produces:
 *
 *     <baseLevel>   ASSO @Ix@
 *     <baseLevel+1> RELA <role>   (5.5.1)  OR  ROLE <role>  (7.0)
 *     <baseLevel+1> NOTE <text>   (optional, multi-line via CONT)
 *
 * The XREF is looked up from the exporter-supplied `personXref` map (same
 * map used by the FAM/INDI emission code). If the related person has no
 * xref entry (i.e. the row was deleted concurrently, or the export scope
 * excludes them) the row is silently skipped — there is no GEDCOM way to
 * point at a missing INDI.
 */
export async function emitPersonAssociations(
  db: Database,
  ownerPersonId: string,
  baseLevel: number,
  version: '5.5.1' | '7.0',
  personXref: Map<string, string>,
  lines: string[],
): Promise<void> {
  const assocs = await getAssociationsForPerson(db, ownerPersonId);
  if (assocs.length === 0) return;

  const roleTag = version === '7.0' ? 'ROLE' : 'RELA';
  for (const a of assocs) {
    const otherXr = personXref.get(a.related_person_id);
    if (!otherXr) continue;
    lines.push(`${baseLevel} ASSO ${otherXr}`);
    lines.push(`${baseLevel + 1} ${roleTag} ${a.role}`);
    if (a.notes && a.notes.length > 0) {
      const noteLines = a.notes.split(/\r?\n/);
      lines.push(`${baseLevel + 1} NOTE ${noteLines[0]}`);
      for (let i = 1; i < noteLines.length; i++) {
        lines.push(`${baseLevel + 2} CONT ${noteLines[i]}`);
      }
    }
  }
}
