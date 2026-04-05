import { ipcMain, dialog, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { getDatabase, getCurrentDatabasePath, switchDatabase } from './database';
import { loadSettings } from './settings';
import * as persons from '../api/persons';
import * as relationships from '../api/relationships';
import * as events from '../api/events';
import * as sources from '../api/sources';
import * as places from '../api/places';
import { parseGedcom, importGedcom, exportGedcom } from '../gedcom';
import type { ImportOptions } from '../gedcom/importer';
import { importFromGenney, discoverTables, isDockerAvailable } from '../import/genney/index';
import * as groups from '../api/groups';
import * as repositories from '../api/repositories';
import * as researchTasks from '../api/research_tasks';
import * as media from '../api/media';
import * as checks from '../api/checks';

function wrapHandler(channel: string, handler: (...args: unknown[]) => unknown) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      console.log(`[IPC] ${channel}`, args);
      const result = handler(...args);
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

  // Relationships
  wrapHandler('relationships:create', (data) => relationships.createRelationship(getDatabase(), data as Parameters<typeof relationships.createRelationship>[1]));
  wrapHandler('relationships:get', (id) => relationships.getRelationship(getDatabase(), id as string));
  wrapHandler('relationships:list', () => relationships.listRelationships(getDatabase()));
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
      filters: [{ name: 'GEDCOM Files', extensions: ['ged', 'gedcom'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    const text = fs.readFileSync(result.filePaths[0], 'utf-8');
    const tree = parseGedcom(text);
    const report = importGedcom(getDatabase(), tree, options);
    return { imported: true, filePath: result.filePaths[0], report };
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
    const options = opts as { sourcePath: string; schema?: string } | undefined;
    if (!options?.sourcePath) return { error: 'sourcePath is required' };
    const win = BrowserWindow.getFocusedWindow();
    const result = await importFromGenney(getDatabase(), options.sourcePath, {
      schema: options.schema,
      onProgress: (msg) => {
        if (win) win.webContents.send('import:genneyProgress', { message: msg });
      },
    });
    if (result.gedcomFallbackPath) {
      return { gedcomFallback: true, gedcomPath: result.gedcomFallbackPath };
    }
    return { imported: true, summary: result.summary };
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

  // Checks
  wrapHandler('checks:runAll', () => checks.runAllChecks(getDatabase()));
  wrapHandler('checks:forPerson', (personId) => checks.runChecksForPerson(getDatabase(), personId as string));

  wrapHandler('gedcom:export', async () => {
    const result = await dialog.showSaveDialog({
      title: 'Export GEDCOM File',
      defaultPath: 'family-tree.ged',
      filters: [{ name: 'GEDCOM Files', extensions: ['ged'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const gedText = exportGedcom(getDatabase());
    fs.writeFileSync(result.filePath, gedText, 'utf-8');
    return { exported: true, filePath: result.filePath };
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
