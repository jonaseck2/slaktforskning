import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { app, protocol, net } from 'electron';
import { pathToFileURL } from 'node:url';

export const PREVIEW_SCHEME = 'app-preview';

let cachedSnapshotJson: string | null = null;

const encoder = new TextEncoder();

export function setPreviewSnapshot(snapshot: unknown): void {
  cachedSnapshotJson = JSON.stringify(snapshot);
}

function bundlePath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'dist-static')
    : path.join(__dirname, '../..', 'dist-static');
}

export function registerPreviewProtocol(): void {
  console.log('[preview-protocol] registering handler for scheme', PREVIEW_SCHEME);
  protocol.handle(PREVIEW_SCHEME, async (request) => {
    console.log('[preview-protocol] request:', request.url);
    try {
      const url = new URL(request.url);
      const pathname = url.pathname.replace(/^\/+/, '');

      if (pathname === 'data.js' || pathname.endsWith('/data.js')) {
        const json = cachedSnapshotJson ?? 'null';
        const body = encoder.encode(`window.__SNAPSHOT__=${json};`);
        console.log('[preview-protocol] serving data.js', body.byteLength, 'bytes (snapshot loaded:', cachedSnapshotJson !== null, ')');
        return new Response(body, {
          status: 200,
          headers: { 'content-type': 'application/javascript; charset=utf-8' },
        });
      }

      // For everything else, delegate to net.fetch on the on-disk index.html.
      // Lets Electron's own file loader handle the bytes/content-type so we
      // don't risk tripping its internal Headers/ByteString conversion.
      const indexPath = path.join(bundlePath(), 'index.html');
      // Verify the file exists before delegating, so a missing bundle gives
      // a clear error instead of ERR_UNEXPECTED.
      try {
        await fsp.access(indexPath);
      } catch {
        console.error('[preview-protocol] index.html missing at', indexPath);
        return new Response(encoder.encode('Preview bundle missing — run `npm run build:static`'), {
          status: 500,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
      const fileUrl = pathToFileURL(indexPath).toString();
      console.log('[preview-protocol] serving index.html via net.fetch from', fileUrl);
      return await net.fetch(fileUrl);
    } catch (e) {
      const msg = e instanceof Error ? e.stack ?? e.message : String(e);
      console.error('[preview-protocol] handler threw:', msg);
      return new Response(encoder.encode(`Preview handler error: ${msg}`), {
        status: 500,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
  });
}
