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
    'Capture a PNG of the Electron renderer. Pass `selector` to crop to a single element (auto-scrolls into view) — preferred when debugging a specific component, since it avoids irrelevant context. Optional `padding` adds N CSS pixels around the element.',
    {
      selector: z.string().optional().describe('CSS selector to crop the screenshot to a single element. If omitted, captures the full window.'),
      padding: z.number().optional().describe('Pixels of padding around the cropped element (default 0). Ignored when no selector.'),
    },
    async ({ selector, padding }) => {
      const result = await uiPost(uiBase, '/screenshot', { selector, padding }) as { data?: string; mimeType?: string; error?: string };
      if (result.error) throw new Error(result.error);
      return {
        content: [{ type: 'image' as const, data: result.data!, mimeType: 'image/png' }],
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
    'ui_reload',
    'Hard-reload the Electron renderer window (equivalent to Cmd+R). Use after MCP-side mutations to refresh list views (Places, Groups, Tasks, Media) that cache the initial empty fetch and never re-query — known dataChanged-listener gap. Drops all unsaved form state.',
    {},
    async () => {
      await uiPost(uiBase, '/reload', {});
      return { content: [{ type: 'text' as const, text: 'Renderer reloaded' }] };
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
    'Get DOM content from the Electron renderer. Pass `selector` to scope to specific elements — the full document is usually too large (Places returns ~12 MB) and will exceed the model output limit. Use `mode` to extract just what you need (textContent for counts/labels, attributes for state, innerHTML to skip the wrapper, outerHTML for layout debugging). Use `all=true` with a multi-match selector to extract many small elements in one call (e.g. `selector=h2.section-title, mode=textContent, all=true` to read every section title).',
    {
      selector: z.string().optional().describe('CSS selector. Omit to return the whole document (usually too large).'),
      mode: z.enum(['outerHTML', 'innerHTML', 'textContent', 'attributes']).optional().describe('What to extract from each match. Defaults to outerHTML. textContent strips markup; attributes returns a {name: value} JSON map.'),
      all: z.boolean().optional().describe('When true, returns every match as a JSON array (`{ matches, total, returned }`). When false (default), returns the first match only — a string for outerHTML/innerHTML/textContent or a JSON object for attributes.'),
      limit: z.number().optional().describe('Maximum matches to return when `all=true` (default 50, max 200).'),
    },
    async ({ selector, mode, all, limit }) => {
      const params = new URLSearchParams();
      if (selector) params.set('selector', selector);
      if (mode) params.set('mode', mode);
      if (all) params.set('all', 'true');
      if (limit !== undefined) params.set('limit', String(limit));
      const qs = params.toString();
      const path = qs ? `/dom?${qs}` : '/dom';
      const text = await uiGet(uiBase, path);
      return { content: [{ type: 'text' as const, text }] };
    }
  );

  server.tool(
    'ui_query_styles',
    'Read computed styles + bounding rect + scroll metrics for elements matching a CSS selector. The fast path for layout debugging — replaces dumping the whole DOM. Returns up to `limit` matches (default 5, max 20). Default `props` covers the common layout properties (display, position, overflow*, height/width, flex*, padding, margin, etc.); pass `props` to override.',
    {
      selector: z.string().describe('CSS selector to inspect'),
      props: z.array(z.string()).optional().describe('Computed-style property names to return per element. Defaults to a curated layout-debug list.'),
      limit: z.number().optional().describe('Maximum number of matched elements to return (default 5, max 20).'),
    },
    async ({ selector, props, limit }) => {
      const result = await uiPost(uiBase, '/query_styles', { selector, props, limit }) as { matches: unknown[]; total: number; error?: string };
      if (result.error) throw new Error(result.error);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'ui_export_pdf',
    'Export the current Electron window to a PDF file via Chromium printToPDF (A4, printable margins). Use when diagnosing print-layout issues — the same code path as the in-app PDF button.',
    { path: z.string().describe('Absolute filesystem path where the PDF will be written') },
    async ({ path }) => {
      const result = await uiPost(uiBase, '/export_pdf', { path }) as { ok?: boolean; error?: string; path?: string; bytes?: number };
      if (result.error) throw new Error(result.error);
      return { content: [{ type: 'text' as const, text: `Wrote PDF: ${result.path} (${result.bytes} bytes)` }] };
    }
  );
}
