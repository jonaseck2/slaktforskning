import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

// The dev MCP drives the running app through the bridge's irreducible
// surface: POST /eval (run a JS string in the renderer, get its JSON value
// back) and POST /screenshot (native window capture — Rust-side because
// the renderer can't capture itself reliably). Every other "tool" the MCP
// exposes is a JS string built in this file and shipped through /eval. This
// keeps the bridge tiny (Tauri Rust has 3 endpoints; Electron main has 3)
// and grows the inventory in one place: this file.

async function uiPost(uiBase: string, path: string, body: unknown): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${uiBase}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('App UI not reachable — make sure the app is running.');
  }
  return res.json();
}

/** Run a script in the renderer via /eval. Returns the script's return value. */
async function runScript(uiBase: string, script: string): Promise<unknown> {
  return await uiPost(uiBase, '/eval', { script });
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
    'Navigate the app to a router path (e.g. "/persons/123"). Awaits the route transition.',
    { path: z.string().describe('Vue Router path to navigate to') },
    async ({ path }) => {
      const pathJson = JSON.stringify(path);
      const script = `(async () => { if (!window.__vue_router) return { error: 'no router' }; await window.__vue_router.push(${pathJson}).catch(() => null); await new Promise(r => requestAnimationFrame(r)); return { ok: true, route: window.__vue_router.currentRoute.value.fullPath }; })()`;
      const result = await runScript(uiBase, script) as { ok?: boolean; error?: string };
      if (result.error) throw new Error(result.error);
      return { content: [{ type: 'text' as const, text: `Navigated to ${path}` }] };
    }
  );

  server.tool(
    'ui_reload',
    'Hard-reload the renderer window (equivalent to Cmd+R). Use after MCP-side mutations to refresh list views (Places, Groups, Tasks, Media) — MCP runs in a separate process and does not fire data:changed in the renderer. Drops all unsaved form state.',
    {},
    async () => {
      await runScript(uiBase, '(window.location.reload(), { ok: true })');
      return { content: [{ type: 'text' as const, text: 'Renderer reloaded' }] };
    }
  );

  server.tool(
    'ui_click',
    'Click a DOM element in the app by CSS selector.',
    { selector: z.string().describe('CSS selector of the element to click') },
    async ({ selector }) => {
      const sel = JSON.stringify(selector);
      const script = `(() => { const el = document.querySelector(${sel}); if (!el) return { error: 'Element not found: ' + ${sel} }; el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return { ok: true }; })()`;
      const result = await runScript(uiBase, script) as { ok?: boolean; error?: string };
      if (result.error) throw new Error(result.error);
      return { content: [{ type: 'text' as const, text: `Clicked: ${selector}` }] };
    }
  );

  server.tool(
    'ui_fill',
    'Set the value of an input or textarea in the app and dispatch input/change events.',
    {
      selector: z.string().describe('CSS selector of the input or textarea'),
      value: z.string().describe('Value to set'),
    },
    async ({ selector, value }) => {
      const sel = JSON.stringify(selector);
      const val = JSON.stringify(value);
      const script = `(() => { const el = document.querySelector(${sel}); if (!el) return { error: 'Element not found: ' + ${sel} }; const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; const setter = Object.getOwnPropertyDescriptor(proto, 'value').set; setter.call(el, ${val}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return { ok: true }; })()`;
      const result = await runScript(uiBase, script) as { ok?: boolean; error?: string };
      if (result.error) throw new Error(result.error);
      return { content: [{ type: 'text' as const, text: `Filled ${selector} with value` }] };
    }
  );

  server.tool(
    'ui_get_dom',
    'Get DOM content from the renderer. Pass `selector` to scope to specific elements — the full document is usually too large and will exceed the model output limit. Use `mode` to extract just what you need (textContent for counts/labels, attributes for state, innerHTML to skip the wrapper, outerHTML for layout debugging). Use `all=true` with a multi-match selector to extract many small elements in one call.',
    {
      selector: z.string().optional().describe('CSS selector. Omit to return the whole document (usually too large).'),
      mode: z.enum(['outerHTML', 'innerHTML', 'textContent', 'attributes']).optional().describe('What to extract from each match. Defaults to outerHTML.'),
      all: z.boolean().optional().describe('When true, returns every match as a JSON array. When false (default), returns the first match only.'),
      limit: z.number().optional().describe('Maximum matches to return when `all=true` (default 50, max 200).'),
    },
    async ({ selector, mode = 'outerHTML', all = false, limit }) => {
      const lim = Math.min(200, Math.max(1, limit ?? (all ? 50 : 1)));
      if (!selector) {
        const r = await runScript(uiBase, 'document.documentElement.outerHTML');
        return { content: [{ type: 'text' as const, text: typeof r === 'string' ? r : JSON.stringify(r) }] };
      }
      const sel = JSON.stringify(selector);
      const modeJson = JSON.stringify(mode);
      const script = `(() => { const els = [...document.querySelectorAll(${sel})].slice(0, ${lim}); if (els.length === 0) return { matches: [], total: 0 }; const total = document.querySelectorAll(${sel}).length; const extract = (el) => { switch (${modeJson}) { case 'innerHTML': return el.innerHTML; case 'textContent': return (el.textContent ?? '').trim(); case 'attributes': { const out = {}; for (const a of el.attributes) out[a.name] = a.value; return out; } default: return el.outerHTML; } }; return { matches: els.map(extract), total }; })()`;
      const result = await runScript(uiBase, script) as { matches?: unknown[]; total?: number };
      const matches = result.matches ?? [];
      const total = result.total ?? 0;
      if (matches.length === 0) throw new Error(`Element not found: ${selector}`);
      if (!all) {
        const single = matches[0];
        const text = typeof single === 'string' ? single : JSON.stringify(single, null, 2);
        return { content: [{ type: 'text' as const, text }] };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify({ matches, total, returned: matches.length }, null, 2) }] };
    }
  );

  server.tool(
    'ui_query_styles',
    'Read computed styles + bounding rect + scroll metrics for elements matching a CSS selector. The fast path for layout debugging — replaces dumping the whole DOM. Returns up to `limit` matches (default 5, max 20).',
    {
      selector: z.string().describe('CSS selector to inspect'),
      props: z.array(z.string()).optional().describe('Computed-style property names to return per element. Defaults to a curated layout-debug list.'),
      limit: z.number().optional().describe('Maximum number of matched elements to return (default 5, max 20).'),
    },
    async ({ selector, props, limit }) => {
      const lim = Math.min(20, Math.max(1, limit ?? 5));
      const sel = JSON.stringify(selector);
      const propsJson = props ? JSON.stringify(props) : 'null';
      const script = `(() => { const DEFAULT_PROPS = ['display','position','overflow','overflowX','overflowY','height','minHeight','maxHeight','width','minWidth','maxWidth','flex','flexDirection','alignItems','justifyContent','gap','padding','margin','borderRadius','boxSizing','zIndex','top','right','bottom','left','transform','visibility','opacity']; const propList = ${propsJson} || DEFAULT_PROPS; const els = [...document.querySelectorAll(${sel})].slice(0, ${lim}); if (els.length === 0) return { matches: [], total: 0 }; const total = document.querySelectorAll(${sel}).length; return { total, matches: els.map((el, i) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); const computed = {}; for (const p of propList) computed[p] = cs[p]; return { index: i, tag: el.tagName.toLowerCase(), classes: [...el.classList], id: el.id || null, rect: { x: r.x, y: r.y, width: r.width, height: r.height }, scroll: { scrollHeight: el.scrollHeight, scrollWidth: el.scrollWidth, scrollTop: el.scrollTop, clientHeight: el.clientHeight, clientWidth: el.clientWidth }, computed }; }) }; })()`;
      const result = await runScript(uiBase, script);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'ui_eval',
    'Run an arbitrary JavaScript expression in the renderer and return its result. The expression must produce a JSON-serializable value (or a Promise of one). Use this for anything not covered by the structured ui_* tools — probing window.api shape, calling a polyfilled handler directly, inspecting Pinia state, reading localStorage. Don\'t use TS type-assertions; the script runs as plain JS.',
    {
      script: z.string().describe('JavaScript expression to evaluate. Wrap in a paren or IIFE for multi-statement bodies. Top-level await is supported via async IIFE.'),
    },
    async ({ script }) => {
      const result = await runScript(uiBase, script);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'ui_console',
    'Drain the renderer\'s captured console buffer (errors + warnings + log entries since the last drain, ring-buffered to 500 entries). Each entry has { ts, level, args }.',
    {},
    async () => {
      const result = await runScript(uiBase, '(() => { const buf = window.__taurisConsole?.drain?.() ?? []; return { entries: buf }; })()');
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'ui_export_pdf',
    'Trigger the native print dialog (use Save-as-PDF in the dialog). Tauri webview has no headless printToPDF; the user must click through.',
    {},
    async () => {
      await runScript(uiBase, '(window.print(), { ok: true })');
      return { content: [{ type: 'text' as const, text: 'Print dialog opened — choose Save as PDF.' }] };
    }
  );

  // Chart inspection tools live in dev/chart.ts (registerChartTools).
}

/** Exported for chart.ts and inspect.ts so they share the /eval helper. */
export { runScript };
