import { describe, it, expect, vi } from 'vitest';
import { ref, nextTick } from 'vue';
import { useEditableFields } from '../../../src/renderer/composables/useEditableFields';

interface Foo { id: string; title: string; notes: string; }

describe('useEditableFields', () => {
  it('seeds fields from initial data and persists changes', async () => {
    const id = ref<string | null>('a');
    const data = ref<Foo | null>({ id: 'a', title: 'Hi', notes: 'N' });
    const persist = vi.fn(async (i: string, patch: Partial<Foo>) => {
      Object.assign(data.value!, patch);
    });
    const { fields, save } = useEditableFields<Foo>(id, data, persist);

    await nextTick();
    expect(fields.title).toBe('Hi');
    fields.title = 'Hello';
    await save('title');
    expect(persist).toHaveBeenCalledWith('a', { title: 'Hello' });
  });

  it('drops save when id changed mid-flight', async () => {
    const id = ref<string | null>('a');
    const data = ref<Foo | null>({ id: 'a', title: 'A', notes: '' });
    let resolve: () => void = () => {};
    const persist = vi.fn(async () => new Promise<void>(r => { resolve = r; }));
    const { fields, save } = useEditableFields<Foo>(id, data, persist);
    await nextTick();

    const p = save('title');
    id.value = 'b';
    data.value = { id: 'b', title: 'B', notes: '' };
    await nextTick();
    resolve();
    await p;
    expect(fields.title).toBe('B');  // re-seeded from new data, not stale 'A'
  });
});
