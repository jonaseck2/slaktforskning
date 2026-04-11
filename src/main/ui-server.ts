import * as http from 'node:http';
import type { BrowserWindow } from 'electron';

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
        const image = await win.webContents.capturePage();
        const data = image.toPNG().toString('base64');
        json(res, 200, { data, mimeType: 'image/png' });

      } else if (method === 'POST' && url === '/navigate') {
        const body = await readBody(req) as { path: string };
        await win.webContents.executeJavaScript(
          `window.__vue_router && window.__vue_router.push(${JSON.stringify(body.path)})`
        );
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

      } else if (method === 'GET' && url === '/dom') {
        const html = await win.webContents.executeJavaScript(
          'document.documentElement.outerHTML'
        );
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);

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
