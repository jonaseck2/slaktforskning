import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as repoApi from '../../../api/repositories';
import type { ToolContext } from './types';

export function registerRepositoryTools(server: McpServer, ctx: ToolContext): void {
  const { getDb } = ctx;

  server.registerTool('add_repository', {
    description: 'Create an archive / library / collection record (e.g. "Stockholms stadsarkiv", "FamilySearch"). Repositories hold sources — link them after creating sources via link_source_repository.',
    inputSchema: {
      name: z.string(),
      address: z.string().optional(),
      city: z.string().optional(),
      postal_code: z.string().optional(),
      state: z.string().optional(),
      country: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      web: z.string().optional(),
      call_number: z.string().optional(),
      notes: z.string().optional(),
    },
  }, async (args) => {
    const repo = await repoApi.createRepository(getDb(), args);
    return { content: [{ type: 'text', text: JSON.stringify(repo, null, 2) }] };
  });

  server.registerTool('list_repositories', {
    description: 'List all repositories.',
    inputSchema: {},
  }, async () => {
    const list = await repoApi.listRepositories(getDb());
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('get_repository', {
    description: 'Get one repository by id.',
    inputSchema: {
      id: z.string().describe('Repository ID'),
    },
  }, async (args) => {
    const repo = await repoApi.getRepository(getDb(), args.id);
    return { content: [{ type: 'text', text: repo ? JSON.stringify(repo, null, 2) : 'Repository not found' }] };
  });

  server.registerTool('update_repository', {
    description: 'Update a repository (any subset of name/address/city/postal_code/state/country/phone/email/web/call_number/notes).',
    inputSchema: {
      id: z.string().describe('Repository ID'),
      name: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      postal_code: z.string().optional(),
      state: z.string().optional(),
      country: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      web: z.string().optional(),
      call_number: z.string().optional(),
      notes: z.string().optional(),
    },
  }, async (args) => {
    const { id, ...data } = args;
    const repo = await repoApi.updateRepository(getDb(), id, data);
    return { content: [{ type: 'text', text: repo ? JSON.stringify(repo, null, 2) : 'Repository not found' }] };
  });

  server.registerTool('delete_repository', {
    description: 'Delete a repository. CASCADE removes source_repositories link rows; sources themselves remain.',
    inputSchema: {
      id: z.string().describe('Repository ID'),
    },
  }, async (args) => {
    const ok = await repoApi.deleteRepository(getDb(), args.id);
    return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Repository not found' }] };
  });

  server.registerTool('link_source_repository', {
    description: 'Attach a source to a repository (i.e. say "this source is held at this archive"). Idempotent — re-linking the same pair is a no-op.',
    inputSchema: {
      source_id: z.string().describe('Source ID'),
      repository_id: z.string().describe('Repository ID'),
    },
  }, async (args) => {
    await repoApi.linkSourceRepository(getDb(), args.source_id, args.repository_id);
    return { content: [{ type: 'text', text: 'Linked' }] };
  });

  server.registerTool('unlink_source_repository', {
    description: 'Remove the link between a source and a repository.',
    inputSchema: {
      source_id: z.string().describe('Source ID'),
      repository_id: z.string().describe('Repository ID'),
    },
  }, async (args) => {
    const ok = await repoApi.unlinkSourceRepository(getDb(), args.source_id, args.repository_id);
    return { content: [{ type: 'text', text: ok ? 'Unlinked' : 'Link not found' }] };
  });

  server.registerTool('get_repositories_for_source', {
    description: 'List all repositories that hold a given source.',
    inputSchema: {
      source_id: z.string().describe('Source ID'),
    },
  }, async (args) => {
    const list = await repoApi.getRepositoriesForSource(getDb(), args.source_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });
}
