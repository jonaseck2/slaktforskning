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
import { gunzipSync } from 'zlib';
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

async function seedFocusPerson(): Promise<string> {
  const id = await app.executeJs<string>(`(async () => {
    const p = await window.api.persons.create({ sex: 'U', living: false, given_name: 'Test', surname: 'Person' });
    await window.api.db.setSetting('default_person_id', p.id);
    return p.id;
  })()`);
  expect(id).toBeTruthy();
  return id;
}

function readPersons(snapshotJson: string): {
  persons: Array<{ id: string }>;
  personNames: Array<{ given_name: string }>;
} {
  return JSON.parse(snapshotJson);
}

test('website export (split mode) writes a working static site with data.json.gz', async () => {
  const outDir = path.join(os.tmpdir(), `slakt-export-split-${Date.now()}`);
  fs.mkdirSync(outDir, { recursive: true });

  const personId = await seedFocusPerson();

  await app.executeJs(`window.api.website.export(${JSON.stringify({
    siteTitle: 'E2E Test Site',
    focusPersonId: personId,
    scope: { everyone: true },
    options: { includeMedia: false, excludeLiving: false, redactLiving: false, mediaPersonOnly: false },
    mode: 'split',
    _outputDir: outDir,
  })})`);

  // Split mode: index.html + data.json.gz alongside it.
  expect(fs.existsSync(path.join(outDir, 'index.html'))).toBe(true);
  expect(fs.existsSync(path.join(outDir, 'data.json.gz'))).toBe(true);

  // Old data.js shape must be gone.
  expect(fs.existsSync(path.join(outDir, 'data.js'))).toBe(false);

  // Decompress the snapshot the same way the static SPA bootstrap does and
  // assert the seeded person round-tripped intact.
  const json = gunzipSync(fs.readFileSync(path.join(outDir, 'data.json.gz'))).toString('utf8');
  const data = readPersons(json);
  expect(data.persons.length).toBeGreaterThanOrEqual(1);
  expect(data.personNames.length).toBeGreaterThanOrEqual(1);
  expect(data.personNames[0].given_name).toBe('Test');

  fs.rmSync(outDir, { recursive: true, force: true });
});

test('website export (portable mode) embeds the snapshot inside index.html', async () => {
  const outDir = path.join(os.tmpdir(), `slakt-export-portable-${Date.now()}`);
  fs.mkdirSync(outDir, { recursive: true });

  const personId = await seedFocusPerson();

  await app.executeJs(`window.api.website.export(${JSON.stringify({
    siteTitle: 'E2E Test Site',
    focusPersonId: personId,
    scope: { everyone: true },
    options: { includeMedia: false, excludeLiving: false, redactLiving: false, mediaPersonOnly: false },
    mode: 'portable',
    _outputDir: outDir,
  })})`);

  // Portable mode: only index.html, no sibling data file.
  expect(fs.existsSync(path.join(outDir, 'index.html'))).toBe(true);
  expect(fs.existsSync(path.join(outDir, 'data.json.gz'))).toBe(false);
  expect(fs.existsSync(path.join(outDir, 'data.js'))).toBe(false);

  // Extract __SNAPSHOT_GZ__ from the inline <script> tag, decode like the
  // static SPA bootstrap does, and assert the seeded person made it through.
  const html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
  const m = html.match(/window\.__SNAPSHOT_GZ__=(?:"|')([^"']+)(?:"|');/);
  expect(m).not.toBeNull();
  const b64 = m![1];
  const json = gunzipSync(Buffer.from(b64, 'base64')).toString('utf8');
  const data = readPersons(json);
  expect(data.persons.length).toBeGreaterThanOrEqual(1);
  expect(data.personNames.length).toBeGreaterThanOrEqual(1);
  expect(data.personNames[0].given_name).toBe('Test');

  fs.rmSync(outDir, { recursive: true, force: true });
});
