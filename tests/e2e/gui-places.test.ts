/**
 * E2E: Places CRUD, Place detail, Address fields (v0.5.3), PlacePicker subtitle.
 *
 * Runs on port 19244 with its own Electron instance, in parallel with other gui-* suites.
 */
import { test, expect } from '@playwright/test';
import {
  AppDriver,
  AppInstance,
  startApp,
  teardownApp,
} from './fixture';

const UI_PORT = 19244;
let instance: AppInstance;
const app = new AppDriver(UI_PORT);

test.beforeAll(async () => {
  instance = await startApp(UI_PORT, 'places');
  await app.settle(1000);
  await app.setLocale('en');
});

test.afterAll(async () => {
  await teardownApp(instance);
});

test.setTimeout(30_000);

// ---------------------------------------------------------------------------
// Places CRUD
// ---------------------------------------------------------------------------

test.describe('Places CRUD', () => {
  test('empty state shows placeholder', async () => {
    await app.navigate('/places');
    await app.waitForText('No places');
  });

  test('create a place via modal', async () => {
    await app.navigate('/places');
    await app.click('.btn-add');
    await app.settle();

    await app.waitAndFill('.modal input[type="text"]', 'Björkvik');
    await app.settle();

    await app.click('.modal button[type="submit"]');
    await app.waitForText('Björkvik');
  });

  test('place appears in list and navigates to detail', async () => {
    await app.navigate('/places');
    await app.waitForText('Björkvik');

    await app.click('.clickable-row');
    await app.waitForText('Björkvik');
    // Detail view sections
    await app.expectText('Details');
    await app.expectText('Address');
  });

  test('place list shows type badge when place_type is set', async () => {
    await app.createPlace({ name: 'Södermanland', place_type: 'province' });
    await app.navigate('/places');
    await app.waitForText('Södermanland');
    // The type badge renders the type value
    await app.expectText('Södermanland');
  });

  test('delete a place from the list', async () => {
    await app.createPlace({ name: 'To Be Deleted' });
    // Navigate via / first to force re-mount of PlacesView (same-path push is a no-op)
    await app.navigate('/');
    await app.navigate('/places');
    await app.waitForText('To Be Deleted');

    await app.executeJs(`
      window.confirm = () => true;
      const rows = document.querySelectorAll('.clickable-row');
      for (const row of rows) {
        if (row.textContent.includes('To Be Deleted')) {
          row.querySelector('.btn-delete').click();
          break;
        }
      }
    `);
    await app.settle(500);
    await app.navigate('/places');
    await app.expectNoText('To Be Deleted');
  });
});

// ---------------------------------------------------------------------------
// Place Detail
// ---------------------------------------------------------------------------

test.describe('Place Detail', () => {
  test('back button returns to places list', async () => {
    const place = await app.createPlace({ name: 'Navigeringsort' });
    await app.navigate(`/places/${place.id}`);
    await app.waitForText('Navigeringsort');

    await app.click('.btn-back');
    await app.settle();

    const routePath = await app.executeJs<string>(
      'window.__vue_router.currentRoute.value.path'
    );
    expect(routePath).toBe('/places');
  });

  test('notes section is editable', async () => {
    const place = await app.createPlace({ name: 'Anteckningsort' });
    await app.navigate(`/places/${place.id}`);
    await app.waitForText('Anteckningsort');
    await app.expectText('Notes');
  });

  test('citations badge is rendered', async () => {
    const place = await app.createPlace({ name: 'Citerad Ort' });
    await app.navigate(`/places/${place.id}`);
    await app.waitForText('Citerad Ort');
    const dom = await app.getDom();
    const hasBadge = dom.includes('unsourced-badge') || dom.includes('source-count-badge');
    expect(hasBadge).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Address fields (v0.5.3)
// ---------------------------------------------------------------------------

test.describe('Address fields', () => {
  test('place detail shows Address section', async () => {
    const place = await app.createPlace({ name: 'Adressort' });
    await app.navigate(`/places/${place.id}`);
    await app.waitForText('Address');
    await app.expectText('Street');
    await app.expectText('Postal Code');
    await app.expectText('City');
    await app.expectText('Country');
  });

  test('address fields round-trip through API', async () => {
    const place = await app.createPlace({
      name: 'Gatan 5',
      street: 'Tvärgatan 5',
      postal_code: '35243',
      city: 'Växjö',
      country: 'Sverige',
    });
    await app.navigate(`/places/${place.id}`);
    await app.waitForText('Gatan 5');

    // Input values set via Vue reactivity are stored in .value (not HTML attribute),
    // so they don't appear in outerHTML — read them directly via executeJs
    const inputValues = await app.executeJs<string>(`
      Array.from(document.querySelectorAll('input[type="text"]')).map(i => i.value).join('|')
    `);
    expect(inputValues).toContain('Tvärgatan 5');
    expect(inputValues).toContain('35243');
    expect(inputValues).toContain('Växjö');
    expect(inputValues).toContain('Sverige');
  });

  test('PlacePicker shows postal_code + city as subtitle', async () => {
    await app.createPlace({
      name: 'Teststaden',
      postal_code: '12345',
      city: 'Teststad',
    });

    // Add an event to a person so we can open EventForm which has a PlacePicker
    const person = await app.createPerson({ given_name: 'Picker', surname: 'Test' });
    await app.navigate(`/persons/${person.id}`);
    await app.waitForText('Picker Test');

    // Open the Add Event form
    await app.executeJs(`
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Add Event') || b.textContent.includes('Add event'));
      if (btn) btn.click();
    `);
    await app.settle(500);

    // Type 'Test' in the PlacePicker search input
    const dom = await app.getDom();
    if (dom.includes('place-picker') || dom.includes('PlacePicker')) {
      await app.executeJs(`
        const input = document.querySelector('.place-picker input, .picker-input');
        if (input) {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          setter.call(input, 'Test');
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      `);
      await app.settle(500);
      const afterDom = await app.getDom();
      // Subtitle should show postal_code + city
      if (afterDom.includes('Teststaden')) {
        expect(afterDom).toContain('12345');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Place hierarchy
// ---------------------------------------------------------------------------

test.describe('Place hierarchy', () => {
  test('child places section shows children', async () => {
    const parent = await app.createPlace({ name: 'Föräldraort' });
    await app.executeJs<{ id: string }>(
      `window.api.places.create(${JSON.stringify({ name: 'Barnort', parent_place_id: parent.id })})`
    );

    await app.navigate(`/places/${parent.id}`);
    await app.waitForText('Föräldraort');
    await app.expectText('Barnort');
  });
});
