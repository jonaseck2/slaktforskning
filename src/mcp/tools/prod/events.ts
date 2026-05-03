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
  date_value_end?: string;
  date_type?: string;
  date_original?: string;
  place?: string;
  place_chain?: string[];
  source_title?: string;
  source_page?: string;
  confidence?: number;
  value?: string;
  notes?: string;
  /** @deprecated use `notes` */
  description?: string;
  cause?: string;
}

export interface RecordEventResult {
  event: GenealogyEvent;
  citation: Citation | null;
}

export function recordEventWorkflow(db: Database, args: RecordEventArgs): RecordEventResult {
  if (args.place && args.place_chain && args.place_chain.length > 0) {
    throw new Error(
      'Pass either `place` (single component) or `place_chain` (root → leaf, including the leaf), not both.',
    );
  }
  db.exec('BEGIN');
  try {
    let place_id: string | null = null;
    if (args.place_chain && args.place_chain.length > 0) {
      for (const link of args.place_chain) placeApi.assertLeafPlaceName(link);
      const leaf = args.place_chain[args.place_chain.length - 1];
      const ancestors = args.place_chain.slice(0, -1);
      const place = placeApi.findOrCreatePlaceWithChain(
        db,
        leaf,
        ancestors.map((n) => ({ name: n })),
      );
      place_id = place.id;
    } else if (args.place) {
      placeApi.assertLeafPlaceName(args.place);
      const place = placeApi.findOrCreatePlace(db, args.place);
      place_id = place.id;
    }

    // Backwards-compat: callers passing `description` (old field name) get
    // routed to `notes`. Explicit `notes` always wins.
    const notesValue = args.notes ?? args.description;

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
      date_value_end: args.date_type ? args.date_value_end ?? null : null,
      place_id,
      value: args.value,
      notes: notesValue,
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
    description: 'Record a life event for one or more persons, optionally with place and source citation in one step. Place input: pass `place` for a single leaf component (e.g. "Chennai"), or `place_chain` for an explicit root → leaf hierarchy (e.g. ["World", "India", "Chennai"]) — never both, and never a comma-string in `place`. For fact-shaped events (occupation, residence, religion, education, title, description), put the fact value (e.g. "Carpenter") in the `value` field — maps to GEDCOM-X Fact.value. The legacy `description` parameter is deprecated; use `notes` for free-form prose.',
    inputSchema: {
      event_type: z.string().describe('Event type (e.g. birth, death, marriage, census, baptism)'),
      person_id: z.string().optional().describe('Primary participant person ID (use this for a single person)'),
      person_ids: z.array(z.object({
        id: z.string().describe('Person ID'),
        role: z.string().optional().describe('Role: primary, spouse, parent, child, witness, godparent, officiant, other'),
      })).optional().describe('Multiple participants with roles (use instead of person_id when multiple persons are involved)'),
      relationship_id: z.string().optional().describe('Relationship ID to attach event to'),
      date_value: z.string().optional().describe('Date value (ISO format for exact, otherwise free text). For range types (between/from-to) this is the start.'),
      date_value_end: z.string().optional().describe('End-of-range date value. Required to express a range with date_type "between" (e.g. military service 1999–2000). Ignored when date_type is omitted.'),
      date_type: z.string().optional().describe('Date type: exact, about, before, after, between, calculated, unknown'),
      date_original: z.string().optional().describe('Original date text as it appears in the source'),
      place: z.string().optional().describe('Place name as a single component (no commas). Creates or reuses a place row. For hierarchy use `place_chain` instead. Mutually exclusive with `place_chain`.'),
      place_chain: z.array(z.string()).optional().describe('Explicit place hierarchy, root → leaf, INCLUDING the leaf as the last element (e.g. ["World", "India", "Chennai"]). Missing rows are created; existing ones are reused. Mutually exclusive with `place`.'),
      source_title: z.string().optional().describe('Source document title; reuses existing source if title matches'),
      source_page: z.string().optional().describe('Page or reference within the source'),
      confidence: z.number().min(0).max(3).optional().describe('Source confidence: 0=Unreliable, 1=Questionable, 2=Secondary, 3=Primary'),
      value: z.string().optional().describe('Fact value (e.g. occupation name "Carpenter", residence "Stockholm", religion "Lutheran"). Maps to GEDCOM 5.5.1 line value / GEDCOM-X Fact.value.'),
      notes: z.string().optional().describe('Free-form notes about the event'),
      description: z.string().optional().describe('DEPRECATED — use `notes`. Treated as notes if provided.'),
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
    description: 'Update fields on an existing event. Place string is resolved to a place_id via findOrCreate. The legacy `description` parameter is deprecated; use `notes` for free-form prose and `value` for the GEDCOM-X Fact.value field.',
    inputSchema: {
      id: z.string().describe('Event ID'),
      event_type: z.string().optional().describe('Event type'),
      date_value: z.string().optional().describe('Date value (start of range for "between" types)'),
      date_value_end: z.string().optional().describe('End-of-range date value (paired with date_type "between")'),
      date_type: z.string().optional().describe('Date type: exact, about, before, after, between, calculated, unknown'),
      date_original: z.string().optional().describe('Original date text as it appears in the source'),
      place: z.string().optional().describe('Place name — resolved to place_id via findOrCreate'),
      value: z.string().optional().describe('Fact value (e.g. occupation name "Carpenter", residence "Stockholm"). Maps to GEDCOM 5.5.1 line value / GEDCOM-X Fact.value.'),
      notes: z.string().optional().describe('Free-form notes about the event'),
      description: z.string().optional().describe('DEPRECATED — use `notes`. Treated as notes if provided.'),
      cause: z.string().optional().describe('Cause (e.g. cause of death)'),
    },
  }, async (args) => {
    const db = getDb();
    const { id, place, description, ...rest } = args;

    const updates: Parameters<typeof eventApi.updateEvent>[2] = { ...rest };

    // Backwards-compat: route deprecated `description` to `notes` when notes
    // wasn't passed explicitly.
    if (description !== undefined && updates.notes === undefined) {
      updates.notes = description;
    }

    if (place !== undefined) {
      const p = placeApi.findOrCreatePlace(db, place);
      updates.place_id = p.id;
    }

    const event = eventApi.updateEvent(db, id, updates);
    return { content: [{ type: 'text', text: event ? JSON.stringify(event, null, 2) : 'Event not found' }] };
  });

  server.registerTool('delete_event', {
    description: 'Delete an event and all of its participant links. Use to remove an event recorded by mistake, or to clear a misattributed birth/death after a merge.',
    inputSchema: {
      id: z.string().describe('Event ID'),
    },
  }, async (args) => {
    const ok = eventApi.deleteEvent(getDb(), args.id);
    return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Event not found' }] };
  });
}
