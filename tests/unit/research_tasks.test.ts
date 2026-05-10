import { describe, it, expect, beforeEach } from 'vitest';
import { createPerson, deletePerson } from '../../src/api/persons';
import { createPlace } from '../../src/api/places';
import { createMedia } from '../../src/api/media';
import {
  createResearchTask,
  getResearchTask,
  listResearchTasks,
  getResearchTasksForPerson,
  getResearchTasksForPlace,
  getResearchTasksForMedia,
  updateResearchTask,
  deleteResearchTask,
  addTaskLink,
  removeTaskLink,
  getTaskLinks,
} from '../../src/api/research_tasks';
import { createTestDb } from './helpers';

let db: any;

beforeEach(async () => {
  db = await createTestDb();
});

describe('research tasks', async () => {
  it('creates and retrieves a task', async () => {
    const task = await createResearchTask(db, { task: 'Find birth record for Erik Nilsson' });
    expect(task.id).toBeDefined();
    expect(task.task).toBe('Find birth record for Erik Nilsson');
    expect(task.status).toBe('open');
    expect(task.priority).toBe(0);

    const fetched = await getResearchTask(db, task.id);
    expect(fetched?.task).toBe('Find birth record for Erik Nilsson');
  });

  it('creates a task with all fields', async () => {
    const task = await createResearchTask(db, {
      task: 'Verify immigration date',
      notes: 'Conflicting sources',
      priority: 3,
      status: 'in_progress',
    });
    expect(task.priority).toBe(3);
    expect(task.status).toBe('in_progress');
    expect(task.notes).toBe('Conflicting sources');
  });

  it('lists tasks ordered by priority desc then created_at', async () => {
    await createResearchTask(db, { task: 'Low priority', priority: 1 });
    await createResearchTask(db, { task: 'High priority', priority: 3 });
    await createResearchTask(db, { task: 'Medium priority', priority: 2 });

    const tasks = await listResearchTasks(db);
    expect(tasks[0].priority).toBe(3);
    expect(tasks[1].priority).toBe(2);
    expect(tasks[2].priority).toBe(1);
  });

  it('updates task status and result', async () => {
    const task = await createResearchTask(db, { task: 'Find death record' });
    const updated = await updateResearchTask(db, task.id, {
      status: 'done',
      result: 'Found in Härnösands stiftsarkiv 1867',
    });
    expect(updated?.status).toBe('done');
    expect(updated?.result).toBe('Found in Härnösands stiftsarkiv 1867');
  });

  it('update with no fields returns task unchanged', async () => {
    const task = await createResearchTask(db, { task: 'Unchanged' });
    const result = await updateResearchTask(db, task.id, {});
    expect(result?.task).toBe('Unchanged');
  });

  it('update returns null for nonexistent id', async () => {
    const result = await updateResearchTask(db, 'nonexistent', { status: 'done' });
    expect(result).toBeNull();
  });

  it('deletes a task', async () => {
    const task = await createResearchTask(db, { task: 'To delete' });
    expect(await deleteResearchTask(db, task.id)).toBe(true);
    expect(await getResearchTask(db, task.id)).toBeNull();
  });

  it('delete returns false for nonexistent id', async () => {
    expect(await deleteResearchTask(db, 'nonexistent')).toBe(false);
  });

  it('get returns null for nonexistent id', async () => {
    expect(await getResearchTask(db, 'nonexistent')).toBeNull();
  });
});

describe('task links', async () => {
  it('adds a person link to a task', async () => {
    const person = await createPerson(db, { given_name: 'Anna', surname: 'Berg' });
    const task = await createResearchTask(db, { task: 'Find baptism' });

    const link = await addTaskLink(db, task.id, 'person', person.id);
    expect(link.task_id).toBe(task.id);
    expect(link.entity_type).toBe('person');
    expect(link.entity_id).toBe(person.id);
  });

  it('addTaskLink is idempotent', async () => {
    const person = await createPerson(db, { given_name: 'Anna', surname: 'Berg' });
    const task = await createResearchTask(db, { task: 'Find baptism' });
    await addTaskLink(db, task.id, 'person', person.id);
    await addTaskLink(db, task.id, 'person', person.id);
    expect(await getTaskLinks(db, task.id)).toHaveLength(1);
  });

  it('supports persons, places, and media on the same task', async () => {
    const task = await createResearchTask(db, { task: 'Cross-reference parish records' });
    const p1 = await createPerson(db, { given_name: 'Erik', surname: 'Nilsson' });
    const p2 = await createPerson(db, { given_name: 'Anna', surname: 'Larsdotter' });
    const place = await createPlace(db, { name: 'Härnösand' });
    const media = await createMedia(db, { title: 'Parish register scan' });

    await addTaskLink(db, task.id, 'person', p1.id);
    await addTaskLink(db, task.id, 'person', p2.id);
    await addTaskLink(db, task.id, 'place', place.id);
    await addTaskLink(db, task.id, 'media', media.id);

    expect(await getTaskLinks(db, task.id)).toHaveLength(4);
    expect(await getResearchTasksForPerson(db, p1.id)).toHaveLength(1);
    expect(await getResearchTasksForPerson(db, p2.id)).toHaveLength(1);
    expect(await getResearchTasksForPlace(db, place.id)).toHaveLength(1);
    expect(await getResearchTasksForMedia(db, media.id)).toHaveLength(1);
  });

  it('removes a task link by id', async () => {
    const person = await createPerson(db, { given_name: 'Anna', surname: 'Berg' });
    const task = await createResearchTask(db, { task: 'Find baptism' });
    const link = await addTaskLink(db, task.id, 'person', person.id);

    expect(await removeTaskLink(db, link.id)).toBe(true);
    expect(await getTaskLinks(db, task.id)).toHaveLength(0);
  });

  it('cascades delete: removing task removes its links', async () => {
    const person = await createPerson(db, { given_name: 'Anna', surname: 'Berg' });
    const task = await createResearchTask(db, { task: 'Find baptism' });
    await addTaskLink(db, task.id, 'person', person.id);

    await deleteResearchTask(db, task.id);
    expect(await getTaskLinks(db, task.id)).toHaveLength(0);
  });

  it('cleans up dangling task_links when a person is deleted', async () => {
    const person = await createPerson(db, { given_name: 'Anna', surname: 'Berg' });
    const task = await createResearchTask(db, { task: 'Find baptism' });
    await addTaskLink(db, task.id, 'person', person.id);
    await deletePerson(db, person.id);
    // Task itself remains; only its link to the deleted person is gone
    expect(await getResearchTask(db, task.id)).not.toBeNull();
    expect(await getResearchTasksForPerson(db, person.id)).toHaveLength(0);
    expect(await getTaskLinks(db, task.id)).toHaveLength(0);
  });
});

describe('tasks for entity', async () => {
  it('gets tasks for a specific person', async () => {
    const person = await createPerson(db, { given_name: 'Anna', surname: 'Berg' });
    const t1 = await createResearchTask(db, { task: 'Find baptism' });
    const t2 = await createResearchTask(db, { task: 'Find marriage' });
    await createResearchTask(db, { task: 'General task' }); // no person link
    await addTaskLink(db, t1.id, 'person', person.id);
    await addTaskLink(db, t2.id, 'person', person.id);

    expect(await getResearchTasksForPerson(db, person.id)).toHaveLength(2);
  });

  it('returns empty array for person with no linked tasks', async () => {
    const person = await createPerson(db, { given_name: 'Solo', surname: 'Person' });
    expect(await getResearchTasksForPerson(db, person.id)).toHaveLength(0);
  });
});
