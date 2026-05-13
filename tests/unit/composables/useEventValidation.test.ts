import { describe, it, expect } from 'vitest';
import { reactive } from 'vue';
import { useEventValidation } from '../../../src/renderer/composables/useEventValidation';
import type { EventForm } from '../../../src/renderer/composables/useEventForm';

// Helper: build a minimal reactive EventForm mirroring useEventForm's EMPTY_FORM.
// The composable under test reads form fields reactively, so we wrap in
// reactive() to match how it is constructed inside useEventForm.
function makeForm(overrides: Partial<EventForm> = {}): EventForm {
  return reactive<EventForm>({
    event_type: '',
    date_type: 'unknown',
    date_value: null,
    date_value_end: null,
    date_original: '',
    place_id: null,
    cause: null,
    value: null,
    notes: '',
    ...overrides,
  });
}

describe('useEventValidation', () => {
  it('flags missing event_type and blocks save on an empty form', () => {
    const form = makeForm();
    const { errors, canSave } = useEventValidation(form);
    expect(errors.value.event_type).toBe('errors.required');
    expect(canSave.value).toBe(false);
  });

  it('allows save when only event_type is set (date is optional)', () => {
    // EventModal currently performs no date validation — handleSave sends
    // every date field through `|| null` without guarding empty values.
    // The composable mirrors that: event_type is the only hard requirement,
    // so a form with just event_type filled in is considered saveable.
    const form = makeForm({ event_type: 'birth' });
    const { errors, canSave } = useEventValidation(form);
    expect(errors.value.event_type).toBeUndefined();
    expect(canSave.value).toBe(true);
  });

  it('returns empty errors and canSave=true for a fully populated form', () => {
    const form = makeForm({
      event_type: 'birth',
      date_type: 'exact',
      date_value: '1900-01-01',
      date_original: '1 January 1900',
    });
    const { errors, canSave } = useEventValidation(form);
    expect(errors.value).toEqual({});
    expect(canSave.value).toBe(true);
  });

  it('reacts when event_type changes from empty to filled', async () => {
    const form = makeForm();
    const { errors, canSave } = useEventValidation(form);
    expect(canSave.value).toBe(false);
    form.event_type = 'death';
    // computed re-evaluates synchronously when read after the source mutation
    expect(errors.value.event_type).toBeUndefined();
    expect(canSave.value).toBe(true);
  });
});
