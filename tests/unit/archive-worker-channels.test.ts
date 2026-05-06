import { describe, it, expect } from 'vitest';
import { getChannel } from '../../src/shared/channels';

describe('archive worker channels (internal)', () => {
  it('archive:_importRun is a registered worker channel', () => {
    const ch = getChannel('archive:_importRun');
    expect(ch).toBeDefined();
    expect(ch!.thread).toBe('worker');
    expect(ch!.mutating).toBe(true);
  });

  it('archive:_exportRun is a registered worker channel (read-only)', () => {
    const ch = getChannel('archive:_exportRun');
    expect(ch).toBeDefined();
    expect(ch!.thread).toBe('worker');
    expect(ch!.mutating).toBe(false);
  });

  it('archive:import (public) and archive:export (public) are NOT in the registry — they live as wrapHandler shims', () => {
    expect(getChannel('archive:import')).toBeUndefined();
    expect(getChannel('archive:export')).toBeUndefined();
  });
});
