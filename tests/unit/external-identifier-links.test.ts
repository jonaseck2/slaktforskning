import { describe, it, expect } from 'vitest';
import { resolveExternalIdentifierUrl } from '../../src/api/external_identifier_links';

describe('resolveExternalIdentifierUrl', () => {
  it('builds the URL shape ArkivDigital itself writes', () => {
    // Measured: 2726 of 2762 `_URL` values across the four real exports use
    // arkivdigital.se/aid/show/<aid>. Zero use app.arkivdigital.se/volume/.
    expect(resolveExternalIdentifierUrl('arkivdigital.image', 'v191316.b580.s52'))
      .toBe('https://www.arkivdigital.se/aid/show/v191316.b580.s52');
  });

  it('keeps the page part, which the volume-and-image form would discard', () => {
    const url = resolveExternalIdentifierUrl('arkivdigital.image', 'v25161.b276.s528');
    expect(url).toContain('.s528');
    expect(url).toBe('https://www.arkivdigital.se/aid/show/v25161.b276.s528');
  });

  it('accepts an image pointer with no page part', () => {
    expect(resolveExternalIdentifierUrl('arkivdigital.image', 'v191316.b580'))
      .toBe('https://www.arkivdigital.se/aid/show/v191316.b580');
  });

  it('does not resolve the volume-level system', () => {
    // Unattested in aid/show, and the source row already carries the
    // researcher's own authored _URL. A synthesised link would be a guess
    // standing beside a real value.
    expect(resolveExternalIdentifierUrl('arkivdigital', 'v191316')).toBeNull();
  });

  it('returns null for a system it does not know', () => {
    expect(resolveExternalIdentifierUrl('gramps.handle', 'abc123')).toBeNull();
  });

  it('returns null for a value that does not match the system shape', () => {
    expect(resolveExternalIdentifierUrl('arkivdigital.image', 'not-an-aid')).toBeNull();
    expect(resolveExternalIdentifierUrl('arkivdigital.image', '')).toBeNull();
    expect(resolveExternalIdentifierUrl('arkivdigital.image', 'v191316')).toBeNull();
  });

  it('does not build a URL from text that merely contains an id', () => {
    // The value is a field, not prose. src/api/link-rules/ is the free-text
    // linkifier and is a different mechanism with different risks.
    expect(resolveExternalIdentifierUrl('arkivdigital.image', 'see v1.b2 for context')).toBeNull();
    expect(resolveExternalIdentifierUrl('arkivdigital.image', 'AID: v1.b2')).toBeNull();
  });

  it('tolerates surrounding whitespace, which the importer trims but the UI may not', () => {
    expect(resolveExternalIdentifierUrl('arkivdigital.image', '  v1.b2  '))
      .toBe('https://www.arkivdigital.se/aid/show/v1.b2');
  });
});
