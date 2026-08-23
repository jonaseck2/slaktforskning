/**
 * Tags the importer deliberately does not model.
 *
 * `CLAUDE.md` Prime Directive (cont.) clause 1: the app does not have to model
 * every tag, it has to say what it didn't. An entry here IS that statement, and
 * the reason is the whole point — a path with a vague reason is not a decision,
 * it is a shrug.
 *
 * Adding an entry is how you make `import-tag-accounting.test.ts` pass. That is
 * intentional: the cost of not mapping a tag is having to write down why.
 *
 * Reason prefixes, enforced by test:
 *   excluded:not-relevant   no app concept, and none wanted
 *   excluded:structural     GEDCOM plumbing carrying no authored value
 *   excluded:redundant      the same value is read from somewhere else
 *   unmapped:pending-<plan> real authored data we intend to map — needs a filed plan
 *
 * Pattern syntax, deliberately minimal so nobody can declare everything:
 *   'INDI.RESI._TITLE'   exact path
 *   '*.PLAC._ADPL'       suffix match under any parent
 *   'INDI.BIRT.*'        any descendant of this prefix
 */

export interface DeclaredUnmapped {
  path: string;
  reason: string;
}

export const DECLARED_UNMAPPED: DeclaredUnmapped[] = [
  // ── Structure and pre-session reads ──────────────────────────────────────
  // These are consumed, just not by a phase inside the accounting session.
  { path: 'TRLR',           reason: 'excluded:structural — end-of-file marker, carries no value' },
  { path: 'HEAD.GEDC',      reason: 'excluded:structural — version envelope, read by detect.ts before the session opens' },
  { path: 'HEAD.GEDC.VERS', reason: 'excluded:structural — read by detect.ts before the session opens' },
  { path: 'HEAD.GEDC.FORM', reason: 'excluded:structural — always LINEAGE-LINKED in 5.5.1' },
  { path: 'HEAD.CHAR',      reason: 'excluded:structural — character set, applied at decode time before parsing' },
  { path: '*.NAME.GIVN',    reason: 'excluded:redundant — folded into the NAME value by normalize.ts before the session; individuals.ts parses the NAME value' },
  { path: '*.NAME.SURN',    reason: 'excluded:redundant — folded into the NAME value by normalize.ts before the session' },
  { path: 'INDI.FAMS',      reason: 'excluded:redundant — the couple link is read from the FAM record HUSB/WIFE' },
  { path: 'INDI.FAMC',      reason: 'excluded:redundant — the parent link is read from the FAM record CHIL' },

  // ── ArkivDigital — mapped by the arkivdigital profile in the next plan ────
  // docs/plans/2026-08-23-arkivdigital-import-design.md Parts 1-3.
  { path: 'SOUR._AID',                reason: 'unmapped:pending-arkivdigital-profile — archive volume pointer, needs external_identifiers' },
  { path: '*.SOUR._AID',              reason: 'unmapped:pending-arkivdigital-profile — image pointer on the citation' },
  { path: '*.PLAC._ADPL',             reason: 'unmapped:pending-arkivdigital-profile — place hierarchy block' },
  { path: '*.PLAC._ADPL._LOCALITY',   reason: 'unmapped:pending-arkivdigital-profile — locality, the leaf place name' },
  { path: '*.PLAC._ADPL._PARISH',     reason: 'unmapped:pending-arkivdigital-profile — parish (församling)' },
  { path: '*.PLAC._ADPL._PARISH_AID', reason: 'unmapped:pending-arkivdigital-profile — parish id; 335 distinct ids for 333 names, so the name alone cannot identify a parish' },
  { path: '*.PLAC._ADPL._COUNTY',     reason: 'unmapped:pending-arkivdigital-profile — county (län)' },
  { path: '*.PLAC._ADPL._COUNTRY',    reason: 'unmapped:pending-arkivdigital-profile — country' },
  { path: '*.PLAC._ADPL._JUDICIAL',   reason: 'unmapped:pending-arkivdigital-profile — härad; AD documents _JUDICIAL_DISTRICT but 5.5.1 caps tags at 15 chars' },
  { path: '*.SOUR.DATA.DATE',         reason: 'unmapped:pending-arkivdigital-profile — date the researcher consulted the record; citations.date_accessed exists and is empty' },
  { path: '*._DESC',                  reason: 'unmapped:pending-arkivdigital-profile — researcher annotation on an event' },
  { path: '*._TITLE',                 reason: 'unmapped:pending-arkivdigital-profile — occupation or title' },
  { path: '*.OBJE._POS',              reason: 'unmapped:pending-arkivdigital-profile — profile-picture crop position' },
  { path: '*.OBJE._PRIM',             reason: 'unmapped:pending-arkivdigital-profile — primary-photo flag' },
  { path: 'OBJE._FOFN',               reason: 'unmapped:pending-arkivdigital-profile — original filename' },
  { path: 'OBJE._SIZE',               reason: 'unmapped:pending-arkivdigital-profile — file size' },
  { path: 'OBJE._OWN',                reason: 'unmapped:pending-arkivdigital-profile — owner of the original media' },
  { path: 'OBJE._CAPT',               reason: 'unmapped:pending-arkivdigital-profile — capture date of the photograph' },
  { path: 'OBJE._DESC',               reason: 'unmapped:pending-arkivdigital-profile — media description' },
  { path: '*._TAG',                   reason: 'unmapped:pending-arkivdigital-profile — note label' },
  { path: '*._TAG.TYPE',              reason: 'unmapped:pending-arkivdigital-profile — note label type' },
  { path: 'FAM.CHIL._FREL',           reason: 'unmapped:pending-arkivdigital-profile — father relation, maps to a parent_child subtype' },
  { path: 'FAM.CHIL._MREL',           reason: 'unmapped:pending-arkivdigital-profile — mother relation, maps to a parent_child subtype' },

  // ── LDS ordinances — already summarised in unmappedData, declared for parity
  { path: 'INDI.BAPL', reason: 'excluded:not-relevant — LDS ordinance, no app concept' },
  { path: 'INDI.CONL', reason: 'excluded:not-relevant — LDS ordinance, no app concept' },
  { path: 'INDI.ENDL', reason: 'excluded:not-relevant — LDS ordinance, no app concept' },
  { path: 'INDI.SLGC', reason: 'excluded:not-relevant — LDS ordinance, no app concept' },
  { path: 'FAM.SLGS',  reason: 'excluded:not-relevant — LDS ordinance, no app concept' },
];

export function matchDeclared(path: string): DeclaredUnmapped | undefined {
  return DECLARED_UNMAPPED.find(d => {
    if (d.path === path) return true;
    if (d.path.startsWith('*.')) return path.endsWith(d.path.slice(1));
    if (d.path.endsWith('.*')) return path.startsWith(d.path.slice(0, -1));
    return false;
  });
}
