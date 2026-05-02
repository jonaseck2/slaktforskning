import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as placeApi from '../../../api/places';
import * as reportData from '../../../api/report_data';
import { getDbSetting } from '../../../api/db_settings';
import { loadGazetteers } from '../../../api/place-gazetteers';
import { getImportedGazetteers } from '../../../api/gazetteers';
import { getAllGazetteers } from '../../../api/place-gazetteers/bundled';
import { resolvePlace } from '../../../api/place-gazetteers/resolver';
import type { GazetteerConfig } from '../../../api/place-gazetteers/types';
import type { ToolContext } from './types';

export function registerPlaceTools(server: McpServer, ctx: ToolContext): void {
  const { getDb } = ctx;

  server.registerTool('add_place', {
    description: 'Create a new place record',
    inputSchema: {
      name: z.string().describe('Place name'),
      place_type: z.enum(['country', 'province', 'county', 'härad', 'parish', 'farm', 'village', 'city', 'other']).optional().describe('Place type'),
      parent_place_id: z.string().optional().describe('Parent place ID'),
      latitude: z.number().optional().describe('Latitude coordinate'),
      longitude: z.number().optional().describe('Longitude coordinate'),
      date_from: z.string().optional().describe('Date from (ISO format)'),
      date_to: z.string().optional().describe('Date to (ISO format)'),
      notes: z.string().optional().describe('Notes about the place'),
    },
  }, async (args) => {
    const place = placeApi.createPlace(getDb(), args);
    return { content: [{ type: 'text', text: JSON.stringify(place, null, 2) }] };
  });

  server.registerTool('search_places', {
    description: 'Search places by name',
    inputSchema: {
      query: z.string().describe('Search query'),
    },
  }, async (args) => {
    const results = placeApi.searchPlaces(getDb(), args.query);
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  });

  server.registerTool('get_place_history', {
    description: 'Get all events at a place chronologically, with participant names and roles',
    inputSchema: {
      place_id: z.string().describe('Place ID'),
    },
  }, async (args) => {
    const result = reportData.getPlaceHistory(getDb(), args.place_id);
    return { content: [{ type: 'text', text: result ? JSON.stringify(result, null, 2) : 'Place not found' }] };
  });

  server.registerTool('resolve_place', {
    description: 'Resolve a place name to coordinates using the enabled gazetteers. Returns lat/lon, match quality, and the matched path.',
    inputSchema: {
      name: z.string().describe('Place name to resolve (comma-separated components, e.g. "Kärda, Kronobergs län")'),
    },
  }, async (args) => {
    const db = getDb();
    const raw = getDbSetting(db, 'gazetteer_config');
    const config: GazetteerConfig = raw
      ? JSON.parse(raw) as GazetteerConfig
      : { enabledGazetteers: [] };
    const imported = getImportedGazetteers(db);
    const gazetteers = loadGazetteers(config, getAllGazetteers(), imported);
    const result = resolvePlace(args.name, gazetteers);
    if (!result) {
      return { content: [{ type: 'text', text: 'No match found' }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool('list_place_children', {
    description: 'List direct children of a place (pass null for root-level places). Returns rows with a hasChildren flag for each.',
    inputSchema: {
      parent_place_id: z.string().nullable().describe('Parent place ID, or null for root-level places'),
    },
  }, async (args) => {
    const rows = placeApi.listPlaceChildren(getDb(), args.parent_place_id ?? null);
    return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] };
  });

  server.registerTool('get_place_ancestors', {
    description: 'Get the ancestor chain (root → self) for a place.',
    inputSchema: {
      place_id: z.string().describe('Place ID'),
    },
  }, async (args) => {
    const chain = placeApi.getPlaceAncestors(getDb(), args.place_id);
    return { content: [{ type: 'text', text: JSON.stringify(chain, null, 2) }] };
  });

  server.registerTool('update_place', {
    description: 'Update an existing place (name, place_type, parent_place_id, latitude/longitude, date_from/to, notes, street/postal_code/city/country). Use to fix typos, attach to a parent, or correct a misclassified place_type.',
    inputSchema: {
      id: z.string().describe('Place ID'),
      name: z.string().optional(),
      place_type: z.enum(['country', 'province', 'county', 'härad', 'parish', 'farm', 'village', 'city', 'other']).optional(),
      parent_place_id: z.string().optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      date_from: z.string().optional(),
      date_to: z.string().optional(),
      notes: z.string().optional(),
      street: z.string().optional(),
      postal_code: z.string().optional(),
      city: z.string().optional(),
      country: z.string().optional(),
    },
  }, async (args) => {
    const { id, ...data } = args;
    const place = placeApi.updatePlace(getDb(), id, data);
    return { content: [{ type: 'text', text: place ? JSON.stringify(place, null, 2) : 'Place not found' }] };
  });

  server.registerTool('delete_place', {
    description: 'Delete a place. Events at the place have place_id set to NULL (not deleted). Children of this place become orphans (parent_place_id NULL). Use carefully — fixing the place is usually better than deleting it.',
    inputSchema: {
      id: z.string().describe('Place ID'),
    },
  }, async (args) => {
    const ok = placeApi.deletePlace(getDb(), args.id);
    return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Place not found' }] };
  });
}
