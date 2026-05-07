import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { app, dialog, BrowserWindow, shell } from 'electron';
import { callWorker } from './worker-client';
import type { WrapHandlerFn } from './wrap-handler';

/**
 * IPC channels that cannot fit the channel registry pattern:
 *   - checks:* → forwarded to worker, but use worker-local state (checksRunId,
 *     importInProgress, getDbDir()) not expressible in the registry
 *   - chart:saveSvg, chart:savePdf, print:print, print:exportPdf, csv:export,
 *     export:openFolder → require Electron dialog / BrowserWindow / fs
 */
export function registerUtilityHandlers(
  _getDb: () => ReturnType<typeof import('../database').getDatabase>,
  _getCurrentDatabasePath: () => string,
  wrapHandler: WrapHandlerFn,
) {
  // Checks → worker (stay in legacy dispatch table — worker-local state)
  wrapHandler('checks:runAll', () => callWorker('checks:runAll'));
  wrapHandler('checks:forPerson', (...args) => callWorker('checks:forPerson', ...args));
  wrapHandler('checks:forPlace', (...args) => callWorker('checks:forPlace', ...args));
  wrapHandler('checks:forMedia', (...args) => callWorker('checks:forMedia', ...args));

  wrapHandler('export:openFolder', async (folderPath) => {
    await shell.openPath(folderPath as string);
  });

  // App metadata + system browser links (used by About dialog)
  wrapHandler('app:getVersion', () => app.getVersion());
  wrapHandler('app:openExternal', async (url) => {
    if (typeof url !== 'string') return;
    if (!url.startsWith('https://') && !url.startsWith('http://') && !url.startsWith('mailto:')) return;
    await shell.openExternal(url);
  });

  // Print / PDF
  wrapHandler('print:print', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return;
    win.webContents.print({ silent: false, printBackground: true });
  });

  wrapHandler('print:exportPdf', async (defaultPathHint?: unknown, landscape?: unknown, headerFooter?: unknown) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return { success: false, error: 'No window' };
    const result = await dialog.showSaveDialog(win, {
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      defaultPath: (defaultPathHint as string) || 'export.pdf',
    });
    if (result.canceled || !result.filePath) return { success: false, error: 'Cancelled' };
    const savePath = result.filePath;
    const hf = (headerFooter ?? {}) as {
      showHeaderFooter?: boolean;
      researcherName?: string | null;
      researcherEmail?: string | null;
      researcherPhone?: string | null;
      appName?: string | null;
    };
    // showHeaderFooter governs the researcher band. Page numbers print whenever
    // showHeaderFooter is true OR explicitly requested. Chart prints pass
    // `showHeaderFooter: false` and get no header/footer at all.
    const showHF = hf.showHeaderFooter !== false; // default on
    let printOpts: Electron.PrintToPDFOptions = {
      printBackground: true,
      pageSize: 'A4',
      landscape: landscape === true,
      margins: showHF ? { marginType: 'default' } : { marginType: 'none' },
    };
    if (showHF) {
      const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const appName = escape(hf.appName ?? 'Släktforskning');
      const name = hf.researcherName ? escape(hf.researcherName) : '';
      const email = hf.researcherEmail ? escape(hf.researcherEmail) : '';
      const phone = hf.researcherPhone ? escape(hf.researcherPhone) : '';
      const headerTemplate = `<div style="font-size:8px;width:100%;padding:0 12mm;display:flex;justify-content:space-between;color:#666;font-family:Georgia,serif;">
           <span>${appName}</span><span>${name}</span>
         </div>`;
      const leftFooter = email || phone
        ? `${email}${email && phone ? ' &middot; ' : ''}${phone}`
        : '';
      const footerTemplate = `<div style="font-size:8px;width:100%;padding:0 12mm;display:flex;justify-content:space-between;color:#666;font-family:Georgia,serif;">
           <span>${leftFooter}</span>
           <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
         </div>`;
      printOpts = {
        ...printOpts,
        displayHeaderFooter: true,
        headerTemplate,
        footerTemplate,
      };
    }
    const pdfData = await win.webContents.printToPDF(printOpts);
    fs.writeFileSync(savePath, pdfData);
    return { success: true, path: savePath };
  });

  // Wall chart SVG export
  wrapHandler('chart:saveSvg', async (svgContent: unknown, fileNameHint?: unknown) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return { success: false, error: 'No window' };
    const result = await dialog.showSaveDialog(win, {
      title: 'Save Wall Chart SVG',
      defaultPath: (fileNameHint as string) || 'chart.svg',
      filters: [{ name: 'SVG', extensions: ['svg'] }],
    });
    if (result.canceled || !result.filePath) return { success: false, error: 'Cancelled' };
    fs.writeFileSync(result.filePath, svgContent as string, 'utf-8');
    return { success: true, path: result.filePath };
  });

  // Chart PDF export — hidden BrowserWindow loads the SVG as a file
  wrapHandler('chart:savePdf', async (svgContent: unknown, pxWidth: unknown, pxHeight: unknown, fileNameHint?: unknown) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return { success: false, error: 'No window' };
    const result = await dialog.showSaveDialog(win, {
      title: 'Save Chart PDF',
      defaultPath: (fileNameHint as string) || 'chart.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePath) return { success: false, error: 'Cancelled' };

    const os = require('os');
    const { BrowserWindow: BW } = require('electron');
    const w = Math.round(pxWidth as number);
    const h = Math.round(pxHeight as number);
    const PX_TO_MICRONS = 25400 / 96;
    const widthMicrons  = Math.round(w * PX_TO_MICRONS);
    const heightMicrons = Math.round(h * PX_TO_MICRONS);
    const tmpFile = path.join(os.tmpdir(), `slakt-chart-${Date.now()}.svg`);
    fs.writeFileSync(tmpFile, svgContent as string, 'utf-8');
    const hidden = new BW({ show: false, width: w, height: h, webPreferences: { nodeIntegration: false, contextIsolation: true } });
    try {
      await hidden.loadFile(tmpFile);
      const pdf = await hidden.webContents.printToPDF({
        pageSize: { width: widthMicrons, height: heightMicrons },
        printBackground: true,
        margins: { marginType: 'none' },
      });
      fs.writeFileSync(result.filePath, Buffer.from(pdf));
      return { success: true, path: result.filePath };
    } finally {
      hidden.destroy();
      try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    }
  });

  // CSV Export — thin main-thread shim. The save dialog stays here (it needs
  // the renderer's BrowserWindow); the heavy DB walk that builds the CSV
  // string runs in the worker via `csv:_exportRun`. The final fs write is
  // back on the main thread to keep the worker free of fs I/O.
  wrapHandler('csv:export', async (opts?: unknown) => {
    const options = opts as { entityType: string; delimiter?: string; encoding?: 'utf-8' | 'utf-8-bom' } | undefined;
    if (!options?.entityType) return { success: false, error: 'entityType is required' };

    const defaultNames: Record<string, string> = {
      persons: 'persons.csv',
      events: 'events.csv',
      sources: 'sources.csv',
      places: 'places.csv',
    };
    const defaultName = defaultNames[options.entityType];
    if (!defaultName) return { success: false, error: 'Unknown entityType: ' + options.entityType };

    const result = await dialog.showSaveDialog({
      title: 'Export CSV',
      defaultPath: defaultName,
      filters: [{ name: 'CSV Files', extensions: ['csv'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };

    const workerResult = (await callWorker('csv:_exportRun', options)) as
      | { csv: string; defaultName: string }
      | { error: string };
    if ('error' in workerResult) {
      return { success: false, error: workerResult.error };
    }

    await fsp.writeFile(result.filePath, workerResult.csv, 'utf-8');
    return { success: true, filePath: result.filePath };
  });
}
