import { describe, it, expect } from 'vitest';
import { STORAGE_KEYS, getJSON, setJSON } from '../../src/renderer/utils/storage-keys';

describe('storage keys', () => {
  it('every key is unique', () => {
    const values = Object.values(STORAGE_KEYS);
    expect(new Set(values).size).toBe(values.length);
  });

  it('getJSON returns default when missing', () => {
    localStorage.clear();
    expect(getJSON(STORAGE_KEYS.personsPanelOpen, true)).toBe(true);
  });

  it('setJSON + getJSON round-trips', () => {
    setJSON(STORAGE_KEYS.personsPanelWidth, 480);
    expect(getJSON(STORAGE_KEYS.personsPanelWidth, 0)).toBe(480);
  });

  it('getJSON returns default on parse error', () => {
    localStorage.setItem(STORAGE_KEYS.personsPanelWidth, '{not json');
    expect(getJSON(STORAGE_KEYS.personsPanelWidth, 99)).toBe(99);
  });
});
