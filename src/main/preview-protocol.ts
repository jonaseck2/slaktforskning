// Builds the HTML for the website-export preview iframe.
//
// We previously registered a custom `app-preview://` protocol and let the
// iframe load it. Electron's `protocol.handle` wrapper choked on a U+FFFD
// character buried in the SPA bundle when constructing internal Headers
// (TypeError: Cannot convert argument to a ByteString — character at index
// 89 has a value of 65533). Instead of fighting the wrapper, we now inline
// the snapshot directly into the SPA's index.html and hand the renderer
// the modified HTML to drop into <iframe srcdoc>. No protocol needed.

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

function bundlePath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'dist-static')
    : path.join(__dirname, '../..', 'dist-static');
}

async function loadIndexHtml(): Promise<string> {
  // Read fresh every time — dist-static can change underneath a long-running
  // dev session (npm run build:static), and a stale cache would silently
  // serve the old SPA.
  const file = path.join(bundlePath(), 'index.html');
  const html = await fsp.readFile(file, 'utf-8');
  console.log('[preview-protocol] loaded index.html from', file, 'size', html.length);
  return html;
}

/**
 * Returns the SPA index.html with `<script src="./data.js"></script>` swapped
 * for an inline `<script>window.__SNAPSHOT__=…</script>`. The renderer drops
 * this string into `<iframe srcdoc>`.
 */
export async function buildPreviewHtml(snapshot: unknown): Promise<string> {
  const html = await loadIndexHtml();
  const json = JSON.stringify(snapshot ?? null);
  // Closing-tag-safe inline script: snapshots can contain `</script>` inside
  // string fields (notes, transcriptions). Escape the slash to be safe.
  const safeJson = json.replace(/<\/script/gi, '<\\/script');
  const inline = `<script>window.__SNAPSHOT__=${safeJson};</script>`;
  const result = html.replace(/<script\s+src="\.\/data\.js"><\/script>/, inline);
  const replaced = result !== html;
  console.log('[preview-protocol] built preview html: bundle', html.length, 'snapshot', json.length, 'replaced', replaced);
  return result;
}
