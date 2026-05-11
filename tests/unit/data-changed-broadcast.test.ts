/**
 * Regression test for the renderer-cache refresh wiring.
 *
 * MCP-side mutations bypass the preload `mutating()` wrapper, so the only way
 * for list views (Places, Groups, Tasks, Media) and panel sections to learn
 * about MCP writes is via a `data:changed` broadcast forwarded to all
 * renderer windows. Without this round trip, MCP-driven tests show "Inga
 * grupper / Inga platser / Inga uppgifter" while the DB holds dozens of rows
 * — the failure mode the Bernadotte test surfaced.
 *
 * The mechanism differs between runtimes but the user goal is identical:
 *
 *   Electron build:
 *     - `src/main/db-worker.ts` calls `broadcast('data:changed', …)` after
 *       a successful mutating channel handler.
 *     - `src/preload/index.ts` subscribes via `ipcRenderer.on('data:changed', …)`
 *       and fans out to the existing `dataChangedListeners` registry.
 *
 *   Tauri build:
 *     - `src/renderer/tauri-window-api.ts` calls `emit('data:changed')`
 *       inside `fireDataChanged()` after every mutating registry channel,
 *       and `listen('data:changed', …)` to receive cross-window events.
 *
 * Both arms run unconditionally — the Tauri build is the one shipped to
 * users today; the Electron arm guards against a regression while the
 * Electron build is still maintained alongside.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const repoRoot = join(__dirname, '..', '..');

describe('data:changed broadcast wiring', () => {
  it('Electron worker broadcasts data:changed after successful mutating channel handlers', () => {
    const src = readFileSync(join(repoRoot, 'src/main/db-worker.ts'), 'utf8');
    expect(src).toMatch(/regCh\.mutating[\s\S]{0,200}broadcast\(\s*['"]data:changed['"]/);
  });

  it('Electron preload subscribes to data:changed and fires dataChangedListeners', () => {
    const src = readFileSync(join(repoRoot, 'src/preload/index.ts'), 'utf8');
    expect(src).toMatch(/ipcRenderer\.on\(\s*['"]data:changed['"]/);
    expect(src).toMatch(/fireDataChanged\(\)/);
  });

  it('Tauri renderer emits data:changed cross-window in fireDataChanged()', () => {
    const src = readFileSync(join(repoRoot, 'src/renderer/tauri-window-api.ts'), 'utf8');
    // emit() is called via the dynamic import('@tauri-apps/api/event').then(({ emit }) => …).
    // Match the import + the literal 'data:changed' near it so a removal
    // of either side fails the assertion loudly.
    expect(src).toMatch(/@tauri-apps\/api\/event/);
    expect(src).toMatch(/emit\(\s*['"]data:changed['"]/);
  });

  it('Tauri renderer listens for data:changed from other windows', () => {
    const src = readFileSync(join(repoRoot, 'src/renderer/tauri-window-api.ts'), 'utf8');
    expect(src).toMatch(/listen\(\s*['"]data:changed['"]/);
  });
});
