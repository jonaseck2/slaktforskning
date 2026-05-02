import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createProdServer } from '../../src/mcp/createProdServer';
import { createTestDb } from './helpers';

let client: Client;

// Helper: call a tool and parse the JSON text response
async function call(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as { type: string; text: string }[])[0].text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

beforeEach(async () => {
  const db = createTestDb();
  const server = createProdServer(db, ':memory:');
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test', version: '1.0.0' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
});

afterEach(async () => {
  await client.close();
});

// ---------------------------------------------------------------------------
// Persons
// ---------------------------------------------------------------------------

describe('persons', () => {
  it('creates a person and retrieves a summary', async () => {
    const result = await call('create_person', { given_name: 'Anna', surname: 'Svensson', sex: 'F' }) as any;
    expect(result.person.id).toBeDefined();
    expect(result.person.sex).toBe('F');

    const summary = await call('get_person_summary', { id: result.person.id }) as any;
    expect(summary.person.id).toBe(result.person.id);
  });

  it('searches persons by name', async () => {
    await call('create_person', { given_name: 'Anna', surname: 'Svensson' });
    await call('create_person', { given_name: 'Erik', surname: 'Larsson' });
    const results = await call('search_persons', { query: 'Anna' }) as any[];
    expect(results).toHaveLength(1);
    expect(results[0].given_name).toBe('Anna');
  });

  it('respects the limit parameter in search_persons', async () => {
    for (let i = 1; i <= 5; i++) {
      await call('create_person', { given_name: `Person${i}`, surname: 'Andersson' });
    }
    const limited = await call('search_persons', { query: 'Andersson', limit: 1 }) as any[];
    expect(limited).toHaveLength(1);

    const wider = await call('search_persons', { query: 'Andersson', limit: 100 }) as any[];
    expect(wider.length).toBeGreaterThanOrEqual(limited.length);
  });

  it('updates a person', async () => {
    const result = await call('create_person', { given_name: 'Anna', surname: 'Svensson', sex: 'U' }) as any;
    const updated = await call('update_person', { id: result.person.id, sex: 'F', notes: 'test note' }) as any;
    expect(updated.sex).toBe('F');
    expect(updated.notes).toBe('test note');
  });

  it('returns "Person not found" when updating unknown id', async () => {
    const res = await call('update_person', { id: 'nonexistent', sex: 'M' });
    expect(res).toBe('Person not found');
  });

  it('deletes a person', async () => {
    const result = await call('create_person', { given_name: 'Anna', surname: 'Svensson' }) as any;
    expect(await call('delete_person', { id: result.person.id })).toBe('Deleted');
    const summary = await call('get_person_summary', { id: result.person.id });
    expect(summary).toBe('Person not found');
  });

  it('returns "Person not found" when deleting unknown id', async () => {
    expect(await call('delete_person', { id: 'nonexistent' })).toBe('Person not found');
  });

  it('update_person_name retypes an existing person_name (the primary one)', async () => {
    // Reproduce the original gap: create_person stamps the primary as type=birth,
    // adding the actual birth surname as a second "birth" trips MULTIPLE_BIRTH_NAMES.
    // With update_person_name we can retype the primary to "aka" — single birth name remains.
    const created = await call('create_person', { given_name: 'Jonas', surname: 'Ahnstedt' }) as any;
    const summary = await call('get_person_summary', { id: created.person.id }) as any;
    const primaryNameId = summary.names[0].id;
    expect(summary.names[0].name_type).toBe('birth');

    const updated = await call('update_person_name', {
      id: primaryNameId,
      name_type: 'aka',
    }) as any;
    expect(updated.name_type).toBe('aka');

    await call('add_person_name', {
      person_id: created.person.id,
      given_name: 'Jonas',
      surname: 'Eckerström',
      name_type: 'birth',
    });

    const after = await call('get_person_summary', { id: created.person.id }) as any;
    const birthNames = (after.names as any[]).filter(n => n.name_type === 'birth');
    expect(birthNames).toHaveLength(1);
    expect(birthNames[0].surname).toBe('Eckerström');
  });

  it('update_person_name returns "person_name not found" for unknown id', async () => {
    expect(await call('update_person_name', { id: 'nonexistent', nickname: 'X' }))
      .toBe('person_name not found');
  });

  it('delete_person_name removes a person_name without deleting the person', async () => {
    const created = await call('create_person', { given_name: 'Eva', surname: 'Nord' }) as any;
    const extra = await call('add_person_name', {
      person_id: created.person.id,
      given_name: 'Eva',
      surname: 'Ahnstedt',
      name_type: 'aka',
    }) as any;

    expect(await call('delete_person_name', { id: extra.id })).toBe('Deleted');

    const after = await call('get_person_summary', { id: created.person.id }) as any;
    expect(after.names).toHaveLength(1);
    expect(after.names[0].surname).toBe('Nord');
  });

  it('delete_person_name returns "person_name not found" for unknown id', async () => {
    expect(await call('delete_person_name', { id: 'nonexistent' })).toBe('person_name not found');
  });
});

