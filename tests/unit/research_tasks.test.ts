import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import { createPerson, deletePerson } from '../../src/api/persons';
import {
  createResearchTask,
  getResearchTask,
  listResearchTasks,
  getResearchTasksForPerson,
  updateResearchTask,
  deleteResearchTask,
} from '../../src/api/research_tasks';

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
    expect(task.person_id).toBeNull();

    const fetched = getResearchTask(db, task.id);
    expect(fetched?.task).toBe('Find birth record for Erik Nilsson');
  });

  it('creates a task with all fields', () => {
    const person = createPerson(db, { given_name: 'Erik', surname: 'Nilsson' });
    const task = createResearchTask(db, {
      task: 'Verify immigration date',
      notes: 'Conflicting sources',
      person_id: person.id,
      priority: 3,
      status: 'in_progress',
    });
    expect(task.person_id).toBe(person.id);
    expect(task.priority).toBe(3);
    expect(task.status).toBe('in_progress');
    expect(task.notes).toBe('Conflicting sources');
  });

  it('creates a task with null person_id (general task)', () => {
    const task = createResearchTask(db, { task: 'Review source list', person_id: null });
    expect(task.person_id).toBeNull();
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

describe('tasks for person', () => {
  it('gets tasks for a specific person', () => {
    const person = createPerson(db, { given_name: 'Anna', surname: 'Berg' });
    createResearchTask(db, { task: 'Find baptism', person_id: person.id });
    createResearchTask(db, { task: 'Find marriage', person_id: person.id });
    createResearchTask(db, { task: 'General task' }); // no person

    const tasks = getResearchTasksForPerson(db, person.id);
    expect(tasks).toHaveLength(2);
  });

  it('returns empty array for person with no tasks', () => {
    const person = createPerson(db, { given_name: 'Solo', surname: 'Person' });
    expect(getResearchTasksForPerson(db, person.id)).toHaveLength(0);
  });

  it('cascades delete: removing person removes their tasks', () => {
    const person = createPerson(db, { given_name: 'Lars', surname: 'Svensson' });
    const task = createResearchTask(db, { task: 'Find birth', person_id: person.id });

    deletePerson(db, person.id);
    expect(getResearchTask(db, task.id)).toBeNull();
  });
});
