import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as relationships from '../../api/relationships';
import type { ToolContext } from './types';

export function registerRelationshipTools(server: McpServer, ctx: ToolContext): void {
  const { getDb } = ctx;

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
    const rel = relationships.createRelationship(getDb(), args);
    return { content: [{ type: 'text', text: JSON.stringify(rel, null, 2) }] };
  });

  server.registerTool('get_relationship', {
    description: 'Get a relationship by ID',
    inputSchema: { id: z.string().describe('Relationship ID') },
  }, async (args) => {
    const rel = relationships.getRelationship(getDb(), args.id);
    return { content: [{ type: 'text', text: rel ? JSON.stringify(rel, null, 2) : 'Relationship not found' }] };
  });

  server.registerTool('list_relationships', { description: 'List all relationships' }, async () => {
    const list = relationships.listRelationships(getDb());
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
    const rel = relationships.updateRelationship(getDb(), id, data);
    return { content: [{ type: 'text', text: rel ? JSON.stringify(rel, null, 2) : 'Relationship not found' }] };
  });

  server.registerTool('delete_relationship', {
    description: 'Delete a relationship',
    inputSchema: { id: z.string().describe('Relationship ID') },
  }, async (args) => {
    const ok = relationships.deleteRelationship(getDb(), args.id);
    return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Not found' }] };
  });

  server.registerTool('get_relationships_of_person', {
    description: 'Get all relationships for a person',
    inputSchema: { person_id: z.string().describe('Person ID') },
  }, async (args) => {
    const list = relationships.getRelationshipsOfPerson(getDb(), args.person_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('search_relationships', {
    description: 'Search relationships by person name',
    inputSchema: { query: z.string().describe('Search query') },
  }, async (args) => {
    const results = relationships.searchRelationships(getDb(), args.query);
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
    const participant = relationships.addEventParticipant(getDb(), args);
    return { content: [{ type: 'text', text: JSON.stringify(participant, null, 2) }] };
  });

  server.registerTool('get_event_participants', {
    description: 'Get all participants for an event',
    inputSchema: { event_id: z.string().describe('Event ID') },
  }, async (args) => {
    const list = relationships.getEventParticipants(getDb(), args.event_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('remove_event_participant', {
    description: 'Remove a participant from an event',
    inputSchema: { id: z.string().describe('Event participant ID') },
  }, async (args) => {
    const ok = relationships.removeEventParticipant(getDb(), args.id);
    return { content: [{ type: 'text', text: ok ? 'Removed' : 'Not found' }] };
  });
}
