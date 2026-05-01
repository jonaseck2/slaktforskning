import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ref, nextTick } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import { usePersonProfilePic } from '../../src/renderer/composables/usePersonProfilePic';
import { cropImageToDataUrl } from '../../src/renderer/utils/cropImage';

// Mock cropImage — HTMLImageElement/HTMLCanvasElement not available in the
// test environment and the file is excluded from coverage anyway.
vi.mock('../../src/renderer/utils/cropImage', () => ({
  cropImageToDataUrl: vi.fn(async (_url: string, _region: unknown) => 'data:cropped'),
}));

// Mock chartData invalidation helpers — they reference a photo-cache that needs
// Electron internals and are excluded from coverage.
vi.mock('../../src/renderer/utils/chartData', () => ({
  invalidatePersonPhoto: vi.fn(),
  invalidateAllPersonPhotos: vi.fn(),
}));

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

type FakeMediaApi = {
  profilePicRef: ReturnType<typeof vi.fn>;
  readAsDataUrl: ReturnType<typeof vi.fn>;
  profilePicRefs: ReturnType<typeof vi.fn>;
};

function installWindowApi(overrides: Partial<FakeMediaApi> = {}): FakeMediaApi {
  const media: FakeMediaApi = {
    profilePicRef: vi.fn().mockResolvedValue(null),
    readAsDataUrl: vi.fn().mockResolvedValue('data:image/jpeg;base64,FAKE'),
    profilePicRefs: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
  (globalThis as Record<string, unknown>).window = { api: { media } };
  return media;
}

// Flush all microtasks / resolved promises.
async function flushAll() {
  await nextTick();
  await nextTick();
  await nextTick();
}

// -------------------------------------------------------------------
// Setup
// -------------------------------------------------------------------

beforeEach(() => {
  setActivePinia(createPinia());
  vi.mocked(cropImageToDataUrl).mockClear();
});

// -------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------

describe('usePersonProfilePic — null / undefined personId', () => {
  it('src is null when personId is null', () => {
    installWindowApi();
    const id = ref<string | null>(null);
    const { src } = usePersonProfilePic(id);
    expect(src.value).toBeNull();
  });

  it('loading is false when personId is null', () => {
    installWindowApi();
    const id = ref<string | null>(null);
    const { loading } = usePersonProfilePic(id);
    expect(loading.value).toBe(false);
  });

  it('src is null when personId is undefined', () => {
    installWindowApi();
    const id = ref<string | undefined>(undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { src } = usePersonProfilePic(id as any);
    expect(src.value).toBeNull();
  });
});

describe('usePersonProfilePic — api returns null (no profile pic)', () => {
  it('src stays null after load completes with no profile pic', async () => {
    installWindowApi({ profilePicRef: vi.fn().mockResolvedValue(null) });
    const id = ref<string | null>('p1');
    const { src } = usePersonProfilePic(id);
    await flushAll();
    expect(src.value).toBeNull();
  });

  it('loading is false after load completes with no profile pic', async () => {
    installWindowApi({ profilePicRef: vi.fn().mockResolvedValue(null) });
    const id = ref<string | null>('p1');
    const { loading } = usePersonProfilePic(id);
    await flushAll();
    expect(loading.value).toBe(false);
  });
});

describe('usePersonProfilePic — api returns a region-tagged profile pic', () => {
  it('src becomes the cropped data URL after load', async () => {
    installWindowApi({
      profilePicRef: vi.fn().mockResolvedValue({
        mediaId: 'm1',
        region: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
      }),
      readAsDataUrl: vi.fn().mockResolvedValue('data:image/jpeg;base64,RAW'),
    });
    vi.mocked(cropImageToDataUrl).mockResolvedValueOnce('data:cropped-face');

    const id = ref<string | null>('p1');
    const { src } = usePersonProfilePic(id);
    await flushAll();

    expect(src.value).toBe('data:cropped-face');
  });

  it('loading is true synchronously (watch is immediate; store sets status to loading before first await)', () => {
    installWindowApi({
      profilePicRef: vi.fn().mockResolvedValue({
        mediaId: 'm1',
        region: { x: 0, y: 0, width: 1, height: 1 },
      }),
    });
    // The watch is { immediate: true }, so ensureLoaded runs synchronously.
    // ensureLoaded sets the store entry to { status: 'loading' } before any
    // await, so loading.value is true the moment the composable is called.
    const id = ref<string | null>('p1');
    const { loading } = usePersonProfilePic(id);
    expect(loading.value).toBe(true);
  });

  it('loading is false after load completes with a valid pic', async () => {
    installWindowApi({
      profilePicRef: vi.fn().mockResolvedValue({
        mediaId: 'm1',
        region: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
      }),
    });
    const id = ref<string | null>('p1');
    const { loading } = usePersonProfilePic(id);
    await flushAll();
    expect(loading.value).toBe(false);
  });
});

describe('usePersonProfilePic — api returns mediaRef without region (no face tag)', () => {
  it('src stays null when mediaRef has no region', async () => {
    installWindowApi({
      profilePicRef: vi.fn().mockResolvedValue({ mediaId: 'm1', region: null }),
    });
    const id = ref<string | null>('p1');
    const { src } = usePersonProfilePic(id);
    await flushAll();
    expect(src.value).toBeNull();
    expect(cropImageToDataUrl).not.toHaveBeenCalled();
  });
});

describe('usePersonProfilePic — personId change triggers re-fetch', () => {
  it('re-fetches and updates src when personId changes to a new value', async () => {
    const profilePicRef = vi.fn()
      .mockResolvedValueOnce(null)        // p1: no pic
      .mockResolvedValueOnce({            // p2: has pic
        mediaId: 'm2',
        region: { x: 0, y: 0, width: 1, height: 1 },
      });
    vi.mocked(cropImageToDataUrl).mockResolvedValueOnce('data:p2-face');

    installWindowApi({ profilePicRef });

    const id = ref<string | null>('p1');
    const { src } = usePersonProfilePic(id);
    await flushAll();
    expect(src.value).toBeNull(); // p1 has no pic

    id.value = 'p2';
    await flushAll();
    expect(src.value).toBe('data:p2-face');
  });

  it('src returns null when personId changes to null after a successful load', async () => {
    installWindowApi({
      profilePicRef: vi.fn().mockResolvedValue({
        mediaId: 'm1',
        region: { x: 0, y: 0, width: 1, height: 1 },
      }),
    });
    vi.mocked(cropImageToDataUrl).mockResolvedValueOnce('data:pic');

    const id = ref<string | null>('p1');
    const { src } = usePersonProfilePic(id);
    await flushAll();
    expect(src.value).toBe('data:pic');

    id.value = null;
    await nextTick();
    expect(src.value).toBeNull();
  });
});

describe('usePersonProfilePic — error during crop (resolveOne catch branch)', () => {
  // The resolveOne() helper in the store has its own try/catch for crop
  // failures. The outer try in ensureLoaded also catches now (regression
  // guard for v0.179.7) — see the next describe block.

  it('src stays null when cropImageToDataUrl throws', async () => {
    installWindowApi({
      profilePicRef: vi.fn().mockResolvedValue({
        mediaId: 'm1',
        region: { x: 0, y: 0, width: 1, height: 1 },
      }),
      readAsDataUrl: vi.fn().mockResolvedValue('data:image/jpeg;base64,RAW'),
    });
    vi.mocked(cropImageToDataUrl).mockRejectedValueOnce(new Error('canvas error'));

    const id = ref<string | null>('p1');
    const { src } = usePersonProfilePic(id);
    await flushAll();
    expect(src.value).toBeNull();
  });

  it('loading is false after crop error (store sets status: error)', async () => {
    installWindowApi({
      profilePicRef: vi.fn().mockResolvedValue({
        mediaId: 'm1',
        region: { x: 0, y: 0, width: 1, height: 1 },
      }),
      readAsDataUrl: vi.fn().mockResolvedValue('data:image/jpeg;base64,RAW'),
    });
    vi.mocked(cropImageToDataUrl).mockRejectedValueOnce(new Error('canvas error'));

    const id = ref<string | null>('p1');
    const { loading } = usePersonProfilePic(id);
    await flushAll();
    expect(loading.value).toBe(false);
  });
});

describe('usePersonProfilePic — profilePicRef itself rejects (outer catch)', () => {
  // Regression guard for v0.179.7. Before the fix, a rejection from
  // profilePicRef bypassed resolveOne's catch, leaving the store entry
  // pinned at status='loading' forever (the dedup guard then blocked
  // retries). The outer catch in ensureLoaded now sets status='error'.

  it('loading clears to false when profilePicRef rejects', async () => {
    installWindowApi({
      profilePicRef: vi.fn().mockRejectedValue(new Error('ipc fail')),
    });
    const id = ref<string | null>('p1');
    const { loading } = usePersonProfilePic(id);
    await flushAll();
    expect(loading.value).toBe(false);
  });

  it('src stays null when profilePicRef rejects', async () => {
    installWindowApi({
      profilePicRef: vi.fn().mockRejectedValue(new Error('ipc fail')),
    });
    const id = ref<string | null>('p1');
    const { src } = usePersonProfilePic(id);
    await flushAll();
    expect(src.value).toBeNull();
  });
});

describe('usePersonProfilePic — same personId does not refetch', () => {
  it('calls profilePicRef only once when the same id is used by two composable instances', async () => {
    const profilePicRef = vi.fn().mockResolvedValue(null);
    installWindowApi({ profilePicRef });

    const id = ref<string | null>('p1');
    usePersonProfilePic(id);
    usePersonProfilePic(id); // second instance shares the same Pinia store
    await flushAll();

    // The store deduplicates in-flight calls; exactly one API call expected.
    expect(profilePicRef).toHaveBeenCalledTimes(1);
  });
});
