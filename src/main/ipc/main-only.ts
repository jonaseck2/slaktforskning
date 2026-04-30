import * as fs from 'fs';
import * as path from 'path';
import { app, dialog, BrowserWindow, shell } from 'electron';
import { exportPersonsCsv, exportEventsCsv, exportSourcesCsv, exportPlacesCsv } from '../../api/csv_export';
import type { CsvOptions } from '../../api/csv_export';
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
  getDb: () => ReturnType<typeof import('../database').getDatabase>,
  getCurrentDatabasePath: () => string,
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

  wrapHandler('print:exportPdf', async (defaultPathHint?: unknown, landscape?: unknown) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return { success: false, error: 'No window' };
    const result = await dialog.showSaveDialog(win, {
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      defaultPath: (defaultPathHint as string) || 'export.pdf',
    });
    if (result.canceled || !result.filePath) return { success: false, error: 'Cancelled' };
    const savePath = result.filePath;
    const pdfData = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      landscape: landscape === true,
      margins: { marginType: 'none' },
    });
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

  // CSV Export — dialog + DB (stays on main thread)
  wrapHandler('csv:export', async (opts?: unknown) => {
    const options = opts as { entityType: string; delimiter?: string; encoding?: 'utf-8' | 'utf-8-bom' } | undefined;
    if (!options?.entityType) return { success: false, error: 'entityType is required' };

    const csvOptions: CsvOptions = {
      delimiter: options.delimiter ?? ',',
      encoding: options.encoding ?? 'utf-8',
    };

    const db = getDb();
    let csv: string;
    let defaultName: string;
    switch (options.entityType) {
      case 'persons':  csv = exportPersonsCsv(db, csvOptions);  defaultName = 'persons.csv';  break;
      case 'events':   csv = exportEventsCsv(db, csvOptions);   defaultName = 'events.csv';   break;
      case 'sources':  csv = exportSourcesCsv(db, csvOptions);  defaultName = 'sources.csv';  break;
      case 'places':   csv = exportPlacesCsv(db, csvOptions);   defaultName = 'places.csv';   break;
      default: return { success: false, error: 'Unknown entityType: ' + options.entityType };
    }

    const result = await dialog.showSaveDialog({
      title: 'Export CSV',
      defaultPath: defaultName,
      filters: [{ name: 'CSV Files', extensions: ['csv'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    fs.writeFileSync(result.filePath, csv, 'utf-8');
    return { success: true, filePath: result.filePath };
  });
}
