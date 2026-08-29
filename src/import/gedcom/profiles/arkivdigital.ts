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
 *  - _FREL/_MREL   parent relation type (via the shared `parentRelSubtype`)
 *
 * Everything here is a pure function. DB access lives in `src/api/` so the
 * ArkivDigital decisions stay testable without a database.
 */
import type { ParentChildSubtype } from '../../../api/types';
import type { GedcomNode } from '../../../gedcom/parser';
import { markConsumed } from '../tag-accounting';

/** Matches 'Arkiv_Digital', 'ArkivDigital', any case or separator. */
export function isArkivDigital(tree: GedcomNode[]): boolean {
  const head = tree.find(n => n.tag === 'HEAD');
  const sour = head?.children.find(n => n.tag === 'SOUR')?.value ?? '';
  return sour.replace(/[_\s-]/g, '').toLowerCase() === 'arkivdigital';
}

export interface PlaceLevel {
  name: string;
  type: 'country' | 'admin1' | 'parish' | 'locality';
  externalId?: string;
}

function adplBlock(placNode: GedcomNode): GedcomNode | undefined {
  const node = placNode.children.find(c => c.tag === '_ADPL');
  // Direct .children access bypasses the marking in node-utils, so mark here.
  // Prime Directive (cont.) clause 1: a node a phase reads must be accounted for.
  if (node) markConsumed(node);
  return node;
}

/**
 * Reads the _ADPL block into ordered levels, outermost first.
 *
 * ArkivDigital hands us the hierarchy explicitly, which is strictly better than
 * splitting the PLAC display string on commas: a locality name can itself
 * contain commas ("Moroten 2&3 Gotlandsgatan 84, Renstjärnasgatan 49-51, ..."),
 * and _PARISH_AID distinguishes two parishes that share a name.
 *
 * Returns null when the PLAC carries no _ADPL, so the caller can fall through
 * to the flat resolver for a mixed file.
 */
export function parseAdpl(placNode: GedcomNode): PlaceLevel[] | null {
  const adpl = adplBlock(placNode);
  if (!adpl) return null;

  const val = (tag: string): string => {
    const node = adpl.children.find(c => c.tag === tag);
    if (node) markConsumed(node);
    return node?.value?.trim() ?? '';
  };
  const country = val('_COUNTRY');
  const county = val('_COUNTY');
  const parish = val('_PARISH');
  const parishAid = val('_PARISH_AID');
  const locality = val('_LOCALITY');

  const levels: PlaceLevel[] = [];
  if (country) levels.push({ name: country, type: 'country' });
  if (county) levels.push({ name: county, type: 'admin1' });
  if (parish) {
    levels.push(parishAid
      ? { name: parish, type: 'parish', externalId: parishAid }
      : { name: parish, type: 'parish' });
  }
  if (locality) levels.push({ name: locality, type: 'locality' });
  return levels;
}

/**
 * The härad (judicial district) of a probate.
 *
 * Deliberately not a level of its own: a judicial district is an attribute of
 * the parish, not a container the locality sits inside. ArkivDigital documents
 * this tag as `_JUDICIAL_DISTRICT`, but GEDCOM 5.5.1 caps tags at 15 characters
 * so the files emit `_JUDICIAL`. Both are accepted.
 */
export function parseAdplJudicial(placNode: GedcomNode): string | null {
  const adpl = adplBlock(placNode);
  if (!adpl) return null;
  const node = adpl.children.find(c => c.tag === '_JUDICIAL' || c.tag === '_JUDICIAL_DISTRICT');
  if (node) markConsumed(node);
  const value = node?.value?.trim() ?? '';
  return value || null;
}

/**
 * A parent-relation word → `ParentChildSubtype`.
 *
 * Shared vocabulary, not an ArkivDigital one. ArkivDigital writes lowercase
 * `adopted`; Family Tree Maker and PAF write capitalised `Natural`, `Step`,
 * `Adopted`, `Unknown`, `Private` at the same `FAM.CHIL` position; standard
 * `PEDI` writes `birth` / `adopted` / `foster` / `sealing`. All three arrive
 * here.
 *
 * **Unrecognised input answers `unknown`, never `biological`.** Prime
 * Directive: a relation the file declined to state is not a relation the DB
 * gets to assert. The previous `default: 'biological'` stored a biological
 * parent for 35 rows across the sample corpus whose files said otherwise —
 * 34 `Unknown` and 1 `Private`, measured 2026-08-29 over the 36 .ged files in
 * export-import/samples.
 *
 * An unseen vendor word still cannot fail the import; it lands on `unknown`,
 * and the raw tag is named in the import report either way.
 */
export function parentRelSubtype(value: string): ParentChildSubtype {
  switch (value.trim().toLowerCase()) {
    case 'adopted':    return 'adopted';
    case 'foster':     return 'foster';
    case 'step':       return 'step';
    case 'natural':
    case 'birth':
    case 'biological': return 'biological';
    default:           return 'unknown';
  }
}
