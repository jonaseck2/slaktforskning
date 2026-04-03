import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Database } from 'node-sqlite3-wasm';
import { initializeSchema } from '../api/schema';
import * as persons from '../api/persons';
import { addPersonIdentifier, getPersonIdentifiers, deletePersonIdentifier } from '../api/persons';
import * as relationships from '../api/relationships';
import * as events from '../api/events';
import * as sources from '../api/sources';
import { createPlace, getPlace, listPlaces, searchPlaces, updatePlace, deletePlace } from '../api/places';
import { getDefaultDbPath } from '../shared/dbPath';

async function main() {
  const dbPath = process.env.SLAKTFORSKNING_DB || getDefaultDbPath();
  const dir = path.dirname(dbPath);
  const fs = await import('node:fs');
  fs.mkdirSync(dir, { recursive: true });
  // Clean up stale Emscripten lock directories from crashed runs
  const lockPath = dbPath + '.lock';
  if (fs.existsSync(lockPath) && fs.statSync(lockPath).isDirectory()) {
    fs.rmSync(lockPath, { recursive: true });
  }

  const db = new Database(dbPath);
  initializeSchema(db);

  const server = new McpServer({
    name: 'slaktforskning',
    version: '0.3.1',
  });

  // Person tools
  server.tool('create_person', 'Create a new person', {
    given_name: z.string().optional().describe('Given/first name'),
    surname: z.string().optional().describe('Surname/family name'),
    sex: z.enum(['M', 'F', 'U']).optional().describe('Sex: M, F, or U (unknown)'),
  }, async (args) => {
    const person = persons.createPerson(db, args);
    return { content: [{ type: 'text', text: JSON.stringify(person, null, 2) }] };
  });

  server.tool('list_persons', 'List all persons', {}, async () => {
    const list = persons.listPersons(db);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.tool('search_persons', 'Search persons by name', {
    query: z.string().describe('Search query'),
  }, async (args) => {
    const results = persons.searchPersons(db, args.query);
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  });

  server.tool('get_person', 'Get a person by ID', {
    id: z.string().describe('Person ID'),
  }, async (args) => {
    const person = persons.getPerson(db, args.id);
    return { content: [{ type: 'text', text: person ? JSON.stringify(person, null, 2) : 'Person not found' }] };
  });

  server.tool('update_person', 'Update a person', {
    id: z.string().describe('Person ID'),
    sex: z.enum(['M', 'F', 'U']).optional(),
    living: z.boolean().optional(),
    notes: z.string().optional(),
  }, async (args) => {
    const { id, ...data } = args;
    const person = persons.updatePerson(db, id, data);
    return { content: [{ type: 'text', text: person ? JSON.stringify(person, null, 2) : 'Person not found' }] };
  });

  server.tool('delete_person', 'Delete a person', {
    id: z.string().describe('Person ID'),
  }, async (args) => {
    const ok = persons.deletePerson(db, args.id);
    return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Not found' }] };
  });

  server.tool('add_person_name', 'Add an alternate name to a person (married, alias, aka)', {
    person_id: z.string().describe('Person ID'),
    given_name: z.string().optional().describe('Given/first name'),
    surname: z.string().optional().describe('Surname/family name'),
    name_type: z.enum(['birth', 'married', 'alias', 'aka']).optional().describe('Name type (default: birth)'),
    name_prefix: z.string().optional().describe('Name prefix (e.g. "von", "af", "de")'),
    name_suffix: z.string().optional().describe('Name suffix (e.g. "Jr.", "Sr.", "III")'),
    patronymic_base: z.string().optional().describe('Base name for patronymic/matronymic construction'),
    name_qualifier: z.enum(['patronymic', 'matronymic', 'particle', 'married', 'alias']).optional().describe('Qualifier for patronymic/particle names'),
  }, async (args) => {
    const { person_id, ...data } = args;
    const name = persons.addPersonName(db, person_id, data);
    return { content: [{ type: 'text', text: JSON.stringify(name, null, 2) }] };
  });

  server.tool('get_person_names', 'Get all names for a person', {
    person_id: z.string().describe('Person ID'),
  }, async (args) => {
    const list = persons.getPersonNames(db, args.person_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.tool('update_person_name', 'Update a person name record', {
    id: z.string(),
    given_name: z.string().optional(),
    surname: z.string().optional(),
    name_type: z.enum(['birth', 'married', 'alias', 'aka']).optional(),
    name_prefix: z.string().optional(),
    name_suffix: z.string().optional(),
    patronymic_base: z.string().optional(),
    name_qualifier: z.enum(['patronymic', 'matronymic', 'particle', 'married', 'alias']).optional(),
  }, async ({ id, ...data }) =>
    ({ content: [{ type: 'text', text: JSON.stringify(persons.updatePersonName(db, id, data)) }] })
  );

  server.tool('delete_person_name', 'Delete a person name record', {
    id: z.string(),
  }, async ({ id }) =>
    ({ content: [{ type: 'text', text: JSON.stringify({ deleted: persons.deletePersonName(db, id) }) }] })
  );

  server.tool('add_person_identifier', 'Add an external identifier to a person (FamilySearch ID, Ancestry ID, etc.)', {
    person_id: z.string(),
    identifier_type: z.enum(['familysearch', 'ancestry', 'riksarkivet', 'personnummer', 'refn', 'rin', 'other']),
    identifier_value: z.string(),
  }, async ({ person_id, identifier_type, identifier_value }) =>
    ({ content: [{ type: 'text', text: JSON.stringify(addPersonIdentifier(db, person_id, { identifier_type, identifier_value })) }] })
  );

  server.tool('get_person_identifiers', 'Get all external identifiers for a person', { person_id: z.string() },
    async ({ person_id }) => ({ content: [{ type: 'text', text: JSON.stringify(getPersonIdentifiers(db, person_id)) }] })
  );

  server.tool('delete_person_identifier', 'Delete an external identifier', { id: z.string() },
    async ({ id }) => ({ content: [{ type: 'text', text: JSON.stringify({ deleted: deletePersonIdentifier(db, id) }) }] })
  );

  // Relationship tools
  server.tool('create_relationship', 'Create a relationship between two persons', {
    type: z.enum(['couple', 'parent_child', 'sibling', 'godparent', 'other']).describe('Relationship type'),
    person1_id: z.string().optional().describe('Person 1 ID (for parent_child: parent)'),
    person2_id: z.string().optional().describe('Person 2 ID (for parent_child: child)'),
    subtype: z.string().optional().describe('Subtype (couple: marriage/civil_union/cohabitation/unknown; parent_child: biological/adopted/foster/step/unknown)'),
    notes: z.string().optional(),
  }, async (args) => {
    const rel = relationships.createRelationship(db, args);
    return { content: [{ type: 'text', text: JSON.stringify(rel, null, 2) }] };
  });

  server.tool('get_relationship', 'Get a relationship by ID', {
    id: z.string().describe('Relationship ID'),
  }, async (args) => {
    const rel = relationships.getRelationship(db, args.id);
    return { content: [{ type: 'text', text: rel ? JSON.stringify(rel, null, 2) : 'Relationship not found' }] };
  });

  server.tool('list_relationships', 'List all relationships', {}, async () => {
    const list = relationships.listRelationships(db);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.tool('update_relationship', 'Update a relationship', {
    id: z.string().describe('Relationship ID'),
    type: z.enum(['couple', 'parent_child', 'sibling', 'godparent', 'other']).optional(),
    person1_id: z.string().optional(),
    person2_id: z.string().optional(),
    subtype: z.string().optional(),
    notes: z.string().optional(),
  }, async (args) => {
    const { id, ...data } = args;
    const rel = relationships.updateRelationship(db, id, data);
    return { content: [{ type: 'text', text: rel ? JSON.stringify(rel, null, 2) : 'Relationship not found' }] };
  });

  server.tool('delete_relationship', 'Delete a relationship', {
    id: z.string().describe('Relationship ID'),
  }, async (args) => {
    const ok = relationships.deleteRelationship(db, args.id);
    return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Not found' }] };
  });

  server.tool('get_relationships_of_person', 'Get all relationships for a person', {
    person_id: z.string().describe('Person ID'),
  }, async (args) => {
    const list = relationships.getRelationshipsOfPerson(db, args.person_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.tool('search_relationships', 'Search relationships by person name', {
    query: z.string().describe('Search query'),
  }, async (args) => {
    const results = relationships.searchRelationships(db, args.query);
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  });

  // Event Participant tools
  server.tool('add_event_participant', 'Add a person as a participant in an event', {
    event_id: z.string().describe('Event ID'),
    person_id: z.string().describe('Person ID'),
    role: z.enum(['primary', 'spouse', 'parent', 'child', 'witness', 'godparent', 'officiant', 'other']).optional().describe('Participant role (default: primary)'),
  }, async (args) => {
    const participant = relationships.addEventParticipant(db, args);
    return { content: [{ type: 'text', text: JSON.stringify(participant, null, 2) }] };
  });

  server.tool('get_event_participants', 'Get all participants for an event', {
    event_id: z.string().describe('Event ID'),
  }, async (args) => {
    const list = relationships.getEventParticipants(db, args.event_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.tool('remove_event_participant', 'Remove a participant from an event', {
    id: z.string().describe('Event participant ID'),
  }, async (args) => {
    const ok = relationships.removeEventParticipant(db, args.id);
    return { content: [{ type: 'text', text: ok ? 'Removed' : 'Not found' }] };
  });

  // Event tools
  server.tool('add_event', 'Add a life event (optionally linked to a relationship)', {
    event_type: z.string().describe('Event type: birth, death, marriage, baptism, burial, immigration, census, residence, occupation, military, etc.'),
    relationship_id: z.string().optional().describe('Relationship ID (for relationship events like marriage)'),
    date_value: z.string().optional().describe('Date in ISO format (YYYY-MM-DD)'),
    date_value_end: z.string().optional().describe('End date for "between" date type (YYYY-MM-DD)'),
    date_type: z.enum(['exact', 'about', 'before', 'after', 'between', 'calculated', 'unknown']).optional(),
    date_original: z.string().optional().describe('Original date text as found in source'),
    place_id: z.string().optional().describe('Place ID'),
    description: z.string().optional(),
  }, async (args) => {
    const event = events.createEvent(db, args);
    return { content: [{ type: 'text', text: JSON.stringify(event, null, 2) }] };
  });

  server.tool('get_event', 'Get a single event by ID', {
    id: z.string().describe('Event ID'),
  }, async (args) => {
    const event = events.getEvent(db, args.id);
    return { content: [{ type: 'text', text: event ? JSON.stringify(event, null, 2) : 'Event not found' }] };
  });

  server.tool('get_events_for_person', 'Get all events for a person (via event_participants)', {
    person_id: z.string().describe('Person ID'),
  }, async (args) => {
    const list = events.getEventsForPerson(db, args.person_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.tool('get_events_for_relationship', 'Get all events for a relationship', {
    relationship_id: z.string().describe('Relationship ID'),
  }, async (args) => {
    const list = events.getEventsForRelationship(db, args.relationship_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.tool('update_event', 'Update an event', {
    id: z.string().describe('Event ID'),
    event_type: z.string().optional(),
    date_value: z.string().optional(),
    date_value_end: z.string().optional(),
    date_type: z.enum(['exact', 'about', 'before', 'after', 'between', 'calculated', 'unknown']).optional(),
    date_original: z.string().optional(),
    place_id: z.string().optional(),
    description: z.string().optional(),
    relationship_id: z.string().optional(),
  }, async (args) => {
    const { id, ...data } = args;
    const event = events.updateEvent(db, id, data);
    return { content: [{ type: 'text', text: event ? JSON.stringify(event, null, 2) : 'Event not found' }] };
  });

  server.tool('delete_event', 'Delete an event', {
    id: z.string().describe('Event ID'),
  }, async (args) => {
    const ok = events.deleteEvent(db, args.id);
    return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Not found' }] };
  });

  // Source tools
  server.tool('add_source', 'Add a source record', {
    title: z.string().describe('Source title'),
    author: z.string().optional(),
    source_type: z.string().optional().describe('Type: vital_record, census, newspaper, photograph, oral_history, etc.'),
    url: z.string().optional(),
    repository: z.string().optional(),
  }, async (args) => {
    const source = sources.createSource(db, args);
    return { content: [{ type: 'text', text: JSON.stringify(source, null, 2) }] };
  });

  server.tool('add_citation', 'Add a citation linking a source to an event, person, relationship, or place', {
    source_id: z.string().describe('Source ID'),
    event_id: z.string().optional().describe('Event ID'),
    person_id: z.string().optional().describe('Person ID'),
    relationship_id: z.string().optional().describe('Relationship ID'),
    place_id: z.string().optional().describe('Place ID'),
    page: z.string().optional().describe('Page/location within source'),
    transcription: z.string().optional().describe('Verbatim text from source'),
    confidence: z.number().optional().describe('0-3: 0=unreliable, 3=direct primary evidence'),
  }, async (args) => {
    const citation = sources.createCitation(db, args);
    return { content: [{ type: 'text', text: JSON.stringify(citation, null, 2) }] };
  });

  server.tool('get_source', 'Get a source by ID', {
    id: z.string().describe('Source ID'),
  }, async (args) => {
    const source = sources.getSource(db, args.id);
    return { content: [{ type: 'text', text: source ? JSON.stringify(source, null, 2) : 'Source not found' }] };
  });

  server.tool('list_sources', 'List all sources', {}, async () => {
    const list = sources.listSources(db);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.tool('update_source', 'Update a source', {
    id: z.string().describe('Source ID'),
    title: z.string().optional(),
    author: z.string().optional(),
    publication_info: z.string().optional(),
    repository: z.string().optional(),
    url: z.string().optional(),
    source_type: z.string().optional(),
  }, async (args) => {
    const { id, ...data } = args;
    const source = sources.updateSource(db, id, data);
    return { content: [{ type: 'text', text: source ? JSON.stringify(source, null, 2) : 'Source not found' }] };
  });

  server.tool('delete_source', 'Delete a source', {
    id: z.string().describe('Source ID'),
  }, async (args) => {
    const ok = sources.deleteSource(db, args.id);
    return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Not found' }] };
  });

  server.tool('search_sources', 'Search sources by title, author, or publication info', {
    query: z.string().describe('Search query'),
  }, async (args) => {
    const results = sources.searchSources(db, args.query);
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  });

  server.tool('get_citation', 'Get a citation by ID', {
    id: z.string().describe('Citation ID'),
  }, async (args) => {
    const citation = sources.getCitation(db, args.id);
    return { content: [{ type: 'text', text: citation ? JSON.stringify(citation, null, 2) : 'Citation not found' }] };
  });

  server.tool('get_citations_for_source', 'Get all citations for a source', {
    source_id: z.string().describe('Source ID'),
  }, async (args) => {
    const list = sources.getCitationsForSource(db, args.source_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.tool('get_citations_for_event', 'Get all citations for an event', {
    event_id: z.string().describe('Event ID'),
  }, async (args) => {
    const list = sources.getCitationsForEvent(db, args.event_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.tool('delete_citation', 'Delete a citation', {
    id: z.string().describe('Citation ID'),
  }, async (args) => {
    const ok = sources.deleteCitation(db, args.id);
    return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Not found' }] };
  });

  // Place tools
  server.tool('add_place', 'Create a new place record', {
    name: z.string().describe('Place name'),
    place_type: z.enum(['country', 'province', 'county', 'härad', 'parish', 'farm', 'village', 'city', 'other']).optional().describe('Place type'),
    parent_place_id: z.string().optional().describe('Parent place ID'),
    latitude: z.number().optional().describe('Latitude coordinate'),
    longitude: z.number().optional().describe('Longitude coordinate'),
    date_from: z.string().optional().describe('Date from (ISO format)'),
    date_to: z.string().optional().describe('Date to (ISO format)'),
    notes: z.string().optional().describe('Notes about the place'),
  }, async (args) => {
    const place = createPlace(db, args);
    return { content: [{ type: 'text', text: JSON.stringify(place, null, 2) }] };
  });

  server.tool('get_place', 'Get a place by ID', {
    id: z.string().describe('Place ID'),
  }, async (args) => {
    const place = getPlace(db, args.id);
    return { content: [{ type: 'text', text: place ? JSON.stringify(place, null, 2) : 'Place not found' }] };
  });

  server.tool('list_places', 'List all places', {}, async () => {
    const list = listPlaces(db);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.tool('search_places', 'Search places by name', {
    query: z.string().describe('Search query'),
  }, async (args) => {
    const results = searchPlaces(db, args.query);
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  });

  server.tool('update_place', 'Update a place', {
    id: z.string().describe('Place ID'),
    name: z.string().optional().describe('Place name'),
    place_type: z.enum(['country', 'province', 'county', 'härad', 'parish', 'farm', 'village', 'city', 'other']).optional(),
    parent_place_id: z.string().optional().nullable().describe('Parent place ID'),
    latitude: z.number().optional().nullable().describe('Latitude coordinate'),
    longitude: z.number().optional().nullable().describe('Longitude coordinate'),
    notes: z.string().optional().describe('Notes about the place'),
  }, async (args) => {
    const { id, ...data } = args;
    const place = updatePlace(db, id, data);
    return { content: [{ type: 'text', text: place ? JSON.stringify(place, null, 2) : 'Place not found' }] };
  });

  server.tool('delete_place', 'Delete a place', {
    id: z.string().describe('Place ID'),
  }, async (args) => {
    const ok = deletePlace(db, args.id);
    return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Not found' }] };
  });

  // UI tools — require the Electron app to be running
  const UI_PORT = process.env.SLAKTFORSKNING_UI_PORT
    ? parseInt(process.env.SLAKTFORSKNING_UI_PORT)
    : 19241;
  const UI_BASE = `http://127.0.0.1:${UI_PORT}`;

  async function uiPost(path: string, body?: unknown): Promise<unknown> {
    try {
      const res = await fetch(`${UI_BASE}${path}`, {
        method: 'POST',
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      return res.json();
    } catch {
      throw new Error('App UI not reachable — make sure the Electron app is running (npm start).');
    }
  }

  async function uiGet(path: string): Promise<string> {
    try {
      const res = await fetch(`${UI_BASE}${path}`);
      return res.text();
    } catch {
      throw new Error('App UI not reachable — make sure the Electron app is running (npm start).');
    }
  }

  server.tool('ui_screenshot', 'Take a screenshot of the current app window. Returns a PNG image.', {}, async () => {
    const result = await uiPost('/screenshot') as { data: string; error?: string };
    if (result.error) return { content: [{ type: 'text', text: `Error: ${result.error}` }] };
    return { content: [{ type: 'image', data: result.data, mimeType: 'image/png' }] };
  });

  server.tool('ui_navigate', 'Navigate the app to a route path (e.g. "/search?q=Erik", "/persons/123", "/relationships").', {
    path: z.string().describe('Vue Router path to navigate to, e.g. "/search?q=Erik"'),
  }, async (args) => {
    const result = await uiPost('/navigate', { path: args.path }) as { ok?: boolean; error?: string };
    if (result.error) return { content: [{ type: 'text', text: `Error: ${result.error}` }] };
    return { content: [{ type: 'text', text: `Navigated to ${args.path}` }] };
  });

  server.tool('ui_get_dom', 'Get the full rendered HTML of the current app view. Use this to verify what is displayed on screen.', {}, async () => {
    const html = await uiGet('/dom');
    return { content: [{ type: 'text', text: html }] };
  });

  server.tool('ui_click', 'Click an element in the app by CSS selector.', {
    selector: z.string().describe('CSS selector for the element to click, e.g. "button.btn-delete", "a[href=\'/relationships\']"'),
  }, async (args) => {
    const result = await uiPost('/click', { selector: args.selector }) as { ok?: boolean; error?: string };
    if (result.error) return { content: [{ type: 'text', text: `Error: ${result.error}` }] };
    return { content: [{ type: 'text', text: `Clicked: ${args.selector}` }] };
  });

  server.tool('ui_execute_js', 'Run JavaScript in the renderer process and return the result. Useful for reading state, querying the DOM, or triggering actions.', {
    code: z.string().describe('JavaScript expression or statement to execute in the renderer'),
  }, async (args) => {
    const result = await uiPost('/execute_js', { code: args.code }) as { result?: unknown; error?: string };
    if (result.error) return { content: [{ type: 'text', text: `Error: ${result.error}` }] };
    return { content: [{ type: 'text', text: JSON.stringify(result.result, null, 2) }] };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
