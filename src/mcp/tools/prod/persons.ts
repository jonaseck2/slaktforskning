import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Database } from 'node-sqlite3-wasm';
import * as personApi from '../../../api/persons';
import * as eventApi from '../../../api/events';
import * as relationshipApi from '../../../api/relationships';
import * as placeApi from '../../../api/places';
import * as sourceApi from '../../../api/sources';
import * as reportData from '../../../api/report_data';
import * as duplicates from '../../../api/duplicates';
import type { Citation, GenealogyEvent, Person, Source } from '../../../api/types';
import type { ToolContext } from './types';

export interface CreatePersonArgs {
  given_name: string;
  surname: string;
  sex?: 'M' | 'F' | 'U';
  birth_date?: string;
  birth_date_type?: string;
  birth_place?: string;
  source_title?: string;
  source_page?: string;
  notes?: string;
}

export interface CreatePersonResult {
  person: Person;
  birth_event: GenealogyEvent | null;
  citation: Citation | null;
}

/**
 * Find an existing source by exact title, or create a new one.
 * Exported as a shared helper for other workflow files.
 */
export function findOrCreateSource(db: Database, title: string): Source {
  const results = sourceApi.searchSources(db, title);
  const exact = results.find(s => s.title === title);
  if (exact) return exact;
  return sourceApi.createSource(db, { title });
}

/**
 * Core logic without transaction wrapper. Called directly by createPersonWorkflow
 * and also by other workflow functions (e.g. addChildWorkflow) inside their own transactions.
 */
export function _createPersonCore(db: Database, args: CreatePersonArgs): CreatePersonResult {
  const person = personApi.createPerson(db, {
    sex: args.sex,
    notes: args.notes,
    given_name: args.given_name,
    surname: args.surname,
  });

  let birth_event: GenealogyEvent | null = null;
  let citation: Citation | null = null;

  if (args.birth_date || args.birth_place) {
    let place_id: string | null = null;
    if (args.birth_place) {
      const place = placeApi.findOrCreatePlace(db, args.birth_place);
      place_id = place.id;
    }
    birth_event = eventApi.createEvent(db, {
      event_type: 'birth',
      date_original: args.birth_date ?? '',
      date_type: (args.birth_date_type as GenealogyEvent['date_type']) ?? (args.birth_date ? 'exact' : 'unknown'),
      date_value: args.birth_date ?? null,
      place_id,
    });
    relationshipApi.addEventParticipant(db, {
      event_id: birth_event.id,
      person_id: person.id,
      role: 'primary',
    });
  }

  if (args.source_title) {
    const source = findOrCreateSource(db, args.source_title);
    citation = sourceApi.createCitation(db, {
      source_id: source.id,
      event_id: birth_event?.id ?? null,
      page: args.source_page,
    });
  }

  return { person, birth_event, citation };
}

/**
 * Public workflow function — wraps _createPersonCore in a transaction.
 */
