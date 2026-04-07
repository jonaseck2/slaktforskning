import { ipcMain, dialog, shell, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as inspector from 'inspector';
import { getDatabase, getCurrentDatabasePath, switchDatabase } from './database';
import { loadSettings } from './settings';
import * as persons from '../api/persons';
import * as relationships from '../api/relationships';
import * as events from '../api/events';
import * as sources from '../api/sources';
import * as places from '../api/places';
import { readGedcomFile, parseGedcom, importGedcom, exportGedcom } from '../gedcom';
import type { ImportOptions } from '../import/gedcom';
import { unzipSync } from 'fflate';
import { importFromGenney, discoverTables, isDockerAvailable } from '../import/genney/index';
import { importFromHolger } from '../import/holger/index';
import * as groups from '../api/groups';
import * as repositories from '../api/repositories';
import * as researchTasks from '../api/research_tasks';
import * as media from '../api/media';
import * as checks from '../api/checks';
import { getDbSetting } from '../api/db_settings';

let importInProgress = false;

// ---------------------------------------------------------------------------
// CPU profiling helpers — writes .cpuprofile to ~/Desktop for Chrome DevTools
// ---------------------------------------------------------------------------
async function captureProfile<T>(label: string, fn: () => T | Promise<T>): Promise<T> {
  const session = new inspector.Session();
  session.connect();
  await new Promise<void>((resolve, reject) =>
    session.post('Profiler.enable', (err) => (err ? reject(err) : resolve()))
  );
  await new Promise<void>((resolve, reject) =>
    session.post('Profiler.start', (err) => (err ? reject(err) : resolve()))
  );
  const t0 = Date.now();
  let result: T;
  try {
    result = await fn();
  } finally {
    const profile = await new Promise<inspector.Profiler.Profile>((resolve, reject) =>
      session.post('Profiler.stop', (_err, params) =>
        _err ? reject(_err) : resolve(params.profile)
      )
    );
    session.disconnect();
    const elapsed = Date.now() - t0;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outPath = path.join(os.homedir(), 'Desktop', `${label}-${stamp}.cpuprofile`);
    fs.writeFileSync(outPath, JSON.stringify(profile), 'utf-8');
    console.log(`[profile] ${label}: ${elapsed}ms → ${outPath}`);
  }
  return result!;
}

function wrapHandler(channel: string, handler: (...args: unknown[]) => unknown) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      console.log(`[IPC] ${channel}`, args);
      const result = await handler(...args);
      console.log(`[IPC] ${channel} → OK`);
      return result;
    } catch (err) {
      console.error(`[IPC] ${channel} → ERROR`, err);
      throw err;
    }
  });
}

