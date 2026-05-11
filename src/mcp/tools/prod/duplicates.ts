import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as duplicates from '../../../api/duplicates';
import type { UtilityToolContext } from './types';

/**
 * Registers MCP tools for merging duplicate places, sources, and media.
 *
 * `merge_persons` and `find_duplicates` live in `persons.ts` for historical
 * reasons (persons were the only supported entity before this plan); the
 * generalised `find_duplicates({entity})` shape is registered there.
 *
 * `merge_media` uses the database path to resolve relative `file_ref` values
 * to absolute paths on disk, so it requires the utility context (which
 * exposes `getDbPath()`). The other merges are pure DB operations.
 */
export function registerDuplicateMergeTools(server: McpServer, ctx: UtilityToolContext) {
  const { getDb, getDbPath } = ctx;

  server.registerTool('merge_places', {
    description:
      'Merge source place into target place. Every reference to the source — events.place_id, ' +
      'places.parent_place_id (children), citations.place_id, group_links/task_links/media_links ' +
      'with entity_type=place, plus open ignored-duplicate rows — is repointed at target, then ' +
      'the source row is deleted. Reversible via the global undo stack. Returns counts per moved kind.',
    inputSchema: {
      target_id: z.string().describe('ID of the place to keep'),
      source_id: z.string().describe('ID of the place to merge into target (will be deleted)'),
    },
  }, async (args) => {
    const result = await duplicates.mergePlaces(getDb(), args.target_id, args.source_id);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool('merge_sources', {
    description:
      'Merge source record into target. Every reference to the source — citations.source_id, ' +
      'source_repositories rows, plus open ignored-duplicate rows — is repointed at target, then ' +
      'the source-of-merge row is deleted. Reversible via the global undo stack. Returns counts ' +
      'per moved kind.',
    inputSchema: {
      target_id: z.string().describe('ID of the source to keep'),
      source_id: z.string().describe('ID of the source row to merge into target (will be deleted)'),
    },
  }, async (args) => {
    const result = await duplicates.mergeSources(getDb(), args.target_id, args.source_id);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool('merge_media', {
    description:
      'Merge source media row into target media row. Every reference (media_links, media_regions, ' +
      'open ignored-duplicate rows) is repointed at target, then the source row is deleted. ' +
      "The user must decide which file on disk to keep via `keep_file`: 'target' keeps the " +
      "target's file_ref intact and deletes the source file (if different); 'source' rewrites " +
      "target.file_ref to the source value, deletes the target's prior file (if different), and " +
      'preserves all other authored target fields (title, notes, format, is_printable). The ' +
      'merge is reversible via the global undo stack — the deleted file bytes are snapshotted ' +
      'and restored on undo.',
    inputSchema: {
      target_id: z.string().describe('ID of the media row to keep'),
      source_id: z.string().describe('ID of the media row to merge into target (will be deleted)'),
      keep_file: z.enum(['target', 'source']).describe(
        "Which file on disk to keep. 'target' = leave target's file_ref alone, delete source's file. " +
        "'source' = rewrite target.file_ref to source's value, delete target's prior file. " +
        'Required — never inferred. Same file_ref on both sides → no file is deleted regardless.',
      ),
    },
  }, async (args) => {
    const result = await duplicates.mergeMedia(getDb(), args.target_id, args.source_id, args.keep_file, {
      dbPath: getDbPath(),
    });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });
}
