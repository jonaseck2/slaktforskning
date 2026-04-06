/**
 * E2E: Persons, Navigation, Screenshots, Add Related Person, Search, Citation Badges.
 *
 * Runs on port 19242 with its own Electron instance, in parallel with other gui-* suites.
 */
import { test, expect } from '@playwright/test';
import {
  AppDriver,
  AppInstance,
  startApp,
  teardownApp,
} from './fixture';

const UI_PORT = 19242;
let instance: AppInstance;
const app = new AppDriver(UI_PORT);

test.beforeAll(async () => {
  instance = await startApp(UI_PORT, 'persons');
  await app.settle(150);
  await app.setLocale('en');
});

test.afterAll(async () => {
  await teardownApp(instance);
});

test.setTimeout(30_000);

// ---------------------------------------------------------------------------
// Persons CRUD
// ---------------------------------------------------------------------------

test.describe('Persons CRUD', () => {
  test('empty state shows placeholder', async () => {
    await app.navigate('/');
    await app.expectText('No persons yet');
  });

  test('create a person via the Add Person modal', async () => {
    await app.navigate('/');
    await app.click('button');
    await app.settle();

    await app.executeJs(`
      const inputs = document.querySelectorAll('.modal input[type="text"]');
      const set = (el, val) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      set(inputs[0], 'Erik');
      set(inputs[1], 'Svensson');
    `);
    await app.settle();

    await app.click('.modal button[type="submit"]');
    await app.waitForText('Erik');
    await app.expectText('Svensson');
  });

  test('person appears in list and navigates to detail', async () => {
    await app.navigate('/');
    await app.waitForText('Erik');

    await app.click('.clickable-row');
    await app.waitForText('Erik Svensson');

    await app.expectText('Names');
    await app.expectText('Birth');
  });

  test('person detail shows Notes section', async () => {
    await app.navigate('/');
    await app.waitForText('Erik');
    await app.click('.clickable-row');
    await app.waitForText('Notes');
  });

  test('delete a person from the list', async () => {
    // Seed a person to delete
    await app.createPerson({ given_name: 'Tobias', surname: 'Deleted' });
    await app.navigate('/');
    await app.waitForText('Tobias');

    // Mock window.confirm so the deletion proceeds without a dialog blocking executeJs
    await app.executeJs(`
      window.confirm = () => true;
      const rows = document.querySelectorAll('.clickable-row');
      for (const row of rows) {
        if (row.textContent.includes('Tobias')) {
          row.querySelector('.btn-delete').click();
          break;
        }
      }
    `);
    await app.settle(80);
    await app.navigate('/');
    await app.expectNoText('Tobias Deleted');
  });
});

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

test.describe('Navigation', () => {
  test('sidebar links navigate to correct views', async () => {
    await app.navigate('/');
    await app.expectText('Persons');

    await app.navigate('/relationships');
    await app.expectText('Relationships');

    await app.navigate('/sources');
    await app.expectText('Sources');

    await app.navigate('/places');
    await app.expectText('Places');
  });

  test('detail view back button returns to persons list', async () => {
    const person = await app.createPerson({ given_name: 'Nils', surname: 'Persson', sex: 'M' });
    await app.navigate(`/persons/${person.id}`);
    await app.waitForText('Nils Persson');

    await app.click('.btn-back');
    await app.settle();

    const routePath = await app.executeJs<string>(
      'window.__vue_router.currentRoute.value.path'
    );
    expect(routePath).toBe('/');
  });
});

// ---------------------------------------------------------------------------
// Screenshots
// ---------------------------------------------------------------------------

test.describe('Screenshots', () => {
  test('can capture a PNG screenshot', async () => {
    await app.navigate('/');
    await app.settle();
    const png = await app.screenshot();
    expect(png.length).toBeGreaterThan(1000);
    // Verify PNG magic bytes
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50); // P
    expect(png[2]).toBe(0x4e); // N
    expect(png[3]).toBe(0x47); // G
  });
});

// ---------------------------------------------------------------------------
// Global Search (persons)
// ---------------------------------------------------------------------------

test.describe('Global Search', () => {
  test('search finds persons by name', async () => {
    await app.navigate('/search?q=Erik');
    await app.waitForText('Persons');
    await app.expectText('Erik');
    await app.expectText('Svensson');
  });

  test('search with no results shows message', async () => {
    await app.navigate('/search?q=zzz_nomatch_zzz');
    await app.waitForText('No results');
  });

  test('sidebar search navigates to search view', async () => {
    await app.navigate('/');
    await app.settle();

    await app.executeJs(`
      const input = document.querySelector('.sidebar-search-input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Erik');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    `);
    await app.settle();
    await app.executeJs(`
      document.querySelector('.sidebar-search-input').closest('form').requestSubmit();
    `);
    await app.settle(80);

    const currentPath = await app.executeJs<string>(
      'window.__vue_router.currentRoute.value.fullPath'
    );
    expect(currentPath).toContain('/search');
    expect(currentPath).toContain('Erik');
  });
});

