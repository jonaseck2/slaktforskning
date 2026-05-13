import { describe, it, expect } from 'vitest';
import { reactive } from 'vue';
import { useRelationshipValidation } from '../../../src/renderer/composables/useRelationshipValidation';
import type { RelationshipForm } from '../../../src/renderer/composables/useRelationshipForm';

function makeForm(overrides: Partial<RelationshipForm> = {}): RelationshipForm {
  return reactive({
    type: 'couple',
    subtype: 'marriage',
    person1_id: null,
    person2_id: null,
    notes: '',
    ...overrides,
  });
}

describe('useRelationshipValidation', () => {
  it('rejects when person1_id is null', () => {
    const { canSave } = useRelationshipValidation(makeForm({ person2_id: 'p-2' }));
    expect(canSave.value).toBe(false);
  });

  it('rejects when person2_id is null', () => {
    const { canSave } = useRelationshipValidation(makeForm({ person1_id: 'p-1' }));
    expect(canSave.value).toBe(false);
  });

  it('rejects when person1_id === person2_id (self-link)', () => {
    const { canSave } = useRelationshipValidation(makeForm({ person1_id: 'p-1', person2_id: 'p-1' }));
    expect(canSave.value).toBe(false);
  });

  it('accepts when both persons set and distinct', () => {
    const { canSave } = useRelationshipValidation(makeForm({ person1_id: 'p-1', person2_id: 'p-2' }));
    expect(canSave.value).toBe(true);
  });

  it('reacts to form changes', () => {
    const form = makeForm();
    const { canSave } = useRelationshipValidation(form);
    expect(canSave.value).toBe(false);
    form.person1_id = 'p-1';
    form.person2_id = 'p-2';
    expect(canSave.value).toBe(true);
  });
});
