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
    // Pass through what the agent provided. Per CLAUDE.md prime directive,
    // we never infer date_type from a free-form date string — agents must
    // explicitly state `birth_date_type` if they want a structured value.
    // When omitted: date_original holds the raw input; date_type defaults to
    // 'unknown' at the api/schema layer; date_value stays null.
    birth_event = eventApi.createEvent(db, {
      event_type: 'birth',
      date_original: args.birth_date ?? '',
      date_type: args.birth_date_type as GenealogyEvent['date_type'] | undefined,
      date_value: args.birth_date_type ? args.birth_date ?? null : null,
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
    description: 'Search persons by name',
    inputSchema: {
      query: z.string().describe('Search query — matches given name, surname, or notes'),
      limit: z.number().int().min(1).max(200).optional().describe('Maximum number of results to return (default: 20, max: 200)'),
    },
  }, async (args) => {
    const results = personApi.searchPersons(getDb(), args.query, null, args.limit);
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

  server.registerTool('update_person_name', {
    description: 'Update fields on an existing person_name record. Use this to retype the primary name (e.g. set the auto-created "birth" record to "aka" when the actual birth surname differs), to set date_from / date_to on a name period, or to attach nickname / preferred_name. To find the name id, call get_person_summary.',
    inputSchema: {
      id: z.string().describe('person_name ID (from get_person_summary)'),
      given_name: z.string().optional(),
      surname: z.string().optional(),
      name_type: z.enum(['birth', 'married', 'alias', 'aka']).optional().describe('birth | married | alias | aka'),
      date_from: z.string().optional().describe('Date this name became active (free text or ISO)'),
      date_to: z.string().optional().describe('Date this name was superseded'),
      sort_order: z.number().optional().describe('Sort order — lower = primary; the lowest sort_order is the displayed name'),
      name_prefix: z.string().optional(),
      name_suffix: z.string().optional(),
      patronymic_base: z.string().optional(),
      preferred_name: z.string().optional().describe('Single given name marked as preferred / called'),
      nickname: z.string().optional(),
    },
  }, async (args) => {
    const { id, ...data } = args;
    const name = personApi.updatePersonName(getDb(), id, data);
    return { content: [{ type: 'text', text: name ? JSON.stringify(name, null, 2) : 'person_name not found' }] };
  });

  server.registerTool('delete_person_name', {
    description: 'Delete a single person_name record (does not delete the person). Use this when an extra name was added by mistake, e.g. a duplicate "birth" entry. To find the name id, call get_person_summary.',
    inputSchema: {
      id: z.string().describe('person_name ID (from get_person_summary)'),
    },
  }, async (args) => {
    const ok = personApi.deletePersonName(getDb(), args.id);
    return { content: [{ type: 'text', text: ok ? 'Deleted' : 'person_name not found' }] };
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

  server.registerTool('add_person_identifier', {
    description: 'Attach an external identifier to a person — FamilySearch ID, Ancestry ID, Riksarkivet ref, Swedish personnummer, GEDCOM REFN/RIN, or anything else. Use this to record matches found in third-party trees and to keep cross-references for future re-imports.',
    inputSchema: {
      person_id: z.string().describe('Person ID'),
      identifier_type: z.enum(['familysearch', 'ancestry', 'riksarkivet', 'personnummer', 'refn', 'rin', 'other']).describe('Identifier scheme'),
      identifier_value: z.string().describe('The identifier value as it appears in the source system'),
    },
  }, async (args) => {
    const ident = personApi.addPersonIdentifier(getDb(), args.person_id, {
      identifier_type: args.identifier_type,
      identifier_value: args.identifier_value,
    });
    return { content: [{ type: 'text', text: JSON.stringify(ident, null, 2) }] };
  });

  server.registerTool('get_person_identifiers', {
    description: 'List all external identifiers attached to a person.',
    inputSchema: {
      person_id: z.string().describe('Person ID'),
    },
  }, async (args) => {
    const list = personApi.getPersonIdentifiers(getDb(), args.person_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('delete_person_identifier', {
    description: 'Remove an external identifier from a person.',
    inputSchema: {
      id: z.string().describe('person_identifier ID'),
    },
  }, async (args) => {
    const ok = personApi.deletePersonIdentifier(getDb(), args.id);
    return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Identifier not found' }] };
  });
}
