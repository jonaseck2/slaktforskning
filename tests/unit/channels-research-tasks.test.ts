import { describe, it, expect } from 'vitest';
import '../../src/shared/channels';   // load the barrel — registers all domains
import { listChannels, getChannel } from '../../src/shared/channels/registry';

describe('research tasks channel registry', () => {
  it('registers all researchTasks:* channels', () => {
    const taskChannels = listChannels().filter(c => c.startsWith('researchTasks:'));
    expect(taskChannels.length).toBe(11);
  });

  it('researchTasks:get is a worker channel', () => {
    const ch = getChannel('researchTasks:get');
    expect(ch).toBeDefined();
    expect(ch!.thread).toBe('worker');
  });

  it('mutating channels are flagged correctly', () => {
    expect(getChannel('researchTasks:create')!.mutating).toBe(true);
    expect(getChannel('researchTasks:update')!.mutating).toBe(true);
    expect(getChannel('researchTasks:delete')!.mutating).toBe(true);
    expect(getChannel('researchTasks:addLink')!.mutating).toBe(true);
    expect(getChannel('researchTasks:removeLink')!.mutating).toBe(true);
    // Read channels should not be mutating
    expect(getChannel('researchTasks:list')!.mutating).toBeFalsy();
    expect(getChannel('researchTasks:get')!.mutating).toBeFalsy();
    expect(getChannel('researchTasks:forPerson')!.mutating).toBeFalsy();
    expect(getChannel('researchTasks:forPlace')!.mutating).toBeFalsy();
    expect(getChannel('researchTasks:forMedia')!.mutating).toBeFalsy();
    expect(getChannel('researchTasks:getLinks')!.mutating).toBeFalsy();
  });
});
