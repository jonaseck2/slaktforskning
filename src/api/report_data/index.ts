// Public entry point for the report-data API. Each report builder lives in its
// own sibling file; this index re-exports them so consumers can keep importing
// from `../api/report_data`. Helper extraction (Task 11 of the plan) lands
// here as `export * from './shared'` if any patterns prove genuinely shared.

export type { EventWithPlace, CitationWithSource, RelationshipSummary } from './types';

export { getResearchGaps } from './research-gaps';
export type { ResearchGaps } from './research-gaps';

export { getPlaceHistory } from './place-history';
export type { PlaceHistory, PlaceEventRecord } from './place-history';

export { getFamilyUnit } from './family-unit';
export type { FamilyUnit, FamilyMember } from './family-unit';

export { getAncestorTree } from './ancestor-tree';
export type { AncestorNode } from './ancestor-tree';

export { getPersonSummary } from './person-summary';
export type { PersonSummary } from './person-summary';

export { getAliveInYear } from './alive-in-year';
export type { AliveInYearPerson, AliveInYearFamily, AliveInYearResult } from './alive-in-year';

export { getTimeline } from './timeline';
export type { TimelineRelationshipLabel, TimelinePartner, TimelineEntry, TimelineOptions } from './timeline';
