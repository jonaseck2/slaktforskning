import * as reportData from '../../api/report_data';
import * as duplicates from '../../api/duplicates';
import { defineChannel } from './registry';

// ── Reports ──────────────────────────────────────────────────────────────────

defineChannel({
  name: 'reports:personSummary',
  thread: 'worker',
  handler: async (db, personId: string) => reportData.getPersonSummary(db, personId),
});

defineChannel({
  name: 'reports:familyUnit',
  thread: 'worker',
  handler: async (db, relId: string) => reportData.getFamilyUnit(db, relId),
});

defineChannel({
  name: 'reports:ancestorTree',
  thread: 'worker',
  handler: async (db, personId: string, generations?: number) =>
    reportData.getAncestorTree(db, personId, generations),
});

defineChannel({
  name: 'reports:placeHistory',
  thread: 'worker',
  handler: async (db, placeId: string) => reportData.getPlaceHistory(db, placeId),
});

defineChannel({
  name: 'reports:researchGaps',
  thread: 'worker',
  handler: async (db, personId: string) => reportData.getResearchGaps(db, personId),
});

defineChannel({
  name: 'reports:timeline',
  thread: 'worker',
  handler: async (db, personId: string, options?: import('../../api/report_data').TimelineOptions) =>
    reportData.getTimeline(db, personId, options),
});

defineChannel({
  name: 'reports:aliveInYear',
  thread: 'worker',
  handler: async (db, year: number) => reportData.getAliveInYear(db, year),
});

// ── Duplicates ────────────────────────────────────────────────────────────────

defineChannel({
  name: 'duplicates:find',
  thread: 'worker',
  handler: async (db, limit?: number) => await duplicates.findDuplicates(db, limit),
});

defineChannel({
  name: 'duplicates:findPage',
  thread: 'worker',
  handler: async (db, limit?: number, offset?: number) => await duplicates.findDuplicatesPage(db, limit, offset),
});

defineChannel({
  name: 'duplicates:count',
  thread: 'worker',
  handler: async (db) => await duplicates.countDuplicates(db),
});

defineChannel({
  name: 'duplicates:merge',
  thread: 'worker',
  mutating: true,
  handler: async (db, targetId: string, sourceId: string) =>
    await duplicates.mergePersons(db, targetId, sourceId),
});

defineChannel({
  name: 'duplicates:ignore',
  thread: 'worker',
  mutating: true,
  handler: async (db, personAId: string, personBId: string) =>
    await duplicates.ignoreDuplicate(db, personAId, personBId),
});
