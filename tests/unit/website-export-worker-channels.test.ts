import { describe, it, expect } from 'vitest';
import { getChannel } from '../../src/shared/channels';
import { createPerson } from '../../src/api/persons';
import { createTestDb } from './helpers';

describe('website:previewSnapshot worker channel — registration', () => {
  it('is registered as a worker channel and is non-mutating', () => {
    const ch = getChannel('website:previewSnapshot');
    expect(ch).toBeDefined();
    expect(ch!.thread).toBe('worker');
    expect(ch!.mutating).toBe(false);
  });

  it('has a handler function', () => {
    const ch = getChannel('website:previewSnapshot');
    expect(typeof (ch as { handler?: unknown }).handler).toBe('function');
  });
});

describe('website:previewSnapshot handler — end-to-end against in-memory DB', () => {
  it('returns totals + sample for an empty scope', async () => {
    const db = createTestDb();
    const ch = getChannel('website:previewSnapshot');
    if (!ch || ch.thread !== 'worker') throw new Error('channel missing');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (ch.handler as any)(db, {
      siteTitle: 'Test',
      scope: { everyone: true },
      options: { excludeLiving: false, redactLiving: false },
    });
    expect(result.totals).toBeDefined();
    expect(result.totals.persons).toBe(0);
    expect(Array.isArray(result.personSample)).toBe(true);
  });

  it('counts a seeded person', async () => {
    const db = createTestDb();
    createPerson(db, { sex: 'F', given_name: 'Anna', surname: 'Test' });
    const ch = getChannel('website:previewSnapshot');
    if (!ch || ch.thread !== 'worker') throw new Error('channel missing');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (ch.handler as any)(db, {
      siteTitle: 'Test',
      scope: { everyone: true },
      options: { excludeLiving: false, redactLiving: false },
    });
    expect(result.totals.persons).toBe(1);
  });
});
