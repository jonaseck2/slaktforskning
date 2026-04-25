import * as fs from 'fs';
import { promises as fsp } from 'fs';
import * as path from 'path';
import { app, dialog } from 'electron';
import { wrapHandler } from './wrap-handler';
import { callWorker } from './worker-client';

export function registerWebsiteExportHandlers(): void {
  wrapHandler('website:export', async (opts: {
    siteTitle: string;
    focusPersonId: string | null;
    scope: { everyone?: boolean; focusId?: string; ancestors?: number; descendants?: number };
    options: {
      includeMedia: boolean;
      excludeLiving: boolean;
      redactLiving: boolean;
      mediaPersonOnly: boolean;
    };
    _outputDir?: string;
  }) => {
    let out: string;
    if ((opts as { _outputDir?: string })._outputDir) {
      out = (opts as { _outputDir?: string })._outputDir!;
    } else {
      const dir = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
      if (dir.canceled || !dir.filePaths[0]) return { canceled: true };
      out = dir.filePaths[0];
    }

    // 1. Copy dist-static bundle
    const bundleSrc = app.isPackaged
      ? path.join(process.resourcesPath, 'dist-static')
      : path.join(__dirname, '../..', 'dist-static');
    if (!fs.existsSync(bundleSrc)) {
      return { bundleMissing: true };
    }
    await fsp.cp(bundleSrc, out, { recursive: true });

    // 2. Build snapshot via worker thread
    const snapshot = await callWorker('website:buildSnapshot', {
      siteTitle: opts.siteTitle,
      focusPersonId: opts.focusPersonId ?? '',
      scope: opts.scope,
      options: opts.options,
    });
    // Write as data.js (script tag, works from file://) — JSON would require fetch which is blocked from file://
    const json = JSON.stringify(snapshot);
    await fsp.writeFile(path.join(out, 'data.js'), `window.__SNAPSHOT__=${json};`);

    // 3. Copy media (async, with periodic yields so the main thread stays
    //    responsive on large libraries — 7000+ images would otherwise lock
    //    the app for minutes and trigger Electron's unresponsive-app kill).
    //    No thumbnails: the static site reads from media/full/ directly via
    //    static-api.readAsDataUrl; the browser handles scaling.
    if (opts.options.includeMedia) {
      const mediaItems = (snapshot as { media: Array<{ id: string; file_ref: string | null }> }).media;
      const fullDir = path.join(out, 'media', 'full');
      await fsp.mkdir(fullDir, { recursive: true });
      let copied = 0;
      for (const m of mediaItems) {
        if (!m.file_ref) continue;
        try {
          await fsp.access(m.file_ref);
        } catch {
          continue;
        }
        const ext = path.extname(m.file_ref);
        const filename = `${m.id}${ext}`;
        try {
          await fsp.copyFile(m.file_ref, path.join(fullDir, filename));
        } catch {
          // Skip individual file failures rather than aborting the export
          continue;
        }
        copied++;
        // Yield every 25 files so IPC and renderer events can process
        if (copied % 25 === 0) {
          await new Promise(resolve => setImmediate(resolve));
        }
      }
    }

    return { canceled: false, outputDir: out };
  });
}
