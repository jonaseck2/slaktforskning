import * as reportData from '../../api/report_data';
import * as duplicates from '../../api/duplicates';
import { defineChannel } from './registry';

// ── Reports ──────────────────────────────────────────────────────────────────

defineChannel({
  name: 'reports:personSummary',
  thread: 'worker',
  handler: (db, personId: string) => reportData.getPersonSummary(db, personId),
});

defineChannel({
  name: 'reports:familyUnit',
  thread: 'worker',
  handler: (db, relId: string) => reportData.getFamilyUnit(db, relId),
});

defineChannel({
  name: 'reports:ancestorTree',
  thread: 'worker',
  handler: (db, personId: string, generations?: number) =>
    reportData.getAncestorTree(db, personId, generations),
});

defineChannel({
  name: 'reports:placeHistory',
  thread: 'worker',
  handler: (db, placeId: string) => reportData.getPlaceHistory(db, placeId),
});

defineChannel({
  name: 'reports:researchGaps',
  thread: 'worker',
  handler: (db, personId: string) => reportData.getResearchGaps(db, personId),
});

defineChannel({
  name: 'reports:timeline',
  thread: 'worker',
  handler: (db, personId: string) => reportData.getTimeline(db, personId),
});

defineChannel({
  name: 'reports:aliveInYear',
  thread: 'worker',
  handler: (db, year: number) => reportData.getAliveInYear(db, year),
});

// ── Duplicates ────────────────────────────────────────────────────────────────

defineChannel({
  name: 'duplicates:find',
  thread: 'worker',
  handler: (db, limit?: number) => duplicates.findDuplicates(db, limit),
});

defineChannel({
  name: 'duplicates:findPage',
  thread: 'worker',
  handler: (db, limit?: number, offset?: number) => duplicates.findDuplicatesPage(db, limit, offset),
});

defineChannel({
  name: 'duplicates:count',
  thread: 'worker',
  handler: (db) => duplicates.countDuplicates(db),
});

defineChannel({
  name: 'duplicates:merge',
  thread: 'worker',
  mutating: true,
  handler: (db, targetId: string, sourceId: string) =>
    duplicates.mergePersons(db, targetId, sourceId),
});

defineChannel({
  name: 'duplicates:ignore',
  thread: 'worker',
  mutating: true,
  handler: (db, personAId: string, personBId: string) =>
    duplicates.ignoreDuplicate(db, personAId, personBId),
});
