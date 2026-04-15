import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as researchTasks from '../../../api/research_tasks';
import * as reportData from '../../../api/report_data';
import { runAllChecks, runChecksForPerson } from '../../../api/checks/index';
import type { ToolContext } from './types';

export function registerResearchTools(server: McpServer, ctx: ToolContext): void {
  const { getDb } = ctx;

  server.registerTool('get_research_gaps', {
    description: 'Analyze a person for research gaps: missing birth/death events, no parents, unsourced events, and events without places',
    inputSchema: {
      person_id: z.string().describe('Person ID'),
    },
  }, async (args) => {
    const result = reportData.getResearchGaps(getDb(), args.person_id);
    return { content: [{ type: 'text', text: result ? JSON.stringify(result, null, 2) : 'Person not found' }] };
  });

  server.registerTool('add_research_task', {
    description: 'Create a new research task, optionally linked to a person',
    inputSchema: {
      task: z.string().describe('Description of the research task'),
      person_id: z.string().optional().describe('Person ID this task relates to'),
      priority: z.number().optional().describe('Priority (lower = higher priority, default 0)'),
      status: z.enum(['open', 'in_progress', 'done', 'stopped']).optional().describe('Task status (default: open)'),
      notes: z.string().optional().describe('Notes about the task'),
    },
  }, async (args) => {
    const task = researchTasks.createResearchTask(getDb(), args);
    return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] };
  });

  server.registerTool('update_research_task', {
    description: 'Update a research task (status, notes, result, etc.)',
    inputSchema: {
      id: z.string().describe('Research task ID'),
      task: z.string().optional().describe('Task description'),
      notes: z.string().optional().describe('Notes about the task'),
      result: z.string().optional().describe('Result of completed research'),
      status: z.enum(['open', 'in_progress', 'done', 'stopped']).optional().describe('Task status'),
      priority: z.number().optional().describe('Priority (lower = higher priority)'),
    },
  }, async (args) => {
    const { id, ...data } = args;
    const task = researchTasks.updateResearchTask(getDb(), id, data);
    return { content: [{ type: 'text', text: task ? JSON.stringify(task, null, 2) : 'Research task not found' }] };
  });

  server.registerTool('run_checks', {
    description: 'Run data quality checks. If person_id is provided, checks only that person; otherwise checks the entire database.',
    inputSchema: {
      person_id: z.string().optional().describe('Person ID to check (omit to check all persons)'),
    },
  }, async (args) => {
    const db = getDb();
    const results = args.person_id
      ? runChecksForPerson(db, args.person_id)
      : runAllChecks(db);
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  });
}
