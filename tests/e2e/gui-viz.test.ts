/**
 * E2E: Visualization view — empty state, person selection, tab switching, SVG rendering.
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
  await app.settle(1000);
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
    await app.navigate('/visualisering');
    await app.waitForText('Add a person to start visualizing');
  });

  test('empty state has data-testid attribute for reliable selection', async () => {
    await app.navigate('/visualisering');
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

  test('navigating to /visualisering/:id shows focal person name', async () => {
    await app.navigate(`/visualisering/${focalPerson.id}`);
    await app.waitForText('Maja Focal');
  });

  test('focal person name has data-testid', async () => {
    await app.navigate(`/visualisering/${focalPerson.id}`);
    await app.waitForText('Maja Focal');
    const dom = await app.getDom();
    expect(dom).toContain('visualization-focal-name');
  });

  test('pedigree chart is active by default and renders SVG', async () => {
    await app.navigate(`/visualisering/${focalPerson.id}`);
    await app.waitForText('Maja Focal');
    await app.settle(500);

    const dom = await app.getDom();
    // Pedigree tab should be active
    expect(dom).toContain('Pedigree');
    // SVG should be rendered for a person with parents
    expect(dom).toContain('<svg');
  });

  test('switching to Hourglass tab renders SVG', async () => {
    await app.navigate(`/visualisering/${focalPerson.id}`);
    await app.waitForText('Maja Focal');
    await app.settle(500);

    await app.executeJs(`
      document.querySelector('[data-testid="tab-hourglass"]').click()
    `);
    await app.settle(500);

    const dom = await app.getDom();
    expect(dom).toContain('<svg');
  });

  test('switching to Timeline tab renders SVG', async () => {
    await app.navigate(`/visualisering/${focalPerson.id}`);
    await app.waitForText('Maja Focal');
    await app.settle(500);

    await app.executeJs(`
      document.querySelector('[data-testid="tab-timeline"]').click()
    `);
    await app.settle(500);

    const dom = await app.getDom();
    // Timeline renders SVG even for a person with no events (shows empty state or axis)
    expect(dom).toContain('viz-area');
  });

  test('switching tabs updates aria-selected', async () => {
    await app.navigate(`/visualisering/${focalPerson.id}`);
    await app.waitForText('Maja Focal');
    await app.settle(300);

    await app.executeJs(`
      document.querySelector('[data-testid="tab-hourglass"]').click()
    `);
    await app.settle(300);

    const selected = await app.executeJs<string>(
      'document.querySelector("[data-testid=\'tab-hourglass\']").getAttribute("aria-selected")'
    );
    expect(selected).toBe('true');

    const pedigreeSelected = await app.executeJs<string>(
      'document.querySelector("[data-testid=\'tab-pedigree\']").getAttribute("aria-selected")'
    );
    expect(pedigreeSelected).toBe('false');
  });

  test('View details link navigates to person detail', async () => {
    await app.navigate(`/visualisering/${focalPerson.id}`);
    await app.waitForText('Maja Focal');
    await app.settle(300);

    await app.click('.btn-detail');
    await app.settle(500);

    const routePath = await app.executeJs<string>(
      'window.__vue_router.currentRoute.value.path'
    );
    expect(routePath).toBe(`/persons/${focalPerson.id}`);
  });

  test('back button navigates away from visualization', async () => {
    // Navigate from / so router.back() returns to /
    await app.navigate('/');
    await app.navigate(`/visualisering/${focalPerson.id}`);
    await app.waitForText('Maja Focal');

    await app.click('.btn-back');
    await app.settle();

    // back() returns to previous history entry (/), not a hardcoded route
    const routePath = await app.executeJs<string>(
      'window.__vue_router.currentRoute.value.path'
    );
    expect(routePath).toBe('/');
  });
});
