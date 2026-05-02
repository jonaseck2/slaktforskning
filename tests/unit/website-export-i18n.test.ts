import { describe, it, expect } from 'vitest';
import en from '../../src/renderer/i18n/en';
import sv from '../../src/renderer/i18n/sv';

/**
 * Task 10.1: Verify new i18n keys exist in both en.ts and sv.ts,
 * and that the old renamed keys do NOT exist.
 *
 * Validates: Requirements 1.3
 */
describe('i18n key existence for web export improvements', () => {
  const enHtmlSite = (en as any).htmlSite;
  const svHtmlSite = (sv as any).htmlSite;

  describe('new keys exist with non-empty string values in English', () => {
    it('htmlSite.focusPerson', () => {
      expect(typeof enHtmlSite.focusPerson).toBe('string');
      expect(enHtmlSite.focusPerson.length).toBeGreaterThan(0);
    });

    it('htmlSite.focusPersonHint', () => {
      expect(typeof enHtmlSite.focusPersonHint).toBe('string');
      expect(enHtmlSite.focusPersonHint.length).toBeGreaterThan(0);
    });

    it('htmlSite.exportSingleFile', () => {
      expect(typeof enHtmlSite.exportSingleFile).toBe('string');
      expect(enHtmlSite.exportSingleFile.length).toBeGreaterThan(0);
    });

    it('htmlSite.exportingSingleFile', () => {
      expect(typeof enHtmlSite.exportingSingleFile).toBe('string');
      expect(enHtmlSite.exportingSingleFile.length).toBeGreaterThan(0);
    });

    it('htmlSite.mediaCount', () => {
      expect(typeof enHtmlSite.mediaCount).toBe('string');
      expect(enHtmlSite.mediaCount.length).toBeGreaterThan(0);
    });
  });

  describe('new keys exist with non-empty string values in Swedish', () => {
    it('htmlSite.focusPerson', () => {
      expect(typeof svHtmlSite.focusPerson).toBe('string');
      expect(svHtmlSite.focusPerson.length).toBeGreaterThan(0);
    });

    it('htmlSite.focusPersonHint', () => {
      expect(typeof svHtmlSite.focusPersonHint).toBe('string');
      expect(svHtmlSite.focusPersonHint.length).toBeGreaterThan(0);
    });

    it('htmlSite.exportSingleFile', () => {
      expect(typeof svHtmlSite.exportSingleFile).toBe('string');
      expect(svHtmlSite.exportSingleFile.length).toBeGreaterThan(0);
    });

    it('htmlSite.exportingSingleFile', () => {
      expect(typeof svHtmlSite.exportingSingleFile).toBe('string');
      expect(svHtmlSite.exportingSingleFile.length).toBeGreaterThan(0);
    });

    it('htmlSite.mediaCount', () => {
      expect(typeof svHtmlSite.mediaCount).toBe('string');
      expect(svHtmlSite.mediaCount.length).toBeGreaterThan(0);
    });
  });

  describe('old renamed keys do NOT exist', () => {
    it('htmlSite.subject does not exist in English', () => {
      expect(enHtmlSite.subject).toBeUndefined();
    });

    it('htmlSite.subjectHint does not exist in English', () => {
      expect(enHtmlSite.subjectHint).toBeUndefined();
    });

    it('htmlSite.subject does not exist in Swedish', () => {
      expect(svHtmlSite.subject).toBeUndefined();
    });

    it('htmlSite.subjectHint does not exist in Swedish', () => {
      expect(svHtmlSite.subjectHint).toBeUndefined();
    });
  });
});
