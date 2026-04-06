import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Database } from 'node-sqlite3-wasm';
import { initializeSchema } from '../api/schema';
import * as persons from '../api/persons';
import { addPersonIdentifier, getPersonIdentifiers, deletePersonIdentifier } from '../api/persons';
import * as relationships from '../api/relationships';
import * as events from '../api/events';
import * as sources from '../api/sources';
import { createPlace, getPlace, listPlaces, searchPlaces, updatePlace, deletePlace } from '../api/places';
import * as groups from '../api/groups';
import * as repositories from '../api/repositories';
import * as researchTasks from '../api/research_tasks';
import * as media from '../api/media';
import { runAllChecks, runChecksForPerson } from '../api/checks';
import { readGedcomFile, parseGedcom, importGedcom, exportGedcom } from '../gedcom';
import type { ImportOptions } from '../import/gedcom';
import { importFromGenney } from '../import/genney/index';
import { importFromHolger } from '../import/holger/index';

export function createMcpServer(initialDb: Database, initialDbPath?: string): McpServer {
  let db = initialDb;
  let currentDbPath = initialDbPath ?? 'unknown';
  const server = new McpServer({
    name: 'slaktforskning',
    version: '0.3.1',
  });

  // Person tools
  server.registerTool('create_person', {
    description: 'Create a new person',
    inputSchema: {
      given_name: z.string().optional().describe('Given/first name'),
      surname: z.string().optional().describe('Surname/family name'),
      sex: z.enum(['M', 'F', 'U']).optional().describe('Sex: M, F, or U (unknown)'),
    },
  }, async (args) => {
    const person = persons.createPerson(db, args);
    return { content: [{ type: 'text', text: JSON.stringify(person, null, 2) }] };
  });

  server.registerTool('list_persons', { description: 'List all persons' }, async () => {
    const list = persons.listPersons(db);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('search_persons', {
    description: 'Search persons by name',
    inputSchema: { query: z.string().describe('Search query') },
  }, async (args) => {
    const results = persons.searchPersons(db, args.query);
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  });

  server.registerTool('get_person', {
    description: 'Get a person by ID',
    inputSchema: { id: z.string().describe('Person ID') },
  }, async (args) => {
    const person = persons.getPerson(db, args.id);
    return { content: [{ type: 'text', text: person ? JSON.stringify(person, null, 2) : 'Person not found' }] };
  });

  server.registerTool('update_person', {
    description: 'Update a person',
    inputSchema: {
      id: z.string().describe('Person ID'),
      sex: z.enum(['M', 'F', 'U']).optional(),
      living: z.boolean().optional(),
      notes: z.string().optional(),
    },
  }, async (args) => {
    const { id, ...data } = args;
    const person = persons.updatePerson(db, id, data);
    return { content: [{ type: 'text', text: person ? JSON.stringify(person, null, 2) : 'Person not found' }] };
  });

  server.registerTool('delete_person', {
    description: 'Delete a person',
    inputSchema: { id: z.string().describe('Person ID') },
  }, async (args) => {
    const ok = persons.deletePerson(db, args.id);
    return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Not found' }] };
  });

  server.registerTool('add_person_name', {
    description: 'Add an alternate name to a person (married, alias, aka)',
    inputSchema: {
      person_id: z.string().describe('Person ID'),
      given_name: z.string().optional().describe('Full legal given names, e.g. "Eva Linda Marie"'),
      surname: z.string().optional().describe('Surname/family name'),
      name_type: z.enum(['birth', 'married', 'alias', 'aka']).optional().describe('Name type (default: birth)'),
      name_prefix: z.string().optional(),
      name_suffix: z.string().optional(),
      patronymic_base: z.string().optional(),
      name_qualifier: z.enum(['patronymic', 'matronymic', 'particle', 'married', 'alias']).optional(),
      preferred_name: z.string().optional().describe('Tilltalsnamn — the specific given name used in daily life, e.g. "Linda"'),
      nickname: z.string().optional().describe('Smeknamn — informal nickname used by friends and family, e.g. "Sanna"'),
    },
  }, async (args) => {
    const { person_id, ...data } = args;
    const name = persons.addPersonName(db, person_id, data);
    return { content: [{ type: 'text', text: JSON.stringify(name, null, 2) }] };
  });

  server.registerTool('get_person_names', {
    description: 'Get all names for a person',
    inputSchema: { person_id: z.string().describe('Person ID') },
  }, async (args) => {
    const list = persons.getPersonNames(db, args.person_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('update_person_name', {
    description: 'Update a person name record',
    inputSchema: {
      id: z.string(),
      given_name: z.string().optional(),
      surname: z.string().optional(),
      name_type: z.enum(['birth', 'married', 'alias', 'aka']).optional(),
      name_prefix: z.string().optional(),
      name_suffix: z.string().optional(),
      patronymic_base: z.string().optional(),
      name_qualifier: z.enum(['patronymic', 'matronymic', 'particle', 'married', 'alias']).optional(),
      preferred_name: z.string().optional().describe('Tilltalsnamn — the specific given name used in daily life'),
      nickname: z.string().optional().describe('Smeknamn — informal nickname used by friends and family'),
    },
  }, async ({ id, ...data }) =>
    ({ content: [{ type: 'text', text: JSON.stringify(persons.updatePersonName(db, id, data)) }] })
  );

  server.registerTool('delete_person_name', {
    description: 'Delete a person name record',
    inputSchema: { id: z.string() },
  }, async ({ id }) =>
    ({ content: [{ type: 'text', text: JSON.stringify({ deleted: persons.deletePersonName(db, id) }) }] })
  );

  server.registerTool('add_person_identifier', {
    description: 'Add an external identifier to a person (FamilySearch ID, Ancestry ID, etc.)',
    inputSchema: {
      person_id: z.string(),
      identifier_type: z.enum(['familysearch', 'ancestry', 'riksarkivet', 'personnummer', 'refn', 'rin', 'other']),
      identifier_value: z.string(),
    },
  }, async ({ person_id, identifier_type, identifier_value }) =>
    ({ content: [{ type: 'text', text: JSON.stringify(addPersonIdentifier(db, person_id, { identifier_type, identifier_value })) }] })
  );

  server.registerTool('get_person_identifiers', {
    description: 'Get all external identifiers for a person',
    inputSchema: { person_id: z.string() },
  }, async ({ person_id }) =>
    ({ content: [{ type: 'text', text: JSON.stringify(getPersonIdentifiers(db, person_id)) }] })
  );

  server.registerTool('delete_person_identifier', {
    description: 'Delete an external identifier',
    inputSchema: { id: z.string() },
  }, async ({ id }) =>
    ({ content: [{ type: 'text', text: JSON.stringify({ deleted: deletePersonIdentifier(db, id) }) }] })
  );

  // Relationship tools
  server.registerTool('create_relationship', {
    description: 'Create a relationship between two persons',
    inputSchema: {
      type: z.enum(['couple', 'parent_child', 'sibling', 'godparent', 'other']).describe('Relationship type'),
      person1_id: z.string().optional().describe('Person 1 ID (for parent_child: parent)'),
      person2_id: z.string().optional().describe('Person 2 ID (for parent_child: child)'),
      subtype: z.string().optional(),
      notes: z.string().optional(),
    },
  }, async (args) => {
    const rel = relationships.createRelationship(db, args);
    return { content: [{ type: 'text', text: JSON.stringify(rel, null, 2) }] };
  });

  server.registerTool('get_relationship', {
    description: 'Get a relationship by ID',
    inputSchema: { id: z.string().describe('Relationship ID') },
  }, async (args) => {
    const rel = relationships.getRelationship(db, args.id);
    return { content: [{ type: 'text', text: rel ? JSON.stringify(rel, null, 2) : 'Relationship not found' }] };
  });

  server.registerTool('list_relationships', { description: 'List all relationships' }, async () => {
    const list = relationships.listRelationships(db);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('update_relationship', {
    description: 'Update a relationship',
    inputSchema: {
      id: z.string().describe('Relationship ID'),
      type: z.enum(['couple', 'parent_child', 'sibling', 'godparent', 'other']).optional(),
      person1_id: z.string().optional(),
      person2_id: z.string().optional(),
      subtype: z.string().optional(),
      notes: z.string().optional(),
    },
  }, async (args) => {
    const { id, ...data } = args;
    const rel = relationships.updateRelationship(db, id, data);
    return { content: [{ type: 'text', text: rel ? JSON.stringify(rel, null, 2) : 'Relationship not found' }] };
  });

  server.registerTool('delete_relationship', {
    description: 'Delete a relationship',
    inputSchema: { id: z.string().describe('Relationship ID') },
  }, async (args) => {
    const ok = relationships.deleteRelationship(db, args.id);
    return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Not found' }] };
  });

  server.registerTool('get_relationships_of_person', {
    description: 'Get all relationships for a person',
    inputSchema: { person_id: z.string().describe('Person ID') },
  }, async (args) => {
    const list = relationships.getRelationshipsOfPerson(db, args.person_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('search_relationships', {
    description: 'Search relationships by person name',
    inputSchema: { query: z.string().describe('Search query') },
  }, async (args) => {
    const results = relationships.searchRelationships(db, args.query);
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  });

  // Event participant tools
  server.registerTool('add_event_participant', {
    description: 'Add a person as a participant in an event',
    inputSchema: {
      event_id: z.string().describe('Event ID'),
      person_id: z.string().describe('Person ID'),
      role: z.enum(['primary', 'spouse', 'parent', 'child', 'witness', 'godparent', 'officiant', 'other']).optional().describe('Participant role (default: primary)'),
    },
  }, async (args) => {
    const participant = relationships.addEventParticipant(db, args);
    return { content: [{ type: 'text', text: JSON.stringify(participant, null, 2) }] };
  });

  server.registerTool('get_event_participants', {
    description: 'Get all participants for an event',
    inputSchema: { event_id: z.string().describe('Event ID') },
  }, async (args) => {
    const list = relationships.getEventParticipants(db, args.event_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('remove_event_participant', {
    description: 'Remove a participant from an event',
    inputSchema: { id: z.string().describe('Event participant ID') },
  }, async (args) => {
    const ok = relationships.removeEventParticipant(db, args.id);
    return { content: [{ type: 'text', text: ok ? 'Removed' : 'Not found' }] };
  });

  // Event tools
  server.registerTool('add_event', {
    description: 'Add a life event (optionally linked to a relationship)',
    inputSchema: {
      event_type: z.string().describe('Event type: birth, death, marriage, baptism, burial, immigration, census, residence, occupation, military, etc.'),
      relationship_id: z.string().optional().describe('Relationship ID (for relationship events like marriage)'),
      date_value: z.string().optional().describe('Date in ISO format (YYYY-MM-DD)'),
      date_value_end: z.string().optional().describe('End date for "between" date type (YYYY-MM-DD)'),
      date_type: z.enum(['exact', 'about', 'before', 'after', 'between', 'calculated', 'unknown']).optional(),
      date_original: z.string().optional().describe('Original date text as found in source'),
      place_id: z.string().optional().describe('Place ID'),
      description: z.string().optional(),
    },
  }, async (args) => {
    const event = events.createEvent(db, args);
    return { content: [{ type: 'text', text: JSON.stringify(event, null, 2) }] };
  });

  server.registerTool('get_event', {
    description: 'Get a single event by ID',
    inputSchema: { id: z.string().describe('Event ID') },
  }, async (args) => {
    const event = events.getEvent(db, args.id);
    return { content: [{ type: 'text', text: event ? JSON.stringify(event, null, 2) : 'Event not found' }] };
  });

  server.registerTool('get_events_for_person', {
    description: 'Get all events for a person (via event_participants)',
    inputSchema: { person_id: z.string().describe('Person ID') },
  }, async (args) => {
    const list = events.getEventsForPerson(db, args.person_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('get_events_for_relationship', {
    description: 'Get all events for a relationship',
    inputSchema: { relationship_id: z.string().describe('Relationship ID') },
  }, async (args) => {
    const list = events.getEventsForRelationship(db, args.relationship_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('update_event', {
    description: 'Update an event',
    inputSchema: {
      id: z.string().describe('Event ID'),
      event_type: z.string().optional(),
      date_value: z.string().optional(),
      date_value_end: z.string().optional(),
      date_type: z.enum(['exact', 'about', 'before', 'after', 'between', 'calculated', 'unknown']).optional(),
      date_original: z.string().optional(),
      place_id: z.string().optional(),
      description: z.string().optional(),
      relationship_id: z.string().optional(),
    },
  }, async (args) => {
    const { id, ...data } = args;
    const event = events.updateEvent(db, id, data);
    return { content: [{ type: 'text', text: event ? JSON.stringify(event, null, 2) : 'Event not found' }] };
  });

  server.registerTool('delete_event', {
    description: 'Delete an event',
    inputSchema: { id: z.string().describe('Event ID') },
  }, async (args) => {
    const ok = events.deleteEvent(db, args.id);
    return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Not found' }] };
  });

  // Source tools
  server.registerTool('add_source', {
    description: 'Add a source record',
    inputSchema: {
      title: z.string().describe('Source title'),
      author: z.string().optional(),
      source_type: z.string().optional().describe('Type: vital_record, census, newspaper, photograph, oral_history, etc.'),
      url: z.string().optional(),
      repository: z.string().optional(),
    },
  }, async (args) => {
    const source = sources.createSource(db, args);
    return { content: [{ type: 'text', text: JSON.stringify(source, null, 2) }] };
  });

  server.registerTool('get_source', {
    description: 'Get a source by ID',
    inputSchema: { id: z.string().describe('Source ID') },
  }, async (args) => {
    const source = sources.getSource(db, args.id);
    return { content: [{ type: 'text', text: source ? JSON.stringify(source, null, 2) : 'Source not found' }] };
  });

  server.registerTool('list_sources', { description: 'List all sources' }, async () => {
    const list = sources.listSources(db);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('update_source', {
    description: 'Update a source',
    inputSchema: {
      id: z.string().describe('Source ID'),
      title: z.string().optional(),
      author: z.string().optional(),
      publication_info: z.string().optional(),
      repository: z.string().optional(),
      url: z.string().optional(),
      source_type: z.string().optional(),
    },
  }, async (args) => {
    const { id, ...data } = args;
    const source = sources.updateSource(db, id, data);
    return { content: [{ type: 'text', text: source ? JSON.stringify(source, null, 2) : 'Source not found' }] };
  });

  server.registerTool('delete_source', {
    description: 'Delete a source',
    inputSchema: { id: z.string().describe('Source ID') },
  }, async (args) => {
    const ok = sources.deleteSource(db, args.id);
    return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Not found' }] };
  });

  server.registerTool('search_sources', {
    description: 'Search sources by title, author, or publication info',
    inputSchema: { query: z.string().describe('Search query') },
  }, async (args) => {
    const results = sources.searchSources(db, args.query);
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  });

  server.registerTool('add_citation', {
    description: 'Add a citation linking a source to an event, person, relationship, or place',
    inputSchema: {
      source_id: z.string().describe('Source ID'),
      event_id: z.string().optional().describe('Event ID'),
      person_id: z.string().optional().describe('Person ID'),
      relationship_id: z.string().optional().describe('Relationship ID'),
      place_id: z.string().optional().describe('Place ID'),
      page: z.string().optional().describe('Page/location within source'),
      transcription: z.string().optional().describe('Verbatim text from source'),
      confidence: z.number().optional().describe('0-3: 0=unreliable, 3=direct primary evidence'),
    },
  }, async (args) => {
    const citation = sources.createCitation(db, args);
    return { content: [{ type: 'text', text: JSON.stringify(citation, null, 2) }] };
  });

  server.registerTool('get_citation', {
    description: 'Get a citation by ID',
    inputSchema: { id: z.string().describe('Citation ID') },
  }, async (args) => {
    const citation = sources.getCitation(db, args.id);
    return { content: [{ type: 'text', text: citation ? JSON.stringify(citation, null, 2) : 'Citation not found' }] };
  });

  server.registerTool('get_citations_for_source', {
    description: 'Get all citations for a source',
    inputSchema: { source_id: z.string().describe('Source ID') },
  }, async (args) => {
    const list = sources.getCitationsForSource(db, args.source_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('get_citations_for_event', {
    description: 'Get all citations for an event',
    inputSchema: { event_id: z.string().describe('Event ID') },
  }, async (args) => {
    const list = sources.getCitationsForEvent(db, args.event_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('get_citations_for_person', {
    description: 'Get all citations attached to a person',
    inputSchema: { person_id: z.string().describe('Person ID') },
  }, async (args) => {
    const list = sources.getCitationsForPerson(db, args.person_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('get_citations_for_relationship', {
    description: 'Get all citations attached to a relationship',
    inputSchema: { relationship_id: z.string().describe('Relationship ID') },
  }, async (args) => {
    const list = sources.getCitationsForRelationship(db, args.relationship_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('get_citations_for_place', {
    description: 'Get all citations attached to a place',
    inputSchema: { place_id: z.string().describe('Place ID') },
  }, async (args) => {
    const list = sources.getCitationsForPlace(db, args.place_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('delete_citation', {
    description: 'Delete a citation',
    inputSchema: { id: z.string().describe('Citation ID') },
  }, async (args) => {
    const ok = sources.deleteCitation(db, args.id);
    return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Not found' }] };
  });

  // Place tools
  server.registerTool('add_place', {
    description: 'Create a new place record',
    inputSchema: {
      name: z.string().describe('Place name'),
      place_type: z.enum(['country', 'province', 'county', 'härad', 'parish', 'farm', 'village', 'city', 'other']).optional().describe('Place type'),
      parent_place_id: z.string().optional().describe('Parent place ID'),
      latitude: z.number().optional().describe('Latitude coordinate'),
      longitude: z.number().optional().describe('Longitude coordinate'),
      date_from: z.string().optional().describe('Date from (ISO format)'),
      date_to: z.string().optional().describe('Date to (ISO format)'),
      notes: z.string().optional().describe('Notes about the place'),
      street: z.string().optional().describe('Street name and number'),
      postal_code: z.string().optional().describe('Postal code'),
      city: z.string().optional().describe('City name'),
      country: z.string().optional().describe('Country name or ISO code'),
    },
  }, async (args) => {
    const place = createPlace(db, args);
    return { content: [{ type: 'text', text: JSON.stringify(place, null, 2) }] };
  });

  server.registerTool('get_place', {
    description: 'Get a place by ID',
    inputSchema: { id: z.string().describe('Place ID') },
  }, async (args) => {
    const place = getPlace(db, args.id);
    return { content: [{ type: 'text', text: place ? JSON.stringify(place, null, 2) : 'Place not found' }] };
  });

  server.registerTool('list_places', { description: 'List all places' }, async () => {
    const list = listPlaces(db);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('search_places', {
    description: 'Search places by name',
    inputSchema: { query: z.string().describe('Search query') },
  }, async (args) => {
    const results = searchPlaces(db, args.query);
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  });

  server.registerTool('update_place', {
    description: 'Update a place',
    inputSchema: {
      id: z.string().describe('Place ID'),
      name: z.string().optional().describe('Place name'),
      place_type: z.enum(['country', 'province', 'county', 'härad', 'parish', 'farm', 'village', 'city', 'other']).optional(),
      parent_place_id: z.string().optional().nullable().describe('Parent place ID'),
      latitude: z.number().optional().nullable().describe('Latitude coordinate'),
      longitude: z.number().optional().nullable().describe('Longitude coordinate'),
      notes: z.string().optional().describe('Notes about the place'),
      street: z.string().optional().describe('Street name and number'),
      postal_code: z.string().optional().describe('Postal code'),
      city: z.string().optional().describe('City name'),
      country: z.string().optional().describe('Country name or ISO code'),
    },
  }, async (args) => {
    const { id, ...data } = args;
    const place = updatePlace(db, id, data);
    return { content: [{ type: 'text', text: place ? JSON.stringify(place, null, 2) : 'Place not found' }] };
  });

  server.registerTool('delete_place', {
    description: 'Delete a place',
    inputSchema: { id: z.string().describe('Place ID') },
  }, async (args) => {
    const ok = deletePlace(db, args.id);
    return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Not found' }] };
  });

  // GEDCOM tools
  server.registerTool('import_gedcom', {
    description: 'Import a GEDCOM 5.5.1 .ged file from disk into the database. Use profile "genney" for Genney 4.1 GEDCOM exports to enable Swedish hierarchical places, patronymic detection, and Genney custom tags. For Genney .backup/.gcc archives, use import_genney instead.',
    inputSchema: {
      file_path: z.string().describe('Absolute path to the .ged file to import'),
      profile: z.enum(['genney']).optional().describe('Import profile. "genney" enables Genney 4.1 extensions: Swedish hierarchical places, patronymic detection, _UID/_YHAPLOGROUP/_MHAPLOGROUP tags.'),
    },
  }, async (args) => {
    const lower = args.file_path.toLowerCase();
    if (lower.endsWith('.backup') || lower.endsWith('.gcc')) {
      return { content: [{ type: 'text', text: 'Error: .backup and .gcc files are Genney archives, not GEDCOM files. Use the import_genney tool instead.' }] };
    }
    const fs = await import('fs');
    const text = readGedcomFile(args.file_path);
    const tree = parseGedcom(text);
    const options: ImportOptions = args.profile ? { profile: args.profile } : {};
    importGedcom(db, tree, options);
    return { content: [{ type: 'text', text: JSON.stringify({ imported: true, file_path: args.file_path, profile: args.profile ?? null }) }] };
  });

  server.registerTool('import_genney', {
    description: 'Import a Genney 4.1 archive (.backup or .gcc) or Derby database directory into the database. Downloads Derby extraction tools on first use (~30 MB, requires internet). Requires Java or Docker.',
    inputSchema: {
      file_path: z.string().describe('Absolute path to the .backup/.gcc archive or extracted Derby database directory'),
      schema: z.string().optional().describe('Override the auto-detected Derby schema name'),
    },
  }, async (args) => {
    const messages: string[] = [];
    try {
      const result = await importFromGenney(db, args.file_path, {
        schema: args.schema,
        onProgress: (msg) => messages.push(msg),
      });
      return { content: [{ type: 'text', text: JSON.stringify({ ...result, progress: messages }, null, 2) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: JSON.stringify({ error: message, progress: messages }, null, 2) }] };
    }
  });

  server.registerTool('import_holger', {
    description:
      'Import a Holger/OurKind GEDCOM export (.ged or .zip) into the database. ' +
      'Handles Holger-specific ENGA TYPE semantics (couple subtypes: Sambo→cohabitation, Partner→cohabitation, ' +
      'Parter→cohabitation, Särbo→cohabitation, Relation→other, Förlovade→unknown) and ADOP TYPE ' +
      '(Fosterbarn→foster, Adoptivbarn→adopted). ' +
      'Optionally remaps Windows-style OBJE FILE paths to a local media directory. ' +
      'To generate the GEDCOM from Holger: Arkiv → Exportera GEDCOM → Generellt format, ANSI encoding.',
    inputSchema: {
      source_path: z.string().describe('Path to a .ged file, a .zip containing a .ged, or a folder containing a .ged'),
      media_dir: z.string().optional().describe('Optional: path to local OurKind/Media directory for remapping Windows image paths'),
    },
  }, async (args) => {
    try {
      const result = await importFromHolger(db, {
        sourcePath: args.source_path,
        mediaDir: args.media_dir,
      });
      const r = result.report;
      const eventTotal = Object.values(r.events).reduce((a, b) => a + b, 0);
      return {
        content: [{
          type: 'text',
          text: `Holger import complete: ${r.persons} persons, ${r.families} families, ${eventTotal} events, ${r.sources} sources, ${r.places} places, ${r.citations} citations.`,
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
      };
    }
  });

  server.registerTool('export_gedcom', {
    description: 'Export the entire database as GEDCOM 5.5.1. If file_path is provided, writes to disk; otherwise returns the content.',
    inputSchema: {
      file_path: z.string().optional().describe('Absolute path to write the .ged file. If omitted, returns GEDCOM content as text.'),
    },
  }, async (args) => {
    const gedText = exportGedcom(db);
    if (args.file_path) {
      const fs = await import('fs');
      fs.writeFileSync(args.file_path, gedText, 'utf-8');
      return { content: [{ type: 'text', text: JSON.stringify({ exported: true, file_path: args.file_path }) }] };
    }
    return { content: [{ type: 'text', text: gedText }] };
  });

  // Group tools
  server.registerTool('create_group', {
    description: 'Create a new group',
    inputSchema: {
      name: z.string().describe('Group name'),
      notes: z.string().optional().describe('Notes about the group'),
    },
  }, async (args) => {
    const group = groups.createGroup(db, args);
    return { content: [{ type: 'text', text: JSON.stringify(group, null, 2) }] };
  });

  server.registerTool('get_group', {
    description: 'Get a group by ID',
    inputSchema: { id: z.string().describe('Group ID') },
  }, async ({ id }) => {
    const group = groups.getGroup(db, id);
    return { content: [{ type: 'text', text: group ? JSON.stringify(group, null, 2) : 'Group not found' }] };
  });

  server.registerTool('list_groups', { description: 'List all groups' }, async () => {
    const list = groups.listGroups(db);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('update_group', {
    description: 'Update a group',
    inputSchema: {
      id: z.string().describe('Group ID'),
      name: z.string().optional().describe('Group name'),
      notes: z.string().optional().describe('Notes about the group'),
    },
  }, async ({ id, ...data }) => {
    const group = groups.updateGroup(db, id, data);
    return { content: [{ type: 'text', text: group ? JSON.stringify(group, null, 2) : 'Group not found' }] };
  });

  server.registerTool('delete_group', {
    description: 'Delete a group',
    inputSchema: { id: z.string().describe('Group ID') },
  }, async ({ id }) => {
    const ok = groups.deleteGroup(db, id);
    return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Not found' }] };
  });

  server.registerTool('add_group_member', {
    description: 'Add a person to a group',
    inputSchema: {
      group_id: z.string().describe('Group ID'),
      person_id: z.string().describe('Person ID'),
    },
  }, async ({ group_id, person_id }) => {
    const member = groups.addGroupMember(db, group_id, person_id);
    return { content: [{ type: 'text', text: JSON.stringify(member, null, 2) }] };
  });

  server.registerTool('remove_group_member', {
    description: 'Remove a person from a group',
    inputSchema: {
      group_id: z.string().describe('Group ID'),
      person_id: z.string().describe('Person ID'),
    },
  }, async ({ group_id, person_id }) => {
    const ok = groups.removeGroupMember(db, group_id, person_id);
    return { content: [{ type: 'text', text: ok ? 'Removed' : 'Not found' }] };
  });

  server.registerTool('get_group_members', {
    description: 'Get all members of a group',
    inputSchema: { group_id: z.string().describe('Group ID') },
  }, async ({ group_id }) => {
    const list = groups.getGroupMembers(db, group_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('get_groups_for_person', {
    description: 'Get all groups a person belongs to',
    inputSchema: { person_id: z.string().describe('Person ID') },
  }, async ({ person_id }) => {
    const list = groups.getGroupsForPerson(db, person_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  // Repository tools
  server.registerTool('create_repository', {
    description: 'Create a new repository (archive, library, etc.)',
    inputSchema: {
      name: z.string().describe('Repository name'),
      address: z.string().optional().describe('Street address'),
      city: z.string().optional().describe('City'),
      postal_code: z.string().optional().describe('Postal code'),
      state: z.string().optional().describe('State or region'),
      country: z.string().optional().describe('Country'),
      phone: z.string().optional().describe('Phone number'),
      email: z.string().optional().describe('Email address'),
      web: z.string().optional().describe('Website URL'),
      call_number: z.string().optional().describe('Call number or reference'),
      notes: z.string().optional().describe('Notes about the repository'),
    },
  }, async (args) => {
    const repo = repositories.createRepository(db, args);
    return { content: [{ type: 'text', text: JSON.stringify(repo, null, 2) }] };
  });

  server.registerTool('get_repository', {
    description: 'Get a repository by ID',
    inputSchema: { id: z.string().describe('Repository ID') },
  }, async ({ id }) => {
    const repo = repositories.getRepository(db, id);
    return { content: [{ type: 'text', text: repo ? JSON.stringify(repo, null, 2) : 'Repository not found' }] };
  });

  server.registerTool('list_repositories', { description: 'List all repositories' }, async () => {
    const list = repositories.listRepositories(db);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('update_repository', {
    description: 'Update a repository',
    inputSchema: {
      id: z.string().describe('Repository ID'),
      name: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      postal_code: z.string().optional(),
      state: z.string().optional(),
      country: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      web: z.string().optional(),
      call_number: z.string().optional(),
      notes: z.string().optional(),
    },
  }, async ({ id, ...data }) => {
    const repo = repositories.updateRepository(db, id, data);
    return { content: [{ type: 'text', text: repo ? JSON.stringify(repo, null, 2) : 'Repository not found' }] };
  });

  server.registerTool('delete_repository', {
    description: 'Delete a repository',
    inputSchema: { id: z.string().describe('Repository ID') },
  }, async ({ id }) => {
    const ok = repositories.deleteRepository(db, id);
    return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Not found' }] };
  });

  server.registerTool('link_source_repository', {
    description: 'Link a source to a repository',
    inputSchema: {
      source_id: z.string().describe('Source ID'),
      repository_id: z.string().describe('Repository ID'),
    },
  }, async ({ source_id, repository_id }) => {
    repositories.linkSourceRepository(db, source_id, repository_id);
    return { content: [{ type: 'text', text: JSON.stringify({ linked: true }) }] };
  });

  server.registerTool('unlink_source_repository', {
    description: 'Remove the link between a source and a repository',
    inputSchema: {
      source_id: z.string().describe('Source ID'),
      repository_id: z.string().describe('Repository ID'),
    },
  }, async ({ source_id, repository_id }) => {
    const ok = repositories.unlinkSourceRepository(db, source_id, repository_id);
    return { content: [{ type: 'text', text: ok ? 'Unlinked' : 'Not found' }] };
  });

  server.registerTool('get_repositories_for_source', {
    description: 'Get all repositories linked to a source',
    inputSchema: { source_id: z.string().describe('Source ID') },
  }, async ({ source_id }) => {
    const list = repositories.getRepositoriesForSource(db, source_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  // Research task tools
  server.registerTool('create_research_task', {
    description: 'Create a new research task',
    inputSchema: {
      task: z.string().describe('Description of the research task'),
      person_id: z.string().optional().describe('Person ID this task relates to'),
      priority: z.number().optional().describe('Priority (lower = higher priority, default 0)'),
      status: z.enum(['open', 'in_progress', 'done', 'stopped']).optional().describe('Task status (default: open)'),
      notes: z.string().optional().describe('Notes about the task'),
      result: z.string().optional().describe('Result of completed research'),
    },
  }, async (args) => {
    const task = researchTasks.createResearchTask(db, args);
    return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] };
  });

  server.registerTool('get_research_task', {
    description: 'Get a research task by ID',
    inputSchema: { id: z.string().describe('Research task ID') },
  }, async ({ id }) => {
    const task = researchTasks.getResearchTask(db, id);
    return { content: [{ type: 'text', text: task ? JSON.stringify(task, null, 2) : 'Research task not found' }] };
  });

  server.registerTool('list_research_tasks', { description: 'List all research tasks' }, async () => {
    const list = researchTasks.listResearchTasks(db);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('get_research_tasks_for_person', {
    description: 'Get all research tasks for a person',
    inputSchema: { person_id: z.string().describe('Person ID') },
  }, async ({ person_id }) => {
    const list = researchTasks.getResearchTasksForPerson(db, person_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('update_research_task', {
    description: 'Update a research task',
    inputSchema: {
      id: z.string().describe('Research task ID'),
      task: z.string().optional().describe('Task description'),
      status: z.enum(['open', 'in_progress', 'done', 'stopped']).optional(),
      priority: z.number().optional(),
      notes: z.string().optional(),
      result: z.string().optional().describe('Result of completed research'),
      person_id: z.string().nullable().optional().describe('Link to a person (null to unlink)'),
    },
  }, async ({ id, ...data }) => {
    const task = researchTasks.updateResearchTask(db, id, data);
    return { content: [{ type: 'text', text: task ? JSON.stringify(task, null, 2) : 'Research task not found' }] };
  });

  server.registerTool('delete_research_task', {
    description: 'Delete a research task',
    inputSchema: { id: z.string().describe('Research task ID') },
  }, async ({ id }) => {
    const ok = researchTasks.deleteResearchTask(db, id);
    return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Not found' }] };
  });

  // Media tools
  server.registerTool('create_media', {
    description: 'Create a new media record',
    inputSchema: {
      title: z.string().describe('Media title or filename'),
      file_ref: z.string().optional().describe('File path or reference'),
      format: z.string().optional().describe('File format (e.g. jpg, pdf, mp4)'),
      notes: z.string().optional().describe('Notes about the media'),
      is_printable: z.boolean().optional().describe('Whether this media can be printed (default: false)'),
    },
  }, async (args) => {
    const item = media.createMedia(db, args);
    return { content: [{ type: 'text', text: JSON.stringify(item, null, 2) }] };
  });

  server.registerTool('get_media', {
    description: 'Get a media record by ID',
    inputSchema: { id: z.string().describe('Media ID') },
  }, async ({ id }) => {
    const item = media.getMedia(db, id);
    return { content: [{ type: 'text', text: item ? JSON.stringify(item, null, 2) : 'Media not found' }] };
  });

  server.registerTool('list_media', { description: 'List all media records' }, async () => {
    const list = media.listMedia(db);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('delete_media', {
    description: 'Delete a media record',
    inputSchema: { id: z.string().describe('Media ID') },
  }, async ({ id }) => {
    const ok = media.deleteMedia(db, id);
    return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Not found' }] };
  });

  server.registerTool('add_media_link', {
    description: 'Link a media record to an entity (person, event, relationship, place, or source)',
    inputSchema: {
      media_id: z.string().describe('Media ID'),
      entity_type: z.enum(['person', 'event', 'relationship', 'place', 'source']).describe('Entity type'),
      entity_id: z.string().describe('Entity ID'),
      link_type: z.string().optional().describe('Link type (e.g. "portrait", "document")'),
    },
  }, async (args) => {
    const link = media.addMediaLink(db, args);
    return { content: [{ type: 'text', text: JSON.stringify(link, null, 2) }] };
  });

  server.registerTool('get_media_for_entity', {
    description: 'Get all media linked to an entity',
    inputSchema: {
      entity_type: z.enum(['person', 'event', 'relationship', 'place', 'source']).describe('Entity type'),
      entity_id: z.string().describe('Entity ID'),
    },
  }, async ({ entity_type, entity_id }) => {
    const list = media.getMediaForEntity(db, entity_type, entity_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('remove_media_link', {
    description: 'Remove a media link by its link ID',
    inputSchema: { link_id: z.string().describe('Media link ID') },
  }, async ({ link_id }) => {
    const ok = media.removeMediaLink(db, link_id);
    return { content: [{ type: 'text', text: ok ? 'Removed' : 'Not found' }] };
  });

  // Checks tools
  server.registerTool('run_checks', {
    description: 'Run all data quality checks across the entire database and return a list of issues found',
  }, async () => {
    const results = runAllChecks(db);
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  });

  server.registerTool('run_checks_for_person', {
    description: 'Run data quality checks for a specific person and return any issues found',
    inputSchema: { id: z.string().describe('Person ID') },
  }, async ({ id }) => {
    const results = runChecksForPerson(db, id);
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  });

  // Database tools
  server.registerTool('get_current_database', {
    description: 'Get the path of the currently open database file.',
  }, async () => {
    const nodePath = await import('node:path');
    return { content: [{ type: 'text', text: JSON.stringify({ path: currentDbPath, name: nodePath.default.basename(currentDbPath) }, null, 2) }] };
  });

  server.registerTool('switch_database', {
    description: 'Close the current database and open a different one. Creates the file if it does not exist. All subsequent tool calls will operate on the new database.',
    inputSchema: {
      path: z.string().describe('Absolute path to the SQLite database file to open'),
    },
  }, async (args) => {
    const fs = await import('node:fs');
    const nodePath = await import('node:path');
    fs.mkdirSync(nodePath.default.dirname(args.path), { recursive: true });
    const lockPath = args.path + '.lock';
    if (fs.existsSync(lockPath) && fs.statSync(lockPath).isDirectory()) {
      fs.rmSync(lockPath, { recursive: true });
    }
    db.close();
    db = new Database(args.path);
    initializeSchema(db);
    currentDbPath = args.path;
    return { content: [{ type: 'text', text: JSON.stringify({ switched: true, path: args.path, name: nodePath.default.basename(args.path) }, null, 2) }] };
  });

  return server;
}
