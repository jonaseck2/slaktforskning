import { describe, it, expect } from 'vitest';
import { round6, round4, computeCentroid, avgCoordinates, weightedCentroid } from '../../src/gazetteer-build/geo';
import { parseWktPoint, generateAliases } from '../../src/gazetteer-build/wikidata';
import { parseGeoNamesRows, parseGeoNamesWithAdminNames, dedup } from '../../src/gazetteer-build/geonames';
import { countNodes, walkTree, countByType } from '../../src/gazetteer-build/tree';
import type { GazetteerNode } from '../../src/api/place-gazetteers/types';

// ── geo ──────────────────────────────────────────────────────────────────────

describe('round6', () => {
  it('rounds positive numbers to 6 decimal places', () => {
    expect(round6(1.1234567)).toBe(1.123457);
  });

  it('rounds negative numbers to 6 decimal places', () => {
    expect(round6(-1.1234567)).toBe(-1.123457);
  });

  it('returns zero unchanged', () => {
    expect(round6(0)).toBe(0);
  });

  it('leaves already-rounded numbers unchanged', () => {
    expect(round6(1.123456)).toBe(1.123456);
  });
});

describe('round4', () => {
  it('rounds positive numbers to 4 decimal places', () => {
    expect(round4(1.12345)).toBe(1.1235);
  });

  it('rounds negative numbers to 4 decimal places', () => {
    // Math.round(-1.12345 * 10000) = Math.round(-11234.5) = -11234 (rounds toward +Infinity)
    expect(round4(-1.12345)).toBe(-1.1234);
  });
});

describe('computeCentroid', () => {
  it('computes centroid of a Polygon (exterior ring only)', () => {
    const geometry = {
      type: 'Polygon' as const,
      coordinates: [
        [[0, 0], [2, 0], [2, 2], [0, 2]], // exterior ring: lon, lat pairs
        [[0.5, 0.5], [1.5, 0.5], [1.5, 1.5]], // interior ring (ignored)
      ],
    };
    const [lat, lon] = computeCentroid(geometry);
    // exterior ring: lons=[0,2,2,0], lats=[0,0,2,2] → avgLat=1, avgLon=1
    expect(lat).toBe(1);
    expect(lon).toBe(1);
  });

  it('computes centroid of a MultiPolygon', () => {
    const geometry = {
      type: 'MultiPolygon' as const,
      coordinates: [
        [[[0, 0], [2, 0], [2, 2], [0, 2]]], // polygon 1: avgLat=1, avgLon=1, 4 pts
        [[[4, 4], [6, 4], [6, 6], [4, 6]]], // polygon 2: avgLat=5, avgLon=5, 4 pts
      ],
    };
    const [lat, lon] = computeCentroid(geometry);
    // 8 points total: lats=[0,0,2,2,4,4,6,6], lons=[0,2,2,0,4,6,6,4]
    expect(lat).toBe(3);
    expect(lon).toBe(3);
  });

  it('uses only exterior ring for Polygon with hole', () => {
    const geometry = {
      type: 'Polygon' as const,
      coordinates: [
        [[0, 0], [4, 0], [4, 4], [0, 4]], // exterior ring
        [[1, 1], [3, 1], [3, 3], [1, 3]], // interior hole (should be ignored)
      ],
    };
    const [lat, lon] = computeCentroid(geometry);
    // exterior only: lats=[0,0,4,4], lons=[0,4,4,0] → avg lat=2, avg lon=2
    expect(lat).toBe(2);
    expect(lon).toBe(2);
  });
});

describe('avgCoordinates', () => {
  it('computes basic average of coordinates', () => {
    const nodes = [
      { lat: 10, lon: 20 },
      { lat: 20, lon: 40 },
    ];
    expect(avgCoordinates(nodes)).toEqual({ lat: 15, lon: 30 });
  });

  it('rounds result to 6 decimal places', () => {
    const nodes = [
      { lat: 1.0000001, lon: 2.0000001 },
      { lat: 1.0000002, lon: 2.0000002 },
    ];
    const result = avgCoordinates(nodes);
    expect(result.lat).toBe(round6((1.0000001 + 1.0000002) / 2));
    expect(result.lon).toBe(round6((2.0000001 + 2.0000002) / 2));
  });
});

