import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as events from '../../api/events';
import type { ToolContext } from './types';

export function registerEventTools(server: McpServer, ctx: ToolContext): void {
  const { getDb } = ctx;

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
    const event = events.createEvent(getDb(), args);
    return { content: [{ type: 'text', text: JSON.stringify(event, null, 2) }] };
  });

  server.registerTool('get_event', {
    description: 'Get a single event by ID',
    inputSchema: { id: z.string().describe('Event ID') },
  }, async (args) => {
    const event = events.getEvent(getDb(), args.id);
    return { content: [{ type: 'text', text: event ? JSON.stringify(event, null, 2) : 'Event not found' }] };
  });

  server.registerTool('get_events_for_person', {
    description: 'Get all events for a person (via event_participants)',
    inputSchema: { person_id: z.string().describe('Person ID') },
  }, async (args) => {
    const list = events.getEventsForPerson(getDb(), args.person_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('get_events_for_relationship', {
    description: 'Get all events for a relationship',
    inputSchema: { relationship_id: z.string().describe('Relationship ID') },
  }, async (args) => {
    const list = events.getEventsForRelationship(getDb(), args.relationship_id);
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
    const event = events.updateEvent(getDb(), id, data);
    return { content: [{ type: 'text', text: event ? JSON.stringify(event, null, 2) : 'Event not found' }] };
  });

  server.registerTool('delete_event', {
    description: 'Delete an event',
    inputSchema: { id: z.string().describe('Event ID') },
  }, async (args) => {
    const ok = events.deleteEvent(getDb(), args.id);
    return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Not found' }] };
  });
}
