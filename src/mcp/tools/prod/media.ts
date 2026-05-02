import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as mediaApi from '../../../api/media';
import * as mediaRegions from '../../../api/media_regions';
import * as mediaAi from '../../../api/media_ai';
import type { ToolContext } from './types';

export function registerMediaTools(server: McpServer, ctx: ToolContext): void {
  const { getDb } = ctx;

  server.registerTool('attach_media', {
    description: 'Create a media record and immediately link it to an entity (person, event, relationship, place, or source) in one step',
    inputSchema: {
      title: z.string().describe('Media title or filename'),
      file_ref: z.string().optional().describe('File path or reference'),
      format: z.string().optional().describe('File format (e.g. jpg, pdf, mp4)'),
      notes: z.string().optional().describe('Notes about the media'),
      entity_type: z.enum(['person', 'event', 'relationship', 'place', 'source']).describe('Entity type to link to'),
      entity_id: z.string().describe('Entity ID to link to'),
      link_type: z.string().optional().describe('Link type (e.g. "portrait", "document")'),
    },
  }, async (args) => {
    const db = getDb();
    const { entity_type, entity_id, link_type, ...mediaData } = args;

    db.exec('BEGIN');
    try {
      const item = mediaApi.createMedia(db, mediaData);
      const link = mediaApi.addMediaLink(db, {
        media_id: item.id,
        entity_type,
        entity_id,
        link_type,
      });
      db.exec('COMMIT');
      return { content: [{ type: 'text', text: JSON.stringify({ media: item, link }, null, 2) }] };
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  });

  server.registerTool('tag_person_in_media', {
    description: 'Tag a person in a region of a media item. Coordinates are fractions 0.0-1.0 of image dimensions.',
    inputSchema: {
      media_id: z.string().describe('Media ID'),
      person_id: z.string().optional().describe('Person ID to link to the region'),
      x: z.number().describe('X coordinate (fraction 0.0-1.0)'),
      y: z.number().describe('Y coordinate (fraction 0.0-1.0)'),
      width: z.number().describe('Width (fraction 0.0-1.0)'),
      height: z.number().describe('Height (fraction 0.0-1.0)'),
      label: z.string().optional().describe('Optional label for the region'),
    },
  }, async (args) => {
    const region = mediaRegions.createMediaRegion(getDb(), args);
    return { content: [{ type: 'text', text: JSON.stringify(region, null, 2) }] };
  });

  server.registerTool('update_media', {
    description: 'Update fields on an existing media record. Use this to point file_ref at the actual relocated file (must be a path RELATIVE to the database directory, e.g. "claude-media/photo.jpg"; NEVER a URL or absolute path — those will fail to load in the renderer). To replace the file itself, copy the new file into the <dbname>-media/ folder first, then update file_ref.',
    inputSchema: {
      id: z.string().describe('Media ID'),
      title: z.string().optional(),
      notes: z.string().optional(),
      format: z.string().optional().describe('File format (e.g. jpg, pdf, mp4)'),
      file_ref: z.string().optional().describe('Path RELATIVE to the database directory, like "claude-media/photo.jpg". URLs and absolute paths break the renderer.'),
      is_printable: z.boolean().optional(),
    },
  }, async (args) => {
    const { id, ...data } = args;
    const media = mediaApi.updateMedia(getDb(), id, data);
    return { content: [{ type: 'text', text: media ? JSON.stringify(media, null, 2) : 'Media not found' }] };
  });

  server.registerTool('delete_media', {
    description: 'Delete a media record (and all of its links to entities). Does not remove the underlying file from disk — that must be done separately.',
    inputSchema: {
      id: z.string().describe('Media ID'),
    },
  }, async (args) => {
    const ok = mediaApi.deleteMedia(getDb(), args.id);
    return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Media not found' }] };
  });

  server.registerTool('get_media_for_person_context', {
    description: 'Find media that might contain a specific person, based on event and relationship links',
    inputSchema: {
      person_id: z.string().describe('Person ID'),
    },
  }, async (args) => {
    const list = mediaAi.getMediaForPersonContext(getDb(), args.person_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });
}
