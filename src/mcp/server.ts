import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Database } from 'node-sqlite3-wasm';
import path from 'node:path';
import os from 'node:os';
import { initializeSchema } from '../api/schema';
import * as persons from '../api/persons';
import * as families from '../api/families';
import * as events from '../api/events';
import * as sources from '../api/sources';

function getDbPath(): string {
  const platform = process.platform;
  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'slaktforskning', 'slaktforskning.db');
  } else if (platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'slaktforskning', 'slaktforskning.db');
  }
  return path.join(os.homedir(), '.config', 'slaktforskning', 'slaktforskning.db');
}

async function main() {
  const dbPath = process.env.SLAKTFORSKNING_DB || getDbPath();
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
    version: '0.1.0',
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

  // Family tools
  server.tool('create_family', 'Create a family unit', {
    partner_a_id: z.string().optional().describe('First partner person ID'),
    partner_b_id: z.string().optional().describe('Second partner person ID'),
    union_type: z.enum(['marriage', 'civil_union', 'cohabitation', 'unknown']).optional(),
  }, async (args) => {
    const family = families.createFamily(db, args);
    return { content: [{ type: 'text', text: JSON.stringify(family, null, 2) }] };
  });

  server.tool('add_child_to_family', 'Add a child to a family', {
    family_id: z.string().describe('Family ID'),
    person_id: z.string().describe('Child person ID'),
    relationship_type: z.enum(['biological', 'adopted', 'foster', 'step', 'unknown']).optional(),
  }, async (args) => {
    const link = families.addChildToFamily(db, args.family_id, args.person_id, args.relationship_type);
    return { content: [{ type: 'text', text: JSON.stringify(link, null, 2) }] };
  });

  server.tool('list_families', 'List all families', {}, async () => {
    const list = families.listFamilies(db);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  // Event tools
  server.tool('add_event', 'Add a life event to a person or family', {
    event_type: z.string().describe('Event type: birth, death, marriage, baptism, burial, immigration, census, residence, occupation, military, etc.'),
    person_id: z.string().optional().describe('Person ID (for individual events)'),
    family_id: z.string().optional().describe('Family ID (for family events like marriage)'),
    date_value: z.string().optional().describe('Date in ISO format (YYYY-MM-DD)'),
    date_type: z.enum(['exact', 'about', 'before', 'after', 'between', 'calculated', 'unknown']).optional(),
    date_original: z.string().optional().describe('Original date text as found in source'),
    description: z.string().optional(),
  }, async (args) => {
    const event = events.createEvent(db, args);
    return { content: [{ type: 'text', text: JSON.stringify(event, null, 2) }] };
  });

  server.tool('get_events_for_person', 'Get all events for a person', {
    person_id: z.string().describe('Person ID'),
  }, async (args) => {
    const list = events.getEventsForPerson(db, args.person_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
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

  server.tool('add_citation', 'Add a citation linking a source to an event or person', {
    source_id: z.string().describe('Source ID'),
    event_id: z.string().optional().describe('Event ID'),
    person_id: z.string().optional().describe('Person ID'),
    page: z.string().optional().describe('Page/location within source'),
    transcription: z.string().optional().describe('Verbatim text from source'),
    confidence: z.number().optional().describe('0-3: 0=unreliable, 3=direct primary evidence'),
  }, async (args) => {
    const citation = sources.createCitation(db, args);
    return { content: [{ type: 'text', text: JSON.stringify(citation, null, 2) }] };
  });

  server.tool('list_sources', 'List all sources', {}, async () => {
    const list = sources.listSources(db);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
