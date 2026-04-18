/**
 * E2E: Research Tasks — CRUD, status cycling, inline editing, filter chips.
 *
 * Runs on port 19250 with its own Electron instance, in parallel with other gui-* suites.
 */
import { test, expect } from '@playwright/test';
import {
  AppDriver,
  AppInstance,
  startApp,
  teardownApp,
} from './fixture';

const UI_PORT = 19250;
let instance: AppInstance;
const app = new AppDriver(UI_PORT);

test.beforeAll(async () => {
  instance = await startApp(UI_PORT, 'research');
  await app.settle(150);
  await app.setLocale('en');
  // Extra settle to ensure locale is applied before first navigation
  await app.settle(300);
});

test.afterAll(async () => {
  await teardownApp(instance);
});

test.setTimeout(30_000);

// ---------------------------------------------------------------------------
// Research Tasks — empty state
// ---------------------------------------------------------------------------

test.describe('Research Tasks empty state', () => {
  test('shows empty state when no tasks', async () => {
    await app.navigate('/research-tasks');
    await app.waitForText('No research tasks');
  });
});

// ---------------------------------------------------------------------------
// Research Tasks — CRUD
// ---------------------------------------------------------------------------

test.describe('Research Tasks CRUD', () => {
  test('create a task via the Add Task modal', async () => {
    await app.navigate('/research-tasks');

    // Click the "+ Task" button (AppButton variant=soft)
    await app.executeJs(`
      const btns = document.querySelectorAll('.app-btn--soft');
      for (const btn of btns) {
        if (btn.textContent.includes('Task')) { btn.click(); break; }
      }
    `);
    await app.settle();

    // Fill in the task field — first input[type=text] in the modal form
    // (The second text input is the PersonPicker)
    await app.executeJs(`
      const form = document.querySelector('.modal form');
      const input = form?.querySelector('input[type="text"]');
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'Find birth certificate for Anders');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    `);
    await app.settle();

    // Submit via the primary button
    await app.executeJs(`
      const btn = document.querySelector('.modal .app-btn--primary');
      if (btn) btn.click();
    `);
    await app.settle(500);

    await app.waitForText('Find birth certificate');
  });

  test('task appears in list with status chip', async () => {
    await app.navigate('/research-tasks');
    await app.waitForText('Find birth certificate');

    const hasStatusChip = await app.executeJs<boolean>(`
      !!document.querySelector('.status-chip')
    `);
    expect(hasStatusChip).toBe(true);
  });

  test('status chip cycling changes status', async () => {
    await app.navigate('/research-tasks');
    await app.waitForText('Find birth certificate');

    // Get initial status text
    const initialStatus = await app.executeJs<string>(`
      document.querySelector('.status-chip')?.textContent?.trim() ?? ''
    `);
    expect(initialStatus).toBe('Open');

    // Click the status chip to cycle
    await app.click('.status-chip');
    await app.settle(300);

    const nextStatus = await app.executeJs<string>(`
      document.querySelector('.status-chip')?.textContent?.trim() ?? ''
    `);
    expect(nextStatus).toBe('In Progress');

    // Click again
    await app.click('.status-chip');
    await app.settle(300);

    const thirdStatus = await app.executeJs<string>(`
      document.querySelector('.status-chip')?.textContent?.trim() ?? ''
    `);
    expect(thirdStatus).toBe('Done');
  });

  test('inline edit via row expansion', async () => {
    // Seed a fresh task for this test
    await app.createResearchTask({ task: 'Check census records', priority: 1, status: 'open' });
    await app.navigate('/');
    await app.navigate('/research-tasks');
    await app.waitForText('Check census records');

    // Click the row to expand it
    await app.executeJs(`
      const rows = document.querySelectorAll('.clickable-row');
      for (const row of rows) {
        if (row.textContent.includes('Check census')) {
          row.click();
          break;
        }
      }
    `);
    await app.settle(300);

    // Should show expanded row with edit fields
    const hasExpanded = await app.executeJs<boolean>(`
      !!document.querySelector('.expanded-row')
    `);
    expect(hasExpanded).toBe(true);

    // Edit the task text in the expanded form
    await app.executeJs(`
      const input = document.querySelector('.expanded-content input[type="text"]');
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'Check census records 1880-1900');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    `);
    await app.settle();

    // Click Save (uses .btn-add class in ResearchTasksTable)
    await app.executeJs(`
      const btn = document.querySelector('.expanded-actions .btn-add');
      if (btn) btn.click();
    `);
    await app.settle(500);

    // Verify the updated text persists
    await app.navigate('/');
    await app.navigate('/research-tasks');
    await app.waitForText('Check census records 1880-1900');
  });

  test('delete a research task', async () => {
    await app.createResearchTask({ task: 'Task To Delete' });
    await app.navigate('/');
    await app.navigate('/research-tasks');
    await app.waitForText('Task To Delete');

    // Override confirm and click delete button on the matching row
    await app.executeJs(`
      window.confirm = () => true;
      const rows = document.querySelectorAll('.clickable-row');
      for (const row of rows) {
        if (row.textContent.includes('Task To Delete')) {
          const delBtn = row.querySelector('.btn-sm.btn-delete, .btn-delete');
          if (delBtn) { delBtn.click(); break; }
        }
      }
    `);
    await app.settle(500);

    await app.expectNoText('Task To Delete');
  });
});

