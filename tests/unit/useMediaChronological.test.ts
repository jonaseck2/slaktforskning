import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref, nextTick } from 'vue';
import { useMediaChronological } from '../../src/renderer/composables/useMediaChronological';

const mockApi = { media: { forEntity: vi.fn() } };
// @ts-expect-error test shim
globalThis.window = { api: mockApi } as never;

describe('useMediaChronological', async () => {
  beforeEach(async () => {
    mockApi.media.forEntity.mockReset();
  });

  it('sorts by sort_order ascending', async () => {
    mockApi.media.forEntity.mockResolvedValue([
      { id: 'm2', title: 'Second', sort_order: 1 },
      { id: 'm1', title: 'First', sort_order: 0 },
    ]);
    const ref0 = ref<{ entityType: 'person'; entityId: string } | null>({
      entityType: 'person',
      entityId: 'p1',
    });
    const { items } = useMediaChronological(ref0);
    await nextTick();
    await new Promise((r) => setTimeout(r, 10));
    expect(items.value.map((i) => i.id)).toEqual(['m1', 'm2']);
  });

  it('clears items when entityRef becomes null', async () => {
    mockApi.media.forEntity.mockResolvedValue([
      { id: 'm1', title: 'X', sort_order: 0 },
    ]);
    const ref0 = ref<{ entityType: 'person'; entityId: string } | null>({
      entityType: 'person',
      entityId: 'p1',
    });
    const { items } = useMediaChronological(ref0);
    await nextTick();
    await new Promise((r) => setTimeout(r, 10));
    expect(items.value).toHaveLength(1);
    ref0.value = null;
    await nextTick();
    await new Promise((r) => setTimeout(r, 10));
    expect(items.value).toHaveLength(0);
  });
});
