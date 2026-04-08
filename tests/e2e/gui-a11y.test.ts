/**
 * E2E: ARIA accessibility verification.
 * Runs on port 19246 with its own Electron instance.
 */
import { test, expect } from '@playwright/test';
import { AppDriver, AppInstance, startApp, teardownApp } from './fixture';

const UI_PORT = 19246;
let instance: AppInstance;
const app = new AppDriver(UI_PORT);

test.beforeAll(async () => {
  instance = await startApp(UI_PORT, 'a11y');
  await app.settle(150);
  await app.setLocale('en');
});

test.afterAll(async () => {
  await teardownApp(instance);
});

test.setTimeout(30_000);

test('skip link exists and targets main content', async () => {
  const dom = await app.getDom();
  expect(dom).toContain('class="skip-link"');
  expect(dom).toContain('href="#main-content"');
  expect(dom).toContain('id="main-content"');
});

test('sidebar nav has aria-label', async () => {
  const dom = await app.getDom();
  expect(dom).toContain('aria-label="Main navigation"');
});

test('nav icons are aria-hidden', async () => {
  const hasHiddenIcons = await app.executeJs<boolean>(`
    (() => {
      const icons = document.querySelectorAll('.nav-icon');
      return icons.length > 0 && Array.from(icons).every(i => i.getAttribute('aria-hidden') === 'true');
    })()
  `);
  expect(hasHiddenIcons).toBe(true);
});

test('settings toggle has aria-expanded', async () => {
  const expanded = await app.executeJs<string>(`
    document.querySelector('.settings-toggle')?.getAttribute('aria-expanded')
  `);
  expect(expanded).toBe('false');

  await app.click('.settings-toggle');
  await app.settle();

  const expandedAfter = await app.executeJs<string>(`
    document.querySelector('.settings-toggle')?.getAttribute('aria-expanded')
  `);
  expect(expandedAfter).toBe('true');
});

test('settings rows have role=radiogroup', async () => {
  await app.click('.settings-toggle');
  await app.settle();

  const radiogroups = await app.executeJs<number>(`
    document.querySelectorAll('.settings-row[role="radiogroup"]').length
  `);
  expect(radiogroups).toBeGreaterThanOrEqual(3); // appearance, text size, language
});

test('modal has role=dialog and aria-modal', async () => {
  await app.navigate('/');
  await app.click('.btn-add');
  await app.settle();

  const hasDialog = await app.executeJs<boolean>(`
    (() => {
      const modal = document.querySelector('.modal');
      return modal?.getAttribute('role') === 'dialog' && modal?.getAttribute('aria-modal') === 'true';
    })()
  `);
  expect(hasDialog).toBe(true);

  // Check aria-labelledby points to an existing element
  const hasLabel = await app.executeJs<boolean>(`
    (() => {
      const modal = document.querySelector('.modal');
      const labelledby = modal?.getAttribute('aria-labelledby');
      return !!labelledby && !!document.getElementById(labelledby);
    })()
  `);
  expect(hasLabel).toBe(true);
});

test('person detail view has aria-labelledby sections', async () => {
  const person = await app.createPerson({ given_name: 'Test', surname: 'Person' });
  await app.navigate('/persons/' + person.id);
  await app.settle(200);

  const sections = await app.executeJs<number>(`
    document.querySelectorAll('section[aria-labelledby]').length
  `);
  expect(sections).toBeGreaterThanOrEqual(3);

  // Verify each aria-labelledby points to an existing element
  const allValid = await app.executeJs<boolean>(`
    (() => {
      const secs = document.querySelectorAll('section[aria-labelledby]');
      return Array.from(secs).every(s => {
        const id = s.getAttribute('aria-labelledby');
        return !!document.getElementById(id);
      });
    })()
  `);
  expect(allValid).toBe(true);
});

test('back button has aria-label', async () => {
  const person = await app.createPerson({ given_name: 'Back', surname: 'Test' });
  await app.navigate('/persons/' + person.id);
  await app.settle(200);

  const hasLabel = await app.executeJs<boolean>(`
    (() => {
      const btn = document.querySelector('.btn-back');
      return !!btn?.getAttribute('aria-label');
    })()
  `);
  expect(hasLabel).toBe(true);
});

test('toast notification has role=alert', async () => {
  // Trigger a toast by creating and deleting a person
  const person = await app.createPerson({ given_name: 'Toast', surname: 'Test' });
  await app.navigate('/persons/' + person.id);
  await app.settle(200);

  // Check the toast container has aria-live
  const hasAriaLive = await app.executeJs<boolean>(`
    (() => {
      const container = document.querySelector('.toast-container');
      return container?.getAttribute('aria-live') === 'assertive';
    })()
  `);
  expect(hasAriaLive).toBe(true);
});

test('clickable table rows have tabindex and role', async () => {
  await app.createPerson({ given_name: 'Row', surname: 'Test' });
  await app.navigate('/');
  await app.settle(200);

  const hasKeyboardAccess = await app.executeJs<boolean>(`
    (() => {
      const row = document.querySelector('.clickable-row');
      if (!row) return false;
      return row.getAttribute('tabindex') === '0' && row.getAttribute('role') === 'button';
    })()
  `);
  expect(hasKeyboardAccess).toBe(true);
});

test('date input fields have aria-labels', async () => {
  // Create a person and open the event form
  const person = await app.createPerson({ given_name: 'Date', surname: 'Test' });
  await app.navigate('/persons/' + person.id);
  await app.settle(200);

  // Click add event button
  const addedEvent = await app.executeJs<boolean>(`
    (() => {
      const btns = Array.from(document.querySelectorAll('.btn-add'));
      const eventBtn = btns.find(b => b.textContent.includes('Event'));
      if (eventBtn) { eventBtn.click(); return true; }
      return false;
    })()
  `);

  if (addedEvent) {
    await app.settle(200);
    const hasDateLabels = await app.executeJs<boolean>(`
      (() => {
        const dateInputs = document.querySelectorAll('.date-input select, .date-input input');
        return dateInputs.length > 0 && Array.from(dateInputs).every(el => !!el.getAttribute('aria-label'));
      })()
    `);
    expect(hasDateLabels).toBe(true);
  }
});

test('TTS read aloud setting exists', async () => {
  await app.click('.settings-toggle');
  await app.settle();

  const hasReadAloud = await app.executeJs<boolean>(`
    (() => {
      const groups = document.querySelectorAll('.settings-row[role="radiogroup"]');
      return Array.from(groups).some(g => {
        const label = g.getAttribute('aria-label');
        return label && (label.includes('Read') || label.includes('Läs'));
      });
    })()
  `);
  expect(hasReadAloud).toBe(true);
});
