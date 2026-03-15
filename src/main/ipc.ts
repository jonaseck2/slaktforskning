import { ipcMain } from 'electron';
import { getDatabase } from './database';
import * as persons from '../api/persons';
import * as families from '../api/families';
import * as events from '../api/events';
import * as sources from '../api/sources';

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

  // Families
  wrapHandler('families:create', (data) => families.createFamily(db, data as Parameters<typeof families.createFamily>[1]));
  wrapHandler('families:get', (id) => families.getFamily(db, id as string));
  wrapHandler('families:list', () => families.listFamilies(db));
  wrapHandler('families:update', (id, data) => families.updateFamily(db, id as string, data as Parameters<typeof families.updateFamily>[2]));
  wrapHandler('families:delete', (id) => families.deleteFamily(db, id as string));
  wrapHandler('families:addChild', (familyId, personId, relType) => families.addChildToFamily(db, familyId as string, personId as string, relType as Parameters<typeof families.addChildToFamily>[3]));
  wrapHandler('families:getChildren', (familyId) => families.getChildrenOfFamily(db, familyId as string));
  wrapHandler('families:getForPerson', (personId) => families.getFamiliesOfPerson(db, personId as string));

  // Events
  wrapHandler('events:create', (data) => events.createEvent(db, data as Parameters<typeof events.createEvent>[1]));
  wrapHandler('events:get', (id) => events.getEvent(db, id as string));
  wrapHandler('events:forPerson', (personId) => events.getEventsForPerson(db, personId as string));
  wrapHandler('events:forFamily', (familyId) => events.getEventsForFamily(db, familyId as string));
  wrapHandler('events:update', (id, data) => events.updateEvent(db, id as string, data as Parameters<typeof events.updateEvent>[2]));
  wrapHandler('events:delete', (id) => events.deleteEvent(db, id as string));

  // Sources
  wrapHandler('sources:create', (data) => sources.createSource(db, data as Parameters<typeof sources.createSource>[1]));
  wrapHandler('sources:get', (id) => sources.getSource(db, id as string));
  wrapHandler('sources:list', () => sources.listSources(db));
  wrapHandler('sources:update', (id, data) => sources.updateSource(db, id as string, data as Parameters<typeof sources.updateSource>[2]));
  wrapHandler('sources:delete', (id) => sources.deleteSource(db, id as string));

  // Citations
  wrapHandler('citations:create', (data) => sources.createCitation(db, data as Parameters<typeof sources.createCitation>[1]));
  wrapHandler('citations:get', (id) => sources.getCitation(db, id as string));
  wrapHandler('citations:forSource', (sourceId) => sources.getCitationsForSource(db, sourceId as string));
  wrapHandler('citations:forEvent', (eventId) => sources.getCitationsForEvent(db, eventId as string));
  wrapHandler('citations:delete', (id) => sources.deleteCitation(db, id as string));
}
