import { describe, it, expect, beforeEach } from 'vitest';
import { channelRegistry, getChannel } from '../../src/shared/channels';
import { createPerson } from '../../src/api/persons';
import { createTestDb } from './helpers';

describe('csv:_exportRun worker channel — registration', () => {
  it('is registered as a worker channel and is non-mutating', () => {
    const ch = getChannel('csv:_exportRun');
    expect(ch).toBeDefined();
    expect(ch!.thread).toBe('worker');
    expect(ch!.mutating).toBe(false);
  });

  it('public csv:export remains a main-thread shim (not in registry)', () => {
    expect(getChannel('csv:export')).toBeUndefined();
  });

  it('has a handler function', () => {
    const ch = channelRegistry['csv:_exportRun'];
    expect(typeof (ch as { handler?: unknown }).handler).toBe('function');
  });
});

describe('csv:_exportRun handler — end-to-end against in-memory DB', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('returns CSV text for persons entityType with seeded row', async () => {
    createPerson(db, { sex: 'F', given_name: 'Anna', surname: 'Lindström' });

    const ch = channelRegistry['csv:_exportRun'];
    if (!ch || ch.thread !== 'worker') throw new Error('channel missing');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (ch.handler as any)(db, { entityType: 'persons' });

    expect(typeof result.csv).toBe('string');
    expect(result.csv).toContain('given_name');
    expect(result.csv).toContain('Anna');
    expect(result.csv).toContain('Lindström');
    expect(result.defaultName).toBe('persons.csv');
  });

  it('honours utf-8-bom encoding option', async () => {
    createPerson(db, { sex: 'M', given_name: 'Erik', surname: 'Test' });
    const ch = channelRegistry['csv:_exportRun'];
    if (!ch || ch.thread !== 'worker') throw new Error('channel missing');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (ch.handler as any)(db, {
      entityType: 'persons',
      encoding: 'utf-8-bom',
    });
    expect(result.csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('returns an error for unknown entityType', async () => {
    const ch = channelRegistry['csv:_exportRun'];
    if (!ch || ch.thread !== 'worker') throw new Error('channel missing');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (ch.handler as any)(db, { entityType: 'bogus' });
    expect(result.error).toBeDefined();
  });

  it('returns an error when entityType is missing', async () => {
    const ch = channelRegistry['csv:_exportRun'];
    if (!ch || ch.thread !== 'worker') throw new Error('channel missing');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (ch.handler as any)(db, {});
    expect(result.error).toBeDefined();
  });
});
