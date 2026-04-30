import { describe, it, expect } from 'vitest';
import { mediaDisplayName, isImageMedia } from '../../src/renderer/utils/mediaUtils';

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

describe('isImageMedia', () => {
  it('returns true for known image format', () => {
    expect(isImageMedia('jpg', null)).toBe(true);
    expect(isImageMedia('PNG', null)).toBe(true);
    expect(isImageMedia('jpeg', '/some/file.pdf')).toBe(true);
  });

  it('falls back to file_ref extension when format is junk', () => {
    // The bug: GEDCOM imports populate `format` with the wrong dot segment
    // ("SE'" from "Familjesidan.se'(jan2022).jpg", "COM" from a URL, etc.)
    expect(isImageMedia("SE'", '/photos/Familjesidan.se\'(jan2022).jpg')).toBe(true);
    expect(isImageMedia('COM', '/photos/archive.com/x.png')).toBe(true);
    expect(isImageMedia('KÄL', '/photos/Källa-foto.jpg')).toBe(true);
  });

  it('returns true when format is null/empty but file_ref is an image', () => {
    expect(isImageMedia(null, '/photos/portrait.jpg')).toBe(true);
    expect(isImageMedia('', '/photos/portrait.png')).toBe(true);
    expect(isImageMedia(undefined, '/photos/x.webp')).toBe(true);
  });

  it('returns false when neither format nor file_ref is an image', () => {
    expect(isImageMedia(null, null)).toBe(false);
    expect(isImageMedia('pdf', '/docs/file.pdf')).toBe(false);
    expect(isImageMedia('SE\'', '/path/document.pdf')).toBe(false);
    expect(isImageMedia(null, '/path/file.docx')).toBe(false);
  });

  it('handles file_ref with multiple dots correctly', () => {
    expect(isImageMedia(null, '/path/my.photo.2024.jpg')).toBe(true);
    expect(isImageMedia(null, '/path/archive.tar.gz')).toBe(false);
  });

  it('handles file_ref with no extension', () => {
    expect(isImageMedia(null, '/path/README')).toBe(false);
    expect(isImageMedia(null, '/path/.hidden')).toBe(false);
  });

  it('is case-insensitive on file_ref extension', () => {
    expect(isImageMedia(null, '/path/PHOTO.JPG')).toBe(true);
    expect(isImageMedia(null, '/path/photo.JpEg')).toBe(true);
  });
});
