/**
 * Regression test for the renderer-cache refresh wiring.
 *
 * MCP-side mutations bypass the renderer's local `dataChangedListeners`, so
 * the only way for list views (Places, Groups, Tasks, Media) and panel
 * sections to learn about MCP writes is via a `data:changed` broadcast
 * forwarded to all renderer windows. Without this round trip, MCP-driven
 * tests show "Inga grupper / Inga platser / Inga uppgifter" while the DB
 * holds dozens of rows — the failure mode the Bernadotte test surfaced.
 *
 * Tauri-only wiring:
 *   - `src/renderer/tauri-window-api.ts` calls `emit('data:changed')`
 *     inside `fireDataChanged()` after every mutating registry channel,
 *     and `listen('data:changed', …)` to receive cross-window events.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const repoRoot = join(__dirname, '..', '..');

describe('data:changed broadcast wiring', () => {
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
