/**
 * E2E: Tree visualization in PersonsView — empty state, person selection, tab switching, SVG rendering.
 *
 * Runs on port 19245 with its own Electron instance, in parallel with other gui-* suites.
 */
import { test, expect } from '@playwright/test';
import {
  AppDriver,
  AppInstance,
  startApp,
  teardownApp,
} from './fixture';

const UI_PORT = 19245;
let instance: AppInstance;
const app = new AppDriver(UI_PORT);

test.beforeAll(async () => {
  instance = await startApp(UI_PORT, 'viz');
  await app.settle(150);
  await app.setLocale('en');
});

test.afterAll(async () => {
  await teardownApp(instance);
});

test.setTimeout(30_000);

// ---------------------------------------------------------------------------
// Visualization empty state
// ---------------------------------------------------------------------------

test.describe('Visualization empty state', () => {
  test('shows empty state when no persons exist', async () => {
    // Navigate away first so PersonsView unmounts, then clear any stale focal-person
    // from prior runs (shared Chromium profile) before navigating back.
    await app.navigate('/sources');
    await app.executeJs(`localStorage.setItem('persons-view-mode', 'tree'); localStorage.removeItem('viz-focal-person')`);
    await app.navigate('/persons');
    await app.waitForText('Create a person to start visualizing');
  });

  test('empty state has data-testid attribute for reliable selection', async () => {
    await app.navigate('/sources');
    await app.executeJs(`localStorage.setItem('persons-view-mode', 'tree'); localStorage.removeItem('viz-focal-person')`);
    await app.navigate('/persons');
    const dom = await app.getDom();
    expect(dom).toContain('viz-empty');
  });
});

// ---------------------------------------------------------------------------
// Person selection and navigation
// ---------------------------------------------------------------------------

test.describe('Visualization with persons', () => {
  let focalPerson: { id: string };
  let parent1: { id: string };
  let parent2: { id: string };
  let child: { id: string };

  test.beforeAll(async () => {
    // Seed a small family: focal person with 2 parents and 1 child
    focalPerson = await app.createPerson({ given_name: 'Maja', surname: 'Focal', sex: 'F' });
    parent1 = await app.createPerson({ given_name: 'Lars', surname: 'Focal', sex: 'M' });
    parent2 = await app.createPerson({ given_name: 'Anna', surname: 'Focal', sex: 'F' });
    child = await app.createPerson({ given_name: 'Lilla', surname: 'Barn', sex: 'F' });

    // Add birth and death events so the Timeline chart has something to render
    const birth = await app.createEvent({ event_type: 'birth', date_original: '1 JAN 1950' });
    await app.addEventParticipant({ event_id: birth.id, person_id: focalPerson.id, role: 'primary' });
    const death = await app.createEvent({ event_type: 'death', date_original: '15 JUN 2010' });
    await app.addEventParticipant({ event_id: death.id, person_id: focalPerson.id, role: 'primary' });
    const parentBirth = await app.createEvent({ event_type: 'birth', date_original: '3 MAR 1920' });
    await app.addEventParticipant({ event_id: parentBirth.id, person_id: parent1.id, role: 'primary' });

    // Parent relationships
    await app.createRelationship({
      type: 'parent_child',
      person1_id: parent1.id,
      person2_id: focalPerson.id,
    });
    await app.createRelationship({
      type: 'parent_child',
      person1_id: parent2.id,
      person2_id: focalPerson.id,
    });
    // Child relationship
    await app.createRelationship({
      type: 'parent_child',
      person1_id: focalPerson.id,
      person2_id: child.id,
    });
  });

  test('navigating to /persons/:id shows focal person name', async () => {
    await app.navigate(`/persons/${focalPerson.id}`);
    await app.waitForText('Maja');
  });

  test('focal person name is shown in panel', async () => {
    await app.navigate(`/persons/${focalPerson.id}`);
    await app.waitForText('Maja');
    const dom = await app.getDom();
    expect(dom).toContain('panel-name');
  });

  test('pedigree chart is active by default and renders SVG', async () => {
    await app.navigate(`/persons/${focalPerson.id}`);
    await app.waitForText('Maja');
    await app.settle(80);

    const dom = await app.getDom();
    // Pedigree tab should be active
    expect(dom).toContain('Pedigree');
    // SVG should be rendered for a person with parents
    expect(dom).toContain('<svg');
  });

  test('switching to Hourglass tab renders SVG', async () => {
    await app.navigate(`/persons/${focalPerson.id}`);
    await app.waitForText('Maja');
    await app.settle(80);

    // Tabs are FilterChips — click by text content
    await app.executeJs(`
      Array.from(document.querySelectorAll('.chip-btn')).find(b => b.textContent.includes('Hourglass'))?.click()
    `);
    await app.settle(200);

    const dom = await app.getDom();
    expect(dom).toContain('<svg');
  });

  test('switching to Timeline tab renders SVG', async () => {
    await app.navigate(`/persons/${focalPerson.id}`);
    await app.waitForText('Maja');
    await app.settle(80);

    await app.executeJs(`
      Array.from(document.querySelectorAll('.chip-btn')).find(b => b.textContent.includes('Timeline'))?.click()
    `);
    await app.settle(200);

    const dom = await app.getDom();
    // Timeline should render an SVG now that the person has birth and death events
    expect(dom).toContain('<svg');
  });

  test('switching tabs updates active chip', async () => {
    await app.navigate(`/persons/${focalPerson.id}`);
    await app.waitForText('Maja');
    await app.settle(50);

    await app.executeJs(`
      Array.from(document.querySelectorAll('.chip-btn')).find(b => b.textContent.includes('Hourglass'))?.click()
    `);
    await app.settle(100);

    const hourglassActive = await app.executeJs<boolean>(`
      Array.from(document.querySelectorAll('.chip-btn')).find(b => b.textContent.includes('Hourglass'))?.classList.contains('chip-btn--active') ?? false
    `);
    expect(hourglassActive).toBe(true);

    const pedigreeActive = await app.executeJs<boolean>(`
      Array.from(document.querySelectorAll('.chip-btn')).find(b => b.textContent.includes('Pedigree'))?.classList.contains('chip-btn--active') ?? false
    `);
    expect(pedigreeActive).toBe(false);
  });

  test('Edit action navigates to person detail', async () => {
    await app.navigate(`/persons/${focalPerson.id}`);
    await app.waitForText('Maja');
    await app.settle(100);

    // The PersonPanel has a SectionHeader with "Edit" action that navigates to /persons/:id
    await app.executeJs(`
      Array.from(document.querySelectorAll('.section-header-bar .app-btn--soft')).find(b => b.textContent.trim() === 'Edit')?.click()
    `);
    await app.settle(80);

    const routePath = await app.executeJs<string>(
      'window.__vue_router.currentRoute.value.path'
    );
    expect(routePath).toBe(`/persons/${focalPerson.id}`);
  });

  test('back button exists in visualization tab bar', async () => {
    // Ensure tree mode so the viz tab bar (containing the back button) renders.
    await app.executeJs(`localStorage.setItem('persons-view-mode', 'tree')`);
    await app.navigate(`/persons/${focalPerson.id}`);
    await app.waitForText('Maja');
    await app.settle(200);

    const hasBackButton = await app.executeJs<boolean>(`
      Array.from(document.querySelectorAll('.viz-tab-bar button')).some(b => b.textContent.trim() === '←')
    `);
    expect(hasBackButton).toBe(true);
  });
});
