import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

async function uiPost(uiBase: string, path: string, body: unknown): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${uiBase}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('App UI not reachable — make sure the Electron app is running (npm start).');
  }
  return res.json();
}

async function uiGet(uiBase: string, path: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${uiBase}${path}`);
  } catch {
    throw new Error('App UI not reachable — make sure the Electron app is running (npm start).');
  }
  return res.json();
}

export function registerChartTools(server: McpServer, uiBase: string): void {
  server.tool(
    'chart_list_persons',
    'List all persons visible in the currently displayed family tree chart.',
    {},
    async () => {
      const result = await uiPost(uiBase, '/chart/persons', {});
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'chart_select_person',
    'Select a person in the chart by ID or name, showing outlines for adding relatives.',
    {
      person_id: z.string().optional().describe('Person ID to select'),
      name: z.string().optional().describe('Person name to search and select'),
    },
    async ({ person_id, name }) => {
      const result = await uiPost(uiBase, '/chart/select', { person_id, name });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'chart_focus_person',
    'Re-focus the family tree chart on a specific person, making them the new root.',
    {
      person_id: z.string().describe('Person ID to focus the chart on'),
    },
    async ({ person_id }) => {
      const result = await uiPost(uiBase, '/chart/focus', { person_id });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'chart_get_layout',
    'Get the full layout data for the currently displayed family tree chart (all boxes and connectors).',
    {},
    async () => {
      const result = await uiGet(uiBase, '/chart/layout');
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'chart_screenshot_person',
    'Capture a screenshot of a specific person\'s box in the family tree chart.',
    {
      person_id: z.string().describe('Person ID to screenshot'),
    },
    async ({ person_id }) => {
      const result = await uiPost(uiBase, '/chart/screenshot', { person_id }) as { data?: string; mimeType?: string; error?: string };
      if (result.data) {
        return {
          content: [{ type: 'image' as const, data: result.data, mimeType: (result.mimeType ?? 'image/png') as 'image/png' }],
        };
      }
      return { content: [{ type: 'text' as const, text: result.error ?? JSON.stringify(result) }] };
    }
  );
}
