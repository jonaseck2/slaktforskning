/**
 * Regression test for the renderer-cache refresh wiring.
 *
 * MCP-side mutations bypass the preload `mutating()` wrapper, so the only way
 * for list views (Places, Groups, Tasks, Media) and panel sections to learn
 * about MCP writes is via a `data:changed` worker broadcast forwarded to all
 * BrowserWindows by the main process. Without this round trip, MCP-driven
 * tests show "Inga grupper / Inga platser / Inga uppgifter" while the DB
 * holds dozens of rows — the failure mode the Bernadotte test surfaced.
 *
 * Both ends of the wiring are static text checks against the source files:
 *
 *  - `src/main/db-worker.ts` must call `broadcast('data:changed', …)` after
 *    a successful mutating channel handler.
 *  - `src/preload/index.ts` must subscribe to `ipcRenderer.on('data:changed', …)`
 *    and fan out to the existing `dataChangedListeners` registry.
 *
 * If either side is removed, tests using MCP to seed data will silently
 * regress to the old "stale renderer" behaviour.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..', '..');

describe('data:changed broadcast wiring', () => {
  it('worker broadcasts data:changed after successful mutating channel handlers', () => {
    const src = readFileSync(join(repoRoot, 'src/main/db-worker.ts'), 'utf8');
    expect(src).toMatch(/regCh\.mutating[\s\S]{0,200}broadcast\(\s*['"]data:changed['"]/);
  });

  it('preload subscribes to data:changed and fires dataChangedListeners', () => {
    const src = readFileSync(join(repoRoot, 'src/preload/index.ts'), 'utf8');
    expect(src).toMatch(/ipcRenderer\.on\(\s*['"]data:changed['"]/);
    expect(src).toMatch(/fireDataChanged\(\)/);
  });
});
