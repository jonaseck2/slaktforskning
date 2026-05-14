import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { withImportLifecycle } from '../../src/api/import_lifecycle';
import {
  _setWorkerStateAccessors,
  _resetWorkerStateAccessors,
} from '../../src/shared/db-worker-state';

describe('withImportLifecycle', async () => {
  let importInProgress = false;

  beforeEach(() => {
    importInProgress = false;
    _setWorkerStateAccessors({
      getDbPath: () => '/tmp/x.db',
      getImportInProgress: () => importInProgress,
      setImportInProgress: (v: boolean) => { importInProgress = v; },
    });
  });

  afterEach(() => {
    _resetWorkerStateAccessors();
  });

  it('flips importInProgress on then off and returns { success, report }', async () => {
    const observed: boolean[] = [];
    const result = await withImportLifecycle('test', async () => {
      observed.push(importInProgress);
      return { rows: 7 };
    });
    expect(observed).toEqual([true]);
    expect(importInProgress).toBe(false);
    expect(result).toEqual({ success: true, report: { rows: 7 } });
  });

  it('clears importInProgress on error and returns { success: false, error }', async () => {
    const result = await withImportLifecycle('test', async () => {
      throw new Error('boom');
    });
    expect(importInProgress).toBe(false);
    expect(result.success).toBe(false);
    expect(result.error).toBe('boom');
  });
});
