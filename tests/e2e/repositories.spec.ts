/**
 * E2E coverage for the Repositories CRUD UI (T10 — GEDCOM alignment).
 *
 * User goal: a genealogist can author, view, edit, and delete repositories
 * from the running UI, and can link an existing repository to a source.
 * Before T10 the `repositories` table had no UI — users could only touch it
 * via MCP / external tools. This spec drives the new surfaces end-to-end:
 *
 *  1. Navigate to /repositories, confirm route + view mount.
 *  2. Use window.api.repositories.create — exercises the same IPC the
 *     RepositoryModal's Save button calls.
 *  3. Read the repository back through .get + .list.
 *  4. Edit a field via .update (the inline-edit path the panel uses).
 *  5. Link the repository to a source via .linkSource, then read via
 *     .forSource (the path SourceRepositoriesSection drives).
 *  6. Unlink and delete; confirm both succeed.
 *
 * Why this shape (API round-trip rather than DOM clicks): the renderer
 * components are exhaustively unit-tested (RepositoryPanel.test.ts,
 * panel-empty-state coverage, lint+vue-tsc). What this spec adds is
 * runtime IPC coverage — that the new `window.api.repositories.*` calls
 * reach a real handler in the packaged binary, and that the link/unlink
 * round-trip survives the renderer → Rust → SQLite → back chain.
 */
import { test, expect } from '@playwright/test';
import { startApp, teardownApp, AppDriver, AppInstance } from './fixture';

const UI_PORT = 19256;
const app = new AppDriver(UI_PORT);
let instance: AppInstance | undefined;

test.beforeAll(async () => {
  instance = await startApp(UI_PORT, 'repositories');
});

test.afterAll(async () => {
  await teardownApp(instance);
});

test('repositories CRUD + source link round-trips through the IPC chain', async () => {
  // ── 1. Open the new /repositories route. The redirect map must let us
  //       reach it without the legacy /database, /import-export, /map etc.
  //       redirects catching us. ──────────────────────────────────────────
  await app.navigate('/repositories');
  await app.settle(300);
  const routeNow = await app.executeJs<string>(
    `(async () => window.__vue_router.currentRoute.value.path)()`,
  );
  expect(routeNow).toBe('/repositories');

  // ── 2. Create a repository (the Save IPC the modal fires). ─────────────
  const repoId = await app.executeJs<string>(`(async () => {
    const r = await window.api.repositories.create({
      name: 'Riksarkivet',
      address: 'Marieberg',
      city: 'Stockholm',
      country: 'Sverige',
      web: 'https://riksarkivet.se',
      notes: '',
    });
    return r.id;
  })()`);
  expect(repoId).toBeTruthy();

  // ── 3. Read it back via get + list (panel + view loaders). ─────────────
  const after = await app.executeJs<{
    repo: { id: string; name: string; city: string | null };
    total: number;
  }>(`(async () => {
    const repo = await window.api.repositories.get(${JSON.stringify(repoId)});
    const list = await window.api.repositories.list();
    return { repo, total: list.length };
  })()`);
  expect(after.repo.id).toBe(repoId);
  expect(after.repo.name).toBe('Riksarkivet');
  expect(after.repo.city).toBe('Stockholm');
  expect(after.total).toBeGreaterThanOrEqual(1);

  // ── 4. Inline-edit a field (the @blur save path the panel uses). ──────
  await app.executeJs<{ id: string }>(`(async () => {
    return await window.api.repositories.update(${JSON.stringify(repoId)}, { city: 'Arninge' });
  })()`);
  const edited = await app.executeJs<{ city: string | null }>(
    `(async () => await window.api.repositories.get(${JSON.stringify(repoId)}))()`,
  );
  expect(edited.city).toBe('Arninge');

  // ── 5. Create a source and link the repository to it (the
  //       SourceRepositoriesSection picker path). ─────────────────────────
  const sourceId = await app.executeJs<string>(`(async () => {
    const s = await window.api.sources.create({ title: 'Husforhorslangd 1850' });
    await window.api.repositories.linkSource(s.id, ${JSON.stringify(repoId)});
    return s.id;
  })()`);
  const linkedRepos = await app.executeJs<Array<{ id: string }>>(
    `(async () => await window.api.repositories.forSource(${JSON.stringify(sourceId)}))()`,
  );
  expect(linkedRepos.length).toBe(1);
  expect(linkedRepos[0]!.id).toBe(repoId);

  // ── 6. Unlink and delete. ─────────────────────────────────────────────
  const cleanup = await app.executeJs<{ unlinked: boolean; deleted: boolean }>(`(async () => {
    const u = await window.api.repositories.unlinkSource(${JSON.stringify(sourceId)}, ${JSON.stringify(repoId)});
    const d = await window.api.repositories.delete(${JSON.stringify(repoId)});
    return { unlinked: !!u, deleted: !!d };
  })()`);
  expect(cleanup.unlinked).toBe(true);
  expect(cleanup.deleted).toBe(true);

  const afterDelete = await app.executeJs<unknown>(
    `(async () => await window.api.repositories.get(${JSON.stringify(repoId)}))()`,
  );
  expect(afterDelete).toBeNull();
});
