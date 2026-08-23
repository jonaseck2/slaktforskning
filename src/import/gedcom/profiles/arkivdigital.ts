/**
 * ArkivDigital-specific import profile.
 *
 * ArkivDigital is Sweden's dominant church-archive service; its GEDCOM 5.5.1
 * export carries a documented set of custom tags. Handled here:
 *
 *  - _ADPL         explicit place hierarchy (country / county / parish / locality)
 *  - _PARISH_AID   ArkivDigital's parish id — 335 distinct ids for 333 distinct
 *                  names across four real exports, so the name alone cannot
 *                  identify a parish
 *  - _AID          archive pointer, volume-level on SOUR, image-level on the citation
 *  - _DESC         the researcher's own annotation on an event
 *  - _TITLE        occupation or title
 *  - _FREL/_MREL   parent relation type
 *
 * Everything here is a pure function. DB access lives in `src/api/` so the
 * ArkivDigital decisions stay testable without a database.
 */
import type { GedcomNode } from '../../../gedcom/parser';

/** Matches 'Arkiv_Digital', 'ArkivDigital', any case or separator. */
export function isArkivDigital(tree: GedcomNode[]): boolean {
  const head = tree.find(n => n.tag === 'HEAD');
  const sour = head?.children.find(n => n.tag === 'SOUR')?.value ?? '';
  return sour.replace(/[_\s-]/g, '').toLowerCase() === 'arkivdigital';
}
