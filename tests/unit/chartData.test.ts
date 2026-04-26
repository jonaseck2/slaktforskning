import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchPersonNode, _resetPhotoCacheForTests, invalidatePersonPhoto } from '../../src/renderer/utils/chartData';
import { cropImageToDataUrl } from '../../src/renderer/utils/cropImage';

vi.mock('../../src/renderer/utils/cropImage', () => ({
  cropImageToDataUrl: vi.fn(async (raw: string) => `cropped:${raw}`),
}));

type MockApi = {
  persons: { get: ReturnType<typeof vi.fn>; getNames: ReturnType<typeof vi.fn> };
  events: { forPerson: ReturnType<typeof vi.fn> };
  media: {
    profilePicRef: ReturnType<typeof vi.fn>;
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
      profilePicRef: vi.fn().mockResolvedValue({
        mediaId: 'm1',
        region: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      }),
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
    vi.mocked(cropImageToDataUrl).mockClear();
  });

  it('crops the tagged face from the profile media into photoUrl', async () => {
    const api = installMockApi();
    const node = await fetchPersonNode('p1');
    expect(api.media.profilePicRef).toHaveBeenCalledWith('p1');
    expect(api.media.readAsDataUrl).toHaveBeenCalledWith('m1');
    expect(cropImageToDataUrl).toHaveBeenCalledWith(
      'data:image/jpeg;base64,AAAA',
      { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
    );
    expect(node.photoUrl).toBe('cropped:data:image/jpeg;base64,AAAA');
  });

  it('returns null photoUrl when the profile media has no face tag (trees should show initials, not a center-crop of the raw photo)', async () => {
    const api = installMockApi();
    api.media.profilePicRef.mockResolvedValue({ mediaId: 'm1', region: null });
    const node = await fetchPersonNode('p1');
    expect(node.photoUrl).toBeNull();
    expect(api.media.readAsDataUrl).not.toHaveBeenCalled();
    expect(cropImageToDataUrl).not.toHaveBeenCalled();
  });

  it('returns null photoUrl when the person has no profile pic', async () => {
    const api = installMockApi();
    api.media.profilePicRef.mockResolvedValue(null);
    const node = await fetchPersonNode('p1');
    expect(node.photoUrl).toBeNull();
    expect(api.media.readAsDataUrl).not.toHaveBeenCalled();
    expect(cropImageToDataUrl).not.toHaveBeenCalled();
  });

  it('caches the cropped result per person across calls', async () => {
    const api = installMockApi();
    await fetchPersonNode('p1');
    await fetchPersonNode('p1');
    expect(api.media.profilePicRef).toHaveBeenCalledTimes(1);
    expect(api.media.readAsDataUrl).toHaveBeenCalledTimes(1);
    expect(cropImageToDataUrl).toHaveBeenCalledTimes(1);
  });

  it('refetches after invalidatePersonPhoto', async () => {
    const api = installMockApi();
    await fetchPersonNode('p1');
    invalidatePersonPhoto('p1');
    await fetchPersonNode('p1');
    expect(api.media.profilePicRef).toHaveBeenCalledTimes(2);
    expect(cropImageToDataUrl).toHaveBeenCalledTimes(2);
  });

  it('returns null photoUrl when readAsDataUrl returns null', async () => {
    const api = installMockApi();
    api.media.readAsDataUrl.mockResolvedValueOnce(null);
    const node = await fetchPersonNode('p1');
    expect(node.photoUrl).toBeNull();
    expect(cropImageToDataUrl).not.toHaveBeenCalled();
  });
});
