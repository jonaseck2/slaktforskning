import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Database } from 'node-sqlite3-wasm';
import * as relationshipApi from '../../../api/relationships';
import * as eventApi from '../../../api/events';
import * as placeApi from '../../../api/places';
import * as reportData from '../../../api/report_data';
import type { Citation, GenealogyEvent, Relationship } from '../../../api/types';
import type { ToolContext } from './types';
import { _createPersonCore, type CreatePersonArgs } from './persons';

export interface AddChildArgs {
  parent_id: string;
  other_parent_id?: string;
  given_name: string;
  surname: string;
  sex?: 'M' | 'F' | 'U';
  birth_date?: string;
  birth_date_type?: string;
  birth_place?: string;
  source_title?: string;
  source_page?: string;
}

export interface AddChildResult {
  child: ReturnType<typeof _createPersonCore>['person'];
  relationships: Relationship[];
  birth_event: GenealogyEvent | null;
  citation: Citation | null;
}

export function addChildWorkflow(db: Database, args: AddChildArgs): AddChildResult {
  db.exec('BEGIN');
  try {
    const personArgs: CreatePersonArgs = {
      given_name: args.given_name,
      surname: args.surname,
      sex: args.sex,
      birth_date: args.birth_date,
      birth_date_type: args.birth_date_type,
      birth_place: args.birth_place,
      source_title: args.source_title,
      source_page: args.source_page,
    };

    const { person: child, birth_event, citation } = _createPersonCore(db, personArgs);

    const relationships: Relationship[] = [];

    const rel1 = relationshipApi.createRelationship(db, {
      type: 'parent_child',
      person1_id: args.parent_id,
      person2_id: child.id,
    });
    relationships.push(rel1);

    if (args.other_parent_id) {
      const rel2 = relationshipApi.createRelationship(db, {
        type: 'parent_child',
        person1_id: args.other_parent_id,
        person2_id: child.id,
      });
      relationships.push(rel2);
    }

    db.exec('COMMIT');
    return { child, relationships, birth_event, citation };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export interface AddRelationshipArgs {
  person1_id: string;
  person2_id: string;
  type: 'couple' | 'parent_child' | 'sibling' | 'godparent' | 'other';
  subtype?: string;
  event_type?: string;
  event_date?: string;
  event_date_type?: string;
  event_place?: string;
  notes?: string;
}

export interface AddRelationshipResult {
  relationship: Relationship;
  event: GenealogyEvent | null;
}

export function addRelationshipWorkflow(db: Database, args: AddRelationshipArgs): AddRelationshipResult {
  db.exec('BEGIN');
  try {
    const relationship = relationshipApi.createRelationship(db, {
      type: args.type,
      person1_id: args.person1_id,
      person2_id: args.person2_id,
      subtype: args.subtype,
      notes: args.notes,
    });

    let event: GenealogyEvent | null = null;
    if (args.event_type) {
      let place_id: string | null = null;
      if (args.event_place) {
        const place = placeApi.findOrCreatePlace(db, args.event_place);
        place_id = place.id;
      }
      // Pass through what the agent provided. Per CLAUDE.md prime directive,
      // we never infer date_type from a free-form date string — agents must
      // explicitly state `event_date_type` for a structured value.
      event = eventApi.createEvent(db, {
        event_type: args.event_type,
        relationship_id: relationship.id,
        date_original: args.event_date ?? '',
        date_type: args.event_date_type as GenealogyEvent['date_type'] | undefined,
        date_value: args.event_date_type ? args.event_date ?? null : null,
        place_id,
      });
    }

    db.exec('COMMIT');
    return { relationship, event };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function registerFamilyTools(server: McpServer, ctx: ToolContext): void {
  const { getDb } = ctx;

  server.registerTool('add_relationship', {
    description: 'Create a relationship between two persons, optionally with an event (e.g. marriage)',
    inputSchema: {
      person1_id: z.string().describe('ID of the first person'),
      person2_id: z.string().describe('ID of the second person'),
      type: z.enum(['couple', 'parent_child', 'sibling', 'godparent', 'other']).describe('Relationship type'),
      subtype: z.string().optional().describe('Relationship subtype (e.g. marriage, biological, adopted)'),
      event_type: z.string().optional().describe('Event type to create (e.g. marriage, divorce)'),
      event_date: z.string().optional().describe('Event date (free text)'),
      event_date_type: z.string().optional().describe('Date type: exact, about, before, after, between, calculated, unknown'),
      event_place: z.string().optional().describe('Event place name'),
      notes: z.string().optional().describe('Notes about the relationship'),
    },
  }, async (args) => {
    const result = addRelationshipWorkflow(getDb(), args as AddRelationshipArgs);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool('add_child', {
    description: 'Create a child person and parent_child relationship(s). Optionally creates birth event and citation.',
    inputSchema: {
      parent_id: z.string().describe('ID of the primary parent'),
      other_parent_id: z.string().optional().describe('ID of the other parent (creates a second parent_child relationship)'),
      given_name: z.string().describe('Given/first name(s) of the child'),
      surname: z.string().describe('Surname/family name of the child'),
      sex: z.enum(['M', 'F', 'U']).optional().describe('Sex: M, F, or U (unknown)'),
      birth_date: z.string().optional().describe('Birth date (free text, e.g. "1850" or "12 Mar 1850"). Without birth_date_type, this is stored only as date_original; date_value stays null.'),
      birth_date_type: z.string().optional().describe('Date type: exact, about, before, after, between, calculated, unknown. Required to populate the structured date_value field.'),
      birth_place: z.string().optional().describe('Birth place name'),
      source_title: z.string().optional().describe('Source document title; reuses existing source if title matches'),
      source_page: z.string().optional().describe('Page or reference within the source'),
    },
  }, async (args) => {
    const result = addChildWorkflow(getDb(), args as AddChildArgs);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool('get_family_unit', {
    description: 'Get a denormalized family unit for a relationship: couple + both persons + children with birth/death events',
    inputSchema: {
      relationship_id: z.string().describe('Relationship ID'),
    },
  }, async (args) => {
    const unit = reportData.getFamilyUnit(getDb(), args.relationship_id);
    return { content: [{ type: 'text', text: unit ? JSON.stringify(unit, null, 2) : 'Relationship not found' }] };
  });

  server.registerTool('get_ancestor_tree', {
    description: 'Get an ancestor tree for a person (nested, up to N generations)',
    inputSchema: {
      person_id: z.string().describe('Person ID'),
      generations: z.number().optional().describe('Number of generations to include (default: 4)'),
    },
  }, async (args) => {
    const tree = reportData.getAncestorTree(getDb(), args.person_id, args.generations ?? 4);
    return { content: [{ type: 'text', text: tree ? JSON.stringify(tree, null, 2) : 'Person not found' }] };
  });
}
