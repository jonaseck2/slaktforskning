import * as persons from '../../api/persons';
import * as uw from '../../api/undo_wrappers';
import type { WrapHandlerFn } from './wrap-handler';

export function registerPersonHandlers(getDb: () => ReturnType<typeof import('../database').getDatabase>, wrapHandler: WrapHandlerFn) {
  // Persons (undo-wrapped)
  wrapHandler('persons:create', (data) => uw.createPersonUndo(getDb(), data as Parameters<typeof persons.createPerson>[1]));
  wrapHandler('persons:get', (id) => persons.getPerson(getDb(), id as string));
  wrapHandler('persons:list', () => persons.listPersons(getDb()));
  wrapHandler('persons:update', (id, data) => uw.updatePersonUndo(getDb(), id as string, data as Parameters<typeof persons.updatePerson>[2]));
  wrapHandler('persons:delete', (id) => uw.deletePersonUndo(getDb(), id as string));
  wrapHandler('persons:search', (query) => persons.searchPersons(getDb(), query as string));
  wrapHandler('persons:addName', (personId, data) => uw.addPersonNameUndo(getDb(), personId as string, data as Parameters<typeof persons.addPersonName>[2]));
  wrapHandler('persons:getNames', (personId) => persons.getPersonNames(getDb(), personId as string));
  wrapHandler('persons:updateName', (id, data) => uw.updatePersonNameUndo(getDb(), id as string, data as Parameters<typeof persons.updatePersonName>[2]));
  wrapHandler('persons:deleteName', (id: string) =>
    uw.deletePersonNameUndo(getDb(), id)
  );
  wrapHandler('persons:addIdentifier', (personId, data) =>
    persons.addPersonIdentifier(getDb(), personId as string, data as Parameters<typeof persons.addPersonIdentifier>[2])
  );
  wrapHandler('persons:getIdentifiers', (personId) =>
    persons.getPersonIdentifiers(getDb(), personId as string)
  );
  wrapHandler('persons:deleteIdentifier', (id) =>
    persons.deletePersonIdentifier(getDb(), id as string)
  );
  wrapHandler('persons:listPage', (limit, offset) => {
    const db = getDb();
    return {
      persons: persons.listPersonsPage(db, limit as number, offset as number),
      total: persons.countPersons(db),
    };
  });
  wrapHandler('persons:searchWithDetails', (query) =>
    persons.searchPersonsWithDetails(getDb(), query as string)
  );
  wrapHandler('persons:listUnsourcedPage', (limit, offset) => {
    const db = getDb();
    return {
      persons: persons.listUnsourcedPersonsPage(db, limit as number, offset as number),
      total: persons.countUnsourcedPersons(db),
    };
  });
}
