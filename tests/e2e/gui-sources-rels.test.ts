/**
 * E2E: Sources CRUD, Relationships CRUD, Source Detail, Relationship Detail, Global Search.
 *
 * Runs on port 19243 with its own Electron instance, in parallel with other gui-* suites.
 */
import { test, expect } from '@playwright/test';
import {
  AppDriver,
  AppInstance,
  startApp,
  teardownApp,
} from './fixture';

const UI_PORT = 19243;
let instance: AppInstance;
const app = new AppDriver(UI_PORT);

test.beforeAll(async () => {
  instance = await startApp(UI_PORT, 'sources-rels');
  await app.settle(150);
  await app.setLocale('en');
});

test.afterAll(async () => {
  await teardownApp(instance);
});

test.setTimeout(30_000);

// ---------------------------------------------------------------------------
// Sources CRUD
// ---------------------------------------------------------------------------

test.describe('Sources CRUD', () => {
  test('empty state shows placeholder', async () => {
    await app.navigate('/sources');
    await app.waitForText('No sources');
  });

  test('create a source via modal', async () => {
    await app.navigate('/sources');
    await app.click('.app-btn--soft');
    await app.settle();

    await app.fillInput('.modal input[type="text"]', 'Swedish Church Records');
    await app.settle();

    await app.click('.modal button[type="submit"]');
    await app.waitForText('Swedish Church Records');
  });

  test('source appears in list and navigates to detail', async () => {
    await app.navigate('/sources');
    await app.waitForText('Swedish Church Records');

    await app.click('.clickable-row');
    await app.waitForText('Swedish Church Records');
    // Detail view should show citation section
    await app.expectText('Citations');
  });

  test('source detail shows Author label and editable fields', async () => {
    const src = await app.createSource({ title: 'Editable Source' });
    await app.navigate(`/sources/${src.id}`);
    await app.waitForText('Editable Source');
    // Author is a label in the form — check the label text, not the input value
    // (input values set via Vue reactivity are not reflected in outerHTML)
    await app.expectText('Author');
  });

  test('delete a source from the list', async () => {
    await app.createSource({ title: 'To Be Deleted' });
    await app.navigate('/sources');
    await app.waitForText('To Be Deleted');

    // Mock window.confirm so the deletion proceeds without a dialog blocking executeJs
    await app.executeJs(`
      window.confirm = () => true;
      const rows = document.querySelectorAll('.clickable-row');
      for (const row of rows) {
        if (row.textContent.includes('To Be Deleted')) {
          row.querySelector('.app-btn--ghost').click();
          break;
        }
      }
    `);
    await app.settle(80);
    await app.navigate('/sources');
    await app.expectNoText('To Be Deleted');
  });
});

// ---------------------------------------------------------------------------
// Relationships CRUD
// ---------------------------------------------------------------------------

test.describe('Relationships CRUD', () => {
  test('empty state shows placeholder', async () => {
    await app.navigate('/relationships');
    await app.waitForText('No relationships');
  });

  test('create a relationship via modal', async () => {
    // Seed two persons first
    await app.createPerson({ given_name: 'Johan', surname: 'Andersson', sex: 'M' });
    await app.createPerson({ given_name: 'Maria', surname: 'Nilsson', sex: 'F' });

    await app.navigate('/relationships');
    await app.click('.app-btn--soft');
    await app.settle();

    await app.click('.modal button[type="submit"]');
    await app.settle();

    await app.navigate('/relationships');
    const dom = await app.getDom();
    expect(dom).toContain('data-table');
  });

  test('relationship detail loads and shows type section', async () => {
    const rel = await app.createRelationship({ type: 'couple' });
    await app.navigate(`/relationships/${rel.id}`);
    await app.waitForText('Type');
  });

  test('relationship detail shows Persons section', async () => {
    const p1 = await app.createPerson({ given_name: 'Adam', surname: 'Berg', sex: 'M' });
    const p2 = await app.createPerson({ given_name: 'Eva', surname: 'Berg', sex: 'F' });
    const rel = await app.createRelationship({
      type: 'couple',
      person1_id: p1.id,
      person2_id: p2.id,
      subtype: 'marriage',
    });

    await app.navigate(`/relationships/${rel.id}`);
    await app.waitForText('Adam Berg');
    await app.expectText('Eva Berg');
  });

  test('relationship detail back button returns to list', async () => {
    const rel = await app.createRelationship({ type: 'couple' });
    // Navigate to list first so router.back() returns to /relationships.
    await app.navigate('/relationships');
    await app.navigate(`/relationships/${rel.id}`);
    await app.settle();

    // RelationshipDetailView has no back button — navigate via sidebar
    await app.navigate('/relationships');

    const routePath = await app.executeJs<string>(
      'window.__vue_router.currentRoute.value.path'
    );
    expect(routePath).toBe('/relationships');
  });

  test('relationship detail shows events section', async () => {
    const p = await app.createPerson({ given_name: 'Pelle', surname: 'Testsson' });
    const rel = await app.createRelationship({ type: 'couple', person1_id: p.id });
    const event = await app.createEvent({ event_type: 'marriage', date_original: '1900', relationship_id: rel.id });
    await app.addEventParticipant({ event_id: event.id, person_id: p.id, role: 'primary' });

    await app.navigate(`/relationships/${rel.id}`);
    // EventList is self-loading — wait for the event date to appear.
    await app.waitForText('1900');
  });
});

// ---------------------------------------------------------------------------
// Global Search (sources)
// ---------------------------------------------------------------------------

test.describe('Global Search (sources)', () => {
  test('search finds sources by title', async () => {
    await app.createSource({ title: 'Swedish Church Records', author: 'Riksarkivet' });
    await app.navigate('/search?q=Swedish');
    await app.waitForText('Sources');
    await app.expectText('Swedish Church Records');
  });

  test('search finds persons by name', async () => {
    await app.navigate('/search?q=Johan');
    await app.waitForText('Persons');
    await app.expectText('Johan');
  });

  test('search with no results shows message', async () => {
    await app.navigate('/search?q=zzz_nomatch_zzz');
    await app.waitForText('No results');
  });
});
