import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as sources from '../../api/sources';
import type { ToolContext } from './types';

export function registerSourceTools(server: McpServer, ctx: ToolContext): void {
  const { getDb } = ctx;

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
    const source = sources.createSource(getDb(), args);
    return { content: [{ type: 'text', text: JSON.stringify(source, null, 2) }] };
  });

  server.registerTool('get_source', {
    description: 'Get a source by ID',
    inputSchema: { id: z.string().describe('Source ID') },
  }, async (args) => {
    const source = sources.getSource(getDb(), args.id);
    return { content: [{ type: 'text', text: source ? JSON.stringify(source, null, 2) : 'Source not found' }] };
  });

  server.registerTool('list_sources', { description: 'List all sources' }, async () => {
    const list = sources.listSources(getDb());
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
    const source = sources.updateSource(getDb(), id, data);
    return { content: [{ type: 'text', text: source ? JSON.stringify(source, null, 2) : 'Source not found' }] };
  });

  server.registerTool('delete_source', {
    description: 'Delete a source',
    inputSchema: { id: z.string().describe('Source ID') },
  }, async (args) => {
    const ok = sources.deleteSource(getDb(), args.id);
    return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Not found' }] };
  });

  server.registerTool('search_sources', {
    description: 'Search sources by title, author, or publication info',
    inputSchema: { query: z.string().describe('Search query') },
  }, async (args) => {
    const results = sources.searchSources(getDb(), args.query);
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
    const citation = sources.createCitation(getDb(), args);
    return { content: [{ type: 'text', text: JSON.stringify(citation, null, 2) }] };
  });

  server.registerTool('get_citation', {
    description: 'Get a citation by ID',
    inputSchema: { id: z.string().describe('Citation ID') },
  }, async (args) => {
    const citation = sources.getCitation(getDb(), args.id);
    return { content: [{ type: 'text', text: citation ? JSON.stringify(citation, null, 2) : 'Citation not found' }] };
  });

  server.registerTool('get_citations_for_source', {
    description: 'Get all citations for a source',
    inputSchema: { source_id: z.string().describe('Source ID') },
  }, async (args) => {
    const list = sources.getCitationsForSource(getDb(), args.source_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('get_citations_for_event', {
    description: 'Get all citations for an event',
    inputSchema: { event_id: z.string().describe('Event ID') },
  }, async (args) => {
    const list = sources.getCitationsForEvent(getDb(), args.event_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('get_citations_for_person', {
    description: 'Get all citations attached to a person',
    inputSchema: { person_id: z.string().describe('Person ID') },
  }, async (args) => {
    const list = sources.getCitationsForPerson(getDb(), args.person_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('get_citations_for_relationship', {
    description: 'Get all citations attached to a relationship',
    inputSchema: { relationship_id: z.string().describe('Relationship ID') },
  }, async (args) => {
    const list = sources.getCitationsForRelationship(getDb(), args.relationship_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('get_citations_for_place', {
    description: 'Get all citations attached to a place',
    inputSchema: { place_id: z.string().describe('Place ID') },
  }, async (args) => {
    const list = sources.getCitationsForPlace(getDb(), args.place_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('delete_citation', {
    description: 'Delete a citation',
    inputSchema: { id: z.string().describe('Citation ID') },
  }, async (args) => {
    const ok = sources.deleteCitation(getDb(), args.id);
    return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Not found' }] };
  });
}
