import { describe, it, expect } from 'vitest';
import { resolveExternalIdentifierUrl } from '../../src/api/external_identifier_links';

describe('resolveExternalIdentifierUrl', () => {
  it('turns an image pointer into a volume+image URL', () => {
    expect(resolveExternalIdentifierUrl('arkivdigital.image', 'v191316.b580.s52'))
      .toBe('https://app.arkivdigital.se/volume/v191316?image=580');
  });

  it('accepts an image pointer with no page part', () => {
    expect(resolveExternalIdentifierUrl('arkivdigital.image', 'v191316.b580'))
      .toBe('https://app.arkivdigital.se/volume/v191316?image=580');
  });

  it('turns a volume pointer into a volume URL', () => {
    expect(resolveExternalIdentifierUrl('arkivdigital', 'v191316'))
      .toBe('https://app.arkivdigital.se/volume/v191316');
  });

  it('returns null for a system it does not know', () => {
    expect(resolveExternalIdentifierUrl('gramps.handle', 'abc123')).toBeNull();
  });

  it('returns null for a value that does not match the system shape', () => {
    expect(resolveExternalIdentifierUrl('arkivdigital.image', 'not-an-aid')).toBeNull();
    expect(resolveExternalIdentifierUrl('arkivdigital', '')).toBeNull();
    expect(resolveExternalIdentifierUrl('arkivdigital', 'v191316.b580')).toBeNull();
  });

  it('does not build a URL from text that merely contains an id', () => {
    // The value is a field, not prose. src/api/link-rules/ is the free-text
    // linkifier and is a different mechanism with different risks.
    expect(resolveExternalIdentifierUrl('arkivdigital.image', 'see v1.b2 for context')).toBeNull();
    expect(resolveExternalIdentifierUrl('arkivdigital.image', 'AID: v1.b2')).toBeNull();
  });

  it('tolerates surrounding whitespace, which the importer trims but the UI may not', () => {
    expect(resolveExternalIdentifierUrl('arkivdigital.image', '  v1.b2  '))
      .toBe('https://app.arkivdigital.se/volume/v1?image=2');
  });
});
