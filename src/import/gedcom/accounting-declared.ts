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
 *   excluded:profile-gated  read, but only when a specific import profile is active
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
  { path: '*.OBJE._POS', reason: 'unmapped:pending-unmapped-capture — no column on media/media_regions to hold it, and 32 occurrences across four real exports do not warrant one. Verbatim capture makes it non-destructive without modelling it. (profile-picture crop position)' },
  { path: '*.OBJE._PRIM', reason: 'unmapped:pending-unmapped-capture — no column on media/media_regions to hold it, and 32 occurrences across four real exports do not warrant one. Verbatim capture makes it non-destructive without modelling it. (primary-photo flag)' },
  { path: 'OBJE._FOFN', reason: 'unmapped:pending-unmapped-capture — no column on media/media_regions to hold it, and 32 occurrences across four real exports do not warrant one. Verbatim capture makes it non-destructive without modelling it. (original filename)' },
  { path: 'OBJE._SIZE', reason: 'unmapped:pending-unmapped-capture — no column on media/media_regions to hold it, and 32 occurrences across four real exports do not warrant one. Verbatim capture makes it non-destructive without modelling it. (file size)' },
  { path: 'OBJE._OWN', reason: 'unmapped:pending-unmapped-capture — no column on media/media_regions to hold it, and 32 occurrences across four real exports do not warrant one. Verbatim capture makes it non-destructive without modelling it. (owner of the original media)' },
  { path: 'OBJE._CAPT', reason: 'unmapped:pending-unmapped-capture — no column on media/media_regions to hold it, and 32 occurrences across four real exports do not warrant one. Verbatim capture makes it non-destructive without modelling it. (capture date of the photograph)' },
  { path: 'OBJE._DESC', reason: 'unmapped:pending-unmapped-capture — no column on media/media_regions to hold it, and 32 occurrences across four real exports do not warrant one. Verbatim capture makes it non-destructive without modelling it. (media description)' },
  { path: '*.NOTE._TITLE', reason: 'unmapped:pending-unmapped-capture — a label on a NOTE. The notes table has text and language, no label column, and ~20 occurrences across four real exports do not warrant one. Verbatim capture makes it non-destructive without modelling it.' },
  { path: '*._TAG', reason: 'unmapped:pending-unmapped-capture — a label on a NOTE. The notes table has text and language, no label column, and ~20 occurrences across four real exports do not warrant one. Verbatim capture makes it non-destructive without modelling it.' },
  { path: '*._TAG.TYPE', reason: 'unmapped:pending-unmapped-capture — a label on a NOTE. The notes table has text and language, no label column, and ~20 occurrences across four real exports do not warrant one. Verbatim capture makes it non-destructive without modelling it.' },

  // ── HEAD metadata about the export itself, not about the family ──────────
  { path: 'HEAD.DATE',      reason: 'excluded:not-relevant — when the exporting program ran, not a fact about the tree' },
  { path: 'HEAD.DATE.TIME', reason: 'excluded:not-relevant — clock time of the export run' },
  { path: 'HEAD.DEST',      reason: 'excluded:not-relevant — the system the file was addressed to' },
  { path: 'HEAD.FILE',      reason: 'excluded:not-relevant — the exporting program\'s own filename for the file' },
  { path: 'HEAD.SUBM',      reason: 'excluded:redundant — xref pointer to a SUBM record, which phaseSubmitters reads directly' },

  // ── Profile-gated reads ──────────────────────────────────────────────────
  { path: '*.NAME.FORE', reason: 'excluded:profile-gated — read as a preferred-name fallback when profile===\'holger\' (individuals.ts:170-173); genuinely unread otherwise' },

  // ── Dialect tags holding authored data — see the dialect-tag review plan ──
  // docs/plans/2026-08-23-dialect-tag-review.md. Each of these was invisible
  // before tag accounting existed; _LIVING is the sharpest example, sitting in
  // KNOWN_INDI_TAGS (so never in `skipped`) while no phase ever read it.
  { path: 'INDI._LIVING',      reason: 'unmapped:pending-dialect-tag-review — Legacy living flag; in KNOWN_INDI_TAGS but never read' },
  { path: 'INDI._FLGS',        reason: 'unmapped:pending-dialect-tag-review — Family Historian flag block' },
  { path: 'INDI._FLGS._LIVING', reason: 'unmapped:pending-dialect-tag-review — Family Historian living flag' },
  { path: 'INDI._FREL',        reason: 'unmapped:pending-dialect-tag-review — FTM/PAF father relation; maps to a parent_child subtype' },
  { path: 'INDI._MREL',        reason: 'unmapped:pending-dialect-tag-review — FTM/PAF mother relation; maps to a parent_child subtype' },
  { path: 'INDI._FREL._MREL',  reason: 'unmapped:pending-dialect-tag-review — FTM nests _MREL under _FREL' },
  { path: 'INDI._HDP',         reason: 'unmapped:pending-dialect-tag-review — Holger; counted for a warning at import-core.ts:594 but the value is not stored' },
  { path: '*.PARI',            reason: 'unmapped:pending-dialect-tag-review — Holger parish on an event; a real place component, currently dropped' },
  { path: 'INDI.ASSO.SOUR',    reason: 'unmapped:pending-dialect-tag-review — RootsMagic citation on an association; asso.ts reads ROLE/RELA/_EVID/NOTE but not SOUR' },
  { path: 'INDI._PHOTO',       reason: 'unmapped:pending-dialect-tag-review — MyHeritage primary-photo pointer' },
  { path: 'INDI._MTTAG',       reason: 'unmapped:pending-dialect-tag-review — MyHeritage tag pointer' },
  { path: 'INDI._WEBTAG',      reason: 'unmapped:pending-dialect-tag-review — Family Historian web link' },
  { path: 'INDI._CUSTOM',      reason: 'unmapped:pending-dialect-tag-review — unrecognised vendor tag in the non-standard fixture' },

  // ── ArkivDigital tags documented but never observed ──────────────────────
  // `FAM._DOMESTIC_PARTNERSHIP` and its `.DATE` used to sit here. Both are
  // mapped now — the couple reads as a cohabitation and the event carries the
  // date. See docs/plans/2026-08-23-ad-unsampled-tags.md Task 2.
  { path: '*._DATE_TEXT',                         reason: 'unmapped:pending-ad-unsampled-tags — mapped to date_original when the node has no DATE sibling (see docs/plans/2026-08-23-ad-unsampled-tags.md Task 3). Not mapped when a DATE is also present: date_original already holds the DATE value, and whether ArkivDigital means the two as alternatives or as complements is what a real sample answers and the documentation does not. Zero occurrences across the four real exports (measured 2026-08-29: 0 in 124878 lines).' },

  // ── Surfaced by running the accounting over the four real ArkivDigital
  // exports. Not AD-specific and not in this plan's scope; named here so the
  // real corpus is clean rather than quietly undeclared.
  { path: 'OBJE.FILE.FORM',      reason: 'unmapped:pending-dialect-tag-review — standard media format sub-tag; media.format holds one value and the FORM/TYPE pair is richer' },
  { path: 'OBJE.FILE.FORM.TYPE', reason: 'unmapped:pending-dialect-tag-review — media type qualifier under FORM' },
  { path: 'OBJE.FILE.TITL',      reason: 'unmapped:pending-dialect-tag-review — per-file title; media.title is per-record, not per-file' },
  { path: 'OBJE.REFN',           reason: 'unmapped:pending-dialect-tag-review — media reference number; no identifier storage for media yet' },
  { path: 'OBJE.REFN.TYPE',      reason: 'unmapped:pending-dialect-tag-review — qualifier on the media reference number' },
  { path: 'OBJE.RIN',            reason: 'unmapped:pending-dialect-tag-review — media record id number' },
  { path: 'SOUR.ABBR',           reason: 'unmapped:pending-dialect-tag-review — short form of the source title; no column on sources' },
  { path: 'SUBN',                reason: 'excluded:not-relevant — GEDCOM 5.5.1 submission record, metadata about the transmission rather than the family' },
  { path: '*.FAMS._TITLE',       reason: 'unmapped:pending-unmapped-capture — a title on a spouse-family pointer, not on the person or the event' },
  { path: '*.FAMC._TITLE',       reason: 'unmapped:pending-unmapped-capture — a title on a child-family pointer' },
  { path: '*.SOUR._TITLE',       reason: 'unmapped:pending-unmapped-capture — a title on a citation, not on the event' },

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
