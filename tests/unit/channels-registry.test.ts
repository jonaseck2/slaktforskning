import { describe, it, expect } from 'vitest';
import { defineChannel, channelRegistry } from '../../src/shared/channels/registry';

describe('channel registry', () => {
  it('registers a channel and stores its handler + thread mode', () => {
    const ch = defineChannel({
      name: 'test:echo',
      thread: 'worker',
      handler: (_db, msg: string) => msg.toUpperCase(),
    });
    expect(ch.name).toBe('test:echo');
    expect(channelRegistry['test:echo']).toBe(ch);
    expect(ch.thread).toBe('worker');
  });

  it('throws when registering a duplicate name', () => {
    defineChannel({ name: 'test:dup', thread: 'worker', handler: () => 1 });
    expect(() =>
      defineChannel({ name: 'test:dup', thread: 'worker', handler: () => 2 })
    ).toThrow(/already registered/);
  });
});
