import { describe, it, expect } from 'vitest';
import { linkify, resolveRules, type LinkRule, type LinkedSegment } from '../../src/api/source-linker';
import { svRules } from '../../src/api/link-rules/sv';
import { enRules } from '../../src/api/link-rules/en';
import { universalRules } from '../../src/api/link-rules/universal';

const testRule: LinkRule = {
  id: 'test-aid',
  name: 'Test AID',
  pattern: 'AID:\\s*v(\\d+)\\.b(\\d+)',
  urlTemplate: 'https://example.com/volume/v$1?image=$2',
  locale: '*',
  enabled: true,
  priority: 10,
};

describe('linkify', () => {
  it('returns plain segment for text with no matches', () => {
    const result = linkify('no links here', [testRule]);
    expect(result).toEqual([{ text: 'no links here' }]);
  });

  it('returns empty array for empty string', () => {
    const result = linkify('', [testRule]);
    expect(result).toEqual([]);
  });

  it('extracts a single match with surrounding text', () => {
    const result = linkify('ref: AID: v12345.b67 end', [testRule]);
    expect(result).toEqual([
      { text: 'ref: ' },
      { text: 'AID: v12345.b67', url: 'https://example.com/volume/v12345?image=67', ruleName: 'Test AID' },
      { text: ' end' },
    ]);
  });

  it('extracts multiple matches', () => {
    const result = linkify('first AID: v1.b2 then AID: v3.b4', [testRule]);
    expect(result).toHaveLength(4);
    expect(result[1]).toEqual({
      text: 'AID: v1.b2',
      url: 'https://example.com/volume/v1?image=2',
      ruleName: 'Test AID',
    });
    expect(result[3]).toEqual({
      text: 'AID: v3.b4',
      url: 'https://example.com/volume/v3?image=4',
      ruleName: 'Test AID',
    });
  });

  it('handles match at start of string', () => {
    const result = linkify('AID: v1.b2 rest', [testRule]);
    expect(result[0]).toEqual({
      text: 'AID: v1.b2',
      url: 'https://example.com/volume/v1?image=2',
      ruleName: 'Test AID',
    });
  });

  it('handles match at end of string', () => {
    const result = linkify('see AID: v1.b2', [testRule]);
    expect(result).toHaveLength(2);
    expect(result[1].url).toBeDefined();
  });

  it('skips disabled rules', () => {
    const disabled = { ...testRule, enabled: false };
    const result = linkify('AID: v1.b2', [disabled]);
    expect(result).toEqual([{ text: 'AID: v1.b2' }]);
  });

  it('higher priority rule wins on overlap', () => {
    const lowPriority: LinkRule = {
      id: 'low',
      name: 'Low',
      pattern: 'AID:\\s*v\\d+',
      urlTemplate: 'https://low.com/$0',
      locale: '*',
      enabled: true,
      priority: 50,
    };
    const result = linkify('AID: v12345.b67', [lowPriority, testRule]);
    expect(result[0].url).toBe('https://example.com/volume/v12345?image=67');
    expect(result[0].ruleName).toBe('Test AID');
  });

  it('supports $0 as full match reference', () => {
    const urlRule: LinkRule = {
      id: 'url',
      name: 'URL',
      pattern: 'https?://[^\\s]+',
      urlTemplate: '$0',
      locale: '*',
      enabled: true,
      priority: 100,
    };
    const result = linkify('visit https://example.com/page today', [urlRule]);
    expect(result[1]).toEqual({
      text: 'https://example.com/page',
      url: 'https://example.com/page',
      ruleName: 'URL',
    });
  });
});
