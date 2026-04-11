import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as media from '../../api/media';
import * as mediaAi from '../../api/media_ai';
import * as mediaRegions from '../../api/media_regions';
import type { ToolContext } from './types';

export function registerMediaTools(server: McpServer, ctx: ToolContext): void {
  const { getDb } = ctx;

  // Media CRUD tools
  server.registerTool('create_media', {
    description: 'Create a new media record',
    inputSchema: {
      title: z.string().describe('Media title or filename'),
      file_ref: z.string().optional().describe('File path or reference'),
      format: z.string().optional().describe('File format (e.g. jpg, pdf, mp4)'),
      notes: z.string().optional().describe('Notes about the media'),
      is_printable: z.boolean().optional().describe('Whether this media can be printed (default: false)'),
    },
  }, async (args) => {
    const item = media.createMedia(getDb(), args);
    return { content: [{ type: 'text', text: JSON.stringify(item, null, 2) }] };
  });

  server.registerTool('get_media', {
    description: 'Get a media record by ID',
    inputSchema: { id: z.string().describe('Media ID') },
  }, async ({ id }) => {
    const item = media.getMedia(getDb(), id);
    return { content: [{ type: 'text', text: item ? JSON.stringify(item, null, 2) : 'Media not found' }] };
  });

  server.registerTool('list_media', { description: 'List all media records' }, async () => {
    const list = media.listMedia(getDb());
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('delete_media', {
    description: 'Delete a media record',
    inputSchema: { id: z.string().describe('Media ID') },
  }, async ({ id }) => {
    const ok = media.deleteMedia(getDb(), id);
    return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Not found' }] };
  });

  server.registerTool('add_media_link', {
    description: 'Link a media record to an entity (person, event, relationship, place, or source)',
    inputSchema: {
      media_id: z.string().describe('Media ID'),
      entity_type: z.enum(['person', 'event', 'relationship', 'place', 'source']).describe('Entity type'),
      entity_id: z.string().describe('Entity ID'),
      link_type: z.string().optional().describe('Link type (e.g. "portrait", "document")'),
    },
  }, async (args) => {
    const link = media.addMediaLink(getDb(), args);
    return { content: [{ type: 'text', text: JSON.stringify(link, null, 2) }] };
  });

  server.registerTool('get_media_for_entity', {
    description: 'Get all media linked to an entity',
    inputSchema: {
      entity_type: z.enum(['person', 'event', 'relationship', 'place', 'source']).describe('Entity type'),
      entity_id: z.string().describe('Entity ID'),
    },
  }, async ({ entity_type, entity_id }) => {
    const list = media.getMediaForEntity(getDb(), entity_type, entity_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('remove_media_link', {
    description: 'Remove a media link by its link ID',
    inputSchema: { link_id: z.string().describe('Media link ID') },
  }, async ({ link_id }) => {
    const ok = media.removeMediaLink(getDb(), link_id);
    return { content: [{ type: 'text', text: ok ? 'Removed' : 'Not found' }] };
  });

  server.registerTool('reorder_media_links', {
    description: 'Reorder media links by providing the link IDs in the desired order. The first ID gets sort_order 0, second gets 1, etc.',
    inputSchema: {
      link_ids: z.array(z.string()).describe('Media link IDs in desired display order'),
    },
  }, async ({ link_ids }) => {
    media.reorderMediaLinks(getDb(), link_ids);
    return { content: [{ type: 'text', text: `Reordered ${link_ids.length} media links` }] };
  });

  // Media AI tools
  server.registerTool('get_media_file_base64', {
    description: 'Get a media file as base64 for vision processing. Optionally downscale large images.',
    inputSchema: {
      media_id: z.string().describe('Media ID'),
      max_dimension: z.number().optional().describe('Maximum width/height in pixels (resizing not yet implemented, reserved for future use)'),
    },
  }, async ({ media_id, max_dimension }) => {
    const result = mediaAi.getMediaFileBase64(getDb(), media_id, max_dimension);
    if (!result) return { content: [{ type: 'text', text: 'Media not found or file missing' }] };
    return { content: [{ type: 'text', text: JSON.stringify({
      fileName: result.fileName,
      mimeType: result.mimeType,
      width: result.width,
      height: result.height,
      base64Length: result.base64.length,
      base64: result.base64,
    }, null, 2) }] };
  });

  server.registerTool('get_untagged_media', {
    description: 'List media items with no person links, ordered by connection count. Use for batch photo tagging workflows.',
    inputSchema: {
      limit: z.number().optional().describe('Maximum number of results (default: 20)'),
    },
  }, async ({ limit }) => {
    const list = mediaAi.getUntaggedMedia(getDb(), limit);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('get_media_for_person_context', {
    description: 'Find media that might contain a specific person based on event and relationship links.',
    inputSchema: {
      person_id: z.string().describe('Person ID'),
    },
  }, async ({ person_id }) => {
    const list = mediaAi.getMediaForPersonContext(getDb(), person_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  // Media region tools
  server.registerTool('create_media_region', {
    description: 'Create a face/region tag on a media item. Coordinates are fractions 0.0-1.0 of image dimensions.',
    inputSchema: {
      media_id: z.string().describe('Media ID'),
      person_id: z.string().optional().describe('Person ID to link the region to'),
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

  server.registerTool('get_media_regions', {
    description: 'Get all face/region tags for a media item.',
    inputSchema: {
      media_id: z.string().describe('Media ID'),
    },
  }, async ({ media_id }) => {
    const list = mediaRegions.getMediaRegions(getDb(), media_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('get_regions_for_person', {
    description: 'Get all face/region tags linked to a specific person.',
    inputSchema: {
      person_id: z.string().describe('Person ID'),
    },
  }, async ({ person_id }) => {
    const list = mediaRegions.getRegionsForPerson(getDb(), person_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('update_media_region', {
    description: 'Update a face/region tag (person assignment, label, or coordinates).',
    inputSchema: {
      id: z.string().describe('Region ID'),
      person_id: z.string().nullable().optional().describe('Person ID to link (null to unlink)'),
      label: z.string().nullable().optional().describe('Label text'),
      x: z.number().optional().describe('X coordinate (fraction 0.0-1.0)'),
      y: z.number().optional().describe('Y coordinate (fraction 0.0-1.0)'),
      width: z.number().optional().describe('Width (fraction 0.0-1.0)'),
      height: z.number().optional().describe('Height (fraction 0.0-1.0)'),
    },
  }, async ({ id, ...data }) => {
    const region = mediaRegions.updateMediaRegion(getDb(), id, data);
    return { content: [{ type: 'text', text: region ? JSON.stringify(region, null, 2) : 'Region not found' }] };
  });

  server.registerTool('delete_media_region', {
    description: 'Delete a face/region tag.',
    inputSchema: {
      id: z.string().describe('Region ID'),
    },
  }, async ({ id }) => {
    const ok = mediaRegions.deleteMediaRegion(getDb(), id);
    return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Region not found' }] };
  });

  // Media AI batch tagging tools
  server.registerTool('suggest_media_regions', {
    description: 'Create multiple face/region tags on a media item at once. Used by AI agents after vision processing to submit detected faces. Coordinates are fractions 0.0-1.0 of image dimensions.',
    inputSchema: {
      media_id: z.string().describe('Media ID'),
      regions: z.array(z.object({
        x: z.number().describe('X coordinate (fraction 0.0-1.0)'),
        y: z.number().describe('Y coordinate (fraction 0.0-1.0)'),
        width: z.number().describe('Width (fraction 0.0-1.0)'),
        height: z.number().describe('Height (fraction 0.0-1.0)'),
        person_id: z.string().optional().describe('Person ID if identified'),
        label: z.string().optional().describe('Optional label'),
      })).describe('Array of region definitions to create'),
    },
  }, async ({ media_id, regions }) => {
    const created = regions.map(r => mediaRegions.createMediaRegion(getDb(), { media_id, ...r }));
    return { content: [{ type: 'text', text: JSON.stringify({ created: created.length, region_ids: created.map(r => r.id) }, null, 2) }] };
  });

  server.registerTool('get_persons_for_matching', {
    description: 'Get persons who have existing face region tags, with their region coordinates and media IDs. Use for face comparison - match new faces against known ones.',
    inputSchema: {
      limit: z.number().optional().describe('Maximum number of persons to return (default: 50)'),
    },
  }, async ({ limit }) => {
    const list = mediaAi.getPersonsForMatching(getDb(), limit);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('get_media_tagging_status', {
    description: 'Get an overview of media tagging progress: total media count, tagged count (has at least one region), untagged count, total region count.',
  }, async () => {
    const status = mediaAi.getMediaTaggingStatus(getDb());
    return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] };
  });
}
