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
import { injectSnapshotIntoHtml } from './preview-html-inject';

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
 * Returns the SPA index.html with the snapshot inlined. The renderer drops
 * the result into a Blob URL the preview iframe loads. Pure injection logic
 * lives in preview-html-inject.ts so it can be unit-tested.
 */
export async function buildPreviewHtml(snapshot: unknown): Promise<string> {
  const html = await loadIndexHtml();
  const result = injectSnapshotIntoHtml(html, snapshot);
  console.log('[preview-protocol] built preview html: bundle', html.length);
  return result;
}
