import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createPlace, getPlace, listPlaces, searchPlaces, updatePlace, deletePlace } from '../../api/places';
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
      street: z.string().optional().describe('Street name and number'),
      postal_code: z.string().optional().describe('Postal code'),
      city: z.string().optional().describe('City name'),
      country: z.string().optional().describe('Country name or ISO code'),
    },
  }, async (args) => {
    const place = createPlace(getDb(), args);
    return { content: [{ type: 'text', text: JSON.stringify(place, null, 2) }] };
  });

  server.registerTool('get_place', {
    description: 'Get a place by ID',
    inputSchema: { id: z.string().describe('Place ID') },
  }, async (args) => {
    const place = getPlace(getDb(), args.id);
    return { content: [{ type: 'text', text: place ? JSON.stringify(place, null, 2) : 'Place not found' }] };
  });

  server.registerTool('list_places', { description: 'List all places' }, async () => {
    const list = listPlaces(getDb());
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('search_places', {
    description: 'Search places by name',
    inputSchema: { query: z.string().describe('Search query') },
  }, async (args) => {
    const results = searchPlaces(getDb(), args.query);
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  });

  server.registerTool('update_place', {
    description: 'Update a place',
    inputSchema: {
      id: z.string().describe('Place ID'),
      name: z.string().optional().describe('Place name'),
      place_type: z.enum(['country', 'province', 'county', 'härad', 'parish', 'farm', 'village', 'city', 'other']).optional(),
      parent_place_id: z.string().optional().nullable().describe('Parent place ID'),
      latitude: z.number().optional().nullable().describe('Latitude coordinate'),
      longitude: z.number().optional().nullable().describe('Longitude coordinate'),
      notes: z.string().optional().describe('Notes about the place'),
      street: z.string().optional().describe('Street name and number'),
      postal_code: z.string().optional().describe('Postal code'),
      city: z.string().optional().describe('City name'),
      country: z.string().optional().describe('Country name or ISO code'),
    },
  }, async (args) => {
    const { id, ...data } = args;
    const place = updatePlace(getDb(), id, data);
    return { content: [{ type: 'text', text: place ? JSON.stringify(place, null, 2) : 'Place not found' }] };
  });

  server.registerTool('delete_place', {
    description: 'Delete a place',
    inputSchema: { id: z.string().describe('Place ID') },
  }, async (args) => {
    const ok = deletePlace(getDb(), args.id);
    return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Not found' }] };
  });
}
