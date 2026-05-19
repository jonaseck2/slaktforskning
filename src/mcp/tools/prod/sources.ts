import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as sourceApi from '../../../api/sources';
import type { ToolContext } from './types';
import { findOrCreateSource } from './persons';

export function registerSourceTools(server: McpServer, ctx: ToolContext): void {
  const { getDb } = ctx;

  server.registerTool('add_source', {
    description: 'Add a source record (book, document, website, etc.). To attach a repository (archive / library / collection), create it via add_repository and link with link_source_repository — the free-text repository field on this tool was removed in favour of structured Repository records.',
    inputSchema: {
      title: z.string().optional().describe('Source title'),
      author: z.string().optional().describe('Author name(s)'),
      publication_info: z.string().optional().describe('Publication info (place, year, publisher)'),
      url: z.string().optional().describe('URL'),
      source_type: z.string().optional().describe('Type: vital_record, census, church_record, newspaper, photograph, oral_history, etc.'),
      call_number: z.string().optional().describe('Call number or reference'),
      abstract: z.string().optional().describe('Abstract or description'),
    },
  }, async (args) => {
    const source = await sourceApi.createSource(getDb(), args);
    return { content: [{ type: 'text', text: JSON.stringify(source, null, 2) }] };
  });

  server.registerTool('search_sources', {
    description: 'Search sources by title, author, or publication info',
    inputSchema: {
      query: z.string().describe('Search query'),
    },
  }, async (args) => {
    const results = await sourceApi.searchSources(getDb(), args.query);
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  });

  server.registerTool('cite', {
    description: 'Attach a citation to an event, person, relationship, or place. Accepts source_id or source_title (finds or creates the source).',
    inputSchema: {
      event_id: z.string().optional().describe('Event ID to cite'),
      person_id: z.string().optional().describe('Person ID to cite'),
      relationship_id: z.string().optional().describe('Relationship ID to cite'),
      place_id: z.string().optional().describe('Place ID to cite'),
      source_id: z.string().optional().describe('Source ID (use instead of source_title if you already have the ID)'),
      source_title: z.string().optional().describe('Source title — finds or creates the source by exact title match'),
      page: z.string().optional().describe('Page or reference within the source'),
      confidence: z.number().min(0).max(3).optional().describe('Source confidence: 0=Unreliable, 1=Questionable, 2=Secondary, 3=Primary'),
      transcription: z.string().optional().describe('Verbatim text from the source'),
      notes: z.string().optional().describe('Notes about this citation'),
    },
  }, async (args) => {
    const db = getDb();
    const { source_id, source_title, ...citationData } = args;

    let resolvedSourceId: string;
    if (source_id) {
      resolvedSourceId = source_id;
    } else if (source_title) {
      const source = await findOrCreateSource(db, source_title);
      resolvedSourceId = source.id;
    } else {
      return { content: [{ type: 'text', text: 'Error: provide either source_id or source_title' }] };
    }

    const citation = await sourceApi.createCitation(db, {
      source_id: resolvedSourceId,
      ...citationData,
    });
    return { content: [{ type: 'text', text: JSON.stringify(citation, null, 2) }] };
  });

  server.registerTool('get_citations_for_person', {
    description: 'Get all citations attached to a person',
    inputSchema: {
      person_id: z.string().describe('Person ID'),
    },
  }, async (args) => {
    const list = await sourceApi.getCitationsForPerson(getDb(), args.person_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('update_source', {
    description: 'Update fields on an existing source (title, author, publication_info, url, source_type, call_number, abstract). Use to fix typos, add missing fields, or change the source_type. Repository links are managed via link_source_repository / unlink_source_repository.',
    inputSchema: {
      id: z.string().describe('Source ID'),
      title: z.string().optional(),
      author: z.string().optional(),
      publication_info: z.string().optional(),
      url: z.string().optional(),
      source_type: z.string().optional().describe('e.g. vital_record, census, church_record, newspaper, photograph, oral_history, website, video'),
      call_number: z.string().optional(),
      abstract: z.string().optional(),
    },
  }, async (args) => {
    const { id, ...data } = args;
    const src = await sourceApi.updateSource(getDb(), id, data);
    return { content: [{ type: 'text', text: src ? JSON.stringify(src, null, 2) : 'Source not found' }] };
  });

  server.registerTool('delete_source', {
    description: 'Delete a source. All citations referencing the source are deleted via CASCADE. Use only when no citation should survive — to keep citations but remove the source title, edit the source instead.',
    inputSchema: {
      id: z.string().describe('Source ID'),
    },
  }, async (args) => {
    const ok = await sourceApi.deleteSource(getDb(), args.id);
    return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Source not found' }] };
  });

  server.registerTool('update_citation', {
    description: 'Update an existing citation (page, confidence, transcription, notes, date_accessed). Use to add a quote you found later, bump confidence after corroborating with a second source, or fix a wrong page reference.',
    inputSchema: {
      id: z.string().describe('Citation ID'),
      page: z.string().optional(),
      confidence: z.number().min(0).max(3).optional().describe('0=Unreliable, 1=Questionable, 2=Secondary, 3=Primary'),
      transcription: z.string().optional(),
      notes: z.string().optional(),
      date_accessed: z.string().optional(),
    },
  }, async (args) => {
    const { id, ...data } = args;
    const cit = await sourceApi.updateCitation(getDb(), id, data);
    return { content: [{ type: 'text', text: cit ? JSON.stringify(cit, null, 2) : 'Citation not found' }] };
  });

  server.registerTool('delete_citation', {
    description: 'Delete a citation (does not delete the source). Use to detach a citation from a wrong event/person without removing the underlying source record.',
    inputSchema: {
      id: z.string().describe('Citation ID'),
    },
  }, async (args) => {
    const ok = await sourceApi.deleteCitation(getDb(), args.id);
    return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Citation not found' }] };
  });
}
