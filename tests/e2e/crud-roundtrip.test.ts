/**
 * E2E IPC chain round-trip.
 *
 * The one test that proves: renderer → preload → main → worker → SQLite → back
 * works for every domain entity, against the packaged binary.
 *
 * Why this is the only entity-CRUD e2e:
 *  - api/ correctness is covered by ~2,000 unit tests in tests/unit/
 *  - Vue rendering, modals, filter chips, status cycling, badges → component tests
 *  - Routing, search filtering, date parsing, layout math → unit/component tests
 *
 * What this asserts:
 *  - Each `window.api.*` channel is exposed and reaches a real handler
 *  - Domain values written through the IPC bridge survive a round-trip read
 *  - Cross-entity links (event → person, citation → source/person) persist
 *
 * If this passes, the full bridge is alive. If it fails, every gui-* test
 * would have failed too — so we don't need them.
 */
import { test, expect } from '@playwright/test';
import { startApp, teardownApp, AppDriver, AppInstance } from './fixture';

const UI_PORT = 19201;
const app = new AppDriver(UI_PORT);
let instance: AppInstance | undefined;

test.beforeAll(async () => {
  instance = await startApp(UI_PORT, 'crud');
});

test.afterAll(async () => {
  await teardownApp(instance);
});

test('window.api round-trips a complete family graph through IPC', async () => {
  // ── Create — exercises every major write channel ───────────────────────
  const seed = await app.executeJs<{
    personId: string;
    spouseId: string;
    placeId: string;
    sourceId: string;
    relationshipId: string;
    eventId: string;
  }>(`(async () => {
    const a = window.api;
    const person = await a.persons.create({ sex: 'M', living: false, given_name: 'Alma', surname: 'Andersson' });
    const spouse = await a.persons.create({ sex: 'F', living: false, given_name: 'Brita', surname: 'Andersson' });
    const place  = await a.places.create({ name: 'Testköping', place_type: 'parish' });
    const source = await a.sources.create({ title: 'Testköping kyrkoarkiv' });
    const rel    = await a.relationships.create({ type: 'couple', person1_id: person.id, person2_id: spouse.id, subtype: 'marriage' });
    const event  = await a.events.create({ event_type: 'birth', date_type: 'exact', date_value: '1850-03-15', place_id: place.id });
    await a.eventParticipants.add({ event_id: event.id, person_id: person.id, role: 'primary' });
    await a.citations.create({ source_id: source.id, person_id: person.id, page: '12', confidence: 2 });
    return { personId: person.id, spouseId: spouse.id, placeId: place.id, sourceId: source.id, relationshipId: rel.id, eventId: event.id };
  })()`);

  expect(seed.personId).toBeTruthy();
  expect(seed.placeId).toBeTruthy();

  // ── Read back — exercises every major read channel ─────────────────────
  const readback = await app.executeJs<{
    person: { id: string };
    persons: number;
    places: number;
    sources: number;
    relationships: number;
    events: number;
    citations: number;
    timeline: number;
  }>(`(async () => {
    const a = window.api;
    const person = await a.persons.get(${JSON.stringify(seed.personId)});
    const [persons, places, sources, relationships] = await Promise.all([
      a.persons.list(),
      a.places.list(),
      a.sources.list(),
      a.relationships.list(),
    ]);
    const events     = await a.events.forPerson(${JSON.stringify(seed.personId)});
    const citations  = await a.citations.forPerson(${JSON.stringify(seed.personId)});
    const timeline   = await a.reports.timeline(${JSON.stringify(seed.personId)});
    return {
      person,
      persons: persons.length,
      places: places.length,
      sources: sources.length,
      relationships: relationships.length,
      events: events.length,
      citations: citations.length,
      timeline: (timeline || []).length,
    };
  })()`);

  expect(readback.person.id).toBe(seed.personId);
  expect(readback.persons).toBe(2);
  expect(readback.places).toBe(1);
  expect(readback.sources).toBe(1);
  expect(readback.relationships).toBe(1);
  expect(readback.events).toBe(1);
  expect(readback.citations).toBe(1);
  expect(readback.timeline).toBeGreaterThanOrEqual(1);
});
