import type { Database } from 'node-sqlite3-wasm';
import { describe, it, expect } from 'vitest';
import { defineChannel, channelRegistry, getChannel } from '../../src/shared/channels/registry';

describe('discriminated channel def', () => {
  it('worker channel handler accepts (db, ...args) without cast', () => {
    defineChannel({
      name: 'disc:worker',
      thread: 'worker',
      handler: (_db: Database, x: number) => x + 1,
    });
    const ch = getChannel('disc:worker');
    if (ch && ch.thread === 'worker') {
      // No cast needed — TS narrows handler to worker form
      const result = ch.handler({} as Database, 5);
      expect(result).toBe(6);
    } else {
      throw new Error('not narrowed');
    }
  });

  it('main channel handler accepts (...args) without cast', () => {
    defineChannel({
      name: 'disc:main',
      thread: 'main',
      handler: (msg: string) => msg.toUpperCase(),
    });
    const ch = getChannel('disc:main');
    if (ch && ch.thread === 'main') {
      const result = ch.handler('hi');
      expect(result).toBe('HI');
    } else {
      throw new Error('not narrowed');
    }
  });

  it('channelRegistry is read-only at runtime', () => {
    expect(() => { (channelRegistry as Record<string, unknown>)['foo'] = {}; })
      .toThrow(/immutable/);
  });
});
