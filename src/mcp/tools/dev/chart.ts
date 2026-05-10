import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runScript } from './ui';

// Chart tools call into window.__chartBridge.* which the renderer populates
// via the chart.onXxx polyfills (Tauri) or the chart:* IPC bridge (Electron).
// Both write to the same global. The dev MCP only knows about the global.

export function registerChartTools(server: McpServer, uiBase: string): void {
  server.tool(
    'chart_list_persons',
    'List all persons visible in the currently displayed family tree chart.',
    {},
    async () => {
      const result = await runScript(uiBase, '(window.__chartBridge && window.__chartBridge.getVisiblePersons) ? window.__chartBridge.getVisiblePersons() : { error: "No chart is currently displayed" }');
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
      const arg = JSON.stringify({ person_id, name });
      const script = `(window.__chartBridge && window.__chartBridge.selectPerson) ? window.__chartBridge.selectPerson(${arg}) : { error: 'No chart is currently displayed' }`;
      const result = await runScript(uiBase, script);
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
      const arg = JSON.stringify({ person_id });
      const script = `(window.__chartBridge && window.__chartBridge.focusPerson) ? window.__chartBridge.focusPerson(${arg}) : { error: 'No chart is currently displayed' }`;
      const result = await runScript(uiBase, script);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'chart_get_layout',
    'Get the full layout data for the currently displayed family tree chart (boxes + connectors).',
    {},
    async () => {
      const result = await runScript(uiBase, '(window.__chartBridge && window.__chartBridge.getLayout) ? window.__chartBridge.getLayout() : { error: "No chart is currently displayed" }');
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // chart_screenshot_person stays element-cropped via /screenshot — that's
  // the irreducible Rust capture surface. The selector is computed in the
  // renderer so the eval roundtrip stays out of the screenshot path.
  server.tool(
    'chart_screenshot_person',
    'Capture a screenshot of a specific person\'s box in the family tree chart.',
    {
      person_id: z.string().describe('Person ID to screenshot'),
    },
    async ({ person_id }) => {
      const sel = `[data-person-box-id="${person_id.replace(/"/g, '\\"')}"]`;
      const res = await fetch(`${uiBase}/screenshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selector: sel, padding: 8 }),
      });
      const result = await res.json() as { data?: string; mimeType?: string; error?: string };
      if (result.data) {
        return { content: [{ type: 'image' as const, data: result.data, mimeType: 'image/png' }] };
      }
      return { content: [{ type: 'text' as const, text: result.error ?? 'No screenshot returned' }] };
    }
  );
}
