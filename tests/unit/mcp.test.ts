import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { createTestDb } from './helpers';
import { createMcpServer } from '../../src/mcp/createServer';

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
  const server = createMcpServer(db);
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
  it('creates a person and retrieves it', async () => {
    const person = await call('create_person', { given_name: 'Anna', surname: 'Svensson', sex: 'F' }) as any;
    expect(person.id).toBeDefined();
    expect(person.sex).toBe('F');

    const fetched = await call('get_person', { id: person.id }) as any;
    expect(fetched.id).toBe(person.id);
  });

  it('returns "Person not found" for unknown id', async () => {
    const result = await call('get_person', { id: 'nonexistent' });
    expect(result).toBe('Person not found');
  });

  it('lists persons', async () => {
    await call('create_person', { given_name: 'Anna', surname: 'Svensson' });
    await call('create_person', { given_name: 'Erik', surname: 'Larsson' });
    const list = await call('list_persons') as any[];
    expect(list).toHaveLength(2);
  });

  it('searches persons by name', async () => {
    await call('create_person', { given_name: 'Anna', surname: 'Svensson' });
    await call('create_person', { given_name: 'Erik', surname: 'Larsson' });
    const results = await call('search_persons', { query: 'Anna' }) as any[];
    expect(results).toHaveLength(1);
    expect(results[0].given_name).toBe('Anna');
  });

  it('updates a person', async () => {
    const person = await call('create_person', { given_name: 'Anna', sex: 'U' }) as any;
    const updated = await call('update_person', { id: person.id, sex: 'F', notes: 'test note' }) as any;
    expect(updated.sex).toBe('F');
    expect(updated.notes).toBe('test note');
  });

  it('returns "Person not found" when updating unknown id', async () => {
    const result = await call('update_person', { id: 'nonexistent', sex: 'M' });
    expect(result).toBe('Person not found');
  });

  it('deletes a person', async () => {
    const person = await call('create_person', { given_name: 'Anna' }) as any;
    const result = await call('delete_person', { id: person.id });
    expect(result).toBe('Deleted');
    expect(await call('get_person', { id: person.id })).toBe('Person not found');
  });

  it('returns "Not found" when deleting unknown id', async () => {
    const result = await call('delete_person', { id: 'nonexistent' });
    expect(result).toBe('Not found');
  });
});

// ---------------------------------------------------------------------------
// Person names
// ---------------------------------------------------------------------------

