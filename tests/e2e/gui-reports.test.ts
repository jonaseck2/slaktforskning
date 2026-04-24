/**
 * E2E: Reports view — smoke-test all seven keepsake reports.
 *
 * For each keepsake tab (alife, amarriage, placeChronicle, yourAncestors,
 * onePage, familyInYear, photoAlbum), seed the minimum data the tab needs,
 * activate the tab, pick a subject if required, and assert that the
 * `.print-preview` renders. PDF export is NOT exercised (it opens a native
 * save dialog) — the preview DOM is the same tree the export pipeline
 * serializes, so preview rendering is sufficient smoke coverage.
 *
 * Runs on port 19252 with its own Electron instance, in parallel with other
 * gui-* suites.
 */
import { test, expect } from '@playwright/test';
import {
  AppDriver,
  AppInstance,
  startApp,
  teardownApp,
} from './fixture';

const UI_PORT = 19252;
let instance: AppInstance;
const app = new AppDriver(UI_PORT);

// Seeded entity IDs, populated in beforeAll.
let focalPersonId: string;
let spousePersonId: string;
let childPersonId: string;
let coupleRelId: string;
let placeId: string;

test.beforeAll(async () => {
  instance = await startApp(UI_PORT, 'reports');
  await app.settle(150);
  await app.setLocale('en');

  // Seed a minimal family: focal + spouse + child + a place + events spanning
  // the default familyInYear year (currentYear - 100). The photoAlbum tab
  // only needs a person subject (it gracefully renders with no photos).
  const focal = await app.createPerson({ given_name: 'Alma', surname: 'Reporter', sex: 'F' });
  const spouse = await app.createPerson({ given_name: 'Bertil', surname: 'Reporter', sex: 'M' });
  const child = await app.createPerson({ given_name: 'Calle', surname: 'Reporter', sex: 'M' });
  focalPersonId = focal.id;
  spousePersonId = spouse.id;
  childPersonId = child.id;

  const place = await app.createPlace({ name: 'Testköping', place_type: 'city', country: 'Sweden' });
  placeId = place.id;

  // Birth for focal in year that makes her alive in familyInYearYear default
  // (current year - 100). createEvent doesn't accept place_id, so we write it
  // directly via window.api.events.update after create, but simpler: pass a
  // place_id via a tailored executeJs call.
  const focalBirthYear = new Date().getFullYear() - 120;
  const focalDeathYear = new Date().getFullYear() - 50;
  const focalBirth = await app.executeJs<{ id: string }>(
    `window.api.events.create(${JSON.stringify({
      event_type: 'birth',
      date_original: String(focalBirthYear),
      date_type: 'exact',
      date_value: focalBirthYear + '-01-01',
      place_id: placeId,
    })})`
  );
  await app.addEventParticipant({ event_id: focalBirth.id, person_id: focalPersonId, role: 'primary' });

  const focalDeath = await app.executeJs<{ id: string }>(
    `window.api.events.create(${JSON.stringify({
      event_type: 'death',
      date_original: String(focalDeathYear),
      date_type: 'exact',
      date_value: focalDeathYear + '-01-01',
    })})`
  );
  await app.addEventParticipant({ event_id: focalDeath.id, person_id: focalPersonId, role: 'primary' });

  // Spouse birth + death so they are alive alongside focal
  const spouseBirth = await app.executeJs<{ id: string }>(
    `window.api.events.create(${JSON.stringify({
      event_type: 'birth',
      date_original: String(focalBirthYear + 2),
      date_type: 'exact',
      date_value: (focalBirthYear + 2) + '-01-01',
    })})`
  );
  await app.addEventParticipant({ event_id: spouseBirth.id, person_id: spousePersonId, role: 'primary' });

  // Couple relationship + marriage event
  const couple = await app.createRelationship({
    type: 'couple',
    person1_id: focalPersonId,
    person2_id: spousePersonId,
    subtype: 'marriage',
  });
  coupleRelId = couple.id;
  const marriage = await app.executeJs<{ id: string }>(
    `window.api.events.create(${JSON.stringify({
      event_type: 'marriage',
      date_original: String(focalBirthYear + 22),
      date_type: 'exact',
      date_value: (focalBirthYear + 22) + '-01-01',
      place_id: placeId,
      relationship_id: couple.id,
    })})`
  );
  // Marriage events are linked via relationship_id — no participant needed.
  void marriage;

  // Parent-child relationship for focal → child
  await app.createRelationship({
    type: 'parent_child',
    person1_id: focalPersonId,
    person2_id: childPersonId,
  });
  await app.createRelationship({
    type: 'parent_child',
    person1_id: spousePersonId,
    person2_id: childPersonId,
  });
});

