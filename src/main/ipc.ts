import { ipcMain, dialog } from 'electron';
import * as fs from 'fs';
import { getDatabase } from './database';
import * as persons from '../api/persons';
import * as relationships from '../api/relationships';
import * as events from '../api/events';
import * as sources from '../api/sources';
import * as places from '../api/places';
import { parseGedcom, importGedcom, exportGedcom } from '../gedcom';
import type { ImportOptions } from '../gedcom/importer';

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
  const db = getDatabase();

  // Persons
  wrapHandler('persons:create', (data) => persons.createPerson(db, data as Parameters<typeof persons.createPerson>[1]));
  wrapHandler('persons:get', (id) => persons.getPerson(db, id as string));
  wrapHandler('persons:list', () => persons.listPersons(db));
  wrapHandler('persons:update', (id, data) => persons.updatePerson(db, id as string, data as Parameters<typeof persons.updatePerson>[2]));
  wrapHandler('persons:delete', (id) => persons.deletePerson(db, id as string));
  wrapHandler('persons:search', (query) => persons.searchPersons(db, query as string));
  wrapHandler('persons:addName', (personId, data) => persons.addPersonName(db, personId as string, data as Parameters<typeof persons.addPersonName>[2]));
  wrapHandler('persons:getNames', (personId) => persons.getPersonNames(db, personId as string));
  wrapHandler('persons:updateName', (id, data) => persons.updatePersonName(db, id as string, data as Parameters<typeof persons.updatePersonName>[2]));
  wrapHandler('persons:deleteName', (id: string) =>
    persons.deletePersonName(db, id)
  );
  wrapHandler('persons:addIdentifier', (personId, data) =>
    persons.addPersonIdentifier(db, personId as string, data as Parameters<typeof persons.addPersonIdentifier>[2])
  );
  wrapHandler('persons:getIdentifiers', (personId) =>
    persons.getPersonIdentifiers(db, personId as string)
  );
  wrapHandler('persons:deleteIdentifier', (id) =>
    persons.deletePersonIdentifier(db, id as string)
  );

  // Relationships
  wrapHandler('relationships:create', (data) => relationships.createRelationship(db, data as Parameters<typeof relationships.createRelationship>[1]));
  wrapHandler('relationships:get', (id) => relationships.getRelationship(db, id as string));
  wrapHandler('relationships:list', () => relationships.listRelationships(db));
  wrapHandler('relationships:update', (id, data) => relationships.updateRelationship(db, id as string, data as Parameters<typeof relationships.updateRelationship>[2]));
  wrapHandler('relationships:delete', (id) => relationships.deleteRelationship(db, id as string));
  wrapHandler('relationships:getForPerson', (personId) => relationships.getRelationshipsOfPerson(db, personId as string));
  wrapHandler('relationships:search', (query) => relationships.searchRelationships(db, query as string));

  // Event Participants
  wrapHandler('eventParticipants:add', (data) => relationships.addEventParticipant(db, data as Parameters<typeof relationships.addEventParticipant>[1]));
  wrapHandler('eventParticipants:getForEvent', (eventId) => relationships.getEventParticipants(db, eventId as string));
  wrapHandler('eventParticipants:remove', (id) => relationships.removeEventParticipant(db, id as string));

  // Events
  wrapHandler('events:create', (data) => events.createEvent(db, data as Parameters<typeof events.createEvent>[1]));
  wrapHandler('events:get', (id) => events.getEvent(db, id as string));
  wrapHandler('events:forPerson', (personId) => events.getEventsForPerson(db, personId as string));
  wrapHandler('events:forRelationship', (relationshipId) => events.getEventsForRelationship(db, relationshipId as string));
  wrapHandler('events:update', (id, data) => events.updateEvent(db, id as string, data as Parameters<typeof events.updateEvent>[2]));
  wrapHandler('events:delete', (id) => events.deleteEvent(db, id as string));

  // Sources
  wrapHandler('sources:create', (data) => sources.createSource(db, data as Parameters<typeof sources.createSource>[1]));
  wrapHandler('sources:get', (id) => sources.getSource(db, id as string));
  wrapHandler('sources:list', () => sources.listSources(db));
  wrapHandler('sources:update', (id, data) => sources.updateSource(db, id as string, data as Parameters<typeof sources.updateSource>[2]));
  wrapHandler('sources:delete', (id) => sources.deleteSource(db, id as string));
  wrapHandler('sources:search', (query) => sources.searchSources(db, query as string));

  // Citations
  wrapHandler('citations:create', (data) => sources.createCitation(db, data as Parameters<typeof sources.createCitation>[1]));
  wrapHandler('citations:get', (id) => sources.getCitation(db, id as string));
  wrapHandler('citations:forSource', (sourceId) => sources.getCitationsForSource(db, sourceId as string));
  wrapHandler('citations:forEvent', (eventId) => sources.getCitationsForEvent(db, eventId as string));
  wrapHandler('citations:forPerson', (personId) => sources.getCitationsForPerson(db, personId as string));
  wrapHandler('citations:forRelationship', (relationshipId) => sources.getCitationsForRelationship(db, relationshipId as string));
  wrapHandler('citations:forPlace', (placeId) => sources.getCitationsForPlace(db, placeId as string));
  wrapHandler('citations:delete', (id) => sources.deleteCitation(db, id as string));

  // Places
  wrapHandler('places:create', (data) => places.createPlace(db, data as Parameters<typeof places.createPlace>[1]));
  wrapHandler('places:get', (id) => places.getPlace(db, id as string));
  wrapHandler('places:list', () => places.listPlaces(db));
  wrapHandler('places:search', (query) => places.searchPlaces(db, query as string));
  wrapHandler('places:update', (id, data) => places.updatePlace(db, id as string, data as Parameters<typeof places.updatePlace>[2]));
  wrapHandler('places:delete', (id) => places.deletePlace(db, id as string));
  wrapHandler('places:findOrCreate', (name) => places.findOrCreatePlace(db, name as string));

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
    importGedcom(getDatabase(), tree, options);
    return { imported: true, filePath: result.filePaths[0] };
  });

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
}
