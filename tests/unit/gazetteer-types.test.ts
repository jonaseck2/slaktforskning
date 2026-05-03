import { describe, it, expect } from 'vitest';
import { GAZETTEER_NODE_TYPES, isGazetteerNodeType } from '../../src/api/place-gazetteers/types';

describe('GazetteerNodeType', () => {
  it('exports the canonical closed vocabulary', () => {
    expect(GAZETTEER_NODE_TYPES).toEqual([
      'world', 'continent', 'country', 'admin1', 'admin2', 'admin3', 'admin4',
      'locality', 'parish', 'farm', 'church', 'city', 'landskap',
      'historical-state', 'other',
    ]);
  });

  it('isGazetteerNodeType accepts valid values', () => {
    expect(isGazetteerNodeType('country')).toBe(true);
    expect(isGazetteerNodeType('admin1')).toBe(true);
    expect(isGazetteerNodeType('parish')).toBe(true);
  });

  it('isGazetteerNodeType rejects invalid values', () => {
    expect(isGazetteerNodeType('municipality')).toBe(false);
    expect(isGazetteerNodeType('sogn')).toBe(false);
    expect(isGazetteerNodeType('')).toBe(false);
  });
});