test.afterAll(async () => {
  await teardownApp(instance);
});

test.setTimeout(60_000);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Select the given keepsake tab by clicking its FilterChips button label.
 * We look for the chip in the keepsake group (first `.filter-chips-bar`) to
 * avoid collisions with the Framable prints group.
 */
async function selectKeepsakeTab(label: string): Promise<void> {
  await app.executeJs(`
    (() => {
      const bars = document.querySelectorAll('.tab-group .filter-chips-bar');
      for (const bar of bars) {
        const btn = Array.from(bar.querySelectorAll('.chip-btn')).find(b => b.textContent.trim().startsWith(${JSON.stringify(label)}));
        if (btn) { btn.click(); return; }
      }
      throw new Error('Keepsake tab not found: ' + ${JSON.stringify(label)});
    })()
  `);
  await app.settle(150);
}

/** Set focus store by navigating to the person detail view (a side effect). */
async function focusPerson(personId: string): Promise<void> {
  await app.navigate('/persons/' + personId);
  await app.settle(100);
}

// ---------------------------------------------------------------------------
// Tests — one per keepsake tab
// ---------------------------------------------------------------------------

test.describe('Reports view keepsake tabs', () => {
  test('reports view renders with two tab groups', async () => {
    await app.navigate('/reports');
    await app.waitForText('Reports', 10_000);
    const dom = await app.getDom();
    // Both tab groups are present
    expect(dom).toContain('tab-group');
    expect(dom).toContain('chip-btn');
  });

  test('alife tab renders preview for focused person', async () => {
    await focusPerson(focalPersonId);
    await app.navigate('/reports');
    await app.settle(100);
    await selectKeepsakeTab('A Life');
    await app.settle(500);
    const dom = await app.getDom();
    expect(dom).toContain('print-preview');
  });

  test('amarriage tab renders preview for selected couple', async () => {
    await focusPerson(focalPersonId);
    await app.navigate('/reports');
    await app.settle(100);
    await selectKeepsakeTab('A Couple');
    await app.settle(300);
    // Pick the first couple in the dropdown
    await app.executeJs(`
      (() => {
        const sel = document.querySelector('.tab-content select');
        if (sel && sel.options.length > 1) {
          sel.value = ${JSON.stringify(coupleRelId)};
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `);
    await app.settle(500);
    const dom = await app.getDom();
    expect(dom).toContain('print-preview');
  });

  test('placeChronicle tab renders preview for selected place', async () => {
    await app.navigate('/reports');
    await app.settle(100);
    await selectKeepsakeTab('Place Chronicle');
    await app.settle(300);
    await app.executeJs(`
      (() => {
        const sel = document.querySelector('.tab-content select');
        if (sel && sel.options.length > 1) {
          sel.value = ${JSON.stringify(placeId)};
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `);
    await app.settle(500);
    const dom = await app.getDom();
    expect(dom).toContain('print-preview');
  });

  test('yourAncestors tab renders preview for focused person', async () => {
    await focusPerson(focalPersonId);
    await app.navigate('/reports');
    await app.settle(100);
    await selectKeepsakeTab('Your Ancestors');
    await app.settle(500);
    const dom = await app.getDom();
    expect(dom).toContain('print-preview');
  });

  test('onePage tab renders preview for focused person', async () => {
    await focusPerson(focalPersonId);
    await app.navigate('/reports');
    await app.settle(100);
    await selectKeepsakeTab('Life on One Page');
    await app.settle(500);
    const dom = await app.getDom();
    expect(dom).toContain('print-preview');
  });

  test('familyInYear tab renders preview without subject (defaults year)', async () => {
    await app.navigate('/reports');
    await app.settle(100);
    await selectKeepsakeTab('Family in a Year');
    await app.settle(500);
    const dom = await app.getDom();
    // familyInYear has a default year (currentYear - 100), so preview always renders
    expect(dom).toContain('print-preview');
  });

  test('photoAlbum tab renders preview for focused person subject', async () => {
    await focusPerson(focalPersonId);
    await app.navigate('/reports');
    await app.settle(100);
    await selectKeepsakeTab('Photo Album');
    await app.settle(500);
    const dom = await app.getDom();
    // subjectType defaults to 'person' and focusStore.personId is set → render
    expect(dom).toContain('print-preview');
  });
});
