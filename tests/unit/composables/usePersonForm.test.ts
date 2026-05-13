import { describe, it, expect } from 'vitest';
import { usePersonForm } from '../../../src/renderer/composables/usePersonForm';

describe('usePersonForm', () => {
  it('defaults sex to U with no addRelatedTo', () => {
    const { form } = usePersonForm();
    expect(form.sex).toBe('U');
    expect(form.subtype).toBe('');
  });

  it('derives sex from addRelatedTo.mode', () => {
    expect(usePersonForm({ addRelatedTo: { personId: 'p', mode: 'father' } }).form.sex).toBe('M');
    expect(usePersonForm({ addRelatedTo: { personId: 'p', mode: 'mother' } }).form.sex).toBe('F');
    expect(usePersonForm({ addRelatedTo: { personId: 'p', mode: 'son' } }).form.sex).toBe('M');
    expect(usePersonForm({ addRelatedTo: { personId: 'p', mode: 'daughter' } }).form.sex).toBe('F');
  });

  it('flips spouse sex from personSex', () => {
    expect(usePersonForm({ addRelatedTo: { personId: 'p', mode: 'spouse', personSex: 'M' } }).form.sex).toBe('F');
    expect(usePersonForm({ addRelatedTo: { personId: 'p', mode: 'spouse', personSex: 'F' } }).form.sex).toBe('M');
    expect(usePersonForm({ addRelatedTo: { personId: 'p', mode: 'spouse', personSex: 'U' } }).form.sex).toBe('U');
  });

  it('defaults subtype to "unknown" for spouse and "biological" for other relationships', () => {
    expect(usePersonForm({ addRelatedTo: { personId: 'p', mode: 'spouse' } }).form.subtype).toBe('unknown');
    expect(usePersonForm({ addRelatedTo: { personId: 'p', mode: 'son' } }).form.subtype).toBe('biological');
    expect(usePersonForm({ addRelatedTo: { personId: 'p', mode: 'father' } }).form.subtype).toBe('biological');
  });

  it('uses prefillSurname when supplied', () => {
    const { form } = usePersonForm({ prefillSurname: 'Andersson' });
    expect(form.surname).toBe('Andersson');
  });

  it('birth ref starts empty', () => {
    const { birth } = usePersonForm();
    expect(birth.date).toBe('');
    expect(birth.placeId).toBeNull();
  });
});
