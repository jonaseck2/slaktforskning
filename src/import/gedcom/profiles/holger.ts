/**
 * Holger / OurKind-specific import profile.
 *
 * Holger extensions handled here:
 *  - ENGA TYPE on FAM → couple subtype mapping (Sambo/Partner/Parter/Särbo → cohabitation, etc.)
 *  - ADOP on INDI with FAMC + TYPE → parent_child subtype override
 *    (Fosterbarn → foster, Adoptivbarn → adopted, otherwise biological)
 *  - ENGA on FAM without MARR is a relationship-type marker, not an event
 *  - Windows-style OBJE FILE paths remapped via mediaDir option
 *
 * These features are enabled when ImportOptions.profile === 'holger'.
 */

import type { GedcomNode } from '../../../gedcom/parser';

/**
 * Maps a Holger ENGA TYPE value to an app couple subtype.
 * Called when a FAM record has ENGA but no MARR.
 */
export function holgerEngaSubtype(engaNode: GedcomNode): string {
  const typeNode = engaNode.children.find(c => c.tag === 'TYPE');
  const type = typeNode?.value?.trim() ?? '';
  // 'Parter' (Swedish: "parties in a relationship") is a distinct Holger type, not a typo of 'Partner'
  if (['Sambo', 'Partner', 'Parter', 'Särbo'].includes(type)) return 'cohabitation';
  if (type === 'Relation') return 'other';
  return 'unknown'; // includes 'Förlovade' (engaged) — no specific subtype for that
}

/**
 * Parses all ADOP nodes on an INDI record and returns a map of
 * familyXref → parent_child subtype.
 * Called once per INDI during Phase 2.
 */
export function parseHolgerAdoptionSubtypes(
  indiNode: GedcomNode,
): Map<string, string> {
  const result = new Map<string, string>();
  for (const adopNode of indiNode.children.filter(c => c.tag === 'ADOP')) {
    const famcNode = adopNode.children.find(c => c.tag === 'FAMC');
    const typeNode = adopNode.children.find(c => c.tag === 'TYPE');
    if (!famcNode) continue;
    const raw = typeNode?.value?.trim() ?? '';
    const subtype =
      raw === 'Fosterbarn' ? 'foster' :
      raw === 'Adoptivbarn' ? 'adopted' :
      'biological';
    result.set(famcNode.value, subtype);
  }
  return result;
}
