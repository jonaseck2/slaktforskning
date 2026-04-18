/**
 * E2E: Media library — create via API, gallery/list view toggle, inline edit,
 * link/unlink, delete. File-dialog-based attach is not testable in E2E
 * (requires OS dialog), so we seed media via window.api.media.create().
 *
 * Runs on port 19248 with its own Electron instance, in parallel with other gui-* suites.
 */
import { test, expect } from '@playwright/test';
import {
  AppDriver,
  AppInstance,
  startApp,
  teardownApp,
} from './fixture';

const UI_PORT = 19248;
let instance: AppInstance;
const app = new AppDriver(UI_PORT);

test.beforeAll(async () => {
  instance = await startApp(UI_PORT, 'media');
  await app.settle(150);
  await app.setLocale('en');
});

test.afterAll(async () => {
  await teardownApp(instance);
});

test.setTimeout(30_000);

// ---------------------------------------------------------------------------
// Media View — empty state
// ---------------------------------------------------------------------------

test.describe('Media empty state', () => {
  test('shows empty state when no media', async () => {
    await app.navigate('/media');
    await app.waitForText('No media');
  });
});

// ---------------------------------------------------------------------------
// Media View — with seeded data
// ---------------------------------------------------------------------------

test.describe('Media CRUD', () => {
  let mediaId1: string;
  let mediaId2: string;
  let personId: string;

  test.beforeAll(async () => {
    personId = (await app.createPerson({ given_name: 'Photo', surname: 'Subject' })).id;
    mediaId1 = (await app.createMedia({ title: 'Family Photo', format: 'jpg', notes: 'Summer 1985' })).id;
    mediaId2 = (await app.createMedia({ title: 'Church Record', format: 'pdf', notes: 'Baptism' })).id;

    // Link media to person
    await app.addMediaLink({ media_id: mediaId1, entity_type: 'person', entity_id: personId, sort_order: 0 });
    await app.addMediaLink({ media_id: mediaId2, entity_type: 'person', entity_id: personId, sort_order: 1 });
  });

  test('media list shows seeded items', async () => {
    // Navigate away and back to ensure fresh data load
    await app.navigate('/');
    await app.navigate('/media');
    await app.waitForText('Family Photo');
    await app.expectText('Church Record');
  });

  test('showing count label', async () => {
    await app.navigate('/media');
    await app.waitForText('Family Photo');
    const dom = await app.getDom();
    // Should show "Showing X of Y media"
    expect(dom).toContain('Showing');
  });

  test('toggle between gallery and list view', async () => {
    await app.navigate('/media');
    await app.waitForText('Family Photo');

    // Click "List" view button
    await app.executeJs(`
      (() => {
        const btns = document.querySelectorAll('.view-toggle button');
        for (const btn of btns) {
          if (btn.textContent.trim() === 'List') { btn.click(); return; }
        }
      })()
    `);
    await app.settle(300);

    // List view should show a table
    const dom1 = await app.getDom();
    expect(dom1).toContain('media-table');

    // Switch back to gallery
    await app.executeJs(`
      (() => {
        const btns = document.querySelectorAll('.view-toggle button');
        for (const btn of btns) {
          if (btn.textContent.trim() === 'Gallery') { btn.click(); return; }
        }
      })()
    `);
    await app.settle(300);

    const dom2 = await app.getDom();
    expect(dom2).toContain('gallery-grid');
  });

  test('search filters media items', async () => {
    await app.navigate('/');
    await app.navigate('/media');
    await app.waitForText('Family Photo');

    // Use waitAndFill which waits for the element to appear before filling
    await app.waitAndFill('.gallery-search', 'Church');
    await app.settle(500);

    const dom = await app.getDom();
    expect(dom).toContain('Church Record');
    // Family Photo should be filtered out — check only in the main content area
    const mainContent = await app.executeJs<boolean>(`
      (() => {
        const cards = document.querySelectorAll('.gallery-card');
        return Array.from(cards).some(c => c.textContent.includes('Family Photo'));
      })()
    `);
    expect(mainContent).toBe(false);
  });

  test('search shows all when cleared', async () => {
    await app.navigate('/');
    await app.navigate('/media');
    await app.waitForText('Family Photo');

    await app.waitAndFill('.gallery-search', 'Church');
    await app.settle(500);
    await app.waitAndFill('.gallery-search', '');
    await app.settle(500);

    await app.expectText('Family Photo');
    await app.expectText('Church Record');
  });

  test('inline edit title in list view', async () => {
    await app.navigate('/');
    await app.navigate('/media');
    await app.waitForText('Family Photo');

    // Switch to list view
    await app.executeJs(`
      (() => {
        const btns = document.querySelectorAll('.view-toggle button');
        for (const btn of btns) {
          if (btn.textContent.trim() === 'List') { btn.click(); return; }
        }
      })()
    `);
    await app.settle(300);

    // The inline edit uses :value + @blur save pattern.
    // Set the native value and then blur to trigger the save handler.
    await app.executeJs(`
      new Promise(resolve => {
        const input = document.querySelector('.media-table .inline-edit');
        if (input) {
          input.focus();
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          setter.call(input, 'Updated Photo Title');
          // Blur triggers the save (the @blur handler compares new vs old value)
          input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
        }
        setTimeout(resolve, 200);
      })
    `);
    await app.settle(500);

    // Reload to verify persistence
    await app.navigate('/');
    await app.navigate('/media');

    // Switch back to list view to see the title
    await app.executeJs(`
      (() => {
        const btns = document.querySelectorAll('.view-toggle button');
        for (const btn of btns) {
          if (btn.textContent.trim() === 'List') { btn.click(); return; }
        }
      })()
    `);
    await app.settle(300);

    await app.waitForText('Updated Photo Title');
  });

  test('delete a media item', async () => {
    // Create a media item to delete
    await app.createMedia({ title: 'To Be Deleted', format: 'png' });
    await app.navigate('/');
    await app.navigate('/media');
    await app.waitForText('To Be Deleted');

    // Override confirm and click delete
    await app.executeJs(`
      (() => {
        window.confirm = () => true;
        const cards = document.querySelectorAll('.gallery-card');
        for (const card of cards) {
          if (card.textContent.includes('To Be Deleted')) {
            const delBtn = card.querySelector('.card-delete');
            if (delBtn) delBtn.click();
            return;
          }
        }
      })()
    `);
    await app.settle(500);

    await app.expectNoText('To Be Deleted');
  });
});
