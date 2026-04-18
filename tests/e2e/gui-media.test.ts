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

    // Click "List" view button (AppButton inside .view-toggle)
    await app.executeJs(`
      const btns = document.querySelectorAll('.view-toggle .app-btn');
      for (const btn of btns) {
        if (btn.textContent.trim() === 'List') { btn.click(); break; }
      }
    `);
    await app.settle(200);

    // List view should show a table
    const hasList = await app.executeJs<boolean>(`
      !!document.querySelector('.media-table')
    `);
    expect(hasList).toBe(true);

    // Switch back to gallery
    await app.executeJs(`
      const btns = document.querySelectorAll('.view-toggle .app-btn');
      for (const btn of btns) {
        if (btn.textContent.trim() === 'Gallery') { btn.click(); break; }
      }
    `);
    await app.settle(200);

    const hasGallery = await app.executeJs<boolean>(`
      !!document.querySelector('.gallery-grid')
    `);
    expect(hasGallery).toBe(true);
  });

  test('search filters media items', async () => {
    await app.navigate('/media');
    await app.waitForText('Family Photo');

    await app.waitAndFill('.gallery-search', 'Church');
    await app.settle(500);

    const dom = await app.getDom();
    expect(dom).toContain('Church Record');
    // Family Photo should be filtered out
    expect(dom).not.toContain('Family Photo');
  });

  test('search shows all when cleared', async () => {
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
    await app.navigate('/media');
    await app.waitForText('Family Photo');

    // Switch to list view
    await app.executeJs(`
      const btns = document.querySelectorAll('.view-toggle .app-btn');
      for (const btn of btns) {
        if (btn.textContent.trim() === 'List') { btn.click(); break; }
      }
    `);
    await app.settle(200);

    // Edit the title of the first media item
    await app.executeJs(`
      const input = document.querySelector('.media-table .inline-edit');
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'Updated Photo Title');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.blur();
      }
    `);
    await app.settle(500);

    // Reload to verify persistence
    await app.navigate('/');
    await app.navigate('/media');
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
      window.confirm = () => true;
      const cards = document.querySelectorAll('.gallery-card');
      for (const card of cards) {
        if (card.textContent.includes('To Be Deleted')) {
          const delBtn = card.querySelector('.card-delete');
          if (delBtn) delBtn.click();
          break;
        }
      }
    `);
    await app.settle(500);

    await app.expectNoText('To Be Deleted');
  });
});
