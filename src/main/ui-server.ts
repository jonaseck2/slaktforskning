import * as http from 'node:http';
import { ipcMain, type BrowserWindow } from 'electron';

export const UI_SERVER_PORT = process.env.SLAKTFORSKNING_UI_PORT
  ? parseInt(process.env.SLAKTFORSKNING_UI_PORT)
  : 19241;

let server: http.Server | null = null;

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function json(res: http.ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

export function startUiServer(windowGetter: () => BrowserWindow | null): void {
  server = http.createServer(async (req, res) => {
    const win = windowGetter();
    if (!win) {
      json(res, 503, { error: 'No window available' });
      return;
    }

    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    try {
      if (method === 'POST' && url === '/screenshot') {
        const body = await readBody(req) as { selector?: string; padding?: number };
        if (body.selector) {
          // Element-cropped screenshot: scroll into view, capture rect.
          const sel = JSON.stringify(body.selector);
          const pad = Math.max(0, Number(body.padding ?? 0));
          const rect = await win.webContents.executeJavaScript(
            `(() => { const el = document.querySelector(${sel}); if (!el) return { error: 'Element not found: ' + ${sel} }; el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = el.getBoundingClientRect(); return { x: Math.max(0, Math.floor(r.left - ${pad})), y: Math.max(0, Math.floor(r.top - ${pad})), width: Math.min(window.innerWidth, Math.ceil(r.width + ${pad} * 2)), height: Math.min(window.innerHeight, Math.ceil(r.height + ${pad} * 2)) }; })()`
          ) as { error?: string; x?: number; y?: number; width?: number; height?: number };
          if (rect.error) { json(res, 404, { error: rect.error }); return; }
          if (!rect.width || !rect.height) { json(res, 400, { error: 'Element has zero size' }); return; }
          const image = await win.webContents.capturePage({ x: rect.x!, y: rect.y!, width: rect.width, height: rect.height });
          const data = image.toPNG().toString('base64');
          json(res, 200, { data, mimeType: 'image/png', rect });
        } else {
          const image = await win.webContents.capturePage();
          const data = image.toPNG().toString('base64');
          json(res, 200, { data, mimeType: 'image/png' });
        }

      } else if (method === 'POST' && url === '/navigate') {
        const body = await readBody(req) as { path: string };
        await win.webContents.executeJavaScript(
          `window.__vue_router && window.__vue_router.push(${JSON.stringify(body.path)})`
        );
        json(res, 200, { ok: true });

      } else if (method === 'POST' && url === '/reload') {
        // Hard reload — drops all renderer state, re-fetches every list view.
        // Use after MCP-side mutations to surface them in cached views.
        win.webContents.reload();
        json(res, 200, { ok: true });

      } else if (method === 'POST' && url === '/execute_js') {
        const body = await readBody(req) as { code: string };
        try {
          const result = await win.webContents.executeJavaScript(body.code);
          json(res, 200, { result });
        } catch (jsErr: unknown) {
          const msg = jsErr instanceof Error ? jsErr.message : String(jsErr);
          json(res, 400, { error: msg });
        }

      } else if (method === 'POST' && url === '/click') {
        const body = await readBody(req) as { selector: string };
        const selector = JSON.stringify(body.selector);
        // Return result object instead of throwing — Electron's executeJavaScript
        // swallows the original error message when scripts throw.
        // Use dispatchEvent with MouseEvent — SVG elements (like <g>) lack .click().
        const result = await win.webContents.executeJavaScript(
          `(() => { const el = document.querySelector(${selector}); if (!el) return { error: 'Element not found: ' + ${selector} }; el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return { ok: true }; })()`
        ) as { ok?: boolean; error?: string };
        if (result.error) {
          json(res, 400, { error: result.error });
        } else {
          json(res, 200, { ok: true });
        }

      } else if (method === 'POST' && url === '/fill') {
        const body = await readBody(req) as { selector: string; value: string };
        const selector = JSON.stringify(body.selector);
        const value = JSON.stringify(body.value);
        const result = await win.webContents.executeJavaScript(
          `(() => { const el = document.querySelector(${selector}); if (!el) return { error: 'Element not found: ' + ${selector} }; const nativeSetter = Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')?.set; if (nativeSetter) { nativeSetter.call(el, ${value}); } else { el.value = ${value}; } el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return { ok: true }; })()`
        ) as { ok?: boolean; error?: string };
        if (result.error) {
          json(res, 400, { error: result.error });
        } else {
          json(res, 200, { ok: true });
        }

      } else if (method === 'GET' && url.startsWith('/dom')) {
        const qIdx = url.indexOf('?');
        const params = new URLSearchParams(qIdx >= 0 ? url.slice(qIdx + 1) : '');
        const selector = params.get('selector');
        const mode = (params.get('mode') ?? 'outerHTML') as 'outerHTML' | 'innerHTML' | 'textContent' | 'attributes';
        const all = params.get('all') === 'true' || params.get('all') === '1';
        const limit = Math.min(200, Math.max(1, Number(params.get('limit') ?? (all ? 50 : 1))));

        // No selector → full document outerHTML (legacy behaviour, usually too
        // large; the agent should pass `selector` to scope).
        if (!selector) {
          const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML') as string;
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(html);
          return;
        }

        const sel = JSON.stringify(selector);
        const result = await win.webContents.executeJavaScript(
          `(() => {
             const els = [...document.querySelectorAll(${sel})].slice(0, ${limit});
             if (els.length === 0) return { matches: [], total: 0 };
             const total = document.querySelectorAll(${sel}).length;
             const extract = (el) => {
               switch (${JSON.stringify(mode)}) {
                 case 'innerHTML':   return el.innerHTML;
                 case 'textContent': return (el.textContent ?? '').trim();
                 case 'attributes': {
                   const out = {};
                   for (const a of el.attributes) out[a.name] = a.value;
                   return out;
                 }
                 default: return el.outerHTML;
               }
             };
             return { matches: els.map(extract), total };
           })()`
        ) as { matches: unknown[]; total: number };

        if (result.matches.length === 0) {
          json(res, 404, { error: `Element not found: ${selector}` });
          return;
        }

        // Default ergonomics: when caller didn't ask for `all`, return the
        // single-element result directly (string or attribute object) so the
        // common case stays a one-liner.
        if (!all) {
          const single = result.matches[0];
          if (typeof single === 'string') {
            res.writeHead(200, { 'Content-Type': mode === 'textContent' ? 'text/plain' : 'text/html' });
            res.end(single);
          } else {
            json(res, 200, single);
          }
          return;
        }

        // `all=true` → JSON envelope so the agent gets each match separately.
        json(res, 200, { matches: result.matches, total: result.total, returned: result.matches.length });

      } else if (method === 'POST' && url === '/query_styles') {
        const body = await readBody(req) as { selector: string; props?: string[]; limit?: number };
        if (!body.selector) { json(res, 400, { error: 'selector required' }); return; }
        const sel = JSON.stringify(body.selector);
        const props = JSON.stringify(body.props ?? null);
        const limit = Math.min(20, Math.max(1, Number(body.limit ?? 5)));
        const result = await win.webContents.executeJavaScript(
          `(() => {
             const DEFAULT_PROPS = ['display','position','overflow','overflowX','overflowY','height','minHeight','maxHeight','width','minWidth','maxWidth','flex','flexDirection','alignItems','justifyContent','gap','padding','margin','borderRadius','boxSizing','zIndex','top','right','bottom','left','transform','visibility','opacity'];
             const propList = ${props} || DEFAULT_PROPS;
             const els = [...document.querySelectorAll(${sel})].slice(0, ${limit});
             if (els.length === 0) return { matches: [], total: 0 };
             const total = document.querySelectorAll(${sel}).length;
             return {
               total,
               matches: els.map((el, i) => {
                 const cs = getComputedStyle(el);
                 const r = el.getBoundingClientRect();
                 const computed = {};
                 for (const p of propList) computed[p] = cs[p];
                 return {
                   index: i,
                   tag: el.tagName.toLowerCase(),
                   classes: [...el.classList],
                   id: el.id || null,
                   rect: { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, left: r.left, bottom: r.bottom, right: r.right },
                   scroll: { scrollHeight: el.scrollHeight, scrollWidth: el.scrollWidth, scrollTop: el.scrollTop, scrollLeft: el.scrollLeft, clientHeight: el.clientHeight, clientWidth: el.clientWidth },
                   computed,
                 };
               }),
             };
           })()`
        ) as { matches: unknown[]; total: number };
        json(res, 200, result);

      } else if (method === 'POST' && url === '/chart/persons') {
        const replyChannel = `chart-reply-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const result = await new Promise((resolve) => {
          const timeout = setTimeout(() => resolve({ error: 'No chart is currently displayed' }), 2000);
          ipcMain.once(replyChannel, (_event, data) => {
            clearTimeout(timeout);
            resolve(data);
          });
          win.webContents.send('chart:getVisiblePersons', replyChannel);
        });
        json(res, 200, result);

      } else if (method === 'POST' && url === '/chart/select') {
        const body = await readBody(req) as { person_id?: string; name?: string };
        const replyChannel = `chart-reply-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const result = await new Promise((resolve) => {
          const timeout = setTimeout(() => resolve({ error: 'No chart is currently displayed' }), 2000);
          ipcMain.once(replyChannel, (_event, data) => {
            clearTimeout(timeout);
            resolve(data);
          });
          win.webContents.send('chart:selectPerson', replyChannel, body);
        });
        json(res, 200, result);

      } else if (method === 'POST' && url === '/chart/focus') {
        const body = await readBody(req) as { person_id: string };
        const replyChannel = `chart-reply-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const result = await new Promise((resolve) => {
          const timeout = setTimeout(() => resolve({ error: 'No chart is currently displayed' }), 2000);
          ipcMain.once(replyChannel, (_event, data) => {
            clearTimeout(timeout);
            resolve(data);
          });
          win.webContents.send('chart:focusPerson', replyChannel, body);
        });
        json(res, 200, result);

      } else if (method === 'GET' && url === '/chart/layout') {
        const replyChannel = `chart-reply-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const result = await new Promise((resolve) => {
          const timeout = setTimeout(() => resolve({ error: 'No chart is currently displayed' }), 2000);
          ipcMain.once(replyChannel, (_event, data) => {
            clearTimeout(timeout);
            resolve(data);
          });
          win.webContents.send('chart:getLayout', replyChannel);
        });
        json(res, 200, result);

      } else if (method === 'POST' && url === '/chart/screenshot') {
        json(res, 501, { error: 'not yet implemented' });

      } else if (method === 'POST' && url === '/export_pdf') {
        const body = await readBody(req) as { path: string };
        const pdfData = await win.webContents.printToPDF({
          printBackground: false,
          pageSize: 'A4',
          margins: { marginType: 'printableArea' },
        });
        const fs = await import('node:fs');
        fs.writeFileSync(body.path, pdfData);
        json(res, 200, { ok: true, path: body.path, bytes: pdfData.length });

      } else if (method === 'GET' && url === '/status') {
        const result = await win.webContents.executeJavaScript(
          `({ route: window.__vue_router ? window.__vue_router.currentRoute.value.fullPath : null, windowWidth: window.innerWidth, windowHeight: window.innerHeight })`
        ) as { route: string | null; windowWidth: number; windowHeight: number };
        json(res, 200, result);

      } else {
        json(res, 404, { error: 'Not found' });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      json(res, 500, { error: message });
    }
  });

  server.listen(UI_SERVER_PORT, '127.0.0.1', () => {
    console.log(`[UI server] http://127.0.0.1:${UI_SERVER_PORT}`);
  });
}

export function stopUiServer(): void {
  server?.close();
  server = null;
}