describe('weightedCentroid', () => {
  it('returns null for empty array', () => {
    expect(weightedCentroid([])).toBeNull();
  });

  it('computes weighted centroid', () => {
    const items = [
      { lat: 0, lon: 0, weight: 1 },
      { lat: 10, lon: 10, weight: 3 },
    ];
    const result = weightedCentroid(items);
    expect(result).not.toBeNull();
    // weighted avg lat = (0*1 + 10*3) / 4 = 7.5
    expect(result!.lat).toBe(7.5);
    expect(result!.lon).toBe(7.5);
  });

  it('falls back to simple average when all weights are zero', () => {
    const items = [
      { lat: 0, lon: 0, weight: 0 },
      { lat: 10, lon: 10, weight: 0 },
    ];
    const result = weightedCentroid(items);
    expect(result).not.toBeNull();
    expect(result!.lat).toBe(5);
    expect(result!.lon).toBe(5);
  });
});

// ── wikidata ─────────────────────────────────────────────────────────────────

describe('parseWktPoint', () => {
  it('parses a valid WKT point', () => {
    expect(parseWktPoint('Point(18.0649 59.3326)')).toEqual({ lat: 59.3326, lon: 18.0649 });
  });

  it('returns null for invalid WKT', () => {
    expect(parseWktPoint('not a point')).toBeNull();
    expect(parseWktPoint('')).toBeNull();
  });

  it('returns null when coordinates are NaN', () => {
    expect(parseWktPoint('Point(abc def)')).toBeNull();
  });

  it('handles negative coordinates', () => {
    const result = parseWktPoint('Point(-73.9857 40.7484)');
    expect(result).toEqual({ lat: 40.7484, lon: -73.9857 });
  });

  it('rounds to 6 decimal places', () => {
    const result = parseWktPoint('Point(18.06491234567 59.33261234567)');
    expect(result).not.toBeNull();
    expect(result!.lat).toBe(round6(59.33261234567));
    expect(result!.lon).toBe(round6(18.06491234567));
  });
});

describe('generateAliases', () => {
  it('splits pipe-separated altLabels and excludes the primary name', () => {
    const aliases = generateAliases('Stockholm', 'Stockholm stad|Sthlm|Stockholm');
    expect(aliases).toContain('Stockholm stad');
    expect(aliases).toContain('Sthlm');
    expect(aliases).not.toContain('Stockholm'); // primary name excluded
  });

  it('returns empty array for empty altLabels', () => {
    expect(generateAliases('Stockholm', '')).toEqual([]);
  });

  it('strips suffix from primary name when suffixRegex provided', () => {
    const aliases = generateAliases('Stockholms stad', '', / stad$/);
    expect(aliases).toContain('Stockholms');
  });

  it('strips suffix from alt labels too', () => {
    // 'Gamla stan stad' → strip ' stad' → 'Gamla stan', which equals the primary name, so excluded
    // 'Gamla stadsdelen' → no suffix match → kept as-is
    const aliases = generateAliases('Gamla stan', 'Gamla stan stad|Gamla stadsdelen', / stad$/);
    expect(aliases).not.toContain('Gamla stan'); // stripped form equals primary name, excluded
    expect(aliases).toContain('Gamla stan stad'); // alt label kept as-is
    expect(aliases).toContain('Gamla stadsdelen');
  });

  it('deduplicates aliases', () => {
    const aliases = generateAliases('Foo', 'Bar|Bar|Baz');
    expect(aliases.filter(a => a === 'Bar').length).toBe(1);
  });
});

// ── geonames ─────────────────────────────────────────────────────────────────

// Build a GeoNames TSV line (15 columns minimum)
function makeGeoNamesLine(overrides: Partial<Record<string, string>> = {}): string {
  const cols = [
    overrides.geonameId ?? '123',       // 0: geonameId
    overrides.name ?? 'TestCity',       // 1: name
    overrides.asciiName ?? 'TestCity',  // 2: asciiName
    overrides.altNames ?? '',           // 3: altNames
    overrides.lat ?? '59.3326',         // 4: lat
    overrides.lon ?? '18.0649',         // 5: lon
    overrides.featureClass ?? 'P',      // 6: featureClass
    overrides.featureCode ?? 'PPL',     // 7: featureCode
    overrides.countryCode ?? 'SE',      // 8: countryCode
    overrides.cc2 ?? '',                // 9: cc2
    overrides.admin1 ?? '28',           // 10: admin1
    overrides.admin2 ?? '01',           // 11: admin2
    overrides.admin3 ?? '',             // 12: admin3
    overrides.admin4 ?? '',             // 13: admin4
    overrides.population ?? '100000',   // 14: population
  ];
  return cols.join('\t');
}

