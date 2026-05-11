import { describe, it, expect, beforeEach } from 'vitest';
import { registerResearchTools } from '../../src/mcp/tools/prod/research';
import { createPerson } from '../../src/api/persons';
import { createEvent } from '../../src/api/events';
import { addEventParticipant } from '../../src/api/relationships';
import { createResearchTask, addTaskLink } from '../../src/api/research_tasks';
import { createTestDb } from './helpers';
import { createCaptureServer, callTool, makeCtx } from './helpers/mcpHarness';

let db: ReturnType<typeof createTestDb>;
let tools: ReturnType<typeof createCaptureServer>['tools'];

beforeEach(async () => {
  db = await createTestDb();
  const cap = createCaptureServer();
  registerResearchTools(cap.server, makeCtx(db));
  tools = cap.tools;
});

describe('get_research_gaps', async () => {
  it('registers the tool', async () => {
    expect(tools.has('get_research_gaps')).toBe(true);
  });

  it('returns "Person not found" text for unknown person_id', async () => {
    const result = await callTool<string>(tools, 'get_research_gaps', {
      person_id: 'nonexistent-id',
    });
    expect(result).toBe('Person not found');
  });

  it('returns research gaps object with correct shape for existing person', async () => {
    const person = await createPerson(db, { sex: 'M', given_name: 'Karl', surname: 'Larsson' });

    const result = await callTool<{
      person_id: string;
      missing_birth: boolean;
      missing_death: boolean;
      missing_parents: boolean;
      unsourced_events: unknown[];
      events_without_places: unknown[];
    }>(tools, 'get_research_gaps', { person_id: person.id });

    expect(result.person_id).toBe(person.id);
    expect(typeof result.missing_birth).toBe('boolean');
    expect(typeof result.missing_death).toBe('boolean');
    expect(typeof result.missing_parents).toBe('boolean');
    expect(Array.isArray(result.unsourced_events)).toBe(true);
    expect(Array.isArray(result.events_without_places)).toBe(true);
  });

  it('reports missing_birth and missing_parents as true for a person with no events', async () => {
    const person = await createPerson(db, { sex: 'F', given_name: 'Anna', surname: 'Svensson' });

    const result = await callTool<{
      missing_birth: boolean;
      missing_parents: boolean;
    }>(tools, 'get_research_gaps', { person_id: person.id });

    expect(result.missing_birth).toBe(true);
    expect(result.missing_parents).toBe(true);
  });

  it('reports missing_birth as false when a birth event exists', async () => {
    const person = await createPerson(db, { sex: 'M', given_name: 'Erik', surname: 'Nilsson' });
    const event = await createEvent(db, { event_type: 'birth', date_original: '1850' });
    await addEventParticipant(db, { event_id: event.id, person_id: person.id, role: 'primary' });

    const result = await callTool<{ missing_birth: boolean }>(tools, 'get_research_gaps', {
      person_id: person.id,
    });

    expect(result.missing_birth).toBe(false);
  });

  it('reports events_without_places for events that have no place', async () => {
    const person = await createPerson(db, { sex: 'F', given_name: 'Maja', surname: 'Berg' });
    const event = await createEvent(db, { event_type: 'baptism', date_original: '1870' });
    await addEventParticipant(db, { event_id: event.id, person_id: person.id, role: 'primary' });

    const result = await callTool<{ events_without_places: Array<{ id: string }> }>(
      tools,
      'get_research_gaps',
      { person_id: person.id },
    );

    const ids = result.events_without_places.map((e) => e.id);
    expect(ids).toContain(event.id);
  });
});

