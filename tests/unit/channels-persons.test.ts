import { describe, it, expect } from 'vitest';
import '../../src/shared/channels/persons';
import { listChannels, getChannel } from '../../src/shared/channels/registry';

describe('persons channel registry', () => {
  it('registers all persons:* channels', () => {
    const personsChannels = listChannels().filter(c => c.startsWith('persons:'));
    expect(personsChannels.length).toBeGreaterThanOrEqual(15);
  });
  it('persons:get is a worker channel', () => {
    const ch = getChannel('persons:get');
    expect(ch).toBeDefined();
    expect(ch!.thread).toBe('worker');
  });
  it('mutating channels have mutating flag', () => {
    const mutatingChannels = ['persons:create', 'persons:createWithEvent', 'persons:update', 'persons:delete',
      'persons:addName', 'persons:updateName', 'persons:deleteName', 'persons:addIdentifier', 'persons:deleteIdentifier'];
    for (const name of mutatingChannels) {
      const ch = getChannel(name);
      expect(ch, `${name} should be registered`).toBeDefined();
      expect(ch!.mutating, `${name} should be mutating`).toBe(true);
    }
  });
  it('read-only channels do not have mutating flag', () => {
    const readOnlyChannels = ['persons:get', 'persons:list', 'persons:search', 'persons:getNames',
      'persons:getIdentifiers', 'persons:listPage', 'persons:searchWithDetails', 'persons:listUnsourcedPage'];
    for (const name of readOnlyChannels) {
      const ch = getChannel(name);
      expect(ch, `${name} should be registered`).toBeDefined();
      expect(ch!.mutating, `${name} should not be mutating`).toBeFalsy();
    }
  });
});
