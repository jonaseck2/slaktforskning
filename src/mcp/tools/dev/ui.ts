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

async function uiGet(uiBase: string, path: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${uiBase}${path}`);
  } catch {
    throw new Error('App UI not reachable — make sure the Electron app is running (npm start).');
  }
  return res.text();
}

export function registerUiTools(server: McpServer, uiBase: string): void {
  server.tool(
    'ui_screenshot',
    'Capture a screenshot of the Electron app UI. Returns a PNG image.',
    {},
    async () => {
      const result = await uiPost(uiBase, '/screenshot', {}) as { data: string; mimeType: string };
      return {
        content: [{ type: 'image' as const, data: result.data, mimeType: 'image/png' }],
      };
    }
  );

  server.tool(
    'ui_navigate',
    'Navigate the Electron app to a router path (e.g. "/persons/123").',
    { path: z.string().describe('Vue Router path to navigate to') },
    async ({ path }) => {
      await uiPost(uiBase, '/navigate', { path });
      return { content: [{ type: 'text' as const, text: `Navigated to ${path}` }] };
    }
  );

  server.tool(
    'ui_click',
    'Click a DOM element in the Electron app by CSS selector.',
    { selector: z.string().describe('CSS selector of the element to click') },
    async ({ selector }) => {
      const result = await uiPost(uiBase, '/click', { selector }) as { ok?: boolean; error?: string };
      if (result.error) throw new Error(result.error);
      return { content: [{ type: 'text' as const, text: `Clicked: ${selector}` }] };
    }
  );

  server.tool(
    'ui_fill',
    'Set the value of an input or textarea in the Electron app and dispatch input/change events.',
    {
      selector: z.string().describe('CSS selector of the input or textarea'),
      value: z.string().describe('Value to set'),
    },
    async ({ selector, value }) => {
      const result = await uiPost(uiBase, '/fill', { selector, value }) as { ok?: boolean; error?: string };
      if (result.error) throw new Error(result.error);
      return { content: [{ type: 'text' as const, text: `Filled ${selector} with value` }] };
    }
  );

  server.tool(
    'ui_get_dom',
    'Get the full HTML DOM of the Electron app renderer.',
    {},
    async () => {
      const html = await uiGet(uiBase, '/dom');
      return { content: [{ type: 'text' as const, text: html }] };
    }
  );
}
