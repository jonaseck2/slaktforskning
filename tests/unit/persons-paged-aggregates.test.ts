import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import {
  createPerson,
  addPersonName,
  listPersonsPage,
  getQualityIssueCounts,
  refreshQualityIssueCounts,
} from '../../src/api/persons';
import { createEvent } from '../../src/api/events';
import { createRelationship, addEventParticipant } from '../../src/api/relationships';
import { addMediaLink, createMedia } from '../../src/api/media';
import { createGroup, addGroupLink } from '../../src/api/groups';
import { createResearchTask, addTaskLink } from '../../src/api/research_tasks';
import { createTestDb } from './helpers';

let db: Database.Database;

beforeEach(() => {
  db = createTestDb() as unknown as Database.Database;
});

describe('listPersonsPage aggregate columns (single-SQL contract)', () => {
  it('returns name_count, event_count, relationship_count, media_count, group_count, task_count for each person', () => {
    const a = createPerson(db, { given_name: 'Anna', surname: 'Svensson' });
    const b = createPerson(db, { given_name: 'Bertil', surname: 'Andersson' });

    // Anna: 2 names, 1 event, 1 relationship, 1 media link, 1 group, 1 task
    addPersonName(db, a.id, { given_name: 'Anna', surname: 'Persson', name_type: 'married' });
    const ev = createEvent(db, { event_type: 'birth', date_original: '1900' });
    addEventParticipant(db, { event_id: ev.id, person_id: a.id, role: 'primary' });
    createRelationship(db, { type: 'couple', person1_id: a.id, person2_id: b.id });
    const m = createMedia(db, { title: 'photo' });
    addMediaLink(db, { media_id: m.id, entity_type: 'person', entity_id: a.id });
    const g = createGroup(db, { name: 'Familjen' });
    addGroupLink(db, g.id, 'person', a.id);
    const t = createResearchTask(db, { task: 'find death' });
    addTaskLink(db, t.id, 'person', a.id);

    const rows = listPersonsPage(db, 100, 0, 'surname', 'asc');
    const aRow = rows.find(r => r.id === a.id)!;
    const bRow = rows.find(r => r.id === b.id)!;

    expect(aRow.name_count).toBe(2);
    expect(aRow.event_count).toBe(1);
    expect(aRow.relationship_count).toBe(1);
    expect(aRow.media_count).toBe(1);
    expect(aRow.group_count).toBe(1);
    expect(aRow.task_count).toBe(1);

    // Bertil: 1 name (the auto-created one from createPerson), 0 events,
    // 1 relationship (the couple link), 0 media/group/task.
    expect(bRow.name_count).toBe(1);
    expect(bRow.event_count).toBe(0);
    expect(bRow.relationship_count).toBe(1);
    expect(bRow.media_count).toBe(0);
    expect(bRow.group_count).toBe(0);
    expect(bRow.task_count).toBe(0);
  });

  it('relationship_count counts both person1_id and person2_id roles', () => {
    const a = createPerson(db, { given_name: 'A', surname: 'A' });
    const b = createPerson(db, { given_name: 'B', surname: 'B' });
    const c = createPerson(db, { given_name: 'C', surname: 'C' });
    createRelationship(db, { type: 'couple', person1_id: a.id, person2_id: b.id });
    createRelationship(db, { type: 'parent_child', person1_id: c.id, person2_id: a.id });

    const rows = listPersonsPage(db, 100, 0, 'surname', 'asc');
    const aRow = rows.find(r => r.id === a.id)!;
    expect(aRow.relationship_count).toBe(2);
  });

  it('quality_count reads from quality_issue_counts cache (defaults to 0)', () => {
    const a = createPerson(db, { given_name: 'Q', surname: 'Q' });
    let rows = listPersonsPage(db, 100, 0, 'surname', 'asc');
    expect(rows.find(r => r.id === a.id)!.quality_count).toBe(0);

    refreshQualityIssueCounts(db, { [a.id]: 3 });
    rows = listPersonsPage(db, 100, 0, 'surname', 'asc');
    expect(rows.find(r => r.id === a.id)!.quality_count).toBe(3);
  });

  it('refreshQualityIssueCounts replaces previous values (delete + insert)', () => {
    const a = createPerson(db, { given_name: 'A', surname: 'A' });
    const b = createPerson(db, { given_name: 'B', surname: 'B' });
    refreshQualityIssueCounts(db, { [a.id]: 5, [b.id]: 2 });
    expect(getQualityIssueCounts(db, [a.id, b.id])).toEqual({ [a.id]: 5, [b.id]: 2 });

    // Subsequent refresh wipes prior entries — A no longer has issues.
    refreshQualityIssueCounts(db, { [b.id]: 1 });
    expect(getQualityIssueCounts(db, [a.id, b.id])).toEqual({ [a.id]: 0, [b.id]: 1 });
  });

  it('getQualityIssueCounts is bulk: single SQL regardless of N', () => {
    // Functional check — we cannot assert the SQL count from JS, but we can
    // verify the function returns a complete map for many ids.
    const ids: string[] = [];
    for (let i = 0; i < 50; i++) {
      const p = createPerson(db, { given_name: `P${i}`, surname: 'X' });
      ids.push(p.id);
    }
    const counts = Object.fromEntries(ids.map((id, i) => [id, i % 3]));
    refreshQualityIssueCounts(db, counts);
    const result = getQualityIssueCounts(db, ids);
    expect(Object.keys(result)).toHaveLength(50);
    expect(result[ids[0]]).toBe(0);
    expect(result[ids[1]]).toBe(1);
    expect(result[ids[2]]).toBe(2);
  });
});

