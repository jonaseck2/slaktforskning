import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as persons from '../../api/persons';
import { addPersonIdentifier, getPersonIdentifiers, deletePersonIdentifier } from '../../api/persons';
import type { ToolContext } from './types';

export function registerPersonTools(server: McpServer, ctx: ToolContext): void {
  const { getDb } = ctx;

  server.registerTool('create_person', {
    description: 'Create a new person',
    inputSchema: {
      given_name: z.string().optional().describe('Given/first name'),
      surname: z.string().optional().describe('Surname/family name'),
      sex: z.enum(['M', 'F', 'U']).optional().describe('Sex: M, F, or U (unknown)'),
    },
  }, async (args) => {
    const person = persons.createPerson(getDb(), args);
    return { content: [{ type: 'text', text: JSON.stringify(person, null, 2) }] };
  });

  server.registerTool('list_persons', { description: 'List all persons' }, async () => {
    const list = persons.listPersons(getDb());
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('search_persons', {
    description: 'Search persons by name',
    inputSchema: { query: z.string().describe('Search query') },
  }, async (args) => {
    const results = persons.searchPersons(getDb(), args.query);
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  });

  server.registerTool('get_person', {
    description: 'Get a person by ID',
    inputSchema: { id: z.string().describe('Person ID') },
  }, async (args) => {
    const person = persons.getPerson(getDb(), args.id);
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
    const person = persons.updatePerson(getDb(), id, data);
    return { content: [{ type: 'text', text: person ? JSON.stringify(person, null, 2) : 'Person not found' }] };
  });

  server.registerTool('delete_person', {
    description: 'Delete a person',
    inputSchema: { id: z.string().describe('Person ID') },
  }, async (args) => {
    const ok = persons.deletePerson(getDb(), args.id);
    return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Not found' }] };
  });

  server.registerTool('add_person_name', {
    description: 'Add an alternate name to a person (married, alias, aka)',
    inputSchema: {
      person_id: z.string().describe('Person ID'),
      given_name: z.string().optional().describe('Full legal given names, e.g. "Eva Linda Marie"'),
      surname: z.string().optional().describe('Surname/family name'),
      name_type: z.enum(['birth', 'married', 'name_change', 'alias', 'aka']).optional().describe('Name type (default: birth)'),
      name_prefix: z.string().optional(),
      name_suffix: z.string().optional(),
      patronymic_base: z.string().optional(),
      name_qualifier: z.enum(['patronymic', 'matronymic', 'particle', 'married', 'alias']).optional(),
      preferred_name: z.string().optional().describe('Tilltalsnamn — the specific given name used in daily life, e.g. "Linda"'),
      nickname: z.string().optional().describe('Smeknamn — informal nickname used by friends and family, e.g. "Sanna"'),
    },
  }, async (args) => {
    const { person_id, ...data } = args;
    const name = persons.addPersonName(getDb(), person_id, data);
    return { content: [{ type: 'text', text: JSON.stringify(name, null, 2) }] };
  });

  server.registerTool('get_person_names', {
    description: 'Get all names for a person',
    inputSchema: { person_id: z.string().describe('Person ID') },
  }, async (args) => {
    const list = persons.getPersonNames(getDb(), args.person_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('update_person_name', {
    description: 'Update a person name record',
    inputSchema: {
      id: z.string(),
      given_name: z.string().optional(),
      surname: z.string().optional(),
      name_type: z.enum(['birth', 'married', 'name_change', 'alias', 'aka']).optional(),
      name_prefix: z.string().optional(),
      name_suffix: z.string().optional(),
      patronymic_base: z.string().optional(),
      name_qualifier: z.enum(['patronymic', 'matronymic', 'particle', 'married', 'alias']).optional(),
      preferred_name: z.string().optional().describe('Tilltalsnamn — the specific given name used in daily life'),
      nickname: z.string().optional().describe('Smeknamn — informal nickname used by friends and family'),
    },
  }, async ({ id, ...data }) =>
    ({ content: [{ type: 'text', text: JSON.stringify(persons.updatePersonName(getDb(), id, data)) }] })
  );

  server.registerTool('delete_person_name', {
    description: 'Delete a person name record',
    inputSchema: { id: z.string() },
  }, async ({ id }) =>
    ({ content: [{ type: 'text', text: JSON.stringify({ deleted: persons.deletePersonName(getDb(), id) }) }] })
  );

  server.registerTool('add_person_identifier', {
    description: 'Add an external identifier to a person (FamilySearch ID, Ancestry ID, etc.)',
    inputSchema: {
      person_id: z.string(),
      identifier_type: z.enum(['familysearch', 'ancestry', 'riksarkivet', 'personnummer', 'refn', 'rin', 'other']),
      identifier_value: z.string(),
    },
  }, async ({ person_id, identifier_type, identifier_value }) =>
    ({ content: [{ type: 'text', text: JSON.stringify(addPersonIdentifier(getDb(), person_id, { identifier_type, identifier_value })) }] })
  );

  server.registerTool('get_person_identifiers', {
    description: 'Get all external identifiers for a person',
    inputSchema: { person_id: z.string() },
  }, async ({ person_id }) =>
    ({ content: [{ type: 'text', text: JSON.stringify(getPersonIdentifiers(getDb(), person_id)) }] })
  );

  server.registerTool('delete_person_identifier', {
    description: 'Delete an external identifier',
    inputSchema: { id: z.string() },
  }, async ({ id }) =>
    ({ content: [{ type: 'text', text: JSON.stringify({ deleted: deletePersonIdentifier(getDb(), id) }) }] })
  );
}
