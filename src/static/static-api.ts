import type { Snapshot } from '../api/html_site/snapshot';

// Indices built once from the snapshot for O(1) lookups
interface Indices {
  personById: Map<string, Snapshot['persons'][number]>;
  namesByPerson: Map<string, Snapshot['personNames']>;
  idsByPerson: Map<string, Snapshot['personIds']>;
}

function buildIndices(s: Snapshot): Indices {
  const personById = new Map(s.persons.map(p => [p.id, p]));

  const namesByPerson = new Map<string, Snapshot['personNames']>();
  for (const n of s.personNames) {
    const list = namesByPerson.get(n.person_id) ?? [];
    list.push(n);
    namesByPerson.set(n.person_id, list);
  }

  const idsByPerson = new Map<string, Snapshot['personIds']>();
  for (const i of s.personIds) {
    const list = idsByPerson.get(i.person_id) ?? [];
    list.push(i);
    idsByPerson.set(i.person_id, list);
  }

  return { personById, namesByPerson, idsByPerson };
}

export function installStaticApiWith(snapshot: Snapshot): void {
  const idx = buildIndices(snapshot);

  const personsWithNames = snapshot.persons.map(p => {
    const name = idx.namesByPerson.get(p.id)?.[0];
    return { ...p, given_name: name?.given_name ?? '', surname: name?.surname ?? '' };
  });

  const personsApi = {
    async listPage(limit: number, offset: number) {
      return { persons: personsWithNames.slice(offset, offset + limit), total: personsWithNames.length };
    },
    async list() {
      return personsWithNames;
    },
    async get(id: string) {
      return idx.personById.get(id) ?? null;
    },
    async getNames(personId: string) {
      return idx.namesByPerson.get(personId) ?? [];
    },
    async getIdentifiers(personId: string) {
      return idx.idsByPerson.get(personId) ?? [];
    },
    async search(q: string) {
      const ql = q.toLowerCase();
      return personsWithNames.filter(p =>
        (p.given_name && p.given_name.toLowerCase().includes(ql)) ||
        (p.surname && p.surname.toLowerCase().includes(ql))
      );
    },
    // No-op mutating methods (static site is read-only)
    async create() { return null; },
    async update() { return null; },
    async delete() { return false; },
    async addName() { return null; },
    async deleteName() { return false; },
    async createWithEvent() { return null; },
  };

  (globalThis as { api: unknown }).api = {
    persons: personsApi,
    // Other namespaces added in Task 10
    db: {
      async getSetting(key: string) {
        return (snapshot.settings as Record<string, unknown>)[key] ?? null;
      },
      async setSetting() {},
      async deleteSetting() {},
      onSwitched() {},
    },
    undo: {
      onPerformed() {},
      onChanged() {},
    },
    onDataChanged() {},
    checks: {
      async runAll() { return null; },
    },
  };
}

export async function installStaticApi(): Promise<void> {
  const res = await fetch('./data.json');
  const snap = (await res.json()) as Snapshot;
  installStaticApiWith(snap);
}
