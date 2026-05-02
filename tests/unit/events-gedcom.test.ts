import { describe, it, expect } from 'vitest';
import {
  EVENT_TYPE_TO_GEDCOM_TAG,
  FACT_VALUE_GEDCOM_TAGS,
  eventTypeHasFactValue,
  valueFieldI18nKey,
} from '../../src/api/events_gedcom';

describe('events_gedcom', () => {
  it('maps occupation event_type to OCCU tag', () => {
    expect(EVENT_TYPE_TO_GEDCOM_TAG.occupation).toBe('OCCU');
  });

  it('OCCU is a fact-value tag', () => {
    expect(FACT_VALUE_GEDCOM_TAGS.has('OCCU')).toBe(true);
  });

  it('BIRT is not a fact-value tag', () => {
    expect(FACT_VALUE_GEDCOM_TAGS.has('BIRT')).toBe(false);
  });

  it('eventTypeHasFactValue: occupation -> true', () => {
    expect(eventTypeHasFactValue('occupation')).toBe(true);
  });

  it('eventTypeHasFactValue: birth -> false', () => {
    expect(eventTypeHasFactValue('birth')).toBe(false);
  });

  it('eventTypeHasFactValue: unknown -> false', () => {
    expect(eventTypeHasFactValue('not_a_real_type')).toBe(false);
  });

  it('valueFieldI18nKey: occupation -> events.value.occupation', () => {
    expect(valueFieldI18nKey('occupation')).toBe('events.value.occupation');
  });

  it('valueFieldI18nKey: education -> events.value.education', () => {
    expect(valueFieldI18nKey('education')).toBe('events.value.education');
  });

  it('valueFieldI18nKey: birth -> events.value.event (fallback)', () => {
    expect(valueFieldI18nKey('birth')).toBe('events.value.event');
  });
});
