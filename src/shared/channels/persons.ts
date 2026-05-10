import * as persons from '../../api/persons';
import * as uw from '../../api/undo_wrappers';
import { defineChannel } from './registry';

defineChannel({
  name: 'persons:create',
  thread: 'worker',
  mutating: true,
  handler: (db, data) => uw.createPersonUndo(db, data),
});

defineChannel({
  name: 'persons:createWithEvent',
  thread: 'worker',
  mutating: true,
  handler: (db, data) => uw.createPersonWithEventUndo(db, data),
});

defineChannel({
  name: 'persons:get',
  thread: 'worker',
  handler: (db, id: string) => persons.getPerson(db, id),
});

defineChannel({
  name: 'persons:list',
  thread: 'worker',
  handler: (db) => persons.listPersons(db),
});

defineChannel({
  name: 'persons:update',
  thread: 'worker',
  mutating: true,
  handler: (db, id: string, data) => uw.updatePersonUndo(db, id, data),
});

defineChannel({
  name: 'persons:delete',
  thread: 'worker',
  mutating: true,
  handler: (db, id: string) => uw.deletePersonUndo(db, id),
});

defineChannel({
  name: 'persons:search',
  thread: 'worker',
  handler: (db, query: string, relateeId: string | null) => persons.searchPersons(db, query, relateeId ?? null),
});

defineChannel({
  name: 'persons:addName',
  thread: 'worker',
  mutating: true,
  handler: (db, personId: string, data) => uw.addPersonNameUndo(db, personId, data),
});

defineChannel({
  name: 'persons:getNames',
  thread: 'worker',
  handler: (db, personId: string) => persons.getPersonNames(db, personId),
});

defineChannel({
  name: 'persons:updateName',
  thread: 'worker',
  mutating: true,
  handler: (db, id: string, data) => uw.updatePersonNameUndo(db, id, data),
});

defineChannel({
  name: 'persons:deleteName',
  thread: 'worker',
  mutating: true,
  handler: (db, id: string) => uw.deletePersonNameUndo(db, id),
});

defineChannel({
  name: 'persons:addIdentifier',
  thread: 'worker',
  mutating: true,
  handler: (db, personId: string, data) => persons.addPersonIdentifier(db, personId, data),
});

defineChannel({
  name: 'persons:getIdentifiers',
  thread: 'worker',
  handler: (db, personId: string) => persons.getPersonIdentifiers(db, personId),
});

defineChannel({
  name: 'persons:deleteIdentifier',
  thread: 'worker',
  mutating: true,
  handler: (db, id: string) => persons.deletePersonIdentifier(db, id),
});

defineChannel({
  name: 'persons:listPage',
  thread: 'worker',
  handler: (
    db,
    limit: number,
    offset: number,
    sortBy: persons.ListPersonsSortBy,
    sortDir: persons.ListPersonsSortDir,
    query?: string,
    sortBy2?: persons.ListPersonsSortBy | null,
    sortDir2?: persons.ListPersonsSortDir,
  ) => ({
    persons: persons.listPersonsPage(db, limit, offset, sortBy, sortDir, query, sortBy2 ?? null, sortDir2),
    total: persons.countPersons(db, query),
  }),
});

defineChannel({
  name: 'persons:refreshQualityIssueCounts',
  thread: 'worker',
  // Not flagged `mutating: true` — this is a derived render-time cache,
  // refreshing it should not trigger every list view to reload. The
  // `quality_issue_counts` table is exempt from the GEDCOM fidelity
  // registry for the same reason.
  handler: (db, counts: Record<string, number>) => persons.refreshQualityIssueCounts(db, counts),
});

defineChannel({
  name: 'persons:getQualityIssueCounts',
  thread: 'worker',
  handler: (db, personIds: string[]) => persons.getQualityIssueCounts(db, personIds),
});

defineChannel({
  name: 'persons:searchWithDetails',
  thread: 'worker',
  handler: (db, query: string) => persons.searchPersonsWithDetails(db, query),
});

defineChannel({
  name: 'persons:listUnsourcedPage',
  thread: 'worker',
  handler: (db, limit: number, offset: number) => ({
    persons: persons.listUnsourcedPersonsPage(db, limit, offset),
    total: persons.countUnsourcedPersons(db),
  }),
});
