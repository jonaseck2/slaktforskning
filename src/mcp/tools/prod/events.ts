import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Database } from 'node-sqlite3-wasm';
import * as eventApi from '../../../api/events';
import * as relationshipApi from '../../../api/relationships';
import * as placeApi from '../../../api/places';
import * as sourceApi from '../../../api/sources';
import * as reportData from '../../../api/report_data';
import type { Citation, GenealogyEvent } from '../../../api/types';
import type { ToolContext } from './types';
import { findOrCreateSource } from './persons';

export interface RecordEventArgs {
  event_type: string;
  person_id?: string;
  person_ids?: { id: string; role?: string }[];
  relationship_id?: string;
  date_value?: string;
  date_type?: string;
  date_original?: string;
  place?: string;
  source_title?: string;
  source_page?: string;
  confidence?: number;
  value?: string;
  notes?: string;
  cause?: string;
}

export interface RecordEventResult {
  event: GenealogyEvent;
  citation: Citation | null;
}

export function recordEventWorkflow(db: Database, args: RecordEventArgs): RecordEventResult {
  db.exec('BEGIN');
  try {
    let place_id: string | null = null;
    if (args.place) {
      const place = placeApi.findOrCreatePlace(db, args.place);
      place_id = place.id;
    }

    // Pass through what the agent provided. Per CLAUDE.md prime directive,
    // we never infer date_type from a free-form date string — agents must
    // explicitly state `date_type` if they want a structured value. When
    // omitted: date_original holds the raw input; date_type defaults to
    // 'unknown' at the api/schema layer; date_value stays null.
    const event = eventApi.createEvent(db, {
      event_type: args.event_type,
      relationship_id: args.relationship_id ?? null,
      date_original: args.date_original ?? args.date_value ?? '',
      date_type: args.date_type as GenealogyEvent['date_type'] | undefined,
      date_value: args.date_type ? args.date_value ?? null : null,
      place_id,
      value: args.value,
      notes: args.notes,
      cause: args.cause,
    });

    // Single primary participant
    if (args.person_id) {
      relationshipApi.addEventParticipant(db, {
        event_id: event.id,
        person_id: args.person_id,
        role: 'primary',
      });
    }

    // Multiple participants with roles
    if (args.person_ids && args.person_ids.length > 0) {
      for (const p of args.person_ids) {
        relationshipApi.addEventParticipant(db, {
          event_id: event.id,
          person_id: p.id,
          role: (p.role as Parameters<typeof relationshipApi.addEventParticipant>[1]['role']) ?? 'primary',
        });
      }
    }

    let citation: Citation | null = null;
    if (args.source_title) {
      const source = findOrCreateSource(db, args.source_title);
      citation = sourceApi.createCitation(db, {
        source_id: source.id,
        event_id: event.id,
        page: args.source_page,
        confidence: args.confidence,
      });
    }

    db.exec('COMMIT');
    return { event, citation };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function registerEventTools(server: McpServer, ctx: ToolContext): void {
  const { getDb } = ctx;

  server.registerTool('record_event', {
    description: 'Record a life event for one or more persons, optionally with place and source citation in one step',
    inputSchema: {
      event_type: z.string().describe('Event type (e.g. birth, death, marriage, census, baptism)'),
      person_id: z.string().optional().describe('Primary participant person ID (use this for a single person)'),
      person_ids: z.array(z.object({
        id: z.string().describe('Person ID'),
        role: z.string().optional().describe('Role: primary, spouse, parent, child, witness, godparent, officiant, other'),
      })).optional().describe('Multiple participants with roles (use instead of person_id when multiple persons are involved)'),
      relationship_id: z.string().optional().describe('Relationship ID to attach event to'),
      date_value: z.string().optional().describe('Date value (ISO format for exact, otherwise free text)'),
      date_type: z.string().optional().describe('Date type: exact, about, before, after, between, calculated, unknown'),
      date_original: z.string().optional().describe('Original date text as it appears in the source'),
      place: z.string().optional().describe('Place name — creates or reuses an existing place'),
      source_title: z.string().optional().describe('Source document title; reuses existing source if title matches'),
      source_page: z.string().optional().describe('Page or reference within the source'),
      confidence: z.number().min(0).max(3).optional().describe('Source confidence: 0=Unreliable, 1=Questionable, 2=Secondary, 3=Primary'),
      value: z.string().optional().describe('Fact value (e.g. occupation name "Carpenter", residence "Stockholm", religion "Lutheran"). Maps to GEDCOM 5.5.1 line value / GEDCOM-X Fact.value.'),
      notes: z.string().optional().describe('Free-form notes about the event'),
      cause: z.string().optional().describe('Cause (e.g. cause of death)'),
    },
  }, async (args) => {
    const result = recordEventWorkflow(getDb(), args as RecordEventArgs);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool('get_timeline', {
    description: 'Get a chronological life-story timeline for a person: their own events plus parent deaths, spouse death, and children\'s births / foster_placements / deaths that happened during their lifetime. Each entry has a relationship_label ("self" | "father" | "mother" | "parent" | "spouse" | "son" | "daughter" | "child" | "sibling"). Spouse births / christenings / burials are excluded; only spouse deaths qualify. Child births include up to 9 months posthumous (to capture postpartum births). Siblings are excluded by default.',
    inputSchema: {
      person_id: z.string().describe('Person ID'),
      include_children_marriages: z.boolean().optional().describe('When true, include each child\'s marriage events that occurred during the subject\'s lifetime. Default false.'),
      include_sibling_deaths: z.boolean().optional().describe('When true, include each sibling\'s death events that occurred during the subject\'s lifetime. Default false.'),
    },
  }, async (args) => {
    const timeline = reportData.getTimeline(getDb(), args.person_id, {
      includeChildrenMarriages: args.include_children_marriages,
      includeSiblingDeaths: args.include_sibling_deaths,
    });
    return { content: [{ type: 'text', text: timeline ? JSON.stringify(timeline, null, 2) : 'Person not found' }] };
  });

  server.registerTool('update_event', {
    description: 'Update fields on an existing event. Place string is resolved to a place_id via findOrCreate.',
    inputSchema: {
      id: z.string().describe('Event ID'),
      event_type: z.string().optional().describe('Event type'),
      date_value: z.string().optional().describe('Date value'),
      date_type: z.string().optional().describe('Date type: exact, about, before, after, between, calculated, unknown'),
      date_original: z.string().optional().describe('Original date text as it appears in the source'),
      place: z.string().optional().describe('Place name — resolved to place_id via findOrCreate'),
      value: z.string().optional().describe('Fact value (e.g. occupation name "Carpenter", residence "Stockholm"). Maps to GEDCOM 5.5.1 line value.'),
      notes: z.string().optional().describe('Free-form notes about the event'),
      cause: z.string().optional().describe('Cause (e.g. cause of death)'),
    },
  }, async (args) => {
    const db = getDb();
    const { id, place, ...rest } = args;

    const updates: Parameters<typeof eventApi.updateEvent>[2] = { ...rest };

    if (place !== undefined) {
      const p = placeApi.findOrCreatePlace(db, place);
      updates.place_id = p.id;
    }

    const event = eventApi.updateEvent(db, id, updates);
    return { content: [{ type: 'text', text: event ? JSON.stringify(event, null, 2) : 'Event not found' }] };
  });
}
