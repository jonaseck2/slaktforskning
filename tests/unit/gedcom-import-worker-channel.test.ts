import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { channelRegistry } from '../../src/shared/channels';
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

describe('gedcom:import / gedcom:preview worker channels', () => {
  it('gedcom:import is registered as a worker channel and is mutating', () => {
    const ch = channelRegistry['gedcom:import'];
    expect(ch).toBeDefined();
    expect(ch!.thread).toBe('worker');
    expect(ch!.mutating).toBe(true);
  });

  it('gedcom:preview is registered as a worker channel and is non-mutating', () => {
    const ch = channelRegistry['gedcom:preview'];
    expect(ch).toBeDefined();
    expect(ch!.thread).toBe('worker');
    expect(ch!.mutating).toBe(false);
  });

  it('gedcom:import has a handler function', () => {
    const ch = channelRegistry['gedcom:import'];
    expect(typeof (ch as { handler?: unknown }).handler).toBe('function');
  });

  it('gedcom:preview has a handler function', () => {
    const ch = channelRegistry['gedcom:preview'];
    expect(typeof (ch as { handler?: unknown }).handler).toBe('function');
  });
});

describe('gedcom:import handler — end-to-end against in-memory DB', () => {
  let tmpDir: string;
  let db: ReturnType<typeof createTestDb>;
  let importFlag: boolean;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gedcom-channel-test-'));
    db = createTestDb();
    importFlag = false;

    const fakeDbPath = path.join(tmpDir, 'family.db');
    _setWorkerStateAccessors({
      getDbPath: () => fakeDbPath,
      getImportInProgress: () => importFlag,
      setImportInProgress: (v: boolean) => { importFlag = v; },
    });
  });

  afterEach(() => {
    _resetWorkerStateAccessors();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('imports a .ged file end-to-end and returns success + report', async () => {
    const gedPath = path.join(tmpDir, 'tree.ged');
    fs.writeFileSync(gedPath, MIN_GED);

    const ch = channelRegistry['gedcom:import'];
    if (!ch || ch.thread !== 'worker') throw new Error('channel missing');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (ch.handler as any)(db, { filePath: gedPath });

    expect(result.success).toBe(true);
    expect(result.report.persons).toBe(1);

    const persons = db.prepare('SELECT * FROM persons').all([]) as unknown[];
    expect(persons).toHaveLength(1);
  });

  it('flips importInProgress around the import', async () => {
    const gedPath = path.join(tmpDir, 'tree.ged');
    fs.writeFileSync(gedPath, MIN_GED);

    const ch = channelRegistry['gedcom:import'];
    if (!ch || ch.thread !== 'worker') throw new Error('channel missing');

    expect(importFlag).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (ch.handler as any)(db, { filePath: gedPath });
    expect(importFlag).toBe(false);
  });
});

describe('gedcom:preview handler — end-to-end', () => {
  let tmpDir: string;
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gedcom-preview-channel-test-'));
    db = createTestDb();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns a preview without mutating the DB', async () => {
    const gedPath = path.join(tmpDir, 'tree.ged');
    fs.writeFileSync(gedPath, MIN_GED);

    const ch = channelRegistry['gedcom:preview'];
    if (!ch || ch.thread !== 'worker') throw new Error('channel missing');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (ch.handler as any)(db, { filePath: gedPath });

    // Handler returns the preview-shaped envelope used by the renderer.
    expect(result.canceled).toBeFalsy();
    expect(result.filePath).toBe(gedPath);
    expect(result.preview).toBeDefined();
    expect(result.preview.personCount).toBe(1);

    // No DB writes
    const persons = db.prepare('SELECT * FROM persons').all([]) as unknown[];
    expect(persons).toHaveLength(0);
  });
});
