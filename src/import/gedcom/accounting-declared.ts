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
  { path: 'INDI._LIVING',      reason: 'excluded:redundant — the app derives living-ness at render time from dates (isLivingDerived in src/api/personLiving.ts, consumed by html_site, persons.ts and the reports) and persons has no living column by design. Legacy writes its own derived flag; storing another program\'s inference is what the Prime Directive forbids. Zero occurrences across the 36 sample files; fixture-only (legacy.ged).' },
  { path: 'INDI._FLGS',        reason: 'excluded:redundant — Family Historian flag block; its only observed child is _LIVING, see INDI._LIVING. Zero occurrences across the 36 sample files; fixture-only (family-historian.ged).' },
  { path: 'INDI._FLGS._LIVING', reason: 'excluded:redundant — Family Historian living flag, same derivation as INDI._LIVING' },
  { path: 'INDI._HDP',         reason: 'excluded:not-relevant — Holger\'s internal row id, not authored research. The import report already discloses it (import-core.ts, the _HDP / _H8P unmappedData category, asserted live in tests/unit/import-holger.test.ts). Storing it in person_identifiers would re-emit it as REFN + TYPE Other, changing the file on export while adding nothing the researcher wrote.' },
  { path: 'INDI.ASSO.SOUR',    reason: 'unmapped:pending-standard-tag-gaps — mapped when the ASSO creates a relationships row (citations.relationship_id); asso.ts reads it there. Not mapped for the person_associations branch: citations has no person_association_id column, and adding one is schema work that belongs with the other citation-shaped gaps in docs/plans/2026-08-28-standard-tag-gaps.md. 0 occurrences of INDI.ASSO.SOUR across the 36 sample files; 2 of FAM.ASSO.SOUR, and FAM-level ASSO is read by no phase at all.' },
  { path: 'INDI._PHOTO',       reason: 'excluded:redundant — MyHeritage primary-photo pointer. 0 occurrences across the 36 sample files; fixture-only (myheritage.ged). The media link already carries the person↔photo association and media_links.sort_order already carries primacy, so the pointer restates two things the DB holds.' },
  { path: 'INDI._MTTAG',       reason: 'unmapped:pending-standard-tag-gaps — MyHeritage tag pointer into a tag record. 0 occurrences across the 36 sample files; fixture-only (myheritage.ged). The app has `groups`, so this may well map — but the target record is not modelled either, and deciding both together is the follow-up plan\'s job.' },
  { path: 'INDI._WEBTAG',      reason: 'unmapped:pending-standard-tag-gaps — Family Historian web link on a person. 0 occurrences across the 36 sample files; fixture-only (non_standard_tags.ged). No column holds a URL on a person; `sources` has one, a person does not.' },
  { path: 'INDI._CUSTOM',      reason: 'excluded:not-relevant — the non_standard_tags fixture\'s deliberate stand-in for a vendor tag nobody has seen. 0 occurrences across the 36 sample files, and unmappable by definition: it exists to prove the accounting names a tag it cannot interpret.' },

  // ── ArkivDigital tags documented but never observed ──────────────────────
  // In the synthetic fixture so the gate reports them, deliberately not
  // modelled. See docs/plans/2026-08-23-ad-unsampled-tags.md.
  { path: 'FAM._DOMESTIC_PARTNERSHIP',            reason: 'unmapped:pending-ad-unsampled-tags — documented by ArkivDigital, zero occurrences across the four real exports; modelling against documentation with no sample risks the wrong shape (cohabitation event)' },
  { path: 'FAM._DOMESTIC_PARTNERSHIP.DATE',       reason: 'unmapped:pending-ad-unsampled-tags — documented by ArkivDigital, zero occurrences across the four real exports; modelling against documentation with no sample risks the wrong shape (its date)' },
  { path: '*._DATE_TEXT',                         reason: 'unmapped:pending-ad-unsampled-tags — documented by ArkivDigital, zero occurrences across the four real exports; modelling against documentation with no sample risks the wrong shape (a date with no valid GEDCOM form)' },

  // ── Surfaced by running the accounting over the four real ArkivDigital
  // exports. Not AD-specific and not in this plan's scope; named here so the
  // real corpus is clean rather than quietly undeclared.
  // OBJE.FILE.FORM (199 occurrences) and OBJE.FILE.TITL (175) are read now —
  // see readObjeFormAndTitle in obje-importer.ts. What is left needs a column
  // that does not exist, so each one carries its measured count and the plan
  // that owns it. Counts measured 2026-08-29 over the 36 .ged files in
  // export-import/samples.
  { path: 'OBJE.FILE.FORM.TYPE', reason: 'unmapped:pending-standard-tag-gaps — media type qualifier under FORM. 0 occurrences across the 36 sample files; what the corpus writes at that position is OBJE.FILE.FORM.MEDI (8 occurrences), GEDCOM 7.0\'s media-type qualifier. `media` has one `format` column and no room for a second qualifier, so this is modelling work.' },
  { path: 'OBJE.REFN',           reason: 'unmapped:pending-standard-tag-gaps — media reference number, 2 occurrences across the 36 sample files. `external_identifiers` does accept entity_type \'media\', but a bare GEDCOM REFN has no system name to file it under and the exporter has no path back out to `1 REFN`; both belong with the other identifier-shaped gaps.' },
  { path: 'OBJE.REFN.TYPE',      reason: 'unmapped:pending-standard-tag-gaps — qualifier on the media reference number, 2 occurrences across the 36 sample files. Blocked on the same decision as OBJE.REFN.' },
  { path: 'OBJE.RIN',            reason: 'unmapped:pending-standard-tag-gaps — media record id number. 0 occurrences across the 36 sample files; declared because the tag is standard and a file may carry it. Same identifier-storage gap as OBJE.REFN.' },
  { path: 'SOUR.ABBR',           reason: 'unmapped:pending-standard-tag-gaps — short form of the source title, 22 occurrences across the 36 sample files. `sources` has title, author, publication_info, url and source_type; a short title is a sixth column, which is modelling work rather than mapping work.' },
  { path: 'SUBN',                reason: 'excluded:not-relevant — GEDCOM 5.5.1 submission record, metadata about the transmission rather than the family' },
  { path: '*.FAMS._TITLE',       reason: 'unmapped:pending-unmapped-capture — a title on a spouse-family pointer, not on the person or the event' },
  { path: '*.FAMC._TITLE',       reason: 'unmapped:pending-unmapped-capture — a title on a child-family pointer' },
  { path: '*.SOUR._TITLE',       reason: 'unmapped:pending-unmapped-capture — a title on a citation, not on the event' },

  // ── Vendor and app bookkeeping surfaced by the real corpus ───────────────
  // Counts measured 2026-08-29 over the 36 .ged files in export-import/samples,
  // read from the census `scripts/accounting-over-samples.ts --out` writes.
  // None of these holds authored genealogy; each gets a reason, not a mapping.
  { path: 'INDI._UPD',          reason: 'excluded:not-relevant — RootsMagic last-updated timestamp, 4683 occurrences. When the exporting program last touched the row, not a fact about the person. The same class as CHAN below.' },
  { path: 'INDI._PPEXCLUDE',    reason: 'excluded:not-relevant — Legacy report-exclusion flag, 347 occurrences. A setting in Legacy\'s own report generator, not research about the person.' },
  { path: 'INDI._SOSADABOVILLE', reason: 'unmapped:pending-standard-tag-gaps — Ancestris Sosa-Stradonitz number, 203 occurrences. A real research artefact, but the numbering is relative to a root person the file never names, so importing the number without the root would store a value nobody can interpret. Needs the root-person question answered first.' },
  { path: '*._UID',             reason: 'unmapped:pending-standard-tag-gaps — event-level identifier, 14485 occurrences across 10 paths (INDI.DEAT._UID 4542, INDI.BIRT._UID 4478, FAM._UID 2877, FAM.MARR._UID 2503, and six smaller). `person_identifiers` covers persons only; events, families and the header have no identifier storage. INDI._UID itself is read into person_identifiers and never reaches here.' },
  { path: '*.RIN',              reason: 'unmapped:pending-standard-tag-gaps — event-level record id number, 14478 occurrences across 10 paths (INDI.DEAT.RIN 4542, INDI.BIRT.RIN 4478, FAM.RIN 2863, FAM.MARR.RIN 2503, and six smaller). Same missing identifier storage as *._UID. INDI.RIN is read into person_identifiers; OBJE.RIN has its own entry above and wins on first match.' },
  { path: '*.CHAN',             reason: 'excluded:not-relevant — when the exporting program last touched the record, 1476 occurrences across 8 record types. Metadata about the other program\'s editing session, not about the family.' },
  { path: '*.CHAN.DATE',        reason: 'excluded:not-relevant — the date of that edit, 1476 occurrences. See *.CHAN.' },
  { path: '*.CHAN.DATE.TIME',   reason: 'excluded:not-relevant — the clock time of that edit, 1476 occurrences. See *.CHAN.' },
  { path: '*.CHAN.NOTE',        reason: 'excluded:not-relevant — a note the exporting program attached to its own edit record, 16 occurrences. See *.CHAN.' },

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
