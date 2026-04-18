import { describe, it, expect } from 'vitest';
import { linkify, resolveRules, type LinkRule } from '../../src/api/source-linker';
import { svRules } from '../../src/api/link-rules/sv';
import { enRules } from '../../src/api/link-rules/en';
import { universalRules } from '../../src/api/link-rules/universal';
import { deRules } from '../../src/api/link-rules/de';
import { daRules } from '../../src/api/link-rules/da';
import { noRules } from '../../src/api/link-rules/no';

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

describe('Swedish default rules', () => {
  it('matches ArkivDigital AID with page suffix', () => {
    const result = linkify('(AID: v170308.b530.s44, NAD: SE/VALA/00333)', svRules);
    const aidSeg = result.find((s) => s.ruleName === 'ArkivDigital (AID)');
    expect(aidSeg).toBeDefined();
    expect(aidSeg!.url).toBe('https://app.arkivdigital.se/volume/v170308?image=530');
  });

  it('matches ArkivDigital AID without page suffix', () => {
    const result = linkify('AID: v36086.b20', svRules);
    const aidSeg = result.find((s) => s.url);
    expect(aidSeg!.url).toBe('https://app.arkivdigital.se/volume/v36086?image=20');
  });

  it('matches Riksarkivet NAD code', () => {
    const result = linkify('NAD: SE/VALA/00333', svRules);
    const nadSeg = result.find((s) => s.ruleName === 'Riksarkivet (NAD)');
    expect(nadSeg).toBeDefined();
    expect(nadSeg!.url).toContain('SE/VALA/00333');
  });

  it('matches Sveriges Befolkning abbreviation', () => {
    const result = linkify('SvBf1980', svRules);
    const seg = result.find((s) => s.url);
    expect(seg).toBeDefined();
  });
});

describe('English default rules', () => {
  it('matches FamilySearch ARK', () => {
    const result = linkify('see ark:/61903/1:1:XHLN-69H for details', enRules);
    const seg = result.find((s) => s.url);
    expect(seg).toBeDefined();
    expect(seg!.url).toBe('https://www.familysearch.org/ark:/61903/1:1:XHLN-69H');
  });

  it('matches FindAGrave memorial', () => {
    const result = linkify('Find A Grave memorial 12345678', enRules);
    const seg = result.find((s) => s.url);
    expect(seg).toBeDefined();
    expect(seg!.url).toBe('https://www.findagrave.com/memorial/12345678');
  });

  it('matches Ancestry record URL', () => {
    const result = linkify('ancestry.com/discoveryui-content/view/12345:6789', enRules);
    const seg = result.find((s) => s.url);
    expect(seg).toBeDefined();
    expect(seg!.url).toBe('https://www.ancestry.com/discoveryui-content/view/12345:6789');
  });
});

describe('Universal rules', () => {
  it('matches plain HTTPS URL', () => {
    const result = linkify('visit https://example.com/page today', universalRules);
    const seg = result.find((s) => s.url);
    expect(seg!.url).toBe('https://example.com/page');
  });

  it('matches plain HTTP URL', () => {
    const result = linkify('see http://old.site.com/doc', universalRules);
    const seg = result.find((s) => s.url);
    expect(seg!.url).toBe('http://old.site.com/doc');
  });
});

describe('resolveRules', () => {
  const defaults: LinkRule[] = [
    { id: 'sv-1', name: 'SV Rule', pattern: 'sv', urlTemplate: 'https://sv.com', locale: 'sv', enabled: true, priority: 10 },
    { id: 'en-1', name: 'EN Rule', pattern: 'en', urlTemplate: 'https://en.com', locale: 'en', enabled: true, priority: 10 },
    { id: 'uni-1', name: 'Universal', pattern: 'uni', urlTemplate: 'https://uni.com', locale: '*', enabled: true, priority: 100 },
  ];

  it('includes only rules from enabled locales plus universal', () => {
    const result = resolveRules(defaults, { enabledLocales: ['sv'], overrides: {} });
    const ids = result.map((r) => r.id);
    expect(ids).toContain('sv-1');
    expect(ids).toContain('uni-1');
    expect(ids).not.toContain('en-1');
  });

  it('applies enabled override to disable a default rule', () => {
    const result = resolveRules(defaults, {
      enabledLocales: ['sv'],
      overrides: { 'sv-1': { enabled: false } },
    });
    const svRule = result.find((r) => r.id === 'sv-1');
    expect(svRule!.enabled).toBe(false);
  });

  it('adds custom rules from overrides', () => {
    const result = resolveRules(defaults, {
      enabledLocales: ['sv'],
      overrides: {
        'custom-1': {
          name: 'Custom',
          pattern: 'cust',
          urlTemplate: 'https://cust.com/$1',
          enabled: true,
          priority: 25,
        },
      },
    });
    const custom = result.find((r) => r.id === 'custom-1');
    expect(custom).toBeDefined();
    expect(custom!.name).toBe('Custom');
  });

  it('sorts output by priority', () => {
    const result = resolveRules(defaults, { enabledLocales: ['sv', 'en'], overrides: {} });
    for (let i = 1; i < result.length; i++) {
      expect(result[i].priority).toBeGreaterThanOrEqual(result[i - 1].priority);
    }
  });
});

