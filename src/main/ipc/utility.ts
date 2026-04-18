import { dialog, BrowserWindow, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { WrapHandlerFn } from './wrap-handler';
import * as groups from '../../api/groups';
import * as repositories from '../../api/repositories';
import * as researchTasks from '../../api/research_tasks';
import * as checks from '../../api/checks';
import * as duplicates from '../../api/duplicates';
import * as reportData from '../../api/report_data';
import * as persons from '../../api/persons';
import { exportPersonsCsv, exportEventsCsv, exportSourcesCsv, exportPlacesCsv } from '../../api/csv_export';
import type { CsvOptions } from '../../api/csv_export';
import { generateHtmlSite } from '../../api/html_site/generator';
import { isImportInProgress } from './import';

export function registerUtilityHandlers(
  getDb: () => ReturnType<typeof import('../database').getDatabase>,
  getCurrentDatabasePath: () => string,
  wrapHandler: WrapHandlerFn,
) {
  // Groups
  wrapHandler('groups:list', () => groups.listGroups(getDb()));
  wrapHandler('groups:get', (id) => groups.getGroup(getDb(), id as string));
  wrapHandler('groups:create', (data) => groups.createGroup(getDb(), data as Parameters<typeof groups.createGroup>[1]));
  wrapHandler('groups:update', (id, data) => groups.updateGroup(getDb(), id as string, data as Parameters<typeof groups.updateGroup>[2]));
  wrapHandler('groups:delete', (id) => groups.deleteGroup(getDb(), id as string));
  wrapHandler('groups:addMember', (groupId, personId) => groups.addGroupMember(getDb(), groupId as string, personId as string));
  wrapHandler('groups:removeMember', (groupId, personId) => groups.removeGroupMember(getDb(), groupId as string, personId as string));
  wrapHandler('groups:getMembers', (groupId) => groups.getGroupMembers(getDb(), groupId as string));
  wrapHandler('groups:forPerson', (personId) => groups.getGroupsForPerson(getDb(), personId as string));

  // Repositories
  wrapHandler('repositories:list', () => repositories.listRepositories(getDb()));
  wrapHandler('repositories:get', (id) => repositories.getRepository(getDb(), id as string));
  wrapHandler('repositories:create', (data) => repositories.createRepository(getDb(), data as Parameters<typeof repositories.createRepository>[1]));
  wrapHandler('repositories:update', (id, data) => repositories.updateRepository(getDb(), id as string, data as Parameters<typeof repositories.updateRepository>[2]));
  wrapHandler('repositories:delete', (id) => repositories.deleteRepository(getDb(), id as string));
  wrapHandler('repositories:forSource', (sourceId) => repositories.getRepositoriesForSource(getDb(), sourceId as string));
  wrapHandler('repositories:linkSource', (sourceId, repoId) => repositories.linkSourceRepository(getDb(), sourceId as string, repoId as string));
  wrapHandler('repositories:unlinkSource', (sourceId, repoId) => repositories.unlinkSourceRepository(getDb(), sourceId as string, repoId as string));

  // Research tasks
  wrapHandler('researchTasks:list', () => researchTasks.listResearchTasks(getDb()));
  wrapHandler('researchTasks:get', (id) => researchTasks.getResearchTask(getDb(), id as string));
  wrapHandler('researchTasks:forPerson', (personId) => researchTasks.getResearchTasksForPerson(getDb(), personId as string));
  wrapHandler('researchTasks:create', (data) => researchTasks.createResearchTask(getDb(), data as Parameters<typeof researchTasks.createResearchTask>[1]));
  wrapHandler('researchTasks:update', (id, data) => researchTasks.updateResearchTask(getDb(), id as string, data as Parameters<typeof researchTasks.updateResearchTask>[2]));
  wrapHandler('researchTasks:delete', (id) => researchTasks.deleteResearchTask(getDb(), id as string));

  // Report data
  wrapHandler('reports:personSummary', (personId) => reportData.getPersonSummary(getDb(), personId as string));
  wrapHandler('reports:familyUnit', (relationshipId) => reportData.getFamilyUnit(getDb(), relationshipId as string));
  wrapHandler('reports:ancestorTree', (personId, generations) => reportData.getAncestorTree(getDb(), personId as string, generations as number | undefined));
  wrapHandler('reports:placeHistory', (placeId) => reportData.getPlaceHistory(getDb(), placeId as string));
  wrapHandler('reports:researchGaps', (personId) => reportData.getResearchGaps(getDb(), personId as string));
  wrapHandler('reports:timeline', (personId) => reportData.getTimeline(getDb(), personId as string));

  // Duplicates & Merge
  wrapHandler('duplicates:find', (limit) => duplicates.findDuplicates(getDb(), limit as number | undefined));
  wrapHandler('duplicates:merge', (targetId, sourceId) => duplicates.mergePersons(getDb(), targetId as string, sourceId as string));

  // Checks — run incrementally, yielding the event loop between each check
  // so navigation and other IPC calls are not blocked.
  let checksRunId = 0;
  wrapHandler('checks:runAll', async () => {
    if (isImportInProgress()) {
      console.log('[IPC] checks:runAll skipped — import in progress');
      return [];
    }

    const runId = ++checksRunId;
    const db = getDb();
    const dbDir = path.dirname(getCurrentDatabasePath());
    const allChecks = checks.getAllCheckFunctions();
    const results: checks.CheckResult[] = [];
    const t0 = Date.now();
    console.log(`[checks] runAll #${runId} starting (${allChecks.length} checks)`);

    for (const check of allChecks) {
      // Abort if a newer run was started
      if (runId !== checksRunId) {
        console.log(`[checks] runAll #${runId} cancelled — superseded by #${checksRunId}`);
        return [];
      }
      // Yield the event loop so other IPC handlers can run
      await new Promise<void>(resolve => setImmediate(resolve));
      if (runId !== checksRunId) {
        console.log(`[checks] runAll #${runId} cancelled — superseded by #${checksRunId}`);
        return [];
      }

      const start = Date.now();
      const res = check.fn(db, dbDir);
      console.log(`[checks] ${check.name}: ${Date.now() - start}ms → ${res.length} result(s)`);
      results.push(...res);
    }

    if (runId !== checksRunId) return [];

    console.log(`[checks] runAll #${runId}: ${Date.now() - t0}ms → ${results.length} raw results`);

    // Cap notice-severity results per check code to 500 — checks like NO_BIRTH_EVENT
    // can return 20k+ results for large trees, making the name-resolution query very slow.
    const countByCode = new Map<string, number>();
    const capped = results.filter(r => {
      if (r.severity !== 'notice') return true;
      const n = (countByCode.get(r.code) ?? 0) + 1;
      countByCode.set(r.code, n);
      return n <= 500;
    });
    console.log(`[checks] capped to ${capped.length} results`);
    const allIds = [...new Set(capped.flatMap(r => r.personIds))];
    console.log(`[checks] resolving ${allIds.length} person names`);
    const t1 = Date.now();
    const nameMap = persons.getPersonDisplayNames(db, allIds);
    console.log(`[checks] getPersonDisplayNames: ${Date.now() - t1}ms`);
    return capped.map(r => ({ ...r, personNames: r.personIds.map(id => nameMap.get(id) ?? '') }));
  });
  wrapHandler('checks:forPerson', (personId) => {
    const dbDir = path.dirname(getCurrentDatabasePath());
    return checks.runChecksForPerson(getDb(), personId as string, dbDir);
  });

  // HTML Site Export
  wrapHandler('export:htmlSiteSelectDir', async () => {
    const dialogOpts = {
      title: 'Select output folder',
      properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[],
    };
    const win = BrowserWindow.getFocusedWindow();
    const result = win
      ? await dialog.showOpenDialog(win, dialogOpts)
      : await dialog.showOpenDialog(dialogOpts);
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    return { canceled: false, path: result.filePaths[0] };
  });

  wrapHandler('export:htmlSite', (opts) => {
    const { outputDir, excludeLiving, siteTitle } = opts as {
      outputDir: string;
      excludeLiving?: boolean;
      siteTitle?: string;
    };
    return generateHtmlSite(getDb(), outputDir, { excludeLiving, siteTitle });
  });

  wrapHandler('export:openFolder', async (folderPath) => {
    await shell.openPath(folderPath as string);
  });

  // Print / PDF
  wrapHandler('print:print', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return;
    win.webContents.print({ silent: false, printBackground: false });
  });

  wrapHandler('print:exportPdf', async (filePath?: unknown) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return { success: false, error: 'No window' };

    let savePath = filePath as string | undefined;
    if (!savePath) {
      const result = await dialog.showSaveDialog(win, {
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
        defaultPath: 'export.pdf',
      });
      if (result.canceled || !result.filePath) return { success: false, error: 'Cancelled' };
      savePath = result.filePath;
    }

    const pdfData = await win.webContents.printToPDF({
      printBackground: false,
      pageSize: 'A4',
      margins: { marginType: 'printableArea' },
    });

    fs.writeFileSync(savePath, pdfData);
    return { success: true, path: savePath };
  });

  // CSV Export
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
      case 'persons':
        csv = exportPersonsCsv(db, csvOptions);
        defaultName = 'persons.csv';
        break;
      case 'events':
        csv = exportEventsCsv(db, csvOptions);
        defaultName = 'events.csv';
        break;
      case 'sources':
        csv = exportSourcesCsv(db, csvOptions);
        defaultName = 'sources.csv';
        break;
      case 'places':
        csv = exportPlacesCsv(db, csvOptions);
        defaultName = 'places.csv';
        break;
      default:
        return { success: false, error: 'Unknown entityType: ' + options.entityType };
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
