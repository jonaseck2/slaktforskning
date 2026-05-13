import { describe, it, expect } from 'vitest';
import { useRelationshipForm } from '../../../src/renderer/composables/useRelationshipForm';

describe('useRelationshipForm', () => {
  it('defaults to couple+marriage in create mode', () => {
    const { form } = useRelationshipForm();
    expect(form.type).toBe('couple');
    expect(form.subtype).toBe('marriage');
    expect(form.person1_id).toBeNull();
    expect(form.person2_id).toBeNull();
    expect(form.notes).toBe('');
  });

  it('hydrates from editingRelationship', () => {
    const { form } = useRelationshipForm({
      editingRelationship: {
        id: 'r-1',
        type: 'parent_child',
        subtype: 'biological',
        person1_id: 'p-1',
        person2_id: 'p-2',
        notes: 'note',
      },
    });
    expect(form.type).toBe('parent_child');
    expect(form.subtype).toBe('biological');
    expect(form.person1_id).toBe('p-1');
    expect(form.person2_id).toBe('p-2');
    expect(form.notes).toBe('note');
  });

  it('selectType resets subtype to a sensible default', () => {
    const { form, selectType } = useRelationshipForm();
    expect(form.subtype).toBe('marriage');
    selectType('parent_child');
    expect(form.type).toBe('parent_child');
    expect(form.subtype).toBe('biological');
    selectType('sibling');
    expect(form.subtype).toBe('');
    selectType('couple');
    expect(form.subtype).toBe('marriage');
  });
});
