import * as fs from 'fs';
import * as path from 'path';
import { app, dialog } from 'electron';
import { wrapHandler } from './wrap-handler';
import { callWorker } from './worker-client';
import { generateThumbnail } from '../../api/html_site/thumbnails';

export function registerWebsiteExportHandlers(): void {
  wrapHandler('website:export', async (opts: {
    siteTitle: string;
    focusPersonId: string | null;
    scope: { everyone?: boolean; focusId?: string; ancestors?: number; descendants?: number };
    options: {
      includeMedia: boolean;
      excludeLiving: boolean;
      redactLiving: boolean;
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
    fs.cpSync(bundleSrc, out, { recursive: true });

    // 2. Build snapshot via worker thread
    const snapshot = await callWorker('website:buildSnapshot', {
      siteTitle: opts.siteTitle,
      focusPersonId: opts.focusPersonId ?? '',
      scope: opts.scope,
      options: opts.options,
    });
    // Write as data.js (script tag, works from file://) — JSON would require fetch which is blocked from file://
    const json = JSON.stringify(snapshot);
    fs.writeFileSync(path.join(out, 'data.js'), `window.__SNAPSHOT__=${json};`);

    // 3. Copy media + thumbnails
    if (opts.options.includeMedia) {
      const mediaItems = (snapshot as { media: Array<{ id: string; file_ref: string | null }> }).media;
      const fullDir = path.join(out, 'media', 'full');
      const thumbDir = path.join(out, 'media', 'thumb');
      fs.mkdirSync(fullDir, { recursive: true });
      fs.mkdirSync(thumbDir, { recursive: true });
      for (const m of mediaItems) {
        if (!m.file_ref || !fs.existsSync(m.file_ref)) continue;
        const ext = path.extname(m.file_ref);
        const filename = `${m.id}${ext}`;
        fs.copyFileSync(m.file_ref, path.join(fullDir, filename));
        await generateThumbnail(m.file_ref, path.join(thumbDir, filename));
      }
    }

    return { canceled: false, outputDir: out };
  });
}
