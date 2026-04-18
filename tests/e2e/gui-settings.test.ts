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
  test('settings view renders database tab by default', async () => {
    await app.navigate('/settings');
    // Database tab is active by default
    await app.waitForText('Active database');
  });

  test('shows current database path', async () => {
    await app.navigate('/settings');
    await app.waitForText('Active database');

    // The db-path element should show the temp DB path
    const pathText = await app.executeJs<string>(`
      document.querySelector('.db-path')?.textContent ?? ''
    `);
    expect(pathText).toContain('.db');
  });

  test('database action buttons exist', async () => {
    await app.navigate('/settings');
    await app.waitForText('Active database');

    const dom = await app.getDom();
    expect(dom).toContain('New database');
    expect(dom).toContain('Open other');
    expect(dom).toContain('Backup');
    expect(dom).toContain('Restore from backup');
  });

  test('tree subject section exists', async () => {
    await app.navigate('/settings');
    await app.waitForText('Active database');
    await app.expectText('Tree subject');
  });

  test('set tree subject via PersonPicker', async () => {
    // Create a person to select as tree subject
    await app.createPerson({ given_name: 'Root', surname: 'Person' });

    await app.navigate('/settings');
    await app.waitForText('Active database');

    // Type in the PersonPicker search field in the tree-subject section
    await app.executeJs(`
      (() => {
        const row = document.querySelector('.tree-subject-row');
        const input = row?.querySelector('input');
        if (input) {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          setter.call(input, 'Root');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.focus();
        }
      })()
    `);
    await app.settle(500);

    // Select the suggestion
    await app.executeJs(`
      (() => {
        const suggestion = document.querySelector('.suggestion-item, .picker-option, [class*="suggestion"]');
        if (suggestion) suggestion.click();
      })()
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
    await app.waitForText('Active database');

    // Settings uses FilterChips for tabs — they render as .chip-btn
    const tabCount = await app.executeJs<number>(`
      document.querySelectorAll('.chip-btn').length
    `);
    expect(tabCount).toBeGreaterThanOrEqual(3);

    // Click Link Rules tab
    await app.executeJs(`
      (() => {
        const chips = document.querySelectorAll('.chip-btn');
        for (const chip of chips) {
          if (chip.textContent.includes('Link Rules')) { chip.click(); return; }
        }
      })()
    `);
    await app.settle(300);

    const dom1 = await app.getDom();
    expect(dom1).toContain('chip-btn--active');

    // Click Gazetteers tab
    await app.executeJs(`
      (() => {
        const chips = document.querySelectorAll('.chip-btn');
        for (const chip of chips) {
          if (chip.textContent.includes('Gazetteer')) { chip.click(); return; }
        }
      })()
    `);
    await app.settle(300);

    // Click back to Database tab
    await app.executeJs(`
      (() => {
        const chips = document.querySelectorAll('.chip-btn');
        for (const chip of chips) {
          if (chip.textContent.includes('Database')) { chip.click(); return; }
        }
      })()
    `);
    await app.settle(300);

    await app.expectText('Active database');
  });
});
