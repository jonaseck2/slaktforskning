import { describe, it, expect } from 'vitest';
import { mediaDisplayName } from '../../src/renderer/utils/mediaUtils';

describe('mediaDisplayName', () => {
  it('returns title when present', () => {
    expect(mediaDisplayName('My Photo', '/path/to/file.jpg')).toBe('My Photo');
  });

  it('returns filename stem when no title', () => {
    expect(mediaDisplayName(null, '/photos/vacation.jpg')).toBe('vacation');
  });

  it('handles filename without extension', () => {
    expect(mediaDisplayName(null, '/path/README')).toBe('README');
  });

  it('handles deeply nested path', () => {
    expect(mediaDisplayName(null, '/a/b/c/d/photo.png')).toBe('photo');
  });

  it('returns fallback when both are null', () => {
    expect(mediaDisplayName(null, null)).toBe('—');
  });

  it('returns custom fallback', () => {
    expect(mediaDisplayName(null, null, 'N/A')).toBe('N/A');
  });

  it('returns fallback for undefined inputs', () => {
    expect(mediaDisplayName(undefined, undefined)).toBe('—');
  });

  it('returns fallback for empty string fileRef', () => {
    expect(mediaDisplayName(null, '')).toBe('—');
  });

  it('handles file with multiple dots', () => {
    expect(mediaDisplayName(null, '/path/my.photo.2024.jpg')).toBe('my.photo.2024');
  });

  it('prefers title over fileRef', () => {
    expect(mediaDisplayName('Custom Title', '/path/file.jpg')).toBe('Custom Title');
  });
});
