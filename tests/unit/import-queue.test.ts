// A researcher picks four exports and gets all four imported, in order, with
// one file's failure costing them only that file.
// See docs/plans/2026-08-23-multi-file-import-consolidation.md.

import { describe, it, expect, vi } from 'vitest';
import { runImportQueue } from '../../src/renderer/components/import/import-queue';

describe('runImportQueue', () => {
  it('imports every file in the order given', async () => {
    const seen: string[] = [];
    await runImportQueue(['a', 'b', 'c'], async f => { seen.push(f); return f; });
    expect(seen).toEqual(['a', 'b', 'c']);
  });

  it('never runs two imports at once', async () => {
    let inFlight = 0, maxInFlight = 0;
    await runImportQueue(['a', 'b', 'c'], async f => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(r => setTimeout(r, 1));
      inFlight--; return f;
    });
    expect(maxInFlight, 'accounting sessions must not overlap').toBe(1);
  });

  it('carries on after a failure and names it in the result', async () => {
    const res = await runImportQueue(['a', 'bad', 'c'], async f => {
      if (f === 'bad') throw new Error('boom');
      return f;
    });
    expect(res.succeeded).toBe(2);
    expect(res.failed).toBe(1);
    expect(res.results[1].error).toContain('boom');
    expect(res.results[2].report).toBe('c');
  });

  it('names the file that failed, not just the message', async () => {
    const res = await runImportQueue(['a', 'bad'], async f => {
      if (f === 'bad') throw new Error('boom');
      return f;
    });
    expect(res.results[1].file).toBe('bad');
    expect(res.results[1].report).toBeNull();
  });

  it('survives a throw that is not an Error', async () => {
    const res = await runImportQueue(['bad'], async () => { throw 'plain string'; });
    expect(res.failed).toBe(1);
    expect(res.results[0].error).toContain('plain string');
  });

  it('reports progress once per file', async () => {
    const onProgress = vi.fn();
    await runImportQueue(['a', 'b'], async f => f, onProgress);
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith(2, 2, 'b');
  });

  it('reports progress for a file that failed too', async () => {
    const onProgress = vi.fn();
    await runImportQueue(['bad'], async () => { throw new Error('boom'); }, onProgress);
    expect(onProgress).toHaveBeenCalledWith(1, 1, 'bad');
  });

  it('handles an empty list without calling the importer', async () => {
    const importOne = vi.fn();
    const res = await runImportQueue([], importOne);
    expect(importOne).not.toHaveBeenCalled();
    expect(res).toEqual({ results: [], succeeded: 0, failed: 0 });
  });
});