// ---------------------------------------------------------------------------
// Citation Badges
// ---------------------------------------------------------------------------

test.describe('Citation Badges', () => {
  test('new event shows Unsourced badge', async () => {
    const person = await app.createPerson({ given_name: 'Olof', surname: 'Osourced' });
    const event = await app.createEvent({ event_type: 'birth', date_original: '1850' });
    await app.addEventParticipant({ event_id: event.id, person_id: person.id, role: 'primary' });

    await app.navigate(`/persons/${person.id}`);
    await app.waitForText('Olof Osourced');
    await app.expectText('Unsourced');
  });

  test('event with citation shows source-count badge', async () => {
    const person = await app.createPerson({ given_name: 'Birgitta', surname: 'Sourced' });
    const event = await app.createEvent({ event_type: 'birth', date_original: '1860' });
    await app.addEventParticipant({ event_id: event.id, person_id: person.id, role: 'primary' });
    const source = await app.createSource({ title: 'Kyrkbok Badge Test' });
    await app.createCitation({ source_id: source.id, event_id: event.id, confidence: 2 });

    await app.navigate(`/persons/${person.id}`);
    await app.waitForText('Birgitta Sourced');
    const dom = await app.getDom();
    expect(dom).toContain('source-count-badge');
  });

  test('evidence summary div is present', async () => {
    const person = await app.createPerson({ given_name: 'Greta', surname: 'Summary' });
    const evt1 = await app.createEvent({ event_type: 'birth', date_original: '1870' });
    await app.addEventParticipant({ event_id: evt1.id, person_id: person.id, role: 'primary' });
    const source = await app.createSource({ title: 'Kyrkbok Summary Test' });
    await app.createCitation({ source_id: source.id, event_id: evt1.id, confidence: 2 });
    const evt2 = await app.createEvent({ event_type: 'death', date_original: '1940' });
    await app.addEventParticipant({ event_id: evt2.id, person_id: person.id, role: 'primary' });

    await app.navigate(`/persons/${person.id}`);
    await app.waitForText('Greta Summary');
    const dom = await app.getDom();
    expect(dom).toContain('evidence-summary');
  });
});

// ---------------------------------------------------------------------------
// Add Related Person
// ---------------------------------------------------------------------------

test.describe('Add Related Person', () => {
  let basePerson: { id: string };

  test.beforeAll(async () => {
    basePerson = await app.createPerson({ given_name: 'Ingrid', surname: 'Baseperson' });
  });

  test('Add Parent button creates a new person and relationship', async () => {
    await app.navigate('/');
    await app.navigate(`/persons/${basePerson.id}`);
    await app.waitForText('Ingrid Baseperson');

    // Buttons use class .btn-add with text "+ Add Parent" / "+ Add Spouse/Partner" / "+ Add Child"
    await app.executeJs(`
      Array.from(document.querySelectorAll('.btn-add')).find(b => b.textContent.includes('Add Parent')).click()
    `);
    await app.waitAndFill('.modal input[type="text"]', 'Sven');
    await app.settle();
    await app.click('.modal button[type="submit"]');
    await app.settle(100);

    await app.navigate('/');
    await app.navigate(`/persons/${basePerson.id}`);
    await app.waitForText('Sven');
  });

  test('Add Child button creates a new person and relationship', async () => {
    await app.navigate('/');
    await app.navigate(`/persons/${basePerson.id}`);
    await app.waitForText('Ingrid Baseperson');

    await app.executeJs(`
      Array.from(document.querySelectorAll('.btn-add')).find(b => b.textContent.includes('Add Child')).click()
    `);
    await app.waitAndFill('.modal input[type="text"]', 'Lisa');
    await app.click('.modal button[type="submit"]');
    await app.settle(100);

    await app.navigate('/');
    await app.navigate(`/persons/${basePerson.id}`);
    await app.waitForText('Lisa');
  });

  test('Add Spouse button creates a new person and relationship', async () => {
    await app.navigate('/');
    await app.navigate(`/persons/${basePerson.id}`);
    await app.waitForText('Ingrid Baseperson');

    await app.executeJs(`
      Array.from(document.querySelectorAll('.btn-add')).find(b => b.textContent.includes('Spouse')).click()
    `);
    await app.waitAndFill('.modal input[type="text"]', 'Erik');
    await app.click('.modal button[type="submit"]');
    await app.settle(100);

    await app.navigate('/');
    await app.navigate(`/persons/${basePerson.id}`);
    await app.waitForText('Erik');
  });
});
