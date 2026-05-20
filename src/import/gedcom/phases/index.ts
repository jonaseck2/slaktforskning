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

export { phaseNotes, phaseNoteLinks } from './notes';
export { phasePrepPlaces } from './prep-places';
export { phasePrepInlineMedia } from './prep-inline-media';
export { phaseObje } from './obje';
export { phaseRepo } from './repo';
export { phaseGroups } from './groups';
export { phaseSources } from './sources';
export { phaseIndividuals } from './individuals';
export { phaseFamilies } from './families';
export { phaseAsso } from './asso';
export { phasePlaceCitations } from './place-citations';
export { phaseGroupRecords } from './group-records';
export { phaseTodos } from './todos';
export { phaseSubmitters } from './submitters';
// T09: HEAD originating-app metadata preservation.
export { phaseHeaderMetadata } from './header-metadata';
// T02 GEDCOM-alignment new phases (stubs; filled by Phase 2 tasks).
export { phaseNegations } from './negations';
export { phaseTranslations } from './translations';
export { phaseCoverage } from './coverage';
export { PERSON_EVENT_TAGS, FAMILY_EVENT_TAGS } from './shared';