export function registerIpcHandlers(): void {
  // Persons
  wrapHandler('persons:create', (data) => persons.createPerson(getDatabase(), data as Parameters<typeof persons.createPerson>[1]));
  wrapHandler('persons:get', (id) => persons.getPerson(getDatabase(), id as string));
  wrapHandler('persons:list', () => persons.listPersons(getDatabase()));
  wrapHandler('persons:update', (id, data) => persons.updatePerson(getDatabase(), id as string, data as Parameters<typeof persons.updatePerson>[2]));
  wrapHandler('persons:delete', (id) => persons.deletePerson(getDatabase(), id as string));
  wrapHandler('persons:search', (query) => persons.searchPersons(getDatabase(), query as string));
  wrapHandler('persons:addName', (personId, data) => persons.addPersonName(getDatabase(), personId as string, data as Parameters<typeof persons.addPersonName>[2]));
  wrapHandler('persons:getNames', (personId) => persons.getPersonNames(getDatabase(), personId as string));
  wrapHandler('persons:updateName', (id, data) => persons.updatePersonName(getDatabase(), id as string, data as Parameters<typeof persons.updatePersonName>[2]));
  wrapHandler('persons:deleteName', (id: string) =>
    persons.deletePersonName(getDatabase(), id)
  );
  wrapHandler('persons:addIdentifier', (personId, data) =>
    persons.addPersonIdentifier(getDatabase(), personId as string, data as Parameters<typeof persons.addPersonIdentifier>[2])
  );
  wrapHandler('persons:getIdentifiers', (personId) =>
    persons.getPersonIdentifiers(getDatabase(), personId as string)
  );
  wrapHandler('persons:deleteIdentifier', (id) =>
    persons.deletePersonIdentifier(getDatabase(), id as string)
  );
  wrapHandler('persons:listPage', (limit, offset) => {
    const db = getDatabase();
    return {
      persons: persons.listPersonsPage(db, limit as number, offset as number),
      total: persons.countPersons(db),
    };
  });
  wrapHandler('persons:searchWithDetails', (query) =>
    persons.searchPersonsWithDetails(getDatabase(), query as string)
  );

  // Relationships
  wrapHandler('relationships:create', (data) => relationships.createRelationship(getDatabase(), data as Parameters<typeof relationships.createRelationship>[1]));
  wrapHandler('relationships:get', (id) => relationships.getRelationship(getDatabase(), id as string));
  wrapHandler('relationships:list', () => relationships.listRelationships(getDatabase()));
  wrapHandler('relationships:listPage', (limit, offset) => {
    const db = getDatabase();
    return {
      relationships: relationships.listRelationshipsPage(db, limit as number, offset as number),
      total: relationships.countRelationships(db),
    };
  });
  wrapHandler('relationships:update', (id, data) => relationships.updateRelationship(getDatabase(), id as string, data as Parameters<typeof relationships.updateRelationship>[2]));
  wrapHandler('relationships:delete', (id) => relationships.deleteRelationship(getDatabase(), id as string));
  wrapHandler('relationships:getForPerson', (personId) => relationships.getRelationshipsOfPerson(getDatabase(), personId as string));
  wrapHandler('relationships:search', (query) => relationships.searchRelationships(getDatabase(), query as string));

  // Event Participants
  wrapHandler('eventParticipants:add', (data) => relationships.addEventParticipant(getDatabase(), data as Parameters<typeof relationships.addEventParticipant>[1]));
  wrapHandler('eventParticipants:getForEvent', (eventId) => relationships.getEventParticipants(getDatabase(), eventId as string));
  wrapHandler('eventParticipants:remove', (id) => relationships.removeEventParticipant(getDatabase(), id as string));

  // Events
  wrapHandler('events:create', (data) => events.createEvent(getDatabase(), data as Parameters<typeof events.createEvent>[1]));
  wrapHandler('events:get', (id) => events.getEvent(getDatabase(), id as string));
  wrapHandler('events:forPerson', (personId) => events.getEventsForPerson(getDatabase(), personId as string));
  wrapHandler('events:forRelationship', (relationshipId) => events.getEventsForRelationship(getDatabase(), relationshipId as string));
  wrapHandler('events:update', (id, data) => events.updateEvent(getDatabase(), id as string, data as Parameters<typeof events.updateEvent>[2]));
  wrapHandler('events:delete', (id) => events.deleteEvent(getDatabase(), id as string));

  // Sources
  wrapHandler('sources:create', (data) => sources.createSource(getDatabase(), data as Parameters<typeof sources.createSource>[1]));
  wrapHandler('sources:get', (id) => sources.getSource(getDatabase(), id as string));
  wrapHandler('sources:list', () => sources.listSources(getDatabase()));
  wrapHandler('sources:update', (id, data) => sources.updateSource(getDatabase(), id as string, data as Parameters<typeof sources.updateSource>[2]));
  wrapHandler('sources:delete', (id) => sources.deleteSource(getDatabase(), id as string));
  wrapHandler('sources:search', (query) => sources.searchSources(getDatabase(), query as string));

  // Citations
  wrapHandler('citations:create', (data) => sources.createCitation(getDatabase(), data as Parameters<typeof sources.createCitation>[1]));
  wrapHandler('citations:get', (id) => sources.getCitation(getDatabase(), id as string));
  wrapHandler('citations:forSource', (sourceId) => sources.getCitationsForSource(getDatabase(), sourceId as string));
  wrapHandler('citations:forEvent', (eventId) => sources.getCitationsForEvent(getDatabase(), eventId as string));
  wrapHandler('citations:forPerson', (personId) => sources.getCitationsForPerson(getDatabase(), personId as string));
  wrapHandler('citations:forRelationship', (relationshipId) => sources.getCitationsForRelationship(getDatabase(), relationshipId as string));
  wrapHandler('citations:forPlace', (placeId) => sources.getCitationsForPlace(getDatabase(), placeId as string));
  wrapHandler('citations:delete', (id) => sources.deleteCitation(getDatabase(), id as string));
  wrapHandler('citations:update', (id, updates) =>
    sources.updateCitation(getDatabase(), id as string, updates as Parameters<typeof sources.updateCitation>[2])
  );

  // Places
  wrapHandler('places:create', (data) => places.createPlace(getDatabase(), data as Parameters<typeof places.createPlace>[1]));
  wrapHandler('places:get', (id) => places.getPlace(getDatabase(), id as string));
  wrapHandler('places:list', () => places.listPlaces(getDatabase()));
  wrapHandler('places:search', (query) => places.searchPlaces(getDatabase(), query as string));
  wrapHandler('places:update', (id, data) => places.updatePlace(getDatabase(), id as string, data as Parameters<typeof places.updatePlace>[2]));
  wrapHandler('places:delete', (id) => places.deletePlace(getDatabase(), id as string));
  wrapHandler('places:findOrCreate', (name) => places.findOrCreatePlace(getDatabase(), name as string));
  wrapHandler('places:getPath', (id) => places.getPlacePath(getDatabase(), id as string));

  // GEDCOM
  wrapHandler('gedcom:import', async (opts) => {
    const options = opts as ImportOptions | undefined;
    const result = await dialog.showOpenDialog({
      title: 'Import GEDCOM File',
      filters: [{ name: 'GEDCOM Files', extensions: ['ged', 'gedcom', 'zip'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    importInProgress = true;
    let tmpDir: string | null = null;
    try {
      return await captureProfile('gedcom-import', () => {
        let gedPath = result.filePaths[0];
        if (path.extname(gedPath).toLowerCase() === '.zip') {
          tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gedcom-import-'));
          const entries = unzipSync(new Uint8Array(fs.readFileSync(gedPath)));
          const gedEntries = Object.entries(entries)
            .filter(([name]) => name.toLowerCase().endsWith('.ged'))
            .sort(([, a], [, b]) => b.length - a.length);
          if (gedEntries.length === 0) throw new Error('No .ged file found inside zip archive.');
          gedPath = path.join(tmpDir, path.basename(gedEntries[0][0]));
          fs.writeFileSync(gedPath, Buffer.from(gedEntries[0][1]));
        }
        const text = readGedcomFile(gedPath);
        const tree = parseGedcom(text);
        const report = importGedcom(getDatabase(), tree, options);
        return { imported: true, filePath: gedPath, report };
      });
    } finally {
      importInProgress = false;
      if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // Genney Derby import
  wrapHandler('import:genneyCheckDocker', () => {
    return { available: isDockerAvailable() };
  });

  wrapHandler('import:genneySelectDerby', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Välj Genney Derby-databasmapp',
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    return { canceled: false, path: result.filePaths[0] };
  });

  wrapHandler('import:genneySelectArchive', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Välj Genney-arkivfil (.gcc, .backup)',
      filters: [{ name: 'Genney-arkiv', extensions: ['gcc', 'backup', 'zip'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    return { canceled: false, path: result.filePaths[0] };
  });

  wrapHandler('import:genneySelectMedia', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Genney media folder (optional)',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    return { canceled: false, path: result.filePaths[0] };
  });

  wrapHandler('import:genneyDiscover', async (opts) => {
    const options = opts as { sourcePath: string; schema?: string } | undefined;
    if (!options?.sourcePath) return { error: 'sourcePath is required' };
    const win = BrowserWindow.getFocusedWindow();
    const tables = await discoverTables(options.sourcePath, {
      schema: options.schema,
      onProgress: (msg) => {
        if (win) win.webContents.send('import:genneyProgress', { message: msg });
      },
    });
    return { tables };
  });

  wrapHandler('import:genneyRun', async (opts) => {
    const options = opts as { sourcePath: string; schema?: string; mediaDir?: string } | undefined;
    if (!options?.sourcePath) return { error: 'sourcePath is required' };
    const win = BrowserWindow.getFocusedWindow();
    // .backup archives bundle a media/ dir — copy it alongside the DB so file_refs survive
    const isBackup = options.sourcePath.toLowerCase().endsWith('.backup');
    const destMediaDir = isBackup
      ? path.join(path.dirname(getCurrentDatabasePath()), 'genney-media')
      : undefined;
    const result = await importFromGenney(getDatabase(), options.sourcePath, {
      schema: options.schema,
      mediaDir: options.mediaDir,
      destMediaDir,
      onProgress: (msg) => {
        if (win) win.webContents.send('import:genneyProgress', { message: msg });
      },
    });
    if (result.gedcomFallbackPath) {
      return { gedcomFallback: true, gedcomPath: result.gedcomFallbackPath };
    }
    return { imported: true, summary: result.summary };
  });

  // Holger / OurKind GEDCOM import
  wrapHandler('import:holgerSelectFile', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Holger GEDCOM export',
      properties: ['openFile'],
      filters: [
        { name: 'GEDCOM / Zip', extensions: ['ged', 'zip'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    return { canceled: false, path: result.filePaths[0] };
  });

  wrapHandler('import:holgerSelectMedia', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select OurKind Media folder (optional)',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    return { canceled: false, path: result.filePaths[0] };
  });

  wrapHandler('import:holgerRun', async (opts) => {
    const options = opts as { sourcePath: string; mediaDir?: string } | undefined;
    if (!options?.sourcePath) return { success: false, error: 'sourcePath is required' };
    const win = BrowserWindow.getFocusedWindow();
    try {
      const result = await importFromHolger(getDatabase(), {
        sourcePath: options.sourcePath,
        mediaDir: options.mediaDir,
        onProgress: (msg) => {
          if (win) win.webContents.send('import:holgerProgress', { message: msg });
        },
      });
      return { success: true, report: result.report };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Database switching
  wrapHandler('db:getCurrent', () => {
    const dbPath = getCurrentDatabasePath();
    return { path: dbPath, name: path.basename(dbPath) };
  });

  wrapHandler('db:getRecent', () => {
    const { recentDatabases } = loadSettings();
    return recentDatabases
      .filter(p => fs.existsSync(p))
      .map(p => ({ path: p, name: path.basename(p) }));
  });

  wrapHandler('db:getSetting', (key) => getDbSetting(getDatabase(), key as string));

  ipcMain.handle('db:createNew', async () => {
    const result = await dialog.showSaveDialog({
      title: 'Ny databas',
      defaultPath: 'slaktforskning.db',
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    switchDatabase(result.filePath);
    BrowserWindow.getAllWindows().forEach(w => w.webContents.send('db:switched'));
    return { path: result.filePath, name: path.basename(result.filePath) };
  });

  ipcMain.handle('db:switchTo', async (_e, dbPath: string) => {
    switchDatabase(dbPath);
    BrowserWindow.getAllWindows().forEach(w => w.webContents.send('db:switched'));
    return { path: dbPath, name: path.basename(dbPath) };
  });

  ipcMain.handle('db:openExisting', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Öppna databas',
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    switchDatabase(result.filePaths[0]);
    BrowserWindow.getAllWindows().forEach(w => w.webContents.send('db:switched'));
    return { path: result.filePaths[0], name: path.basename(result.filePaths[0]) };
  });

  // Groups
  wrapHandler('groups:list', () => groups.listGroups(getDatabase()));
  wrapHandler('groups:get', (id) => groups.getGroup(getDatabase(), id as string));
  wrapHandler('groups:create', (data) => groups.createGroup(getDatabase(), data as Parameters<typeof groups.createGroup>[1]));
  wrapHandler('groups:update', (id, data) => groups.updateGroup(getDatabase(), id as string, data as Parameters<typeof groups.updateGroup>[2]));
  wrapHandler('groups:delete', (id) => groups.deleteGroup(getDatabase(), id as string));
  wrapHandler('groups:addMember', (groupId, personId) => groups.addGroupMember(getDatabase(), groupId as string, personId as string));
  wrapHandler('groups:removeMember', (groupId, personId) => groups.removeGroupMember(getDatabase(), groupId as string, personId as string));
  wrapHandler('groups:getMembers', (groupId) => groups.getGroupMembers(getDatabase(), groupId as string));
  wrapHandler('groups:forPerson', (personId) => groups.getGroupsForPerson(getDatabase(), personId as string));

  // Repositories
  wrapHandler('repositories:list', () => repositories.listRepositories(getDatabase()));
  wrapHandler('repositories:get', (id) => repositories.getRepository(getDatabase(), id as string));
  wrapHandler('repositories:create', (data) => repositories.createRepository(getDatabase(), data as Parameters<typeof repositories.createRepository>[1]));
  wrapHandler('repositories:update', (id, data) => repositories.updateRepository(getDatabase(), id as string, data as Parameters<typeof repositories.updateRepository>[2]));
  wrapHandler('repositories:delete', (id) => repositories.deleteRepository(getDatabase(), id as string));
  wrapHandler('repositories:forSource', (sourceId) => repositories.getRepositoriesForSource(getDatabase(), sourceId as string));
  wrapHandler('repositories:linkSource', (sourceId, repoId) => repositories.linkSourceRepository(getDatabase(), sourceId as string, repoId as string));
  wrapHandler('repositories:unlinkSource', (sourceId, repoId) => repositories.unlinkSourceRepository(getDatabase(), sourceId as string, repoId as string));

  // Research tasks
  wrapHandler('researchTasks:list', () => researchTasks.listResearchTasks(getDatabase()));
  wrapHandler('researchTasks:get', (id) => researchTasks.getResearchTask(getDatabase(), id as string));
  wrapHandler('researchTasks:forPerson', (personId) => researchTasks.getResearchTasksForPerson(getDatabase(), personId as string));
  wrapHandler('researchTasks:create', (data) => researchTasks.createResearchTask(getDatabase(), data as Parameters<typeof researchTasks.createResearchTask>[1]));
  wrapHandler('researchTasks:update', (id, data) => researchTasks.updateResearchTask(getDatabase(), id as string, data as Parameters<typeof researchTasks.updateResearchTask>[2]));
  wrapHandler('researchTasks:delete', (id) => researchTasks.deleteResearchTask(getDatabase(), id as string));

  // Media
  wrapHandler('media:list', () => media.listMedia(getDatabase()));
  wrapHandler('media:get', (id) => media.getMedia(getDatabase(), id as string));
  wrapHandler('media:create', (data) => media.createMedia(getDatabase(), data as Parameters<typeof media.createMedia>[1]));
  wrapHandler('media:delete', (id) => media.deleteMedia(getDatabase(), id as string));
  wrapHandler('media:forEntity', (entityType, entityId) => media.getMediaForEntity(getDatabase(), entityType as Parameters<typeof media.getMediaForEntity>[1], entityId as string));
  wrapHandler('media:addLink', (data) => media.addMediaLink(getDatabase(), data as Parameters<typeof media.addMediaLink>[1]));
  wrapHandler('media:removeLink', (linkId) => media.removeMediaLink(getDatabase(), linkId as string));

  wrapHandler('media:attach', async (data) => {
    const opts = data as { entityType?: string; entityId?: string } | undefined;
    const result = await dialog.showOpenDialog({
      title: 'Välj mediafil',
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };

    const srcPath = result.filePaths[0];
    const dbDir = path.dirname(getCurrentDatabasePath());
    const mediaDir = path.join(dbDir, 'media');
    fs.mkdirSync(mediaDir, { recursive: true });

    const filename = path.basename(srcPath);
    let destPath = path.join(mediaDir, filename);
    // Avoid overwriting: append suffix if file already exists
    if (fs.existsSync(destPath)) {
      const ext = path.extname(filename);
      const base = path.basename(filename, ext);
      const suffix = Date.now();
      destPath = path.join(mediaDir, `${base}_${suffix}${ext}`);
    }
    fs.copyFileSync(srcPath, destPath);

    const fileRef = path.join('media', path.basename(destPath));
    const ext = path.extname(destPath).slice(1).toLowerCase();
    const db = getDatabase();
    const item = media.createMedia(db, {
      file_ref: fileRef,
      title: path.basename(destPath, path.extname(destPath)),
      format: ext || null,
    });

    if (opts?.entityType && opts?.entityId) {
      media.addMediaLink(db, {
        media_id: item.id,
        entity_type: opts.entityType as Parameters<typeof media.addMediaLink>[1]['entity_type'],
        entity_id: opts.entityId,
      });
    }

    return { canceled: false, media: item };
  });

  wrapHandler('media:openFile', async (id) => {
    const item = media.getMedia(getDatabase(), id as string);
    if (!item || !item.file_ref) return { success: false, error: 'Media not found or no file_ref' };
    const dbDir = path.dirname(getCurrentDatabasePath());
    const absPath = path.resolve(dbDir, item.file_ref);
    if (!fs.existsSync(absPath)) return { success: false, error: 'File not found: ' + absPath };
    await shell.openPath(absPath);
    return { success: true };
  });

  wrapHandler('media:getFilePath', (id) => {
    const item = media.getMedia(getDatabase(), id as string);
    if (!item || !item.file_ref) return null;
    const dbDir = path.dirname(getCurrentDatabasePath());
    const absPath = path.resolve(dbDir, item.file_ref);
    return fs.existsSync(absPath) ? absPath : null;
  });

  wrapHandler('media:readAsDataUrl', (id) => {
    const item = media.getMedia(getDatabase(), id as string);
    if (!item || !item.file_ref) return null;
    const dbDir = path.dirname(getCurrentDatabasePath());
    const absPath = path.resolve(dbDir, item.file_ref);
    if (!fs.existsSync(absPath)) return null;
    const ext = path.extname(absPath).toLowerCase().slice(1);
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
    };
    const mime = mimeMap[ext] ?? 'image/jpeg';
    const data = fs.readFileSync(absPath).toString('base64');
    return `data:${mime};base64,${data}`;
  });

  // Checks
  wrapHandler('checks:runAll', () => {
    if (importInProgress) {
      console.log('[IPC] checks:runAll skipped — import in progress');
      return [];
    }
    return captureProfile('checks-runAll', () => {
      const db = getDatabase();
      const raw = checks.runAllChecks(db);
      // Cap notice-severity results per check code to 500 — checks like NO_BIRTH_EVENT
      // can return 20k+ results for large trees, making the name-resolution query very slow.
      const countByCode = new Map<string, number>();
      const capped = raw.filter(r => {
        if (r.severity !== 'notice') return true;
        const n = (countByCode.get(r.code) ?? 0) + 1;
        countByCode.set(r.code, n);
        return n <= 500;
      });
      const allIds = [...new Set(capped.flatMap(r => r.personIds))];
      const nameMap = persons.getPersonDisplayNames(db, allIds);
      return capped.map(r => ({ ...r, personNames: r.personIds.map(id => nameMap.get(id) ?? '') }));
    });
  });
  wrapHandler('checks:forPerson', (personId) => checks.runChecksForPerson(getDatabase(), personId as string));

  wrapHandler('gedcom:export', async (opts?: unknown) => {
    const version = (opts as { version?: string } | undefined)?.version === '7.0' ? '7.0' : '5.5.1';
    const defaultPath = version === '7.0' ? 'family-tree-70.ged' : 'family-tree.ged';
    const result = await dialog.showSaveDialog({
      title: 'Export GEDCOM File',
      defaultPath,
      filters: [{ name: 'GEDCOM Files', extensions: ['ged'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const { ged, report } = exportGedcom(getDatabase(), version);
    fs.writeFileSync(result.filePath, ged, 'utf-8');
    return { exported: true, filePath: result.filePath, report };
  });

  // Backup / Restore
  wrapHandler('backup:backup', async () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return { success: false, error: 'No window' };

    const currentPath = getCurrentDatabasePath();
    const result = await dialog.showSaveDialog(win, {
      title: 'Spara säkerhetskopia',
      defaultPath: path.basename(currentPath).replace('.db', '') + '-backup-' + new Date().toISOString().slice(0, 10) + '.db',
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
    });
    if (result.canceled || !result.filePath) return { success: false, error: 'Cancelled' };

    fs.copyFileSync(currentPath, result.filePath);
    return { success: true, path: result.filePath };
  });

  wrapHandler('backup:restore', async () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return { success: false, error: 'No window' };

    const result = await dialog.showOpenDialog(win, {
      title: 'Välj säkerhetskopia',
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return { success: false, error: 'Cancelled' };

    const backupPath = result.filePaths[0];
    switchDatabase(backupPath);
    BrowserWindow.getAllWindows().forEach(w => w.webContents.send('db:switched'));
    return { success: true, path: backupPath };
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
}
