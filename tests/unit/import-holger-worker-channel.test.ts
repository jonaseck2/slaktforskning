import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { channelRegistry } from '../../src/shared/channels';
import {
  _setBroadcastTarget,
  _resetBroadcastTarget,
} from '../../src/main/db-worker-broadcast';
import {
  _setWorkerStateAccessors,
  _resetWorkerStateAccessors,
} from '../../src/main/db-worker-state';
import { createTestDb } from './helpers';

const MIN_GED = `0 HEAD
1 GEDC
2 VERS 5.5
0 @I1@ INDI
1 NAME Anna /Lindström/
1 SEX F
0 TRLR`;

describe('import:holgerRun worker channel', () => {
  it('is registered in the channel registry', () => {
    const ch = channelRegistry['import:holgerRun'];
    expect(ch).toBeDefined();
  });

  it('is registered as a worker channel', () => {
    const ch = channelRegistry['import:holgerRun'];
    expect(ch!.thread).toBe('worker');
  });

  it('is marked as mutating (so renderer dataChanged listeners fire after import)', () => {
    const ch = channelRegistry['import:holgerRun'];
    expect(ch!.mutating).toBe(true);
  });

  it('has a handler function', () => {
    const ch = channelRegistry['import:holgerRun'];
    expect(typeof (ch as { handler?: unknown }).handler).toBe('function');
  });
});

describe('import:holgerRun handler — end-to-end against in-memory DB', () => {
  let tmpDir: string;
  let db: ReturnType<typeof createTestDb>;
  let importFlag: boolean;
  const broadcasts: Array<{ type: string; topic?: string; payload?: unknown }> = [];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holger-channel-test-'));
    db = createTestDb();
    importFlag = false;
    broadcasts.length = 0;

    // Wire worker-state accessors. The fake dbPath points at tmpDir so
    // getMediaDir() and consolidateMediaFolder() resolve to a real (empty) dir.
    const fakeDbPath = path.join(tmpDir, 'family.db');
    _setWorkerStateAccessors({
      getDbPath: () => fakeDbPath,
      getImportInProgress: () => importFlag,
      setImportInProgress: (v: boolean) => { importFlag = v; },
    });

    // Capture broadcasts via a stub postMessage target.
    _setBroadcastTarget({
      postMessage: (msg: unknown) => {
        broadcasts.push(msg as { type: string; topic?: string; payload?: unknown });
      },
    });
  });

  afterEach(() => {
    _resetWorkerStateAccessors();
    _resetBroadcastTarget();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('imports a .ged file end-to-end and returns success + report', async () => {
    const gedPath = path.join(tmpDir, 'tree.ged');
    fs.writeFileSync(gedPath, MIN_GED);

    const ch = channelRegistry['import:holgerRun'];
    if (!ch || ch.thread !== 'worker') throw new Error('channel missing');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (ch.handler as any)(db, { sourcePath: gedPath });

    expect(result.success).toBe(true);
    expect(result.report.persons).toBe(1);

    // DB state assertion (per /tests rule: assert state, not return value alone)
    const persons = db.prepare('SELECT * FROM persons').all([]) as unknown[];
    expect(persons).toHaveLength(1);
  });

  it('rejects missing sourcePath without throwing', async () => {
    const ch = channelRegistry['import:holgerRun'];
    if (!ch || ch.thread !== 'worker') throw new Error('channel missing');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (ch.handler as any)(db, {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('sourcePath');
  });

  it('flips importInProgress around the import', async () => {
    const gedPath = path.join(tmpDir, 'tree.ged');
    fs.writeFileSync(gedPath, MIN_GED);

    const ch = channelRegistry['import:holgerRun'];
    if (!ch || ch.thread !== 'worker') throw new Error('channel missing');

    expect(importFlag).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (ch.handler as any)(db, { sourcePath: gedPath });
    // Final state: cleared (the flag should be flipped on/off inside the handler)
    expect(importFlag).toBe(false);
  });

  it('emits progress as broadcast envelopes on topic import:holgerProgress', async () => {
    const gedPath = path.join(tmpDir, 'tree.ged');
    fs.writeFileSync(gedPath, MIN_GED);

    const ch = channelRegistry['import:holgerRun'];
    if (!ch || ch.thread !== 'worker') throw new Error('channel missing');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (ch.handler as any)(db, { sourcePath: gedPath });

    const progressEvents = broadcasts.filter(
      (b) => b.type === 'broadcast' && b.topic === 'import:holgerProgress',
    );
    expect(progressEvents.length).toBeGreaterThan(0);
    // Payload shape matches what the renderer listener expects (data.message)
    expect(progressEvents[0].payload).toMatchObject({ message: expect.any(String) });
  });
});
