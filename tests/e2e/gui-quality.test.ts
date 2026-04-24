/**
 * E2E: Quality checks — run checks, severity filtering, ignore/restore.
 *
 * Runs on port 19247 with its own Electron instance, in parallel with other gui-* suites.
 */
import { test, expect } from '@playwright/test';
import {
  AppDriver,
  AppInstance,
  startApp,
  teardownApp,
} from './fixture';

const UI_PORT = 19247;
let instance: AppInstance;
const app = new AppDriver(UI_PORT);

test.beforeAll(async () => {
  instance = await startApp(UI_PORT, 'quality');
  await app.settle(150);
  await app.setLocale('en');
});

test.afterAll(async () => {
  await teardownApp(instance);
});

test.setTimeout(30_000);

// ---------------------------------------------------------------------------
// Quality View — initial state
// ---------------------------------------------------------------------------

test.describe('Quality checks', () => {
  test('quality view shows results after navigation', async () => {
    // Checks auto-run on mount — on empty DB we get the "no issues" state
    await app.navigate('/quality');
    // Wait for checks to complete (either results or no-issues state)
    await app.waitForText('Quality');
  });

  test('empty DB shows no-issues or notRun state', async () => {
    await app.navigate('/quality');
    // With zero persons the checks should complete quickly
    await app.settle(500);
    const dom = await app.getDom();
    // Either "No issues found" or the summary line (0 errors · 0 warnings · 0 notices)
    const hasNoIssues = dom.includes('No issues') || dom.includes('0 errors');
    const hasNotRun = dom.includes('Run checks');
    expect(hasNoIssues || hasNotRun).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Quality View — with seeded data that triggers checks
// ---------------------------------------------------------------------------

test.describe('Quality checks with data', () => {
  test.beforeAll(async () => {
    // Create a person with no birth event → triggers NO_BIRTH_EVENT notice
    await app.createPerson({ given_name: 'Test', surname: 'NoEvents', sex: 'M' });

    // Create a person marked as living but with a death event → LIVING_WITH_DEATH_EVENT
    const p2 = await app.createPerson({ given_name: 'Dead', surname: 'ButLiving', sex: 'F' });
    const deathEvent = await app.createEvent({ event_type: 'death', date_original: '1990-01-01' });
    await app.addEventParticipant({ event_id: deathEvent.id, person_id: p2.id, role: 'primary' });
    // Person defaults to living=true, so death event creates a check

    // Create a person with birth after death → BIRTH_AFTER_DEATH error
    const p3 = await app.createPerson({ given_name: 'Chrono', surname: 'Error', sex: 'M' });
    const birthEvt = await app.createEvent({ event_type: 'birth', date_original: '2000-01-01' });
    await app.addEventParticipant({ event_id: birthEvt.id, person_id: p3.id, role: 'primary' });
    const deathEvt = await app.createEvent({ event_type: 'death', date_original: '1990-01-01' });
    await app.addEventParticipant({ event_id: deathEvt.id, person_id: p3.id, role: 'primary' });
  });

  test('quality view shows check results after seeding data', async () => {
    await app.navigate('/quality');
    // Wait for the summary line which only appears after checks complete (not CSS).
    await app.waitForText('errors ·', 15000);
    const dom = await app.getDom();
    // Should have at least some issues rendered in the table
    expect(dom).toContain('severity-badge');
  });

  test('filter chips work', async () => {
    await app.navigate('/quality');
    await app.waitForText('errors ·', 15000);

    // Click the "Errors" filter chip
    await app.executeJs(`
      const chips = document.querySelectorAll('.chip-btn');
      for (const chip of chips) {
        if (chip.textContent.includes('Errors') || chip.textContent.includes('Error')) {
          chip.click();
          break;
        }
      }
    `);
    await app.settle(200);

    // The table should still exist with filtered results
    const dom = await app.getDom();
    expect(dom).toContain('severity-badge');
  });

  test('ignore and restore a check result', async () => {
    await app.navigate('/quality');
    await app.waitForText('errors ·', 15000);

    // Clear any leftover ignored state from previous retries
    await app.executeJs(`localStorage.removeItem('quality:ignored')`);
    await app.navigate('/');
    await app.navigate('/quality');
    // Wait for 'NoEvents' to appear — entity label for Test NoEvents person's NO_BIRTH_EVENT
    // result. Only appears in rendered table cells, never in CSS.
    await app.waitForText('NoEvents', 15000);

    // Count ALL visible rows (not just clickable ones — clickability depends on Vue reactivity
    // timing and is verified separately by the navigation test)
    const rowsBefore = await app.executeJs<number>(`
      document.querySelectorAll('.data-table tbody tr').length
    `);
    expect(rowsBefore).toBeGreaterThan(0);

    // Click the ignore button (✕) on the first row
    await app.executeJs(`
      (() => {
        const btn = document.querySelector('.data-table tbody tr .btn-delete');
        if (btn) btn.click();
      })()
    `);
    await app.settle(500);

    // In "All" filter, ignored rows are hidden — row count should decrease
    const rowsAfterIgnore = await app.executeJs<number>(`
      document.querySelectorAll('.data-table tbody tr').length
    `);
    expect(rowsAfterIgnore).toBe(rowsBefore - 1);

    // Switch to "Ignored" filter to see the ignored item
    await app.executeJs(`
      (() => {
        const chips = document.querySelectorAll('.chip-btn');
        for (const chip of chips) {
          if (chip.textContent.includes('Ignored')) { chip.click(); return; }
        }
      })()
    `);
    await app.settle(500);

    // Should show exactly 1 ignored row
    const ignoredRows = await app.executeJs<number>(`
      document.querySelectorAll('.data-table .row-ignored').length
    `);
    expect(ignoredRows).toBe(1);

    // Restore: click the ✕ button on the ignored row
    await app.executeJs(`
      (() => {
        const btn = document.querySelector('.data-table .row-ignored .btn-delete');
        if (btn) btn.click();
      })()
    `);
    await app.settle(500);

    // Switch back to "All" — should see all rows again
    await app.executeJs(`
      (() => {
        const chip = document.querySelector('.chip-btn');
        if (chip) chip.click();
      })()
    `);
    await app.settle(500);

    const rowsAfterRestore = await app.executeJs<number>(`
      document.querySelectorAll('.data-table tbody tr').length
    `);
    expect(rowsAfterRestore).toBe(rowsBefore);
  });

  test('severity badges are rendered', async () => {
    await app.navigate('/quality');
    await app.waitForText('errors ·', 15000);

    const dom = await app.getDom();
    // Should have severity badge classes (badge-error, badge-warning, badge-notice)
    const hasSeverity = dom.includes('badge-error') ||
      dom.includes('badge-warning') ||
      dom.includes('badge-notice');
    expect(hasSeverity).toBe(true);
  });

  test('clicking a result row navigates to person detail', async () => {
    await app.navigate('/quality');
    await app.waitForText('errors ·', 15000);

    // Click the first result row
    await app.click('.data-table .clickable-row');
    await app.settle(500);

    // Should navigate to a person detail view
    const url = await app.executeJs<string>('window.location.hash');
    expect(url).toContain('/persons/');
  });
});
