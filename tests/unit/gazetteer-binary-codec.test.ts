import { describe, it, expect } from 'vitest';
import { encodeGazetteer, decodeGazetteer } from '../../src/gazetteer-build/binary-codec';
import type { Gazetteer } from '../../src/api/place-gazetteers/types';

const TINY_GAZ: Gazetteer = {
  id: 'test-tiny',
  name: 'Tiny Test',
  locale: 'en',
  shape: 'scaffolding',
  root: {
    name: 'World',
    type: 'world',
    lat: 0,
    lon: 0,
    children: [
      {
        name: 'Sweden',
        type: 'country',
        lat: 60,
        lon: 15,
        aliases: ['Sverige'],
        children: [
          { name: 'Stockholm', type: 'admin1', lat: 59.3293, lon: 18.0686 },
        ],
      },
    ],
  },
};

describe('gazetteer binary codec', () => {
  it('round-trips a minimal gazetteer', () => {
    const buf = encodeGazetteer(TINY_GAZ);
    const decoded = decodeGazetteer(buf);
    expect(decoded.id).toBe(TINY_GAZ.id);
    expect(decoded.name).toBe(TINY_GAZ.name);
    expect(decoded.locale).toBe(TINY_GAZ.locale);
    expect(decoded.root?.name).toBe('World');
    expect(decoded.root?.children?.[0].name).toBe('Sweden');
    expect(decoded.root?.children?.[0].aliases).toEqual(['Sverige']);
    const stockholm = decoded.root?.children?.[0].children?.[0];
    expect(stockholm?.name).toBe('Stockholm');
    expect(stockholm?.lat).toBeCloseTo(59.3293, 5); // int32 × 1e6 = 5 dp
    expect(stockholm?.lon).toBeCloseTo(18.0686, 5);
  });

  it('preserves geometry round-trip', () => {
    const gaz: Gazetteer = {
      id: 'test-geom',
      name: 'Geom Test',
      locale: 'en',
      kind: 'boundary',
      shape: 'scaffolding',
      root: {
        name: 'World',
        type: 'world',
        lat: 0,
        lon: 0,
        children: [
          {
            name: 'Box',
            type: 'country',
            lat: 1,
            lon: 1,
            geometry: {
              type: 'Polygon',
              coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
            },
          },
        ],
      },
    };
    const decoded = decodeGazetteer(encodeGazetteer(gaz));
    const box = decoded.root?.children?.[0];
    expect(box?.geometry?.type).toBe('Polygon');
    const coords = (box?.geometry as { coordinates: number[][][] }).coordinates;
    expect(coords[0]).toHaveLength(5);
    expect(coords[0][0]).toEqual([0, 0]);
    expect(coords[0][2]).toEqual([1, 1]);
  });

  it('preserves contributions shape', () => {
    const gaz: Gazetteer = {
      id: 'test-contrib',
      name: 'Contrib Test',
      locale: 'sv',
      shape: 'contributions',
      contributions: [
        {
          parentPath: ['World', 'Europe', 'Sweden'],
          nodes: [
            { name: 'Skåne', type: 'admin1', lat: 55.99, lon: 13.59 },
          ],
        },
      ],
    };
    const decoded = decodeGazetteer(encodeGazetteer(gaz));
    expect(decoded.shape).toBe('contributions');
    expect(decoded.contributions).toHaveLength(1);
    expect(decoded.contributions?.[0].parentPath).toEqual(['World', 'Europe', 'Sweden']);
    expect(decoded.contributions?.[0].nodes[0].name).toBe('Skåne');
  });

  it('throws on a bad magic number', () => {
    expect(() => decodeGazetteer(Buffer.from([0, 0, 0, 0, 1, 2, 3, 4]))).toThrow(/magic|format/i);
  });

  it('throws on an unsupported version', () => {
    const buf = Buffer.from([
      0x53, 0x4c, 0x47, 0x00,           // "SLG\0" magic stub
      0xFF, 0x00, 0x00, 0x00,           // version 255
    ]);
    // The actual encoder uses 'SLG1' = [0x53, 0x4c, 0x47, 0x31]; build a buf that
    // has a bad version. The decode error should mention 'version'.
    const realBuf = encodeGazetteer(TINY_GAZ);
    realBuf.writeUInt32LE(99, 4); // overwrite version field
    expect(() => decodeGazetteer(realBuf)).toThrow(/version/i);
  });

  it('round-trips every real bundled gazetteer (smoke)', async () => {
    // Sample a handful — full set runs in Task 6 verification.
    const ids = ['world-countries', 'sv-orter', 'us-immigration-states'];
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    for (const id of ids) {
      const json = JSON.parse(
        readFileSync(resolve('src/api/place-gazetteers/data', `${id}.json`), 'utf8'),
      ) as Gazetteer;
      const decoded = decodeGazetteer(encodeGazetteer(json));
      expect(decoded.id).toBe(json.id);
      // Spot-check: name, locale, root presence
      expect(decoded.name).toBe(json.name);
      expect(decoded.locale).toBe(json.locale);
      if (json.root) expect(decoded.root?.name).toBe(json.root.name);
      if (json.contributions) expect(decoded.contributions?.length).toBe(json.contributions.length);
    }
  });
});
