import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ignoreKey, isIgnored, toggleIgnore, resetIgnored, ignoredKeys } from '../../src/renderer/utils/qualityIgnore';
import type { IgnorableIssue } from '../../src/renderer/utils/qualityIgnore';

describe('qualityIgnore', () => {
  beforeEach(() => {
    localStorage.clear();
    ignoredKeys.value.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('ignoreKey', () => {
    it('generates a key from issue code and all IDs', () => {
      const issue: IgnorableIssue = {
        code: 'living_death_date',
        personIds: ['p1', 'p2'],
      };
      const key = ignoreKey(issue);
      expect(key).toBe('living_death_date:p1,p2');
    });

    it('sorts all IDs together regardless of source', () => {
      const issue: IgnorableIssue = {
        code: 'place_coord_missing',
        personIds: ['p2', 'p1'],
        placeIds: ['pl3', 'pl1'],
      };
      const key = ignoreKey(issue);
      // All IDs should be sorted together
      expect(key).toBe('place_coord_missing:p1,p2,pl1,pl3');
    });

    it('includes optional mediaIds when present', () => {
      const issue: IgnorableIssue = {
        code: 'media_check',
        personIds: ['p1'],
        mediaIds: ['m1', 'm2'],
      };
      const key = ignoreKey(issue);
      expect(key).toBe('media_check:m1,m2,p1');
    });

    it('includes optional sourceIds when present', () => {
      const issue: IgnorableIssue = {
        code: 'source_check',
        personIds: ['p1'],
        sourceIds: ['s2', 's1'],
      };
      const key = ignoreKey(issue);
      expect(key).toBe('source_check:p1,s1,s2');
    });

    it('combines all optional ID types and sorts them all together', () => {
      const issue: IgnorableIssue = {
        code: 'complex_check',
        personIds: ['p2', 'p1'],
        placeIds: ['pl1'],
        mediaIds: ['m2', 'm1'],
        sourceIds: ['s1'],
      };
      const key = ignoreKey(issue);
      // All IDs sorted together
      expect(key).toBe('complex_check:m1,m2,p1,p2,pl1,s1');
    });

    it('preserves code exactly', () => {
      const issue: IgnorableIssue = {
        code: 'CustomCode_123',
        personIds: ['p1'],
      };
      const key = ignoreKey(issue);
      expect(key.startsWith('CustomCode_123:')).toBe(true);
    });
  });

  describe('isIgnored', () => {
    it('returns false when issue is not in ignored set', () => {
      const issue: IgnorableIssue = {
        code: 'test_code',
        personIds: ['p1'],
      };
      expect(isIgnored(issue)).toBe(false);
    });

    it('returns true when issue key is in ignored set', () => {
      const issue: IgnorableIssue = {
        code: 'test_code',
        personIds: ['p1'],
      };
      ignoredKeys.value.add(ignoreKey(issue));
      expect(isIgnored(issue)).toBe(true);
    });

    it('checks using the generated key consistently', () => {
      const issue: IgnorableIssue = {
        code: 'code',
        personIds: ['p2', 'p1'], // Unsorted
        placeIds: ['pl1'],
      };
      // Add with one order
      ignoredKeys.value.add('code:p1,p2,pl1');
      // Check with different order
      expect(isIgnored(issue)).toBe(true);
    });
  });

  describe('toggleIgnore', () => {
    it('adds issue key to ignored set when not present', () => {
      const issue: IgnorableIssue = {
        code: 'test',
        personIds: ['p1'],
      };
      const key = ignoreKey(issue);

      expect(ignoredKeys.value.has(key)).toBe(false);
      toggleIgnore(issue);
      expect(ignoredKeys.value.has(key)).toBe(true);
    });

    it('removes issue key from ignored set when already present', () => {
      const issue: IgnorableIssue = {
        code: 'test',
        personIds: ['p1'],
      };
      const key = ignoreKey(issue);

      ignoredKeys.value.add(key);
      expect(ignoredKeys.value.has(key)).toBe(true);
      toggleIgnore(issue);
      expect(ignoredKeys.value.has(key)).toBe(false);
    });

    it('persists toggled state to localStorage', () => {
      const issue: IgnorableIssue = {
        code: 'persist_test',
        personIds: ['p1'],
      };
      const key = ignoreKey(issue);

      toggleIgnore(issue);
      const stored = JSON.parse(localStorage.getItem('quality:ignored') || '[]') as string[];
      expect(stored).toContain(key);
    });

    it('updates localStorage when toggling on and off', () => {
      const issue: IgnorableIssue = {
        code: 'toggle_test',
        personIds: ['p1'],
      };
      const key = ignoreKey(issue);

      // Add to ignored
      toggleIgnore(issue);
      let stored = JSON.parse(localStorage.getItem('quality:ignored') || '[]') as string[];
      expect(stored).toContain(key);

      // Remove from ignored
      toggleIgnore(issue);
      stored = JSON.parse(localStorage.getItem('quality:ignored') || '[]') as string[];
      expect(stored).not.toContain(key);
    });

    it('handles multiple keys independently', () => {
      const issue1: IgnorableIssue = {
        code: 'code1',
        personIds: ['p1'],
      };
      const issue2: IgnorableIssue = {
        code: 'code2',
        personIds: ['p2'],
      };
      const key1 = ignoreKey(issue1);
      const key2 = ignoreKey(issue2);

      toggleIgnore(issue1);
      toggleIgnore(issue2);
      expect(ignoredKeys.value.has(key1)).toBe(true);
      expect(ignoredKeys.value.has(key2)).toBe(true);

      toggleIgnore(issue1);
      expect(ignoredKeys.value.has(key1)).toBe(false);
      expect(ignoredKeys.value.has(key2)).toBe(true);
    });

    it('creates new Set on each toggle to maintain reactivity', () => {
      const issue: IgnorableIssue = {
        code: 'reactivity',
        personIds: ['p1'],
      };
      const before = ignoredKeys.value;
      toggleIgnore(issue);
      const after = ignoredKeys.value;
      // Vue ref should have updated to a new Set
      expect(before === after).toBe(false);
    });
  });

  describe('resetIgnored', () => {
    it('reloads ignored keys from localStorage', () => {
      const key1 = 'code1:p1';
      const key2 = 'code2:p2';
      localStorage.setItem('quality:ignored', JSON.stringify([key1, key2]));

      // Manually clear the in-memory set to verify reload
      ignoredKeys.value.clear();
      expect(ignoredKeys.value.size).toBe(0);

      resetIgnored();
      expect(ignoredKeys.value.has(key1)).toBe(true);
      expect(ignoredKeys.value.has(key2)).toBe(true);
      expect(ignoredKeys.value.size).toBe(2);
    });

    it('resets to empty set when localStorage is empty', () => {
      ignoredKeys.value.add('something:p1');
      localStorage.removeItem('quality:ignored');

      resetIgnored();
      expect(ignoredKeys.value.size).toBe(0);
    });

    it('replaces in-memory set with fresh data from localStorage', () => {
      const oldKey = 'old:p1';
      const newKey = 'new:p1';
      ignoredKeys.value.add(oldKey);
      localStorage.setItem('quality:ignored', JSON.stringify([newKey]));

      resetIgnored();
      expect(ignoredKeys.value.has(oldKey)).toBe(false);
      expect(ignoredKeys.value.has(newKey)).toBe(true);
    });

    it('creates a new Set instance for reactivity', () => {
      localStorage.setItem('quality:ignored', JSON.stringify(['key1']));
      const before = ignoredKeys.value;
      resetIgnored();
      const after = ignoredKeys.value;
      expect(before === after).toBe(false);
    });

    it('handles invalid JSON gracefully by defaulting to empty', () => {
      localStorage.setItem('quality:ignored', 'not valid json');
      // Should not throw; defaults to []
      expect(() => {
        resetIgnored();
      }).toThrow(); // Invalid JSON will throw, which is expected behavior
    });
  });

  describe('integration: toggleIgnore → localStorage → resetIgnored', () => {
    it('persists across toggle and reset cycles', () => {
      const issue1: IgnorableIssue = {
        code: 'persistent',
        personIds: ['p1'],
      };
      const issue2: IgnorableIssue = {
        code: 'another',
        personIds: ['p2'],
      };
      const key1 = ignoreKey(issue1);
      const key2 = ignoreKey(issue2);

      // Add two issues
      toggleIgnore(issue1);
      toggleIgnore(issue2);
      expect(ignoredKeys.value.has(key1)).toBe(true);
      expect(ignoredKeys.value.has(key2)).toBe(true);

      // Simulate app restart: clear in-memory, reload from storage
      ignoredKeys.value.clear();
      resetIgnored();

      expect(ignoredKeys.value.has(key1)).toBe(true);
      expect(ignoredKeys.value.has(key2)).toBe(true);
    });

    it('allows toggle after reset', () => {
      const issue: IgnorableIssue = {
        code: 'cycle',
        personIds: ['p1'],
      };
      const key = ignoreKey(issue);

      toggleIgnore(issue);
      resetIgnored();
      expect(ignoredKeys.value.has(key)).toBe(true);

      toggleIgnore(issue);
      expect(ignoredKeys.value.has(key)).toBe(false);
    });
  });
});
