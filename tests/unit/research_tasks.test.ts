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

beforeEach(() => {
  db = createTestDb();
});

describe('research tasks', () => {
  it('creates and retrieves a task', () => {
    const task = createResearchTask(db, { task: 'Find birth record for Erik Nilsson' });
    expect(task.id).toBeDefined();
    expect(task.task).toBe('Find birth record for Erik Nilsson');
    expect(task.status).toBe('open');
    expect(task.priority).toBe(0);

    const fetched = getResearchTask(db, task.id);
    expect(fetched?.task).toBe('Find birth record for Erik Nilsson');
  });

  it('creates a task with all fields', () => {
    const task = createResearchTask(db, {
      task: 'Verify immigration date',
      notes: 'Conflicting sources',
      priority: 3,
      status: 'in_progress',
    });
    expect(task.priority).toBe(3);
    expect(task.status).toBe('in_progress');
    expect(task.notes).toBe('Conflicting sources');
  });

  it('lists tasks ordered by priority desc then created_at', () => {
    createResearchTask(db, { task: 'Low priority', priority: 1 });
    createResearchTask(db, { task: 'High priority', priority: 3 });
    createResearchTask(db, { task: 'Medium priority', priority: 2 });

    const tasks = listResearchTasks(db);
    expect(tasks[0].priority).toBe(3);
    expect(tasks[1].priority).toBe(2);
    expect(tasks[2].priority).toBe(1);
  });

  it('updates task status and result', () => {
    const task = createResearchTask(db, { task: 'Find death record' });
    const updated = updateResearchTask(db, task.id, {
      status: 'done',
      result: 'Found in Härnösands stiftsarkiv 1867',
    });
    expect(updated?.status).toBe('done');
    expect(updated?.result).toBe('Found in Härnösands stiftsarkiv 1867');
  });

  it('update with no fields returns task unchanged', () => {
    const task = createResearchTask(db, { task: 'Unchanged' });
    const result = updateResearchTask(db, task.id, {});
    expect(result?.task).toBe('Unchanged');
  });

  it('update returns null for nonexistent id', () => {
    const result = updateResearchTask(db, 'nonexistent', { status: 'done' });
    expect(result).toBeNull();
  });

  it('deletes a task', () => {
    const task = createResearchTask(db, { task: 'To delete' });
    expect(deleteResearchTask(db, task.id)).toBe(true);
    expect(getResearchTask(db, task.id)).toBeNull();
  });

  it('delete returns false for nonexistent id', () => {
    expect(deleteResearchTask(db, 'nonexistent')).toBe(false);
  });

  it('get returns null for nonexistent id', () => {
    expect(getResearchTask(db, 'nonexistent')).toBeNull();
  });
});

describe('task links', () => {
  it('adds a person link to a task', () => {
    const person = createPerson(db, { given_name: 'Anna', surname: 'Berg' });
    const task = createResearchTask(db, { task: 'Find baptism' });

    const link = addTaskLink(db, task.id, 'person', person.id);
    expect(link.task_id).toBe(task.id);
    expect(link.entity_type).toBe('person');
    expect(link.entity_id).toBe(person.id);
  });

  it('addTaskLink is idempotent', () => {
    const person = createPerson(db, { given_name: 'Anna', surname: 'Berg' });
    const task = createResearchTask(db, { task: 'Find baptism' });
    addTaskLink(db, task.id, 'person', person.id);
    addTaskLink(db, task.id, 'person', person.id);
    expect(getTaskLinks(db, task.id)).toHaveLength(1);
  });

  it('supports persons, places, and media on the same task', () => {
    const task = createResearchTask(db, { task: 'Cross-reference parish records' });
    const p1 = createPerson(db, { given_name: 'Erik', surname: 'Nilsson' });
    const p2 = createPerson(db, { given_name: 'Anna', surname: 'Larsdotter' });
    const place = createPlace(db, { name: 'Härnösand' });
    const media = createMedia(db, { title: 'Parish register scan' });

    addTaskLink(db, task.id, 'person', p1.id);
    addTaskLink(db, task.id, 'person', p2.id);
    addTaskLink(db, task.id, 'place', place.id);
    addTaskLink(db, task.id, 'media', media.id);

    expect(getTaskLinks(db, task.id)).toHaveLength(4);
    expect(getResearchTasksForPerson(db, p1.id)).toHaveLength(1);
    expect(getResearchTasksForPerson(db, p2.id)).toHaveLength(1);
    expect(getResearchTasksForPlace(db, place.id)).toHaveLength(1);
    expect(getResearchTasksForMedia(db, media.id)).toHaveLength(1);
  });

  it('removes a task link by id', () => {
    const person = createPerson(db, { given_name: 'Anna', surname: 'Berg' });
    const task = createResearchTask(db, { task: 'Find baptism' });
    const link = addTaskLink(db, task.id, 'person', person.id);

    expect(removeTaskLink(db, link.id)).toBe(true);
    expect(getTaskLinks(db, task.id)).toHaveLength(0);
  });

  it('cascades delete: removing task removes its links', () => {
    const person = createPerson(db, { given_name: 'Anna', surname: 'Berg' });
    const task = createResearchTask(db, { task: 'Find baptism' });
    addTaskLink(db, task.id, 'person', person.id);

    deleteResearchTask(db, task.id);
    expect(getTaskLinks(db, task.id)).toHaveLength(0);
  });

  it('cleans up dangling task_links when a person is deleted', () => {
    const person = createPerson(db, { given_name: 'Anna', surname: 'Berg' });
    const task = createResearchTask(db, { task: 'Find baptism' });
    addTaskLink(db, task.id, 'person', person.id);
    deletePerson(db, person.id);
    // Task itself remains; only its link to the deleted person is gone
    expect(getResearchTask(db, task.id)).not.toBeNull();
    expect(getResearchTasksForPerson(db, person.id)).toHaveLength(0);
    expect(getTaskLinks(db, task.id)).toHaveLength(0);
  });
});

describe('tasks for entity', () => {
  it('gets tasks for a specific person', () => {
    const person = createPerson(db, { given_name: 'Anna', surname: 'Berg' });
    const t1 = createResearchTask(db, { task: 'Find baptism' });
    const t2 = createResearchTask(db, { task: 'Find marriage' });
    createResearchTask(db, { task: 'General task' }); // no person link
    addTaskLink(db, t1.id, 'person', person.id);
    addTaskLink(db, t2.id, 'person', person.id);

    expect(getResearchTasksForPerson(db, person.id)).toHaveLength(2);
  });

  it('returns empty array for person with no linked tasks', () => {
    const person = createPerson(db, { given_name: 'Solo', surname: 'Person' });
    expect(getResearchTasksForPerson(db, person.id)).toHaveLength(0);
  });
});
