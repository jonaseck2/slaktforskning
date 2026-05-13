import { describe, it, expect, beforeEach } from 'vitest';
import { useEventForm } from '../../../src/renderer/composables/useEventForm';

// Composable runs in node env — install a window stub with an api shape we
// can swap per-test for hydration assertions.
function installApi(api: unknown): void {
  (globalThis as unknown as { window: { api: unknown } }).window = { api } as { api: unknown };
}

describe('useEventForm', () => {
  beforeEach(() => {
    installApi({});
  });

  it('hydrates form from defaults on create mode', () => {
    const { form } = useEventForm({
      eventId: null,
      mode: 'create',
      defaults: { event_type: 'birth' },
    });
    expect(form.event_type).toBe('birth');
    expect(form.date_original).toBe('');
    expect(form.place_id).toBeNull();
    expect(form.notes).toBe('');
  });

  it('marks dirty when a field changes', async () => {
    const { form, isDirty } = useEventForm({ eventId: null, mode: 'create' });
    expect(isDirty.value).toBe(false);
    form.event_type = 'death';
    // Vue's deep watch fires on the next microtask flush.
    await new Promise((r) => setTimeout(r, 0));
    expect(isDirty.value).toBe(true);
  });

  it('hydrates form from existing event on edit mode', async () => {
    installApi({
      events: {
        get: async (_id: string) => ({
          id: 'ev-1',
          event_type: 'marriage',
          date_type: 'exact',
          date_value: null,
          date_value_end: null,
          date_original: '1900-01-01',
          place_id: null,
          cause: null,
          value: null,
          notes: '',
        }),
      },
    });
    const { form, loading } = useEventForm({ eventId: 'ev-1', mode: 'edit' });
    expect(loading.value).toBe(true);
    // Allow the hydration Promise + the subsequent reactive write to flush.
    await new Promise((r) => setTimeout(r, 20));
    expect(form.event_type).toBe('marriage');
    expect(form.date_original).toBe('1900-01-01');
    expect(loading.value).toBe(false);
  });
});
