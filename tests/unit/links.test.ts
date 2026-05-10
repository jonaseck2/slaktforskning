import type { Database } from 'node-sqlite3-wasm';
import { describe, it, expect, beforeEach } from 'vitest';
import * as events from '../../src/api/events';
import * as groups from '../../src/api/groups';
import { getLinkedEntities, getCitationsByOwner } from '../../src/api/links';
import * as persons from '../../src/api/persons';
import * as places from '../../src/api/places';
import * as researchTasks from '../../src/api/research_tasks';
import * as sources from '../../src/api/sources';
import { createTestDb } from './helpers';

describe('getLinkedEntities (polymorphic)', async () => {
  let db: Database;
  beforeEach(async () => { db = await createTestDb(); });

  it('returns groups linked to a person via group_links', async () => {
    const p = await persons.createPerson(db, { sex: 'M', given_name: 'A', surname: 'B' });
    const g = await groups.createGroup(db, { name: 'G1' });
    await groups.addGroupLink(db, g.id, 'person', p.id);

    const result = await getLinkedEntities<{ id: string; name: string }>(db, {
      linkTable: 'group_links',
      parentTable: 'groups',
      parentFk: 'group_id',
      orderBy: 'g.name',
    }, 'person', p.id);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(g.id);
    expect(result[0].name).toBe('G1');
  });

  it('returns research_tasks linked to a place ordered by priority DESC', async () => {
    const place = await places.createPlace(db, { name: 'TestPlace' });
    const t1 = await researchTasks.createResearchTask(db, { task: 'low', priority: 1 });
    const t2 = await researchTasks.createResearchTask(db, { task: 'high', priority: 5 });
    await researchTasks.addTaskLink(db, t1.id, 'place', place.id);
    await researchTasks.addTaskLink(db, t2.id, 'place', place.id);

    const result = await getLinkedEntities<{ id: string; priority: number }>(db, {
      linkTable: 'task_links',
      parentTable: 'research_tasks',
      parentFk: 'task_id',
      orderBy: 'rt.priority DESC, rt.created_at',
    }, 'place', place.id);

    expect(result.map(r => r.priority)).toEqual([5, 1]);
  });
});

describe('getCitationsByOwner', async () => {
  let db: Database;
  beforeEach(async () => { db = await createTestDb(); });

  it('returns citations linked via person_id', async () => {
    const p = await persons.createPerson(db, { sex: 'F', given_name: 'C', surname: 'D' });
    const s = await sources.createSource(db, { title: 'Census' });
    await sources.createCitation(db, { source_id: s.id, person_id: p.id, page: '12' });

    const result = await getCitationsByOwner<{ source_id: string; page: string }>(db, 'person', p.id);
    expect(result).toHaveLength(1);
    expect(result[0].source_id).toBe(s.id);
    expect(result[0].page).toBe('12');
  });

  it('returns citations linked via event_id', async () => {
    const e = await events.createEvent(db, { event_type: 'birth' });
    const s = await sources.createSource(db, { title: 'BirthRec' });
    await sources.createCitation(db, { source_id: s.id, event_id: e.id });

    const result = await getCitationsByOwner<{ source_id: string }>(db, 'event', e.id);
    expect(result).toHaveLength(1);
    expect(result[0].source_id).toBe(s.id);
  });

  it('returns citations linked via source_id', async () => {
    const s = await sources.createSource(db, { title: 'Census' });
    await sources.createCitation(db, { source_id: s.id, page: '1' });
    await sources.createCitation(db, { source_id: s.id, page: '2' });

    const result = await getCitationsByOwner<{ page: string }>(db, 'source', s.id);
    expect(result.map(r => r.page).sort()).toEqual(['1', '2']);
  });
});
