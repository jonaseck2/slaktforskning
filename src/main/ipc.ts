import { ipcMain } from 'electron';
import { getDatabase } from './database';
import * as persons from '../api/persons';
import * as families from '../api/families';
import * as events from '../api/events';
import * as sources from '../api/sources';

export function registerIpcHandlers(): void {
  const db = getDatabase();

  // Persons
  ipcMain.handle('persons:create', (_e, data) => persons.createPerson(db, data));
  ipcMain.handle('persons:get', (_e, id) => persons.getPerson(db, id));
  ipcMain.handle('persons:list', () => persons.listPersons(db));
  ipcMain.handle('persons:update', (_e, id, data) => persons.updatePerson(db, id, data));
  ipcMain.handle('persons:delete', (_e, id) => persons.deletePerson(db, id));
  ipcMain.handle('persons:search', (_e, query) => persons.searchPersons(db, query));
  ipcMain.handle('persons:addName', (_e, personId, data) => persons.addPersonName(db, personId, data));
  ipcMain.handle('persons:getNames', (_e, personId) => persons.getPersonNames(db, personId));

  // Families
  ipcMain.handle('families:create', (_e, data) => families.createFamily(db, data));
  ipcMain.handle('families:get', (_e, id) => families.getFamily(db, id));
  ipcMain.handle('families:list', () => families.listFamilies(db));
  ipcMain.handle('families:update', (_e, id, data) => families.updateFamily(db, id, data));
  ipcMain.handle('families:delete', (_e, id) => families.deleteFamily(db, id));
  ipcMain.handle('families:addChild', (_e, familyId, personId, relType) => families.addChildToFamily(db, familyId, personId, relType));
  ipcMain.handle('families:getChildren', (_e, familyId) => families.getChildrenOfFamily(db, familyId));
  ipcMain.handle('families:getForPerson', (_e, personId) => families.getFamiliesOfPerson(db, personId));

  // Events
  ipcMain.handle('events:create', (_e, data) => events.createEvent(db, data));
  ipcMain.handle('events:get', (_e, id) => events.getEvent(db, id));
  ipcMain.handle('events:forPerson', (_e, personId) => events.getEventsForPerson(db, personId));
  ipcMain.handle('events:forFamily', (_e, familyId) => events.getEventsForFamily(db, familyId));
  ipcMain.handle('events:update', (_e, id, data) => events.updateEvent(db, id, data));
  ipcMain.handle('events:delete', (_e, id) => events.deleteEvent(db, id));

  // Sources
  ipcMain.handle('sources:create', (_e, data) => sources.createSource(db, data));
  ipcMain.handle('sources:get', (_e, id) => sources.getSource(db, id));
  ipcMain.handle('sources:list', () => sources.listSources(db));
  ipcMain.handle('sources:update', (_e, id, data) => sources.updateSource(db, id, data));
  ipcMain.handle('sources:delete', (_e, id) => sources.deleteSource(db, id));

  // Citations
  ipcMain.handle('citations:create', (_e, data) => sources.createCitation(db, data));
  ipcMain.handle('citations:get', (_e, id) => sources.getCitation(db, id));
  ipcMain.handle('citations:forSource', (_e, sourceId) => sources.getCitationsForSource(db, sourceId));
  ipcMain.handle('citations:forEvent', (_e, eventId) => sources.getCitationsForEvent(db, eventId));
  ipcMain.handle('citations:delete', (_e, id) => sources.deleteCitation(db, id));
}
