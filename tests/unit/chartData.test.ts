import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchPersonNode, _resetPhotoCacheForTests } from '../../src/renderer/utils/chartData';

type MockApi = {
  persons: { get: ReturnType<typeof vi.fn>; getNames: ReturnType<typeof vi.fn> };
  events: { forPerson: ReturnType<typeof vi.fn> };
  media: {
    forEntity: ReturnType<typeof vi.fn>;
    readAsDataUrl: ReturnType<typeof vi.fn>;
  };
  places: { get: ReturnType<typeof vi.fn> };
  relationships: { getForPerson: ReturnType<typeof vi.fn> };
};

function installMockApi(): MockApi {
  const api: MockApi = {
    persons: {
      get: vi.fn().mockResolvedValue({ id: 'p1', sex: 'M', living: false }),
      getNames: vi.fn().mockResolvedValue([
        { given_name: 'Test', surname: 'Person', preferred_name: null, nickname: null, sort_order: 0 },
      ]),
    },
    events: { forPerson: vi.fn().mockResolvedValue([]) },
    media: {
      forEntity: vi.fn().mockResolvedValue([
        { id: 'm1', file_ref: '/tmp/photo.jpg', sort_order: 0 },
      ]),
      readAsDataUrl: vi.fn().mockResolvedValue('data:image/jpeg;base64,AAAA'),
    },
    places: { get: vi.fn().mockResolvedValue(null) },
    relationships: { getForPerson: vi.fn().mockResolvedValue([]) },
  };
  // @ts-expect-error — assigning mock api to window for the module under test
  globalThis.window = { api };
  return api;
}

describe('fetchPersonNode — photoUrl', () => {
  beforeEach(() => {
    _resetPhotoCacheForTests();
  });

  it('resolves photoUrl to a data URL via media.readAsDataUrl', async () => {
    const api = installMockApi();
    const node = await fetchPersonNode('p1');
    expect(api.media.readAsDataUrl).toHaveBeenCalledWith('m1');
    expect(node.photoUrl).toBe('data:image/jpeg;base64,AAAA');
  });

  it('returns null photoUrl when the person has no linked media', async () => {
    const api = installMockApi();
    api.media.forEntity.mockResolvedValue([]);
    const node = await fetchPersonNode('p1');
    expect(node.photoUrl).toBeNull();
    expect(api.media.readAsDataUrl).not.toHaveBeenCalled();
  });

  it('caches the data URL per media id across calls', async () => {
    const api = installMockApi();
    await fetchPersonNode('p1');
    await fetchPersonNode('p1');
    expect(api.media.readAsDataUrl).toHaveBeenCalledTimes(1);
  });

  it('returns null photoUrl and leaves cache untouched when readAsDataUrl returns null', async () => {
    const api = installMockApi();
    api.media.readAsDataUrl.mockResolvedValueOnce(null);
    const node = await fetchPersonNode('p1');
    expect(node.photoUrl).toBeNull();
  });
});