describe('listPersonsPage secondary sort + sex sort', () => {
  it('sex ASC + secondary surname ASC keeps surnames alphabetical within each sex bucket', () => {
    createPerson(db, { given_name: 'Karl', surname: 'Yngve', sex: 'M' });
    createPerson(db, { given_name: 'Anna', surname: 'Berg', sex: 'F' });
    createPerson(db, { given_name: 'Beata', surname: 'Carlsson', sex: 'F' });
    createPerson(db, { given_name: 'David', surname: 'Andersson', sex: 'M' });

    const rows = listPersonsPage(db, 100, 0, 'sex', 'asc', undefined, 'surname', 'asc');
    // F, F, M, M with surnames in alphabetical order within each bucket
    expect(rows.map(r => `${r.sex}|${r.surname}`)).toEqual([
      'F|Berg',
      'F|Carlsson',
      'M|Andersson',
      'M|Yngve',
    ]);
  });

  it('event_count ASC sorts persons with no events first (sparseness scanner)', () => {
    const sparse = createPerson(db, { given_name: 'Sparse', surname: 'A' });
    const rich = createPerson(db, { given_name: 'Rich', surname: 'B' });
    for (let i = 0; i < 3; i++) {
      const ev = createEvent(db, { event_type: 'fact', date_original: `190${i}` });
      addEventParticipant(db, { event_id: ev.id, person_id: rich.id, role: 'primary' });
    }
    const rows = listPersonsPage(db, 100, 0, 'event_count', 'asc');
    expect(rows[0].id).toBe(sparse.id);
    expect(rows[0].event_count).toBe(0);
    expect(rows.find(r => r.id === rich.id)!.event_count).toBe(3);
  });

  it('default tiebreaker is surname,given_name even with no explicit secondary', () => {
    createPerson(db, { given_name: 'Anna', surname: 'Z' });
    createPerson(db, { given_name: 'Bert', surname: 'A' });
    // Sort by sex (all U). Without tiebreaker, the order would be arbitrary;
    // with the built-in tiebreaker the surname `A` row must appear first.
    const rows = listPersonsPage(db, 100, 0, 'sex', 'asc');
    expect(rows[0].surname).toBe('A');
    expect(rows[1].surname).toBe('Z');
  });
});