describe('person names', () => {
  it('adds and retrieves names for a person', async () => {
    const person = await call('create_person', { given_name: 'Anna', surname: 'Svensson' }) as any;
    const name = await call('add_person_name', {
      person_id: person.id,
      given_name: 'Anna',
      surname: 'Larsson',
      name_type: 'married',
    }) as any;
    expect(name.id).toBeDefined();
    expect(name.name_type).toBe('married');

    const names = await call('get_person_names', { person_id: person.id }) as any[];
    expect(names.length).toBeGreaterThanOrEqual(1);
    expect(names.some((n: any) => n.name_type === 'married')).toBe(true);
  });

  it('updates a person name', async () => {
    const person = await call('create_person', { given_name: 'Anna', surname: 'Svensson' }) as any;
    const name = await call('add_person_name', { person_id: person.id, given_name: 'Anna', surname: 'Old' }) as any;
    const updated = await call('update_person_name', { id: name.id, surname: 'New' }) as any;
    expect(updated.surname).toBe('New');
  });

  it('stores and retrieves preferred_name (tilltalsnamn)', async () => {
    const person = await call('create_person', { given_name: 'Eva Linda Marie', surname: 'Karlsson' }) as any;
    const name = await call('add_person_name', {
      person_id: person.id,
      given_name: 'Eva Linda Marie',
      surname: 'Karlsson',
      preferred_name: 'Linda',
    }) as any;
    expect(name.preferred_name).toBe('Linda');
    const updated = await call('update_person_name', { id: name.id, preferred_name: 'Eva' }) as any;
    expect(updated.preferred_name).toBe('Eva');
  });

  it('deletes a person name', async () => {
    const person = await call('create_person', { given_name: 'Anna', surname: 'Svensson' }) as any;
    const name = await call('add_person_name', { person_id: person.id, given_name: 'Anna', name_type: 'aka' }) as any;
    const result = await call('delete_person_name', { id: name.id }) as any;
    expect(result.deleted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Person identifiers
// ---------------------------------------------------------------------------

describe('person identifiers', () => {
  it('adds, retrieves, and deletes an identifier', async () => {
    const person = await call('create_person', { given_name: 'Anna' }) as any;

    const identifier = await call('add_person_identifier', {
      person_id: person.id,
      identifier_type: 'familysearch',
      identifier_value: 'ABCD-1234',
    }) as any;
    expect(identifier.identifier_value).toBe('ABCD-1234');

    const list = await call('get_person_identifiers', { person_id: person.id }) as any[];
    expect(list).toHaveLength(1);
    expect(list[0].identifier_type).toBe('familysearch');

    const deleted = await call('delete_person_identifier', { id: identifier.id }) as any;
    expect(deleted.deleted).toBe(true);

    const after = await call('get_person_identifiers', { person_id: person.id }) as any[];
    expect(after).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Relationships
// ---------------------------------------------------------------------------

describe('relationships', () => {
  it('creates and retrieves a relationship', async () => {
    const p1 = await call('create_person', { given_name: 'Karl' }) as any;
    const p2 = await call('create_person', { given_name: 'Maja' }) as any;

    const rel = await call('create_relationship', {
      type: 'couple',
      person1_id: p1.id,
      person2_id: p2.id,
      subtype: 'marriage',
    }) as any;
    expect(rel.id).toBeDefined();
    expect(rel.type).toBe('couple');

    const fetched = await call('get_relationship', { id: rel.id }) as any;
    expect(fetched.id).toBe(rel.id);
  });

  it('returns "Relationship not found" for unknown id', async () => {
    const result = await call('get_relationship', { id: 'nonexistent' });
    expect(result).toBe('Relationship not found');
  });

  it('lists relationships', async () => {
    await call('create_relationship', { type: 'couple' });
    await call('create_relationship', { type: 'sibling' });
    const list = await call('list_relationships') as any[];
    expect(list).toHaveLength(2);
  });

  it('updates a relationship', async () => {
    const rel = await call('create_relationship', { type: 'couple' }) as any;
    const updated = await call('update_relationship', { id: rel.id, notes: 'updated' }) as any;
    expect(updated.notes).toBe('updated');
  });

  it('returns "Relationship not found" when updating unknown id', async () => {
    const result = await call('update_relationship', { id: 'nonexistent', notes: 'x' });
    expect(result).toBe('Relationship not found');
  });

  it('deletes a relationship', async () => {
    const rel = await call('create_relationship', { type: 'sibling' }) as any;
    expect(await call('delete_relationship', { id: rel.id })).toBe('Deleted');
    expect(await call('get_relationship', { id: rel.id })).toBe('Relationship not found');
  });

  it('returns "Not found" when deleting unknown id', async () => {
    expect(await call('delete_relationship', { id: 'nonexistent' })).toBe('Not found');
  });

  it('gets relationships of a person', async () => {
    const p1 = await call('create_person', { given_name: 'Karl' }) as any;
    const p2 = await call('create_person', { given_name: 'Maja' }) as any;
    await call('create_relationship', { type: 'couple', person1_id: p1.id, person2_id: p2.id });

    const list = await call('get_relationships_of_person', { person_id: p1.id }) as any[];
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe('couple');
  });

  it('searches relationships by person name', async () => {
    const p1 = await call('create_person', { given_name: 'Erik', surname: 'Lindgren' }) as any;
    const p2 = await call('create_person', { given_name: 'Sara' }) as any;
    await call('create_relationship', { type: 'couple', person1_id: p1.id, person2_id: p2.id });

    const results = await call('search_relationships', { query: 'Lindgren' }) as any[];
    expect(results).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

describe('events', () => {
  it('adds and retrieves an event', async () => {
    const event = await call('add_event', {
      event_type: 'birth',
      date_type: 'exact',
      date_value: '1900-05-15',
      date_original: '15 May 1900',
    }) as any;
    expect(event.id).toBeDefined();
    expect(event.event_type).toBe('birth');
    expect(event.date_value).toBe('1900-05-15');

    const fetched = await call('get_event', { id: event.id }) as any;
    expect(fetched.id).toBe(event.id);
  });

  it('returns "Event not found" for unknown id', async () => {
    expect(await call('get_event', { id: 'nonexistent' })).toBe('Event not found');
  });

  it('updates an event', async () => {
    const event = await call('add_event', { event_type: 'birth' }) as any;
    const updated = await call('update_event', { id: event.id, date_value: '1901-01-01', date_type: 'exact' }) as any;
    expect(updated.date_value).toBe('1901-01-01');
  });

  it('returns "Event not found" when updating unknown id', async () => {
    expect(await call('update_event', { id: 'nonexistent', event_type: 'death' })).toBe('Event not found');
  });

  it('deletes an event', async () => {
    const event = await call('add_event', { event_type: 'birth' }) as any;
    expect(await call('delete_event', { id: event.id })).toBe('Deleted');
    expect(await call('get_event', { id: event.id })).toBe('Event not found');
  });

  it('returns "Not found" when deleting unknown id', async () => {
    expect(await call('delete_event', { id: 'nonexistent' })).toBe('Not found');
  });
});

// ---------------------------------------------------------------------------
// Event participants
// ---------------------------------------------------------------------------

describe('event participants', () => {
  it('adds, lists, and removes participants', async () => {
    const person = await call('create_person', { given_name: 'Anna' }) as any;
    const event = await call('add_event', { event_type: 'birth' }) as any;

    const participant = await call('add_event_participant', {
      event_id: event.id,
      person_id: person.id,
      role: 'primary',
    }) as any;
    expect(participant.role).toBe('primary');

    const list = await call('get_event_participants', { event_id: event.id }) as any[];
    expect(list).toHaveLength(1);
    expect(list[0].person_id).toBe(person.id);

    const removed = await call('remove_event_participant', { id: participant.id });
    expect(removed).toBe('Removed');

    const after = await call('get_event_participants', { event_id: event.id }) as any[];
    expect(after).toHaveLength(0);
  });

  it('returns "Not found" when removing unknown participant', async () => {
    expect(await call('remove_event_participant', { id: 'nonexistent' })).toBe('Not found');
  });

  it('gets events for a person via participants', async () => {
    const person = await call('create_person', { given_name: 'Anna' }) as any;
    const event = await call('add_event', { event_type: 'birth', date_value: '1900-01-01', date_type: 'exact' }) as any;
    await call('add_event_participant', { event_id: event.id, person_id: person.id });

    const events = await call('get_events_for_person', { person_id: person.id }) as any[];
    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe('birth');
  });

  it('gets events for a relationship', async () => {
    const rel = await call('create_relationship', { type: 'couple' }) as any;
    await call('add_event', { event_type: 'marriage', relationship_id: rel.id });

    const events = await call('get_events_for_relationship', { relationship_id: rel.id }) as any[];
    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe('marriage');
  });
});

// ---------------------------------------------------------------------------
// Sources and citations
// ---------------------------------------------------------------------------

describe('sources', () => {
  it('adds, retrieves, updates, and deletes a source', async () => {
    const source = await call('add_source', {
      title: 'Husförhörslängd',
      author: 'Kyrkan',
      source_type: 'church_record',
    }) as any;
    expect(source.id).toBeDefined();
    expect(source.title).toBe('Husförhörslängd');

    const fetched = await call('get_source', { id: source.id }) as any;
    expect(fetched.id).toBe(source.id);

    const updated = await call('update_source', { id: source.id, author: 'Riksarkivet' }) as any;
    expect(updated.author).toBe('Riksarkivet');

    const list = await call('list_sources') as any[];
    expect(list).toHaveLength(1);

    expect(await call('delete_source', { id: source.id })).toBe('Deleted');
    expect(await call('get_source', { id: source.id })).toBe('Source not found');
  });

  it('returns "Source not found" for unknown id', async () => {
    expect(await call('get_source', { id: 'nonexistent' })).toBe('Source not found');
  });

  it('returns "Not found" when deleting unknown source', async () => {
    expect(await call('delete_source', { id: 'nonexistent' })).toBe('Not found');
  });

  it('searches sources', async () => {
    await call('add_source', { title: 'Husförhörslängd' });
    await call('add_source', { title: 'Emigrantregister' });
    const results = await call('search_sources', { query: 'Emigrant' }) as any[];
    expect(results).toHaveLength(1);
  });
});

describe('citations', () => {
  it('adds, retrieves, and deletes a citation', async () => {
    const source = await call('add_source', { title: 'Test Source' }) as any;
    const event = await call('add_event', { event_type: 'birth' }) as any;

    const citation = await call('add_citation', {
      source_id: source.id,
      event_id: event.id,
      page: '42',
      confidence: 3,
      transcription: 'Born 1 Jan 1900',
    }) as any;
    expect(citation.id).toBeDefined();
    expect(citation.page).toBe('42');

    const fetched = await call('get_citation', { id: citation.id }) as any;
    expect(fetched.id).toBe(citation.id);

    const forSource = await call('get_citations_for_source', { source_id: source.id }) as any[];
    expect(forSource).toHaveLength(1);

    const forEvent = await call('get_citations_for_event', { event_id: event.id }) as any[];
    expect(forEvent).toHaveLength(1);

    expect(await call('delete_citation', { id: citation.id })).toBe('Deleted');

    const after = await call('get_citations_for_source', { source_id: source.id }) as any[];
    expect(after).toHaveLength(0);
  });

  it('returns "Citation not found" for unknown id', async () => {
    expect(await call('get_citation', { id: 'nonexistent' })).toBe('Citation not found');
  });

  it('returns "Not found" when deleting unknown citation', async () => {
    expect(await call('delete_citation', { id: 'nonexistent' })).toBe('Not found');
  });

  it('gets citations for a person', async () => {
    const person = await call('create_person', { given_name: 'Anna' }) as any;
    const source = await call('add_source', { title: 'Record' }) as any;
    await call('add_citation', { source_id: source.id, person_id: person.id });
    const list = await call('get_citations_for_person', { person_id: person.id }) as any[];
    expect(list).toHaveLength(1);
    expect(await call('get_citations_for_person', { person_id: 'nonexistent' })).toHaveLength(0);
  });

  it('gets citations for a relationship', async () => {
    const rel = await call('create_relationship', { type: 'couple' }) as any;
    const source = await call('add_source', { title: 'Record' }) as any;
    await call('add_citation', { source_id: source.id, relationship_id: rel.id });
    const list = await call('get_citations_for_relationship', { relationship_id: rel.id }) as any[];
    expect(list).toHaveLength(1);
    expect(await call('get_citations_for_relationship', { relationship_id: 'nonexistent' })).toHaveLength(0);
  });

  it('gets citations for a place', async () => {
    const place = await call('add_place', { name: 'Stockholm' }) as any;
    const source = await call('add_source', { title: 'Record' }) as any;
    await call('add_citation', { source_id: source.id, place_id: place.id });
    const list = await call('get_citations_for_place', { place_id: place.id }) as any[];
    expect(list).toHaveLength(1);
    expect(await call('get_citations_for_place', { place_id: 'nonexistent' })).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------

describe('places', () => {
  it('adds, retrieves, updates, and deletes a place', async () => {
    const place = await call('add_place', {
      name: 'Stockholm',
      place_type: 'city',
      latitude: 59.3293,
      longitude: 18.0686,
    }) as any;
    expect(place.id).toBeDefined();
    expect(place.name).toBe('Stockholm');

    const fetched = await call('get_place', { id: place.id }) as any;
    expect(fetched.id).toBe(place.id);

    const updated = await call('update_place', { id: place.id, notes: 'Capital of Sweden' }) as any;
    expect(updated.notes).toBe('Capital of Sweden');

    const list = await call('list_places') as any[];
    expect(list).toHaveLength(1);

    expect(await call('delete_place', { id: place.id })).toBe('Deleted');
    expect(await call('get_place', { id: place.id })).toBe('Place not found');
  });

  it('returns "Place not found" for unknown id', async () => {
    expect(await call('get_place', { id: 'nonexistent' })).toBe('Place not found');
  });

  it('returns "Not found" when deleting unknown place', async () => {
    expect(await call('delete_place', { id: 'nonexistent' })).toBe('Not found');
  });

  it('searches places by name', async () => {
    await call('add_place', { name: 'Stockholm' });
    await call('add_place', { name: 'Göteborg' });
    const results = await call('search_places', { query: 'Stock' }) as any[];
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Stockholm');
  });

  it('supports parent place hierarchy', async () => {
    const country = await call('add_place', { name: 'Sverige', place_type: 'country' }) as any;
    const city = await call('add_place', {
      name: 'Stockholm',
      place_type: 'city',
      parent_place_id: country.id,
    }) as any;
    expect(city.parent_place_id).toBe(country.id);
  });

  it('stores and updates address fields', async () => {
    const place = await call('add_place', {
      name: 'Tvärgatan 5',
      street: 'Tvärgatan 5',
      postal_code: '35243',
      city: 'Växjö',
      country: 'Sverige',
    }) as any;
    expect(place.street).toBe('Tvärgatan 5');
    expect(place.postal_code).toBe('35243');
    expect(place.city).toBe('Växjö');
    expect(place.country).toBe('Sverige');

    const updated = await call('update_place', { id: place.id, street: 'Tvärgatan 7' }) as any;
    expect(updated.street).toBe('Tvärgatan 7');
    expect(updated.city).toBe('Växjö');
  });
});

// ---------------------------------------------------------------------------
// Database switching
// ---------------------------------------------------------------------------

describe('database switching', () => {
  it('get_current_database returns a path and name', async () => {
    const result = await call('get_current_database') as any;
    expect(typeof result.path).toBe('string');
    expect(typeof result.name).toBe('string');
  });

  it('switch_database opens a new empty database', async () => {
    // Create a person in the current DB
    await call('create_person', { given_name: 'Before', surname: 'Switch' });
    const before = await call('list_persons') as any[];
    expect(before).toHaveLength(1);

    // Switch to a new temp DB
    const tmpPath = path.join(os.tmpdir(), `mcp-test-switch-${Date.now()}.db`);
    try {
      const result = await call('switch_database', { path: tmpPath }) as any;
      expect(result.switched).toBe(true);
      expect(result.path).toBe(tmpPath);

      // New DB should be empty
      const after = await call('list_persons') as any[];
      expect(after).toHaveLength(0);

      // get_current_database should reflect the switch
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
// Groups
// ---------------------------------------------------------------------------

describe('groups', () => {
  it('creates, retrieves, updates, and deletes a group', async () => {
    const group = await call('create_group', { name: 'Emigranter', notes: 'Moved to USA' }) as any;
    expect(group.id).toBeDefined();
    expect(group.name).toBe('Emigranter');

    const fetched = await call('get_group', { id: group.id }) as any;
    expect(fetched.id).toBe(group.id);

    const updated = await call('update_group', { id: group.id, name: 'Emigrants' }) as any;
    expect(updated.name).toBe('Emigrants');

    const list = await call('list_groups') as any[];
    expect(list).toHaveLength(1);

    expect(await call('delete_group', { id: group.id })).toBe('Deleted');
    expect(await call('get_group', { id: group.id })).toBe('Group not found');
  });

  it('returns "Group not found" for unknown id', async () => {
    expect(await call('get_group', { id: 'nonexistent' })).toBe('Group not found');
  });

  it('adds and removes group members', async () => {
    const group = await call('create_group', { name: 'TestGroup' }) as any;
    const person = await call('create_person', { given_name: 'Anna' }) as any;

    const member = await call('add_group_member', { group_id: group.id, person_id: person.id }) as any;
    expect(member.group_id).toBe(group.id);
    expect(member.person_id).toBe(person.id);

    const members = await call('get_group_members', { group_id: group.id }) as any[];
    expect(members).toHaveLength(1);

    const personGroups = await call('get_groups_for_person', { person_id: person.id }) as any[];
    expect(personGroups).toHaveLength(1);
    expect(personGroups[0].id).toBe(group.id);

    expect(await call('remove_group_member', { group_id: group.id, person_id: person.id })).toBe('Removed');
    expect(await call('get_group_members', { group_id: group.id })).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Repositories
// ---------------------------------------------------------------------------

describe('repositories', () => {
  it('creates, retrieves, updates, and deletes a repository', async () => {
    const repo = await call('create_repository', {
      name: 'Riksarkivet',
      city: 'Stockholm',
      country: 'Sverige',
      web: 'https://www.riksarkivet.se',
    }) as any;
    expect(repo.id).toBeDefined();
    expect(repo.name).toBe('Riksarkivet');
    expect(repo.city).toBe('Stockholm');

    const fetched = await call('get_repository', { id: repo.id }) as any;
    expect(fetched.id).toBe(repo.id);

    const updated = await call('update_repository', { id: repo.id, city: 'Marieberg' }) as any;
    expect(updated.city).toBe('Marieberg');

    const list = await call('list_repositories') as any[];
    expect(list).toHaveLength(1);

    expect(await call('delete_repository', { id: repo.id })).toBe('Deleted');
    expect(await call('get_repository', { id: repo.id })).toBe('Repository not found');
  });

  it('returns "Repository not found" for unknown id', async () => {
    expect(await call('get_repository', { id: 'nonexistent' })).toBe('Repository not found');
  });

  it('links and unlinks source-repository associations', async () => {
    const repo = await call('create_repository', { name: 'Archive' }) as any;
    const source = await call('add_source', { title: 'Parish record' }) as any;

    const linked = await call('link_source_repository', { source_id: source.id, repository_id: repo.id }) as any;
    expect(linked.linked).toBe(true);

    const repos = await call('get_repositories_for_source', { source_id: source.id }) as any[];
    expect(repos).toHaveLength(1);
    expect(repos[0].id).toBe(repo.id);

    expect(await call('unlink_source_repository', { source_id: source.id, repository_id: repo.id })).toBe('Unlinked');
    expect(await call('get_repositories_for_source', { source_id: source.id })).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Research tasks
// ---------------------------------------------------------------------------

describe('research tasks', () => {
  it('creates, retrieves, updates, and deletes a task', async () => {
    const task = await call('create_research_task', {
      task: 'Find birth record for Anna',
      priority: 1,
      status: 'open',
    }) as any;
    expect(task.id).toBeDefined();
    expect(task.task).toBe('Find birth record for Anna');
    expect(task.status).toBe('open');

    const fetched = await call('get_research_task', { id: task.id }) as any;
    expect(fetched.id).toBe(task.id);

    const updated = await call('update_research_task', {
      id: task.id,
      status: 'done',
      result: 'Found in Husförhörslängd 1843',
    }) as any;
    expect(updated.status).toBe('done');
    expect(updated.result).toBe('Found in Husförhörslängd 1843');

    const list = await call('list_research_tasks') as any[];
    expect(list).toHaveLength(1);

    expect(await call('delete_research_task', { id: task.id })).toBe('Deleted');
    expect(await call('get_research_task', { id: task.id })).toBe('Research task not found');
  });

  it('returns "Research task not found" for unknown id', async () => {
    expect(await call('get_research_task', { id: 'nonexistent' })).toBe('Research task not found');
  });

  it('gets research tasks for a person', async () => {
    const person = await call('create_person', { given_name: 'Erik' }) as any;
    await call('create_research_task', { task: 'Find birth record', person_id: person.id });
    await call('create_research_task', { task: 'Unrelated task' });

    const forPerson = await call('get_research_tasks_for_person', { person_id: person.id }) as any[];
    expect(forPerson).toHaveLength(1);
    expect(forPerson[0].task).toBe('Find birth record');
  });
});

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

describe('media', () => {
  it('creates, retrieves, and deletes a media record', async () => {
    const item = await call('create_media', {
      title: 'Baptism photo',
      file_ref: '/photos/baptism.jpg',
      format: 'jpg',
      is_printable: true,
    }) as any;
    expect(item.id).toBeDefined();
    expect(item.title).toBe('Baptism photo');

    const fetched = await call('get_media', { id: item.id }) as any;
    expect(fetched.id).toBe(item.id);

    const list = await call('list_media') as any[];
    expect(list).toHaveLength(1);

    expect(await call('delete_media', { id: item.id })).toBe('Deleted');
    expect(await call('get_media', { id: item.id })).toBe('Media not found');
  });

  it('returns "Media not found" for unknown id', async () => {
    expect(await call('get_media', { id: 'nonexistent' })).toBe('Media not found');
  });

  it('links media to entities and retrieves by entity', async () => {
    const item = await call('create_media', { title: 'Portrait' }) as any;
    const person = await call('create_person', { given_name: 'Anna' }) as any;

    const link = await call('add_media_link', {
      media_id: item.id,
      entity_type: 'person',
      entity_id: person.id,
      link_type: 'portrait',
    }) as any;
    expect(link.media_id).toBe(item.id);
    expect(link.entity_id).toBe(person.id);

    const linked = await call('get_media_for_entity', { entity_type: 'person', entity_id: person.id }) as any[];
    expect(linked).toHaveLength(1);
    expect(linked[0].title).toBe('Portrait');
    expect(linked[0].link_type).toBe('portrait');

    expect(await call('remove_media_link', { link_id: link.id })).toBe('Removed');
    expect(await call('get_media_for_entity', { entity_type: 'person', entity_id: person.id })).toHaveLength(0);
  });
});
