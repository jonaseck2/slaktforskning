import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Database } from 'node-sqlite3-wasm';
import { initializeSchema } from '../../api/schema';
import * as groups from '../../api/groups';
import * as repositories from '../../api/repositories';
import * as researchTasks from '../../api/research_tasks';
import { runAllChecks, runChecksForPerson } from '../../api/checks';
import * as duplicates from '../../api/duplicates';
import * as reportData from '../../api/report_data';
import type { ToolContext } from './types';

/**
 * Extended context for utility tools — includes mutable db/path setters
 * needed by `switch_database`.
 */
export interface UtilityToolContext extends ToolContext {
  getDbPath: () => string;
  setDb: (newDb: Database) => void;
  setDbPath: (newPath: string) => void;
}

export function registerUtilityTools(server: McpServer, ctx: UtilityToolContext): void {
  const { getDb, getDbPath, setDb, setDbPath } = ctx;

  // Group tools
  server.registerTool('create_group', {
    description: 'Create a new group',
    inputSchema: {
      name: z.string().describe('Group name'),
      notes: z.string().optional().describe('Notes about the group'),
    },
  }, async (args) => {
    const group = groups.createGroup(getDb(), args);
    return { content: [{ type: 'text', text: JSON.stringify(group, null, 2) }] };
  });

  server.registerTool('get_group', {
    description: 'Get a group by ID',
    inputSchema: { id: z.string().describe('Group ID') },
  }, async ({ id }) => {
    const group = groups.getGroup(getDb(), id);
    return { content: [{ type: 'text', text: group ? JSON.stringify(group, null, 2) : 'Group not found' }] };
  });

  server.registerTool('list_groups', { description: 'List all groups' }, async () => {
    const list = groups.listGroups(getDb());
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('update_group', {
    description: 'Update a group',
    inputSchema: {
      id: z.string().describe('Group ID'),
      name: z.string().optional().describe('Group name'),
      notes: z.string().optional().describe('Notes about the group'),
    },
  }, async ({ id, ...data }) => {
    const group = groups.updateGroup(getDb(), id, data);
    return { content: [{ type: 'text', text: group ? JSON.stringify(group, null, 2) : 'Group not found' }] };
  });

  server.registerTool('delete_group', {
    description: 'Delete a group',
    inputSchema: { id: z.string().describe('Group ID') },
  }, async ({ id }) => {
    const ok = groups.deleteGroup(getDb(), id);
    return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Not found' }] };
  });

  server.registerTool('add_group_member', {
    description: 'Add a person to a group',
    inputSchema: {
      group_id: z.string().describe('Group ID'),
      person_id: z.string().describe('Person ID'),
    },
  }, async ({ group_id, person_id }) => {
    const member = groups.addGroupMember(getDb(), group_id, person_id);
    return { content: [{ type: 'text', text: JSON.stringify(member, null, 2) }] };
  });

  server.registerTool('remove_group_member', {
    description: 'Remove a person from a group',
    inputSchema: {
      group_id: z.string().describe('Group ID'),
      person_id: z.string().describe('Person ID'),
    },
  }, async ({ group_id, person_id }) => {
    const ok = groups.removeGroupMember(getDb(), group_id, person_id);
    return { content: [{ type: 'text', text: ok ? 'Removed' : 'Not found' }] };
  });

  server.registerTool('get_group_members', {
    description: 'Get all members of a group',
    inputSchema: { group_id: z.string().describe('Group ID') },
  }, async ({ group_id }) => {
    const list = groups.getGroupMembers(getDb(), group_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('get_groups_for_person', {
    description: 'Get all groups a person belongs to',
    inputSchema: { person_id: z.string().describe('Person ID') },
  }, async ({ person_id }) => {
    const list = groups.getGroupsForPerson(getDb(), person_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  // Repository tools
  server.registerTool('create_repository', {
    description: 'Create a new repository (archive, library, etc.)',
    inputSchema: {
      name: z.string().describe('Repository name'),
      address: z.string().optional().describe('Street address'),
      city: z.string().optional().describe('City'),
      postal_code: z.string().optional().describe('Postal code'),
      state: z.string().optional().describe('State or region'),
      country: z.string().optional().describe('Country'),
      phone: z.string().optional().describe('Phone number'),
      email: z.string().optional().describe('Email address'),
      web: z.string().optional().describe('Website URL'),
      call_number: z.string().optional().describe('Call number or reference'),
      notes: z.string().optional().describe('Notes about the repository'),
    },
  }, async (args) => {
    const repo = repositories.createRepository(getDb(), args);
    return { content: [{ type: 'text', text: JSON.stringify(repo, null, 2) }] };
  });

  server.registerTool('get_repository', {
    description: 'Get a repository by ID',
    inputSchema: { id: z.string().describe('Repository ID') },
  }, async ({ id }) => {
    const repo = repositories.getRepository(getDb(), id);
    return { content: [{ type: 'text', text: repo ? JSON.stringify(repo, null, 2) : 'Repository not found' }] };
  });

  server.registerTool('list_repositories', { description: 'List all repositories' }, async () => {
    const list = repositories.listRepositories(getDb());
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('update_repository', {
    description: 'Update a repository',
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
  }, async ({ id, ...data }) => {
    const repo = repositories.updateRepository(getDb(), id, data);
    return { content: [{ type: 'text', text: repo ? JSON.stringify(repo, null, 2) : 'Repository not found' }] };
  });

  server.registerTool('delete_repository', {
    description: 'Delete a repository',
    inputSchema: { id: z.string().describe('Repository ID') },
  }, async ({ id }) => {
    const ok = repositories.deleteRepository(getDb(), id);
    return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Not found' }] };
  });

  server.registerTool('link_source_repository', {
    description: 'Link a source to a repository',
    inputSchema: {
      source_id: z.string().describe('Source ID'),
      repository_id: z.string().describe('Repository ID'),
    },
  }, async ({ source_id, repository_id }) => {
    repositories.linkSourceRepository(getDb(), source_id, repository_id);
    return { content: [{ type: 'text', text: JSON.stringify({ linked: true }) }] };
  });

  server.registerTool('unlink_source_repository', {
    description: 'Remove the link between a source and a repository',
    inputSchema: {
      source_id: z.string().describe('Source ID'),
      repository_id: z.string().describe('Repository ID'),
    },
  }, async ({ source_id, repository_id }) => {
    const ok = repositories.unlinkSourceRepository(getDb(), source_id, repository_id);
    return { content: [{ type: 'text', text: ok ? 'Unlinked' : 'Not found' }] };
  });

  server.registerTool('get_repositories_for_source', {
    description: 'Get all repositories linked to a source',
    inputSchema: { source_id: z.string().describe('Source ID') },
  }, async ({ source_id }) => {
    const list = repositories.getRepositoriesForSource(getDb(), source_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  // Research task tools
  server.registerTool('create_research_task', {
    description: 'Create a new research task',
    inputSchema: {
      task: z.string().describe('Description of the research task'),
      person_id: z.string().optional().describe('Person ID this task relates to'),
      priority: z.number().optional().describe('Priority (lower = higher priority, default 0)'),
      status: z.enum(['open', 'in_progress', 'done', 'stopped']).optional().describe('Task status (default: open)'),
      notes: z.string().optional().describe('Notes about the task'),
      result: z.string().optional().describe('Result of completed research'),
    },
  }, async (args) => {
    const task = researchTasks.createResearchTask(getDb(), args);
    return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] };
  });

  server.registerTool('get_research_task', {
    description: 'Get a research task by ID',
    inputSchema: { id: z.string().describe('Research task ID') },
  }, async ({ id }) => {
    const task = researchTasks.getResearchTask(getDb(), id);
    return { content: [{ type: 'text', text: task ? JSON.stringify(task, null, 2) : 'Research task not found' }] };
  });

  server.registerTool('list_research_tasks', { description: 'List all research tasks' }, async () => {
    const list = researchTasks.listResearchTasks(getDb());
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('get_research_tasks_for_person', {
    description: 'Get all research tasks for a person',
    inputSchema: { person_id: z.string().describe('Person ID') },
  }, async ({ person_id }) => {
    const list = researchTasks.getResearchTasksForPerson(getDb(), person_id);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('update_research_task', {
    description: 'Update a research task',
    inputSchema: {
      id: z.string().describe('Research task ID'),
      task: z.string().optional().describe('Task description'),
      status: z.enum(['open', 'in_progress', 'done', 'stopped']).optional(),
      priority: z.number().optional(),
      notes: z.string().optional(),
      result: z.string().optional().describe('Result of completed research'),
      person_id: z.string().nullable().optional().describe('Link to a person (null to unlink)'),
    },
  }, async ({ id, ...data }) => {
    const task = researchTasks.updateResearchTask(getDb(), id, data);
    return { content: [{ type: 'text', text: task ? JSON.stringify(task, null, 2) : 'Research task not found' }] };
  });

  server.registerTool('delete_research_task', {
    description: 'Delete a research task',
    inputSchema: { id: z.string().describe('Research task ID') },
  }, async ({ id }) => {
    const ok = researchTasks.deleteResearchTask(getDb(), id);
    return { content: [{ type: 'text', text: ok ? 'Deleted' : 'Not found' }] };
  });

  // Duplicate detection & merge tools
  server.registerTool('find_duplicates', {
    description: 'Find potential duplicate persons by comparing names and birth dates. Returns candidates with similarity scores.',
    inputSchema: {
      limit: z.number().optional().describe('Maximum number of candidates to return (default: 100)'),
    },
  }, async ({ limit }) => {
    const list = duplicates.findDuplicates(getDb(), limit ?? 100);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  server.registerTool('merge_persons', {
    description: 'Merge source person into target person. All data from source (names, events, relationships, citations, groups, tasks) is reassigned to target, then source is deleted.',
    inputSchema: {
      target_id: z.string().describe('Person ID to keep (target)'),
      source_id: z.string().describe('Person ID to merge and delete (source)'),
    },
  }, async ({ target_id, source_id }) => {
    const result = duplicates.mergePersons(getDb(), target_id, source_id);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  // Checks tools
  server.registerTool('run_checks', {
    description: 'Run all data quality checks across the entire database and return a list of issues found',
  }, async () => {
    const { dirname } = await import('node:path');
    const dbDir = dirname(getDbPath());
    const results = runAllChecks(getDb(), dbDir);
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  });

  server.registerTool('run_checks_for_person', {
    description: 'Run data quality checks for a specific person and return any issues found',
    inputSchema: { id: z.string().describe('Person ID') },
  }, async ({ id }) => {
    const { dirname } = await import('node:path');
    const dbDir = dirname(getDbPath());
    const results = runChecksForPerson(getDb(), id, dbDir);
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  });

  // Report / narrative data tools
  server.registerTool('get_person_summary', {
    description: 'Get a comprehensive summary of a person: all names, events (with places), relationships (with partner/parent/child names), citations (with source titles), groups, and research tasks. One call = everything about a person, optimized for narrative generation.',
    inputSchema: { person_id: z.string().describe('Person ID') },
  }, async ({ person_id }) => {
    const result = reportData.getPersonSummary(getDb(), person_id);
    return { content: [{ type: 'text', text: result ? JSON.stringify(result, null, 2) : 'Person not found' }] };
  });

  server.registerTool('get_family_unit', {
    description: 'Get a family unit: couple relationship + both persons with birth/death events + all children with their birth/death events. Children are found via parent_child relationships.',
    inputSchema: { relationship_id: z.string().describe('Relationship ID (typically a couple relationship)') },
  }, async ({ relationship_id }) => {
    const result = reportData.getFamilyUnit(getDb(), relationship_id);
    return { content: [{ type: 'text', text: result ? JSON.stringify(result, null, 2) : 'Relationship not found' }] };
  });

  server.registerTool('get_ancestor_tree', {
    description: 'Get a nested ancestor tree for a person up to N generations. Each node has person data, names, birth/death/marriage events, and father/mother subtrees.',
    inputSchema: {
      person_id: z.string().describe('Person ID'),
      generations: z.number().optional().default(4).describe('Number of generations to include (default: 4)'),
    },
  }, async ({ person_id, generations }) => {
    const result = reportData.getAncestorTree(getDb(), person_id, generations);
    return { content: [{ type: 'text', text: result ? JSON.stringify(result, null, 2) : 'Person not found' }] };
  });

  server.registerTool('get_place_history', {
    description: 'Get all events at a place chronologically, with participant names and roles.',
    inputSchema: { place_id: z.string().describe('Place ID') },
  }, async ({ place_id }) => {
    const result = reportData.getPlaceHistory(getDb(), place_id);
    return { content: [{ type: 'text', text: result ? JSON.stringify(result, null, 2) : 'Place not found' }] };
  });

  server.registerTool('get_research_gaps', {
    description: 'Analyze a person for research gaps: missing birth event, missing death event (if not living), no parents, unsourced events, and events without places.',
    inputSchema: { person_id: z.string().describe('Person ID') },
  }, async ({ person_id }) => {
    const result = reportData.getResearchGaps(getDb(), person_id);
    return { content: [{ type: 'text', text: result ? JSON.stringify(result, null, 2) : 'Person not found' }] };
  });

  server.registerTool('get_timeline', {
    description: 'Get a chronological timeline of a person\'s events merged with key family events (spouse birth/death, children births/deaths).',
    inputSchema: { person_id: z.string().describe('Person ID') },
  }, async ({ person_id }) => {
    const result = reportData.getTimeline(getDb(), person_id);
    return { content: [{ type: 'text', text: result ? JSON.stringify(result, null, 2) : 'Person not found' }] };
  });

  // Database tools
  server.registerTool('get_current_database', {
    description: 'Get the path of the currently open database file.',
  }, async () => {
    const nodePath = await import('node:path');
    return { content: [{ type: 'text', text: JSON.stringify({ path: getDbPath(), name: nodePath.default.basename(getDbPath()) }, null, 2) }] };
  });

  server.registerTool('switch_database', {
    description: 'Close the current database and open a different one. Creates the file if it does not exist. All subsequent tool calls will operate on the new database.',
    inputSchema: {
      path: z.string().describe('Absolute path to the SQLite database file to open'),
    },
  }, async (args) => {
    const fs = await import('node:fs');
    const nodePath = await import('node:path');
    fs.mkdirSync(nodePath.default.dirname(args.path), { recursive: true });
    const lockPath = args.path + '.lock';
    if (fs.existsSync(lockPath) && fs.statSync(lockPath).isDirectory()) {
      fs.rmSync(lockPath, { recursive: true });
    }
    getDb().close();
    const newDb = new Database(args.path);
    initializeSchema(newDb);
    setDb(newDb);
    setDbPath(args.path);
    return { content: [{ type: 'text', text: JSON.stringify({ switched: true, path: args.path, name: nodePath.default.basename(args.path) }, null, 2) }] };
  });
}