describe('parseGeoNamesRows', () => {
  it('parses TSV content into rows', () => {
    const line = makeGeoNamesLine({ geonameId: '456', name: 'Gothenburg', lat: '57.7089', lon: '11.9746' });
    const rows = parseGeoNamesRows(line);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Gothenburg');
    expect(rows[0].lat).toBe(57.7089);
    expect(rows[0].lon).toBe(11.9746);
    expect(rows[0].geonameId).toBe('456');
    expect(rows[0].population).toBe(100000);
  });

  it('skips blank lines', () => {
    const content = makeGeoNamesLine() + '\n\n' + makeGeoNamesLine({ name: 'Second' });
    const rows = parseGeoNamesRows(content);
    expect(rows).toHaveLength(2);
  });
});

describe('parseGeoNamesWithAdminNames', () => {
  it('extracts admin1 and admin2 name maps', () => {
    const adm1Line = makeGeoNamesLine({ name: 'Stockholm County', featureClass: 'A', featureCode: 'ADM1', admin1: '28' });
    const adm2Line = makeGeoNamesLine({ name: 'Stockholm Municipality', featureClass: 'A', featureCode: 'ADM2', admin1: '28', admin2: '01' });
    const cityLine = makeGeoNamesLine({ name: 'Stockholm', featureClass: 'P', featureCode: 'PPL', admin1: '28', admin2: '01' });
    const content = [adm1Line, adm2Line, cityLine].join('\n');

    const { rows, admin1Names, admin2Names } = parseGeoNamesWithAdminNames(content);
    expect(admin1Names['28']).toBe('Stockholm County');
    expect(admin2Names['28.01']).toBe('Stockholm Municipality');
    expect(rows).toHaveLength(3);
  });

  it('applies filter to output rows', () => {
    const adm1Line = makeGeoNamesLine({ name: 'County', featureClass: 'A', featureCode: 'ADM1', admin1: '01' });
    const cityLine = makeGeoNamesLine({ name: 'City', featureClass: 'P', featureCode: 'PPL' });
    const content = [adm1Line, cityLine].join('\n');

    const { rows, admin1Names } = parseGeoNamesWithAdminNames(
      content,
      (row) => row.featureClass === 'P',
    );
    // admin1Names still built from all rows
    expect(admin1Names['01']).toBe('County');
    // but filtered rows only contain P rows
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('City');
  });
});

describe('dedup', () => {
  it('deduplicates by lowercase name, first occurrence wins', () => {
    const items = [
      { name: 'Stockholm', value: 1 },
      { name: 'stockholm', value: 2 },
      { name: 'Gothenburg', value: 3 },
    ];
    const result = dedup(items);
    expect(result).toHaveLength(2);
    expect(result[0].value).toBe(1); // first occurrence
    expect(result[1].name).toBe('Gothenburg');
  });

  it('returns empty array for empty input', () => {
    expect(dedup([])).toEqual([]);
  });
});

// ── tree ─────────────────────────────────────────────────────────────────────

function makeNode(name: string, type: string, children?: GazetteerNode[]): GazetteerNode {
  return { name, type, lat: 0, lon: 0, children };
}

describe('countNodes', () => {
  it('counts all nodes recursively', () => {
    const tree = makeNode('root', 'country', [
      makeNode('child1', 'county', [
        makeNode('grandchild1', 'parish'),
        makeNode('grandchild2', 'parish'),
      ]),
      makeNode('child2', 'county'),
    ]);
    expect(countNodes(tree)).toBe(5);
  });

  it('counts a leaf node as 1', () => {
    expect(countNodes(makeNode('leaf', 'parish'))).toBe(1);
  });
});

describe('walkTree', () => {
  it('visits all nodes with correct depth', () => {
    const tree = makeNode('root', 'country', [
      makeNode('child', 'county', [
        makeNode('grandchild', 'parish'),
      ]),
    ]);
    const visited: Array<{ name: string; depth: number }> = [];
    walkTree(tree, (node, depth) => visited.push({ name: node.name, depth }));

    expect(visited).toEqual([
      { name: 'root', depth: 0 },
      { name: 'child', depth: 1 },
      { name: 'grandchild', depth: 2 },
    ]);
  });
});

describe('countByType', () => {
  it('groups node counts by type', () => {
    const tree = makeNode('root', 'country', [
      makeNode('c1', 'county', [
        makeNode('p1', 'parish'),
        makeNode('p2', 'parish'),
      ]),
      makeNode('c2', 'county'),
    ]);
    expect(countByType(tree)).toEqual({
      country: 1,
      county: 2,
      parish: 2,
    });
  });
});
