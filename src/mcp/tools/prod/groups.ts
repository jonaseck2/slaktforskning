import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as groupApi from '../../../api/groups';
import type { ToolContext } from './types';

export function registerGroupTools(server: McpServer, ctx: ToolContext): void {
  const { getDb } = ctx;

  server.registerTool('add_group', {
    description: 'Create a custom group / collection (e.g. "Soldiers in the Eckerström line", "Photos pending review"). Groups can hold persons, places, and media.',
    inputSchema: {
      name: z.string().describe('Group name'),
      notes: z.string().optional(),
    },
  }, async (args) => {
    const group = await groupApi.createGroup(getDb(), args);
    return { content: [{ type: 'text', text: JSON.stringify(group, null, 2) }] };
  });

  server.registerTool('list_groups', {
    description: 'List all groups with their names.',
    inputSchema: {},
  }, async () => {
    const list = await groupApi.listGroups(getDb());
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('get_group', {
    description: 'Get a single group with its links (persons, places, media).',
    inputSchema: {
      id: z.string().describe('Group ID'),
    },
  }, async (args) => {
    const db = getDb();
    const group = await groupApi.getGroup(db, args.id);
    if (!group) return { content: [{ type: 'text', text: 'Group not found' }] };
    const links = await groupApi.getGroupLinks(db, args.id);
    return { content: [{ type: 'text', text: JSON.stringify({ ...group, links }, null, 2) }] };
  });

  server.registerTool('update_group', {
    description: 'Update a group (name, notes).',
    inputSchema: {
      id: z.string().describe('Group ID'),
      name: z.string().optional(),
      notes: z.string().optional(),
    },
  }, async (args) => {
    const { id, ...data } = args;
    const group = await groupApi.updateGroup(getDb(), id, data);
    return { content: [{ type: 'text', text: group ? JSON.stringify(group, null, 2) : 'Group not found' }] };
  });

  server.registerTool('delete_group', {
    description: 'Delete a group and all of its membership links. Members themselves are not deleted.',
    inputSchema: {
      id: z.string().describe('Group ID'),
    },
  }, async (args) => {
    const ok = await groupApi.deleteGroup(getDb(), args.id);
    return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Group not found' }] };
  });

  server.registerTool('add_group_link', {
    description: 'Add a person, place, or media to a group.',
    inputSchema: {
      group_id: z.string().describe('Group ID'),
      entity_type: z.enum(['person', 'place', 'media']),
      entity_id: z.string().describe('Entity ID'),
    },
  }, async (args) => {
    const link = await groupApi.addGroupLink(getDb(), args.group_id, args.entity_type, args.entity_id);
    return { content: [{ type: 'text', text: JSON.stringify(link, null, 2) }] };
  });

  server.registerTool('remove_group_link', {
    description: 'Remove a person/place/media from a group by the link id (NOT the entity id).',
    inputSchema: {
      link_id: z.string().describe('group_link ID'),
    },
  }, async (args) => {
    const ok = await groupApi.removeGroupLink(getDb(), args.link_id);
    return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Link not found' }] };
  });
}