// ---------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------

describe('places', () => {
  it('adds a place and searches for it', async () => {
    await call('add_place', { name: 'Stockholm', place_type: 'city' });
    await call('add_place', { name: 'Göteborg', place_type: 'city' });
    const results = await call('search_places', { query: 'Stock' }) as any[];
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Stockholm');
  });
});

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

describe('sources', () => {
  it('adds a source and searches for it', async () => {
    await call('add_source', { title: 'Husförhörslängd' });
    await call('add_source', { title: 'Emigrantregister' });
    const results = await call('search_sources', { query: 'Emigrant' }) as any[];
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Emigrantregister');
  });
});

// ---------------------------------------------------------------------------
// Citations
// ---------------------------------------------------------------------------

describe('citations', () => {
  it('creates citation via cite tool and retrieves it for a person', async () => {
    const person = await call('create_person', { given_name: 'Anna', surname: 'Svensson' }) as any;
    const personId = person.person.id;

    await call('add_source', { title: 'Kyrkböcker' });
    await call('cite', {
      person_id: personId,
      source_title: 'Kyrkböcker',
      notes: 'Parish record',
    });

    const cits = await call('get_citations_for_person', { person_id: personId }) as any[];
    expect(cits.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

describe('events', () => {
  it('records an event for a person and retrieves it in timeline', async () => {
    const person = await call('create_person', { given_name: 'Lars', surname: 'Berg' }) as any;
    const personId = person.person.id;

    await call('record_event', {
      event_type: 'death',
      person_id: personId,
      date_value: '1900',
    });

    const timeline = await call('get_timeline', { person_id: personId }) as any[];
    const death = timeline.find((e: any) => e.event.event_type === 'death');
    expect(death).toBeDefined();
  });

  it('record_event accepts date_value_end for ranged "between" dates', async () => {
    const person = await call('create_person', { given_name: 'Jonas', surname: 'Test' }) as any;
    const result = await call('record_event', {
      event_type: 'military',
      person_id: person.person.id,
      date_type: 'between',
      date_value: '1999',
      date_value_end: '2000',
      date_original: '1999–2000',
    }) as any;
    expect(result.event.date_value).toBe('1999');
    expect(result.event.date_value_end).toBe('2000');
  });

  it('update_event can set date_value_end on an existing event', async () => {
    const person = await call('create_person', { given_name: 'Anna', surname: 'Test' }) as any;
    const created = await call('record_event', {
      event_type: 'residence',
      person_id: person.person.id,
      date_type: 'between',
      date_value: '2010',
    }) as any;

    const updated = await call('update_event', {
      id: created.event.id,
      date_value_end: '2015',
    }) as any;
    expect(updated.date_value_end).toBe('2015');
  });
});

// ---------------------------------------------------------------------------
// Families
// ---------------------------------------------------------------------------

describe('families', () => {
  it('adds a child and retrieves family unit', async () => {
    const parent = await call('create_person', { given_name: 'Erik', surname: 'Svensson', sex: 'M' }) as any;
    const parentId = parent.person.id;

    const childResult = await call('add_child', {
      parent_id: parentId,
      given_name: 'Anna',
      surname: 'Svensson',
    }) as any;
    expect(childResult.child.id).toBeDefined();
    expect(childResult.relationships[0].id).toBeDefined();
  });

  it('adds a relationship between two persons', async () => {
    const p1 = await call('create_person', { given_name: 'Karl', surname: 'Lindgren', sex: 'M' }) as any;
    const p2 = await call('create_person', { given_name: 'Maja', surname: 'Lindgren', sex: 'F' }) as any;

    const rel = await call('add_relationship', {
      type: 'couple',
      person1_id: p1.person.id,
      person2_id: p2.person.id,
      subtype: 'marriage',
    }) as any;
    expect(rel.relationship.id).toBeDefined();
    expect(rel.relationship.type).toBe('couple');
  });
});

// ---------------------------------------------------------------------------
// Database switching
// ---------------------------------------------------------------------------

describe('database switching', () => {
  it('get_current_database returns a path', async () => {
    const result = await call('get_current_database') as any;
    expect(typeof result.path).toBe('string');
  });

  it('switch_database opens a new empty database', async () => {
    const tmpPath = path.join(os.tmpdir(), `mcp-test-switch-${Date.now()}.db`);
    try {
      const result = await call('switch_database', { path: tmpPath }) as any;
      expect(result.switched).toBe(true);
      expect(result.path).toBe(tmpPath);

      const info = await call('get_current_database') as any;
      expect(info.path).toBe(tmpPath);
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      const lockPath = tmpPath + '.lock';
      if (fs.existsSync(lockPath)) fs.rmSync(lockPath, { recursive: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Import (GEDCOM)
// ---------------------------------------------------------------------------

describe('import_file', () => {
  it('imports a minimal GEDCOM .ged file', async () => {
    const gedcom = '0 HEAD\n1 GEDC\n2 VERS 5.5.1\n0 @I1@ INDI\n1 NAME Anna /Svensson/\n0 TRLR\n';
    const tmpPath = path.join(os.tmpdir(), `test-${Date.now()}.ged`);
    fs.writeFileSync(tmpPath, gedcom, 'utf-8');
    try {
      const result = await call('import_file', { file_path: tmpPath }) as any;
      expect(result.imported).toBe(true);
    } finally {
      fs.unlinkSync(tmpPath);
    }
  });

  it('returns error for non-existent genney archive', async () => {
    const result = await call('import_file', { file_path: '/tmp/does-not-exist.backup', format: 'genney' }) as any;
    expect(result.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Coverage: every genealogy-essential tool is registered
// ---------------------------------------------------------------------------

describe('mcp prod tool registry coverage', () => {
  it('registers every tool the agent needs to author + curate a genealogy database', async () => {
    const tools = await client.listTools();
    const names = new Set(tools.tools.map(t => t.name));

    // The list below is the genealogy-essential set per the MCP audit.
    // Adding/removing here is intentional and should match
    // src/mcp/tools/prod/*.ts.
    const required = [
      // persons
      'create_person', 'search_persons', 'get_person_summary', 'update_person', 'delete_person',
      'add_person_name', 'update_person_name', 'delete_person_name',
      'add_person_identifier', 'get_person_identifiers', 'delete_person_identifier',
      'merge_persons', 'find_duplicates',
      // families / relationships / participants
      'add_relationship', 'add_child', 'get_family_unit', 'get_ancestor_tree',
      'update_relationship', 'delete_relationship',
      'add_event_participant', 'remove_event_participant',
      // events
      'record_event', 'get_timeline', 'update_event', 'delete_event',
      // sources / citations
      'add_source', 'search_sources', 'cite', 'get_citations_for_person',
      'update_source', 'delete_source', 'update_citation', 'delete_citation',
      // places
      'add_place', 'search_places', 'get_place_history', 'resolve_place',
      'list_place_children', 'get_place_ancestors',
      'update_place', 'delete_place',
      // research
      'get_research_gaps', 'add_research_task', 'update_research_task', 'delete_research_task', 'run_checks',
      // media
      'attach_media', 'tag_person_in_media', 'get_media_for_person_context',
      'update_media', 'delete_media',
      'link_media', 'unlink_media', 'reorder_media',
      'update_media_region', 'delete_media_region',
      // groups
      'add_group', 'list_groups', 'get_group', 'update_group', 'delete_group',
      'add_group_link', 'remove_group_link',
      // repositories
      'add_repository', 'list_repositories', 'get_repository',
      'update_repository', 'delete_repository',
      'link_source_repository', 'unlink_source_repository', 'get_repositories_for_source',
      // data management / archive
      'import_file', 'export_gedcom', 'export_archive', 'import_archive',
      'get_current_database', 'switch_database',
    ];

    const missing = required.filter(n => !names.has(n));
    expect(missing).toEqual([]);
  });
});
