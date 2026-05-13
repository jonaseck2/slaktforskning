// Thin re-export stub during the in-progress `report_data.ts` split
// (plan: 2026-05-14-report-data-split). All builders live in `./report_data/`;
// this file exists so existing call sites keep resolving via the legacy path
// until Task 10 flips them (or proves the directory's index.ts is sufficient
// for Node module resolution and lets this file be deleted entirely).

export type { EventWithPlace, CitationWithSource, RelationshipSummary } from './report_data/types';

export { getResearchGaps } from './report_data/research-gaps';
export type { ResearchGaps } from './report_data/research-gaps';
export { getPlaceHistory } from './report_data/place-history';
export type { PlaceHistory, PlaceEventRecord } from './report_data/place-history';
export { getFamilyUnit } from './report_data/family-unit';
export type { FamilyUnit, FamilyMember } from './report_data/family-unit';
export { getAncestorTree } from './report_data/ancestor-tree';
export type { AncestorNode } from './report_data/ancestor-tree';
export { getPersonSummary } from './report_data/person-summary';
export type { PersonSummary } from './report_data/person-summary';
export { getAliveInYear } from './report_data/alive-in-year';
export type { AliveInYearPerson, AliveInYearFamily, AliveInYearResult } from './report_data/alive-in-year';
export { getTimeline } from './report_data/timeline';
export type { TimelineRelationshipLabel, TimelinePartner, TimelineEntry, TimelineOptions } from './report_data/timeline';