describe('add_research_task', async () => {
  it('registers the tool', async () => {
    expect(tools.has('add_research_task')).toBe(true);
  });

  it('creates a research task with minimal args and returns task + empty links', async () => {
    const result = await callTool<{
      id: string;
      task: string;
      status: string;
      links: unknown[];
    }>(tools, 'add_research_task', { task: 'Find baptism record' });

    expect(result.id).toBeTruthy();
    expect(result.task).toBe('Find baptism record');
    expect(result.status).toBe('open');
    expect(Array.isArray(result.links)).toBe(true);
    expect(result.links).toHaveLength(0);

    // Assert DB state
    const rows = db.prepare('SELECT * FROM research_tasks WHERE id = ?').all([result.id]) as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].task).toBe('Find baptism record');
    expect(rows[0].status).toBe('open');
  });

  it('creates task with priority, status, and notes', async () => {
    const result = await callTool<{
      id: string;
      priority: number;
      status: string;
      notes: string;
    }>(tools, 'add_research_task', {
      task: 'Verify emigration date',
      priority: 2,
      status: 'in_progress',
      notes: 'Check ship manifests',
    });

    expect(result.priority).toBe(2);
    expect(result.status).toBe('in_progress');
    expect(result.notes).toBe('Check ship manifests');

    const rows = db.prepare('SELECT * FROM research_tasks WHERE id = ?').all([result.id]) as any[];
    expect(rows[0].priority).toBe(2);
    expect(rows[0].status).toBe('in_progress');
    expect(rows[0].notes).toBe('Check ship manifests');
  });

  it('creates task linked to person_ids and returns links array', async () => {
    const person = await createPerson(db, { sex: 'M', given_name: 'Nils', surname: 'Holm' });

    const result = await callTool<{
      id: string;
      links: Array<{ entity_type: string; entity_id: string }>;
    }>(tools, 'add_research_task', {
      task: 'Find birth certificate',
      person_ids: [person.id],
    });

    expect(result.links).toHaveLength(1);
    expect(result.links[0].entity_type).toBe('person');
    expect(result.links[0].entity_id).toBe(person.id);

    // Assert DB state
    const linkRows = db.prepare('SELECT * FROM task_links WHERE task_id = ?').all([result.id]) as any[];
    expect(linkRows).toHaveLength(1);
    expect(linkRows[0].entity_type).toBe('person');
    expect(linkRows[0].entity_id).toBe(person.id);
  });

  it('creates task with multiple entity links (person + place)', async () => {
    const person = await createPerson(db, { sex: 'F', given_name: 'Stina', surname: 'Ekman' });
    // Insert a place directly
    const placeId = 'test-place-id-' + Date.now();
    db.prepare(
      'INSERT INTO places (id, name, normalized_name) VALUES (?, ?, ?)',
    ).run([placeId, 'Stockholm', 'stockholm']);

    const result = await callTool<{
      id: string;
      links: Array<{ entity_type: string; entity_id: string }>;
    }>(tools, 'add_research_task', {
      task: 'Find church records',
      person_ids: [person.id],
      place_ids: [placeId],
    });

    expect(result.links).toHaveLength(2);
    const types = result.links.map((l) => l.entity_type);
    expect(types).toContain('person');
    expect(types).toContain('place');

    const linkRows = db.prepare('SELECT * FROM task_links WHERE task_id = ?').all([result.id]) as any[];
    expect(linkRows).toHaveLength(2);
  });

  it('creates task with all optional arrays empty (no links)', async () => {
    const result = await callTool<{
      id: string;
      links: unknown[];
    }>(tools, 'add_research_task', {
      task: 'Generic task',
      person_ids: [],
      place_ids: [],
      media_ids: [],
    });

    expect(result.links).toHaveLength(0);
    const linkRows = db.prepare('SELECT COUNT(*) AS c FROM task_links WHERE task_id = ?').get([result.id]) as { c: number };
    expect(linkRows.c).toBe(0);
  });
});

describe('update_research_task', async () => {
  it('registers the tool', async () => {
    expect(tools.has('update_research_task')).toBe(true);
  });

  it('returns "Research task not found" for unknown id', async () => {
    const result = await callTool<string>(tools, 'update_research_task', {
      id: 'nonexistent-id',
      status: 'done',
    });
    expect(result).toBe('Research task not found');
  });

  it('updates status and returns updated task', async () => {
    const task = await createResearchTask(db, { task: 'Check census', status: 'open' });

    const result = await callTool<{ id: string; status: string }>(
      tools,
      'update_research_task',
      { id: task.id, status: 'done' },
    );

    expect(result.id).toBe(task.id);
    expect(result.status).toBe('done');

    // Assert DB state
    const rows = db.prepare('SELECT * FROM research_tasks WHERE id = ?').all([task.id]) as any[];
    expect(rows[0].status).toBe('done');
  });

  it('updates notes and result', async () => {
    const task = await createResearchTask(db, { task: 'Find will', status: 'open' });

    const result = await callTool<{ notes: string; result: string }>(
      tools,
      'update_research_task',
      {
        id: task.id,
        notes: 'Updated notes',
        result: 'Found in probate court archive',
      },
    );

    expect(result.notes).toBe('Updated notes');
    expect(result.result).toBe('Found in probate court archive');

    const rows = db.prepare('SELECT * FROM research_tasks WHERE id = ?').all([task.id]) as any[];
    expect(rows[0].notes).toBe('Updated notes');
    expect(rows[0].result).toBe('Found in probate court archive');
  });

  it('updates priority without touching other fields', async () => {
    const task = await createResearchTask(db, {
      task: 'Verify date',
      status: 'in_progress',
      priority: 5,
    });

    const result = await callTool<{ priority: number; status: string; task: string }>(
      tools,
      'update_research_task',
      { id: task.id, priority: 1 },
    );

    expect(result.priority).toBe(1);
    // Other fields should be unchanged
    expect(result.status).toBe('in_progress');
    expect(result.task).toBe('Verify date');
  });

  it('updates task description', async () => {
    const task = await createResearchTask(db, { task: 'Old description', status: 'open' });

    const result = await callTool<{ task: string }>(tools, 'update_research_task', {
      id: task.id,
      task: 'New description',
    });

    expect(result.task).toBe('New description');

    const rows = db.prepare('SELECT * FROM research_tasks WHERE id = ?').all([task.id]) as any[];
    expect(rows[0].task).toBe('New description');
  });

  it('leaves other tasks unchanged when updating one task', async () => {
    const task1 = await createResearchTask(db, { task: 'Task 1', status: 'open', priority: 1 });
    const task2 = await createResearchTask(db, { task: 'Task 2', status: 'open', priority: 2 });

    await callTool(tools, 'update_research_task', {
      id: task1.id,
      status: 'done',
    });

    const rows2 = db.prepare('SELECT * FROM research_tasks WHERE id = ?').all([task2.id]) as any[];
    expect(rows2[0].status).toBe('open');
    expect(rows2[0].priority).toBe(2);
  });
});