// ---------------------------------------------------------------------------
// Research Tasks — filter chips
// ---------------------------------------------------------------------------

test.describe('Research Tasks filtering', () => {
  test.beforeAll(async () => {
    // Seed tasks with different statuses
    await app.createResearchTask({ task: 'Open task alpha', status: 'open' });
    await app.createResearchTask({ task: 'Done task beta', status: 'done' });
    await app.createResearchTask({ task: 'Stopped task gamma', status: 'stopped' });
  });

  test('filter chips show counts', async () => {
    await app.navigate('/research-tasks');
    await app.waitForText('Open task alpha');

    // FilterChips uses .chip-btn class
    const chipTexts = await app.executeJs<string[]>(`
      Array.from(document.querySelectorAll('.chip-btn')).map(c => c.textContent.trim())
    `);
    expect(chipTexts.length).toBeGreaterThanOrEqual(2);
    // "All" chip should be present
    expect(chipTexts.some(t => t.includes('All'))).toBe(true);
  });

  test('filter by status shows only matching tasks', async () => {
    await app.navigate('/research-tasks');
    await app.waitForText('Open task alpha');

    // Click the "Done" filter chip
    await app.executeJs(`
      const chips = document.querySelectorAll('.chip-btn');
      for (const chip of chips) {
        if (chip.textContent.includes('Done')) { chip.click(); break; }
      }
    `);
    await app.settle(300);

    const dom = await app.getDom();
    expect(dom).toContain('Done task beta');
    expect(dom).not.toContain('Open task alpha');
    expect(dom).not.toContain('Stopped task gamma');
  });

  test('All filter shows all tasks', async () => {
    await app.navigate('/research-tasks');
    await app.waitForText('Open task alpha');

    // Click "Done" first
    await app.executeJs(`
      const chips = document.querySelectorAll('.chip-btn');
      for (const chip of chips) {
        if (chip.textContent.includes('Done')) { chip.click(); break; }
      }
    `);
    await app.settle(200);

    // Then click "All" (first chip)
    await app.executeJs(`
      document.querySelector('.chip-btn')?.click();
    `);
    await app.settle(200);

    const dom = await app.getDom();
    expect(dom).toContain('Open task alpha');
    expect(dom).toContain('Done task beta');
  });
});

// ---------------------------------------------------------------------------
// Research Tasks — summary
// ---------------------------------------------------------------------------

test.describe('Research Tasks summary', () => {
  test('summary shows total and active count', async () => {
    await app.navigate('/research-tasks');
    await app.settle(300);

    const dom = await app.getDom();
    // Summary format: "X research tasks · Y active"
    expect(dom).toContain('research tasks');
    expect(dom).toContain('active');
  });
});

// ---------------------------------------------------------------------------
// Research Tasks — priority badges
// ---------------------------------------------------------------------------

test.describe('Research Tasks priority', () => {
  test('priority badge renders with correct class', async () => {
    await app.createResearchTask({ task: 'High priority task', priority: 3, status: 'open' });
    await app.navigate('/');
    await app.navigate('/research-tasks');
    await app.waitForText('High priority task');

    const hasPriorityBadge = await app.executeJs<boolean>(`
      !!document.querySelector('.priority-badge.priority-3')
    `);
    expect(hasPriorityBadge).toBe(true);
  });
});
