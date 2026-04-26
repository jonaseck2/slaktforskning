/**
 * E2E: website:export IPC handler writes a working static site bundle.
 *
 * Why this stays e2e:
 *  - Touches the real filesystem from the main process
 *  - Exercises IPC + node fs + nativeImage (thumbnail pipeline)
 *  - The unit-side snapshot serialiser is covered by tests/unit/staticApi.test.ts;
 *    this test exists only to prove the file write end-to-end works.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { test, expect } from '@playwright/test';
import { startApp, teardownApp, AppDriver, AppInstance } from './fixture';

const UI_PORT = 19202;
const app = new AppDriver(UI_PORT);
let instance: AppInstance | undefined;

test.beforeAll(async () => {
  instance = await startApp(UI_PORT, 'website-export');
});

test.afterAll(async () => {
  await teardownApp(instance);
});

test('website export produces a working static site', async () => {
  const outDir = path.join(os.tmpdir(), `slakt-export-out-${Date.now()}`);
  fs.mkdirSync(outDir, { recursive: true });

  // Seed: create a focus person via real IPC.
  const personId = await app.executeJs<string>(`(async () => {
    const p = await window.api.persons.create({ sex: 'U', living: false });
    await window.api.persons.addName(p.id, { given_name: 'Test', surname: 'Person' });
    await window.api.db.setSetting('default_person_id', p.id);
    return p.id;
  })()`);
  expect(personId).toBeTruthy();

  // Trigger the export through the real IPC handler.
  await app.executeJs(`window.api.website.export(${JSON.stringify({
    siteTitle: 'E2E Test Site',
    focusPersonId: personId,
    scope: { everyone: true },
    options: {
      includeMedia: false,
      excludeLiving: false,
      redactLiving: false,
      mediaPersonOnly: false,
    },
    _outputDir: outDir,
  })})`);

  // Verify output — data.js wraps the snapshot as window.__SNAPSHOT__=...
  expect(fs.existsSync(path.join(outDir, 'data.js'))).toBe(true);
  const dataJs = fs.readFileSync(path.join(outDir, 'data.js'), 'utf-8');
  const json = dataJs.replace(/^window\.__SNAPSHOT__=/, '').replace(/;$/, '');
  const data = JSON.parse(json) as {
    persons: Array<{ id: string }>;
    personNames: Array<{ given_name: string }>;
  };
  expect(data.persons.length).toBeGreaterThanOrEqual(1);
  expect(data.personNames.length).toBeGreaterThanOrEqual(1);
  expect(data.personNames[0].given_name).toBe('Test');

  fs.rmSync(outDir, { recursive: true, force: true });
});