export async function createPersonWorkflow(db: Database, args: CreatePersonArgs): Promise<CreatePersonResult> {
  db.exec('BEGIN');
  try {
    const result = _createPersonCore(db, args);
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function registerPersonTools(server: McpServer, ctx: ToolContext): void {
  const { getDb } = ctx;

  server.registerTool('create_person', {
    description: 'Create a new person, optionally with a birth event and source citation in one step',
    inputSchema: {
      given_name: z.string().describe('Given/first name(s)'),
      surname: z.string().describe('Surname/family name'),
      sex: z.enum(['M', 'F', 'U']).optional().describe('Sex: M, F, or U (unknown)'),
      birth_date: z.string().optional().describe('Birth date (free text, e.g. "1850" or "12 Mar 1850")'),
      birth_date_type: z.string().optional().describe('Date type: exact, about, before, after, between, calculated, unknown'),
      birth_place: z.string().optional().describe('Birth place name'),
      source_title: z.string().optional().describe('Title of the source document; reuses existing source if title matches'),
      source_page: z.string().optional().describe('Page or reference within the source'),
      notes: z.string().optional().describe('Free-text notes'),
    },
  }, async (args) => {
    const result = await createPersonWorkflow(getDb(), args as CreatePersonArgs);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool('search_persons', {
    description: 'Search persons by name, optionally filtered by birth year range',
    inputSchema: {
      query: z.string().describe('Search query — matches given name, surname, or notes'),
      limit: z.number().int().min(1).max(200).optional().describe('Maximum number of results to return (default: 20, max: 200)'),
      birth_year_min: z.number().int().optional().describe('Only return persons born in this year or later'),
      birth_year_max: z.number().int().optional().describe('Only return persons born in this year or earlier'),
    },
  }, async (args) => {
    const results = personApi.searchPersons(getDb(), args.query, null, args.limit, args.birth_year_min, args.birth_year_max);
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  });

  server.registerTool('get_person_summary', {
    description: 'Get a full summary of a person including names, events, relationships, citations, groups, and tasks',
    inputSchema: {
      id: z.string().describe('Person ID'),
    },
  }, async (args) => {
    const summary = reportData.getPersonSummary(getDb(), args.id);
    return { content: [{ type: 'text', text: summary ? JSON.stringify(summary, null, 2) : 'Person not found' }] };
  });

  server.registerTool('update_person', {
    description: 'Update a person\'s fields. Use given_name/surname to update the primary name.',
    inputSchema: {
      id: z.string().describe('Person ID'),
      sex: z.enum(['M', 'F', 'U']).optional(),
      notes: z.string().optional(),
      given_name: z.string().optional().describe('Updates the given name on the primary (lowest sort_order) name record'),
      surname: z.string().optional().describe('Updates the surname on the primary (lowest sort_order) name record'),
    },
  }, async (args) => {
    const db = getDb();
    const { id, given_name, surname, ...personFields } = args;

    const person = personApi.updatePerson(db, id, personFields);
    if (!person) {
      return { content: [{ type: 'text', text: 'Person not found' }] };
    }

    if (given_name !== undefined || surname !== undefined) {
      const names = personApi.getPersonNames(db, id);
      if (names.length > 0) {
        const primary = names[0];
        personApi.updatePersonName(db, primary.id, {
          ...(given_name !== undefined ? { given_name } : {}),
          ...(surname !== undefined ? { surname } : {}),
        });
      }
    }

    return { content: [{ type: 'text', text: JSON.stringify(personApi.getPerson(db, id), null, 2) }] };
  });

  server.registerTool('delete_person', {
    description: 'Delete a person and all their associated data',
    inputSchema: {
      id: z.string().describe('Person ID'),
    },
  }, async (args) => {
    const ok = personApi.deletePerson(getDb(), args.id);
    return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Person not found' }] };
  });

  server.registerTool('add_person_name', {
    description: 'Add an alternate name to a person (married name, alias, etc.)',
    inputSchema: {
      person_id: z.string().describe('Person ID'),
      given_name: z.string().optional(),
      surname: z.string().optional(),
      name_type: z.enum(['birth', 'married', 'alias', 'aka']).optional().describe('Name type (default: birth)'),
    },
  }, async (args) => {
    const { person_id, ...data } = args;
    const name = personApi.addPersonName(getDb(), person_id, data);
    return { content: [{ type: 'text', text: JSON.stringify(name, null, 2) }] };
  });

  server.registerTool('merge_persons', {
    description: 'Merge source person into target person. All data from source is moved to target, then source is deleted.',
    inputSchema: {
      target_id: z.string().describe('ID of the person to keep'),
      source_id: z.string().describe('ID of the person to merge into target (will be deleted)'),
    },
  }, async (args) => {
    const result = duplicates.mergePersons(getDb(), args.target_id, args.source_id);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool('find_duplicates', {
    description: 'Find potential duplicate persons by comparing names and birth dates',
    inputSchema: {
      limit: z.number().optional().describe('Maximum number of candidates to return (default: 100)'),
    },
  }, async (args) => {
    const candidates = duplicates.findDuplicates(getDb(), args.limit);
    return { content: [{ type: 'text', text: JSON.stringify(candidates, null, 2) }] };
  });
}