describe('German default rules', () => {
  it('matches Archion reference', () => {
    const result = linkify('Archion: Taufregister 1680-1720', deRules);
    const seg = result.find((s) => s.url);
    expect(seg).toBeDefined();
    expect(seg!.url).toContain('archion.de');
    expect(seg!.url).toContain('Taufregister');
  });

  it('matches Matricula reference', () => {
    const result = linkify('Matricula: Wien, St. Stephan, more text', deRules);
    const seg = result.find((s) => s.ruleName === 'Matricula');
    expect(seg).toBeDefined();
    expect(seg!.url).toContain('matricula-online.eu');
  });

  it('matches Ancestry.de record URL', () => {
    const result = linkify('ancestry.de/discoveryui-content/view/45678:1234', deRules);
    const seg = result.find((s) => s.url);
    expect(seg).toBeDefined();
    expect(seg!.url).toBe('https://www.ancestry.de/discoveryui-content/view/45678:1234');
  });
});

describe('Danish default rules', () => {
  it('matches Arkivalieronline AO reference', () => {
    const result = linkify('AO: 12345', daRules);
    const seg = result.find((s) => s.url);
    expect(seg).toBeDefined();
    expect(seg!.url).toContain('sa.dk');
    expect(seg!.url).toContain('12345');
  });

  it('matches KIP reference', () => {
    const result = linkify('KIP: Odense 1787, some note', daRules);
    const seg = result.find((s) => s.ruleName?.includes('KIP'));
    expect(seg).toBeDefined();
    expect(seg!.url).toContain('kip.rfrn.dk');
  });
});

describe('Norwegian default rules', () => {
  it('matches Digitalarkivet DA reference', () => {
    const result = linkify('DA: Bergen 1801, census', noRules);
    const seg = result.find((s) => s.url);
    expect(seg).toBeDefined();
    expect(seg!.url).toContain('digitalarkivet.no');
  });

  it('matches Arkivverket URL passthrough', () => {
    const result = linkify('see arkivverket.no/search/archives for details', noRules);
    const seg = result.find((s) => s.url);
    expect(seg).toBeDefined();
    expect(seg!.text).toBe('arkivverket.no/search/archives');
  });
});

describe('Swedish rule additions', () => {
  it('matches SVAR reference', () => {
    const result = linkify('SVAR: Husförhör Lekeberga 1820-1830, page 5', svRules);
    const seg = result.find((s) => s.ruleName === 'SVAR');
    expect(seg).toBeDefined();
    expect(seg!.url).toContain('riksarkivet.se/svar/');
  });

  it('matches DDB reference', () => {
    const result = linkify('DDB: Skellefteå 1890, birth record', svRules);
    const seg = result.find((s) => s.ruleName?.includes('DDB'));
    expect(seg).toBeDefined();
    expect(seg!.url).toContain('ddb.umu.se');
  });
});

describe('English rule additions', () => {
  it('matches MyHeritage record URL', () => {
    const result = linkify('myheritage.com/research/record-1-300123456', enRules);
    const seg = result.find((s) => s.url);
    expect(seg).toBeDefined();
    expect(seg!.url).toBe('https://www.myheritage.com/research/record-1-300123456');
  });

  it('matches Geni profile URL', () => {
    const result = linkify('geni.com/people/John-Smith/6000000012345678', enRules);
    const seg = result.find((s) => s.url);
    expect(seg).toBeDefined();
    expect(seg!.url).toContain('geni.com/people/profile/6000000012345678');
  });

  it('matches WikiTree ID reference', () => {
    const result = linkify('WikiTree: Smith-12345', enRules);
    const seg = result.find((s) => s.url);
    expect(seg).toBeDefined();
    expect(seg!.url).toBe('https://www.wikitree.com/wiki/Smith-12345');
  });

  it('matches BillionGraves memorial', () => {
    const result = linkify('BillionGraves memorial 1234567', enRules);
    const seg = result.find((s) => s.url);
    expect(seg).toBeDefined();
    expect(seg!.url).toBe('https://billiongraves.com/grave/1234567');
  });
});