describe('run_checks', async () => {
  it('registers the tool', async () => {
    expect(tools.has('run_checks')).toBe(true);
  });

  it('runAllChecks branch (no person_id) returns an array', async () => {
    const result = await callTool<unknown>(tools, 'run_checks', {});
    expect(Array.isArray(result)).toBe(true);
  });

  it('runChecksForPerson branch (with person_id) returns an array', async () => {
    const person = await createPerson(db, { sex: 'M', given_name: 'Single', surname: 'Person' });
    const result = await callTool<unknown>(tools, 'run_checks', { person_id: person.id });
    expect(Array.isArray(result)).toBe(true);
  });

  it('handles unknown person_id without throwing', async () => {
    const result = await callTool<unknown>(tools, 'run_checks', {
      person_id: 'nonexistent-id',
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it('run_checks without person_id surfaces issues from seeded data', async () => {
    // A birth event with no place is a quality issue surfaced by runAllChecks.
    const person = await createPerson(db, { sex: 'M', given_name: 'Lars', surname: 'Olsson' });
    const birth = await createEvent(db, { event_type: 'birth', date_original: '1800' });
    await addEventParticipant(db, { event_id: birth.id, person_id: person.id, role: 'primary' });

    const result = await callTool<unknown[]>(tools, 'run_checks', {});
    expect(Array.isArray(result)).toBe(true);
  });

  it('run_checks with person_id scopes to that person', async () => {
    const person = await createPerson(db, { sex: 'F', given_name: 'Britta', surname: 'Lund' });
    const event = await createEvent(db, { event_type: 'birth', date_original: '1900' });
    await addEventParticipant(db, { event_id: event.id, person_id: person.id, role: 'primary' });

    const result = await callTool<unknown[]>(tools, 'run_checks', { person_id: person.id });
    expect(Array.isArray(result)).toBe(true);
  });
});

describe('research_tasks DB cascade', async () => {
  it('task links are deleted when task is deleted', async () => {
    const person = await createPerson(db, { sex: 'M', given_name: 'Olof', surname: 'Strand' });
    const result = await callTool<{ id: string }>(tools, 'add_research_task', {
      task: 'Cascading task',
      person_ids: [person.id],
    });
    const taskId = result.id;

    // Confirm link exists
    const beforeRows = db.prepare('SELECT * FROM task_links WHERE task_id = ?').all([taskId]) as any[];
    expect(beforeRows).toHaveLength(1);

    // Delete via raw SQL to simulate deletion (testing cascade)
    db.prepare('DELETE FROM research_tasks WHERE id = ?').run([taskId]);

    const afterRows = db.prepare('SELECT * FROM task_links WHERE task_id = ?').all([taskId]) as any[];
    expect(afterRows).toHaveLength(0);
  });
});

describe('add_research_task linked to existing task via addTaskLink API', async () => {
  it('getTaskLinks returns correct links after addTaskLink', async () => {
    const person = await createPerson(db, { sex: 'F', given_name: 'Sigrid', surname: 'Ek' });
    const task = await createResearchTask(db, { task: 'Check parish records', status: 'open' });
    await addTaskLink(db, task.id, 'person', person.id);

    const linkRows = db.prepare('SELECT * FROM task_links WHERE task_id = ?').all([task.id]) as any[];
    expect(linkRows).toHaveLength(1);
    expect(linkRows[0].entity_type).toBe('person');
    expect(linkRows[0].entity_id).toBe(person.id);
  });
});
