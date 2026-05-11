import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import {
  setMediaAsPersonProfile,
  isMediaPersonProfile,
} from '../../src/renderer/utils/mediaProfile';
import { useProfilePicStore } from '../../src/renderer/stores/profilePic';

// Mock chartData so the profilePic store can be imported without its
// canvas/window.api dependencies.
vi.mock('../../src/renderer/utils/chartData', () => ({
  invalidatePersonPhoto: vi.fn(),
  invalidateAllPersonPhotos: vi.fn(),
}));

// Mock cropImage so the profilePic store can be imported without
// HTMLCanvasElement / HTMLImageElement.
vi.mock('../../src/renderer/utils/cropImage', () => ({
  cropImageToDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,fake'),
}));

interface LinkRow {
  id: string;       // media id
  link_id: string;  // media_link id
}

function stubApi(links: LinkRow[], opts: { secondFetch?: LinkRow[] } = {}) {
  const secondFetch = opts.secondFetch ?? links;
  let callCount = 0;
  const forEntity = vi.fn().mockImplementation(async () => {
    callCount++;
    return callCount === 1 ? [...links] : [...secondFetch];
  });
  const addLink = vi.fn().mockResolvedValue(undefined);
  const reorder = vi.fn().mockResolvedValue(undefined);
  const profilePicRef = vi.fn().mockResolvedValue(null);
  const readAsDataUrl = vi.fn().mockResolvedValue(null);

  return { forEntity, addLink, reorder, profilePicRef, readAsDataUrl };
}

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('isMediaPersonProfile', async () => {
  it('returns true when mediaId is first in the link list', async () => {
    const links: LinkRow[] = [
      { id: 'media-1', link_id: 'link-1' },
      { id: 'media-2', link_id: 'link-2' },
    ];
    (window as unknown as { api: unknown }).api = { media: stubApi(links) };

    const result = await isMediaPersonProfile('person-1', 'media-1');
    expect(result).toBe(true);
  });

  it('returns false when mediaId is NOT first', async () => {
    const links: LinkRow[] = [
      { id: 'media-1', link_id: 'link-1' },
      { id: 'media-2', link_id: 'link-2' },
    ];
    (window as unknown as { api: unknown }).api = { media: stubApi(links) };

    const result = await isMediaPersonProfile('person-1', 'media-2');
    expect(result).toBe(false);
  });

  it('returns false when link list is empty', async () => {
    (window as unknown as { api: unknown }).api = { media: stubApi([]) };

    const result = await isMediaPersonProfile('person-1', 'media-1');
    expect(result).toBe(false);
  });

  it('returns false when mediaId is not in the list at all', async () => {
    const links: LinkRow[] = [
      { id: 'media-1', link_id: 'link-1' },
    ];
    (window as unknown as { api: unknown }).api = { media: stubApi(links) };

    const result = await isMediaPersonProfile('person-1', 'media-99');
    expect(result).toBe(false);
  });
});

describe('setMediaAsPersonProfile', async () => {
  it('reorders links so the target media link_id is first', async () => {
    const links: LinkRow[] = [
      { id: 'media-1', link_id: 'link-1' },
      { id: 'media-2', link_id: 'link-2' },
      { id: 'media-3', link_id: 'link-3' },
    ];
    const api = stubApi(links);
    (window as unknown as { api: unknown }).api = { media: api };

    await setMediaAsPersonProfile('person-1', 'media-2');

    expect(api.reorder).toHaveBeenCalledOnce();
    // media-2's link_id should be first; the others preserve original order
    expect(api.reorder).toHaveBeenCalledWith(['link-2', 'link-1', 'link-3']);
  });

  it('reorders correctly when target is already the only link', async () => {
    const links: LinkRow[] = [{ id: 'media-1', link_id: 'link-1' }];
    const api = stubApi(links);
    (window as unknown as { api: unknown }).api = { media: api };

    await setMediaAsPersonProfile('person-1', 'media-1');

    expect(api.reorder).toHaveBeenCalledWith(['link-1']);
    expect(api.addLink).not.toHaveBeenCalled();
  });

  it('moves target to front when it is already first', async () => {
    const links: LinkRow[] = [
      { id: 'media-1', link_id: 'link-1' },
      { id: 'media-2', link_id: 'link-2' },
    ];
    const api = stubApi(links);
    (window as unknown as { api: unknown }).api = { media: api };

    await setMediaAsPersonProfile('person-1', 'media-1');

    expect(api.reorder).toHaveBeenCalledWith(['link-1', 'link-2']);
  });

  it('adds link first when media is not yet linked to the person', async () => {
    // Initial fetch returns no links; after addLink a second fetch returns the new link.
    const newLink: LinkRow = { id: 'new-media', link_id: 'new-link-id' };
    const api = stubApi([], { secondFetch: [newLink] });
    (window as unknown as { api: unknown }).api = { media: api };

    await setMediaAsPersonProfile('person-1', 'new-media');

    expect(api.addLink).toHaveBeenCalledOnce();
    expect(api.addLink).toHaveBeenCalledWith({
      media_id: 'new-media',
      entity_type: 'person',
      entity_id: 'person-1',
    });
    expect(api.reorder).toHaveBeenCalledWith(['new-link-id']);
  });

  it('returns early without reorder when target link is not found after addLink', async () => {
    // forEntity always returns empty — addLink silently failed to register the link
    const api = stubApi([], { secondFetch: [] });
    (window as unknown as { api: unknown }).api = { media: api };

    await setMediaAsPersonProfile('person-1', 'ghost-media');

    expect(api.reorder).not.toHaveBeenCalled();
  });

  it('invalidates the profile pic store entry for the person', async () => {
    const links: LinkRow[] = [{ id: 'media-1', link_id: 'link-1' }];
    const api = stubApi(links);
    (window as unknown as { api: unknown }).api = { media: api };

    const store = useProfilePicStore();
    // Spy on invalidatePerson directly to verify the call.
    const spy = vi.spyOn(store, 'invalidatePerson');

    await setMediaAsPersonProfile('person-1', 'media-1');

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith('person-1');
  });
});
