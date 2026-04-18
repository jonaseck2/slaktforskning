/**
 * E2E: Settings — Database tab: current path display, tree subject,
 * recent databases list. File-dialog operations (create/open/backup/restore)
 * require OS dialogs and cannot be fully tested, but we verify the UI renders
 * and buttons exist.
 *
 * Runs on port 19249 with its own Electron instance, in parallel with other gui-* suites.
 */
import { test, expect } from '@playwright/test';
import {
  AppDriver,
  AppInstance,
  startApp,
  teardownApp,
} from './fixture';

const UI_PORT = 19249;
let instance: AppInstance;
const app = new AppDriver(UI_PORT);

test.beforeAll(async () => {
  instance = await startApp(UI_PORT, 'settings');
  await app.settle(150);
  await app.setLocale('en');
});

test.afterAll(async () => {
  await teardownApp(instance);
});

test.setTimeout(30_000);

// ---------------------------------------------------------------------------
// Settings View — Database tab
// ---------------------------------------------------------------------------

test.describe('Database settings', () => {
  test('settings view renders database tab', async () => {
    await app.navigate('/settings');
    await app.settle(200);

    // Click the Database tab
    await app.executeJs(`
      const tabs = document.querySelectorAll('.tab-btn');
      for (const tab of tabs) {
        if (tab.textContent.includes('Database')) { tab.click(); break; }
      }
    `);
    await app.settle(200);

    await app.waitForText('Active database');
  });

  test('shows current database path', async () => {
    await app.navigate('/settings');
    await app.settle(200);

    // Click Database tab
    await app.executeJs(`
      const tabs = document.querySelectorAll('.tab-btn');
      for (const tab of tabs) {
        if (tab.textContent.includes('Database')) { tab.click(); break; }
      }
    `);
    await app.settle(200);

    // The db-path element should show the temp DB path
    const hasPath = await app.executeJs<boolean>(`
      !!document.querySelector('.db-path')
    `);
    expect(hasPath).toBe(true);

    // Path should contain .db
    const pathText = await app.executeJs<string>(`
      document.querySelector('.db-path')?.textContent ?? ''
    `);
    expect(pathText).toContain('.db');
  });

  test('database action buttons exist', async () => {
    await app.navigate('/settings');
    await app.settle(200);

    await app.executeJs(`
      const tabs = document.querySelectorAll('.tab-btn');
      for (const tab of tabs) {
        if (tab.textContent.includes('Database')) { tab.click(); break; }
      }
    `);
    await app.settle(200);

    const dom = await app.getDom();
    expect(dom).toContain('New database');
    expect(dom).toContain('Open other');
    expect(dom).toContain('Backup');
    expect(dom).toContain('Restore from backup');
  });

  test('tree subject section exists', async () => {
    await app.navigate('/settings');
    await app.settle(200);

    await app.executeJs(`
      const tabs = document.querySelectorAll('.tab-btn');
      for (const tab of tabs) {
        if (tab.textContent.includes('Database')) { tab.click(); break; }
      }
    `);
    await app.settle(200);

    await app.expectText('Tree subject');
  });

  test('set tree subject via PersonPicker', async () => {
    // Create a person to select as tree subject
    await app.createPerson({ given_name: 'Root', surname: 'Person' });

    await app.navigate('/settings');
    await app.settle(200);

    await app.executeJs(`
      const tabs = document.querySelectorAll('.tab-btn');
      for (const tab of tabs) {
        if (tab.textContent.includes('Database')) { tab.click(); break; }
      }
    `);
    await app.settle(200);

    // Type in the PersonPicker search field in the tree-subject section
    await app.executeJs(`
      const row = document.querySelector('.tree-subject-row');
      const input = row?.querySelector('input');
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'Root');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
      }
    `);
    await app.settle(500);

    // Select the suggestion
    await app.executeJs(`
      const suggestion = document.querySelector('.suggestion-item, .picker-option, [class*="suggestion"]');
      if (suggestion) suggestion.click();
    `);
    await app.settle(300);

    // Should show "Root Person" somewhere in the tree subject area
    const dom = await app.getDom();
    expect(dom).toContain('Root');
  });
});

// ---------------------------------------------------------------------------
// Settings View — tabs navigation
// ---------------------------------------------------------------------------

test.describe('Settings tabs', () => {
  test('tab navigation works across all tabs', async () => {
    await app.navigate('/settings');
    await app.settle(200);

    // Verify tabs exist
    const tabCount = await app.executeJs<number>(`
      document.querySelectorAll('.tab-btn').length
    `);
    expect(tabCount).toBeGreaterThanOrEqual(3);

    // Click each tab and verify it activates
    const tabLabels = await app.executeJs<string[]>(`
      Array.from(document.querySelectorAll('.tab-btn')).map(t => t.textContent.trim())
    `);

    for (const label of tabLabels) {
      await app.executeJs(`
        const tabs = document.querySelectorAll('.tab-btn');
        for (const tab of tabs) {
          if (tab.textContent.trim() === ${JSON.stringify(label)}) { tab.click(); break; }
        }
      `);
      await app.settle(200);

      const hasActive = await app.executeJs<boolean>(`
        (() => {
          const tabs = document.querySelectorAll('.tab-btn');
          return Array.from(tabs).some(t =>
            t.textContent.trim() === ${JSON.stringify(label)} && t.classList.contains('active')
          );
        })()
      `);
      expect(hasActive).toBe(true);
    }
  });

  test('Import / Export tab shows import options', async () => {
    await app.navigate('/settings');
    await app.settle(200);

    await app.executeJs(`
      const tabs = document.querySelectorAll('.tab-btn');
      for (const tab of tabs) {
        if (tab.textContent.includes('Import')) { tab.click(); break; }
      }
    `);
    await app.settle(200);

    const dom = await app.getDom();
    // Should show import/export section with GEDCOM options
    expect(dom).toContain('GEDCOM');
  });
});
