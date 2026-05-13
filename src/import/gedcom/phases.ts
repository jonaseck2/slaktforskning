/**
 * GEDCOM import phases.
 *
 * Each phase function mutates the ImportContext (maps, counters) and writes to
 * the database. The orchestrator in import-core.ts calls them in order.
 *
 * Phases:
 *   0   NOTE top-level records -> noteMap
 *   0.5 OBJE top-level records -> objeMap
 *   0.7 REPO records -> repoMap
 *   0.8 _GRP records (Genney only) -> grpMap
 *   1   SOUR records -> sourceMap
 *   2   INDI records -> personMap (+ holgerAdoptionMap for Holger)
 *   3   FAM records -> couple + parent_child relationships + family events
 *   4   ASSO post-processing -> event participants + sibling/godparent relationships
 *   5   _PLAC records -> place-level citations
 *   6   _TODO records (Genney only) -> research tasks
 *   SUBM  Submitter name collection
 */

// ── Tag maps ────────────────────────────────────────────────────────────────
// PERSON_EVENT_TAGS and FAMILY_EVENT_TAGS live in ./phases/shared and are
// re-exported here for callers that still import from './phases'.
export { PERSON_EVENT_TAGS, FAMILY_EVENT_TAGS } from './phases/shared';

// ── Phase 0: NOTE records ───────────────────────────────────────────────────
// phaseNotes lives in ./phases/notes and is re-exported here for callers that
// still import from './phases'.
export { phaseNotes } from './phases/notes';

// ── Phase 0.3: pre-resolve places ──────────────────────────────────────────
// phasePrepPlaces lives in ./phases/prep-places and is re-exported here for
// callers that still import from './phases'.
export { phasePrepPlaces } from './phases/prep-places';

// ── Phase 0.4: pre-resolve inline OBJE (media inside INDI/FAM/events) ──────
// phasePrepInlineMedia lives in ./phases/prep-inline-media and is re-exported
// here for callers that still import from './phases'.
export { phasePrepInlineMedia } from './phases/prep-inline-media';

// ── Phase 0.5: OBJE top-level records ──────────────────────────────────────
// phaseObje lives in ./phases/obje and is re-exported here for callers that
// still import from './phases'.
export { phaseObje } from './phases/obje';

// ── Phase 0.7: REPO records ────────────────────────────────────────────────
// phaseRepo lives in ./phases/repo and is re-exported here for callers that
// still import from './phases'.
export { phaseRepo } from './phases/repo';

// ── Phase 0.8: _GRP records (Genney only) ──────────────────────────────────
// phaseGroups lives in ./phases/groups and is re-exported here for callers
// that still import from './phases'.
export { phaseGroups } from './phases/groups';

// ── Phase 1: SOUR records ──────────────────────────────────────────────────
// phaseSources lives in ./phases/sources and is re-exported here for callers
// that still import from './phases'.
export { phaseSources } from './phases/sources';

// ── Phase 2: INDI records ──────────────────────────────────────────────────
// phaseIndividuals lives in ./phases/individuals and is re-exported here for
// callers that still import from './phases'.
export { phaseIndividuals } from './phases/individuals';

// ── Phase 3: FAM records ───────────────────────────────────────────────────
// phaseFamilies lives in ./phases/families and is re-exported here for callers
// that still import from './phases'.
export { phaseFamilies } from './phases/families';


// ── Phase 4: Post-process ASSO blocks ──────────────────────────────────────
// phaseAsso lives in ./phases/asso and is re-exported here for callers that
// still import from './phases'.
export { phaseAsso } from './phases/asso';

// ── Phase 5: _PLAC records for place-level citations ───────────────────────
// phasePlaceCitations lives in ./phases/place-citations and is re-exported here
// for callers that still import from './phases'.
export { phasePlaceCitations } from './phases/place-citations';

// ── Phase 5b: _GROUP records (groups + group_links) ────────────────────────
// phaseGroupRecords lives in ./phases/group-records and is re-exported here
// for callers that still import from './phases'.
export { phaseGroupRecords } from './phases/group-records';

// ── Phase 6: _TODO records (Genney only) ───────────────────────────────────
// phaseTodos lives in ./phases/todos and is re-exported here for callers that
// still import from './phases'.
export { phaseTodos } from './phases/todos';

// ── SUBM: collect submitter name + contact info ───────────────────────────
// phaseSubmitters lives in ./phases/submitters and is re-exported here for
// callers that still import from './phases'.
export { phaseSubmitters } from './phases/submitters';
