import { describe, it, expect } from 'vitest';
import { channelRegistry } from '../../src/shared/channels';

describe('import:genneyRun / import:genneyDiscover worker channels', () => {
  it('genneyRun is registered as a worker channel and is mutating', () => {
    const ch = channelRegistry['import:genneyRun'];
    expect(ch).toBeDefined();
    expect(ch!.thread).toBe('worker');
    expect(ch!.mutating).toBe(true);
    expect(typeof (ch as { handler?: unknown }).handler).toBe('function');
  });

  it('genneyDiscover is registered as a worker channel and is non-mutating', () => {
    const ch = channelRegistry['import:genneyDiscover'];
    expect(ch).toBeDefined();
    expect(ch!.thread).toBe('worker');
    expect(ch!.mutating).toBe(false);
    expect(typeof (ch as { handler?: unknown }).handler).toBe('function');
  });

  it('genneyRun rejects missing sourcePath without throwing', async () => {
    const ch = channelRegistry['import:genneyRun'];
    if (!ch || ch.thread !== 'worker') throw new Error('channel missing');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (ch.handler as any)({}, {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('sourcePath');
  });

  it('genneyDiscover rejects missing sourcePath without throwing', async () => {
    const ch = channelRegistry['import:genneyDiscover'];
    if (!ch || ch.thread !== 'worker') throw new Error('channel missing');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (ch.handler as any)({}, {});
    expect(result).toMatchObject({ error: expect.stringContaining('sourcePath') });
  });
});
