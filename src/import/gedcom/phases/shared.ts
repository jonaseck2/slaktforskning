/**
 * Shared constants used across GEDCOM import phases.
 *
 * These tag maps drive how raw GEDCOM event tags route to our internal
 * event_type enum during phaseIndividuals (PERSON_EVENT_TAGS) and
 * phaseFamilies (FAMILY_EVENT_TAGS).
 */

export const PERSON_EVENT_TAGS: Record<string, string> = {
  BIRT: 'birth', DEAT: 'death', CHR: 'christening', BURI: 'burial',
  // BAPM (adult/LDS baptism) collapses to christening in our model — single
  // semantic type matching Swedish "Dop". Round-tripping LDS-specific data is
  // out of scope.
  BAPM: 'christening', CONF: 'confirmation', OCCU: 'occupation',
  RESI: 'residence', EDUC: 'education', EMIG: 'emigration',
  IMMI: 'immigration', NATU: 'naturalization', CENS: 'census',
  PROB: 'probate', WILL: 'will', GRAD: 'graduation', RETI: 'retirement',
  ENGA: 'engagement', ADOP: 'adoption',
  // GEDCOM 5.5/5.5.1 standard INDI events. CREM and BARM/BASM are widely
  // emitted by FTM, RootsMagic, Heiner's torture test, etc. ORDN is GEDCOM
  // standard for ordination. _MILT is FTM's non-standard military service tag.
  CREM: 'cremation', BARM: 'bar_mitzvah', BASM: 'bas_mitzvah',
  ORDN: 'ordination', _MILT: 'military',
  // Fact-shaped tags (line value preserved in events.value, not notes).
  // TITL routes through its own event_type rather than the legacy
  // TITL→occupation conversion so round-trip preserves the original tag.
  TITL: 'title', RELI: 'religion', DSCR: 'description', FACT: 'fact',
  EVEN: 'other',
};

export const FAMILY_EVENT_TAGS: Record<string, string> = {
  MARR: 'marriage', DIV: 'divorce', CENS: 'census', ENGA: 'engagement',
  // GEDCOM 5.5/5.5.1 standard FAM events (ANUL, MARL) plus the widely-used
  // non-standard _SEPR for separation. Real-world: FTM Habsburg has 18 ANULs
  // and 7 _SEPRs that were silently dropped before.
  ANUL: 'annulment', MARL: 'marriage_license', _SEPR: 'separation',
  EVEN: 'other',
};
