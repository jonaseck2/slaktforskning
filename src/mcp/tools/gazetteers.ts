import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  importGazetteer,
  exportGazetteer,
  deleteGazetteer,
  listGazetteers,
  getGazetteerSchema,
  getImportedGazetteers,
} from '../../api/gazetteers';
import { getDbSetting } from '../../api/db_settings';
import { loadGazetteers } from '../../api/place-gazetteers/index';
import { resolvePlace, searchGazetteer } from '../../api/place-gazetteers/resolver';
import type { GazetteerConfig } from '../../api/place-gazetteers/types';
import type { ToolContext } from './types';

function getEnabledGazetteers(ctx: ToolContext) {
  const db = ctx.getDb();
  const raw = getDbSetting(db, 'gazetteer_config');
  const config: GazetteerConfig = raw
    ? JSON.parse(raw) as GazetteerConfig
    : { enabledGazetteers: [] };
  const imported = getImportedGazetteers(db);
  return loadGazetteers(config, imported);
}

export function registerGazetteerTools(server: McpServer, ctx: ToolContext): void {
  const { getDb } = ctx;

  server.registerTool('get_gazetteer_schema', {
    description:
      'Return the JSON schema for the Gazetteer format. Use this as a spec sheet when creating a custom gazetteer. ' +
      'Call export_gazetteer on a bundled gazetteer ID (from list_gazetteers) to see a concrete example of the format.',
  }, async () => {
    const schema = getGazetteerSchema();
    return { content: [{ type: 'text', text: JSON.stringify(schema, null, 2) }] };
  });

  server.registerTool('list_gazetteers', {
    description: 'List all gazetteers (both bundled and imported). Shows ID, name, locale, and whether it is bundled.',
  }, async () => {
    const list = listGazetteers(getDb());
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('import_gazetteer', {
    description: 'Import a custom gazetteer from a JSON string. The JSON must conform to the Gazetteer schema (use get_gazetteer_schema). Overwrites any existing imported gazetteer with the same ID.',
    inputSchema: {
      json: z.string().describe('Gazetteer JSON string conforming to the Gazetteer schema'),
    },
  }, async (args) => {
    const result = importGazetteer(getDb(), args.json);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool('export_gazetteer', {
    description: 'Export a gazetteer (bundled or imported) as a JSON string. Useful for inspecting the bundled format before creating a custom one.',
    inputSchema: {
      id: z.string().describe('Gazetteer ID (from list_gazetteers)'),
    },
  }, async (args) => {
    const json = exportGazetteer(getDb(), args.id);
    if (!json) {
      return { content: [{ type: 'text', text: 'Gazetteer not found' }] };
    }
    return { content: [{ type: 'text', text: json }] };
  });

  server.registerTool('delete_gazetteer', {
    description: 'Delete an imported gazetteer. Bundled gazetteers cannot be deleted.',
    inputSchema: {
      id: z.string().describe('Gazetteer ID to delete'),
    },
  }, async (args) => {
    const deleted = deleteGazetteer(getDb(), args.id);
    if (!deleted) {
      return { content: [{ type: 'text', text: 'Not found or is a bundled gazetteer' }] };
    }
    return { content: [{ type: 'text', text: 'Deleted' }] };
  });

  server.registerTool('resolve_place', {
    description: 'Resolve a place name string to coordinates using the enabled gazetteers. Returns lat/lon, match quality, and the matched path.',
    inputSchema: {
      name: z.string().describe('Place name to resolve (comma-separated components, e.g. "Kärda, Kronobergs län")'),
    },
  }, async (args) => {
    const gazetteers = getEnabledGazetteers(ctx);
    const result = resolvePlace(args.name, gazetteers);
    if (!result) {
      return { content: [{ type: 'text', text: 'No match found' }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool('search_gazetteer', {
    description: 'Search for place names across all enabled gazetteers. Returns matching nodes with their coordinates and path.',
    inputSchema: {
      query: z.string().describe('Place name to search for'),
      limit: z.number().optional().default(10).describe('Maximum number of results (default 10)'),
    },
  }, async (args) => {
    const gazetteers = getEnabledGazetteers(ctx);
    const hits = searchGazetteer(args.query, gazetteers, args.limit);
    const simplified = hits.map(hit => ({
      name: hit.node.name,
      type: hit.node.type,
      lat: hit.node.lat,
      lon: hit.node.lon,
      path: hit.path.map(n => n.name),
      gazetteer: hit.gazetteer,
    }));
    return { content: [{ type: 'text', text: JSON.stringify(simplified, null, 2) }] };
  });
}
