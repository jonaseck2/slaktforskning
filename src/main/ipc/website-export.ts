import * as fs from 'fs';
import * as path from 'path';
import { app, BrowserWindow, dialog } from 'electron';
import { wrapHandler } from './wrap-handler';
import { callWorker } from './worker-client';
import { generateThumbnail } from '../../api/html_site/thumbnails';

const REPORT_SLUGS = ['a-life', 'your-ancestors', 'life-on-one-page', 'photo-album'];
const PRINT_SLUGS = ['pedigree', 'hourglass', 'descendant', 'fan-chart', 'timeline'];

export function registerWebsiteExportHandlers(): void {
  wrapHandler('website:export', async (opts: {
    siteTitle: string;
    focusPersonId: string | null;
    scope: { everyone?: boolean; focusId?: string; ancestors?: number; descendants?: number };
    options: {
      includeMedia: boolean;
      includeReports: boolean;
      includePrints: boolean;
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
    if (fs.existsSync(bundleSrc)) {
      fs.cpSync(bundleSrc, out, { recursive: true });
    }

    // 2. Build snapshot via worker thread
    const snapshot = await callWorker('website:buildSnapshot', {
      siteTitle: opts.siteTitle,
      focusPersonId: opts.focusPersonId ?? '',
      scope: opts.scope,
      options: opts.options,
    });
    fs.writeFileSync(path.join(out, 'data.json'), JSON.stringify(snapshot));

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

    // 4. Pre-render reports via hidden BrowserWindow (only if SPA bundle was copied)
    const indexHtml = path.join(out, 'index.html');
    if (opts.options.includeReports && fs.existsSync(indexHtml)) {
      fs.mkdirSync(path.join(out, 'reports'), { recursive: true });
      for (const slug of REPORT_SLUGS) {
        await prerenderPage(out, 'reports', slug);
      }
    }
    if (opts.options.includePrints && fs.existsSync(indexHtml)) {
      fs.mkdirSync(path.join(out, 'prints'), { recursive: true });
      for (const slug of PRINT_SLUGS) {
        await prerenderPage(out, 'prints', slug);
      }
    }

    return { canceled: false, outputDir: out };
  });
}

async function prerenderPage(outDir: string, type: 'reports' | 'prints', slug: string): Promise<void> {
  const win = new BrowserWindow({
    show: false,
    width: 1200,
    height: 1600,
    webPreferences: { sandbox: false },
  });
  const url = `file://${path.join(outDir, 'index.html')}#/${type}/${slug}?prerender=1`;
  await win.loadURL(url);
  await new Promise(r => setTimeout(r, 1500));
  const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML') as string;
  fs.writeFileSync(path.join(outDir, type, `${slug}.html`), html);
  const pdf = await win.webContents.printToPDF({});
  fs.writeFileSync(path.join(outDir, type, `${slug}.pdf`), pdf);
  win.close();
}
