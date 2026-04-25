import { test, expect, _electron as electron } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

test('website export produces a working static site', async () => {
  const dbPath = path.join(os.tmpdir(), `slakt-export-${Date.now()}.db`);
  const outDir = path.join(os.tmpdir(), `slakt-export-out-${Date.now()}`);
  fs.mkdirSync(outDir, { recursive: true });

  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, SLAKTFORSKNING_DB: dbPath },
  });

  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  // Seed: create a focus person
  const personId = await page.evaluate(async () => {
    const p = await (window as never as { api: Record<string, Record<string, (...a: unknown[]) => Promise<unknown>>> }).api.persons.create({ sex: 'U', living: false });
    return (p as { id: string }).id;
  });
  await page.evaluate(async (id: string) => {
    await (window as never as { api: Record<string, Record<string, (...a: unknown[]) => Promise<unknown>>> }).api.persons.addName(id, { given_name: 'Test', surname: 'Person' });
    await (window as never as { api: Record<string, Record<string, (...a: unknown[]) => Promise<unknown>>> }).api.db.setSetting('default_person_id', id);
  }, personId);

  // Trigger export with test bypass
  await page.evaluate(async (args: { outDir: string; personId: string }) => {
    await (window as never as { api: Record<string, Record<string, (...a: unknown[]) => Promise<unknown>>> }).api.website.export({
      siteTitle: 'E2E Test Site',
      focusPersonId: args.personId,
      scope: { everyone: true },
      options: {
        includeMedia: false,
        excludeLiving: false,
        redactLiving: false,
      },
      _outputDir: args.outDir,
    });
  }, { outDir, personId });

  await app.close();

  // Verify output — data is written as data.js (window.__SNAPSHOT__=...) so it loads via <script> from file://
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
});
