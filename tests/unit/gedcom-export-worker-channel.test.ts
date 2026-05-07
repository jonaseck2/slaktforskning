import { describe, it, expect, beforeEach } from 'vitest';
import { channelRegistry, getChannel } from '../../src/shared/channels';
import { createPerson } from '../../src/api/persons';
import { createTestDb } from './helpers';

describe('gedcom:_exportRun worker channel — registration', () => {
  it('is registered as a worker channel and is non-mutating', () => {
    const ch = getChannel('gedcom:_exportRun');
    expect(ch).toBeDefined();
    expect(ch!.thread).toBe('worker');
    expect(ch!.mutating).toBe(false);
  });

  it('public gedcom:export remains a main-thread shim (not in registry)', () => {
    expect(getChannel('gedcom:export')).toBeUndefined();
  });

  it('has a handler function', () => {
    const ch = channelRegistry['gedcom:_exportRun'];
    expect(typeof (ch as { handler?: unknown }).handler).toBe('function');
  });
});

describe('gedcom:_exportRun handler — end-to-end against in-memory DB', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('returns a GEDCOM string + report for a seeded person', async () => {
    createPerson(db, { sex: 'F', given_name: 'Anna', surname: 'Lindström' });

    const ch = channelRegistry['gedcom:_exportRun'];
    if (!ch || ch.thread !== 'worker') throw new Error('channel missing');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (ch.handler as any)(db, { version: '5.5.1' });

    expect(typeof result.ged).toBe('string');
    expect(result.ged).toContain('0 HEAD');
    expect(result.ged).toContain('0 TRLR');
    expect(result.ged).toContain('Anna');
    expect(result.ged).toContain('Lindström');
    expect(result.report).toBeDefined();
  });

  it('respects version 7.0 in the produced GEDCOM', async () => {
    createPerson(db, { sex: 'M', given_name: 'Erik', surname: 'Test' });
    const ch = channelRegistry['gedcom:_exportRun'];
    if (!ch || ch.thread !== 'worker') throw new Error('channel missing');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (ch.handler as any)(db, { version: '7.0' });
    expect(result.ged).toContain('7.0');
  });
});
