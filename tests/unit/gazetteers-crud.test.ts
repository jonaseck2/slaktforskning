import { describe, it, expect, beforeEach } from 'vitest';
import type { Database } from 'node-sqlite3-wasm';
import {
  importGazetteer,
  exportGazetteer,
  deleteGazetteer,
  listGazetteers,
  getImportedGazetteers,
  getGazetteerSchema,
} from '../../src/api/gazetteers';
import { setDbSetting, getDbSetting } from '../../src/api/db_settings';
import { createTestDb } from './helpers';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makePointGazetteer(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: 'test-custom',
    name: 'Test Gazetteer',
    locale: 'en',
    kind: 'point',
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
          lon: 18,
          children: [
            { name: 'Stockholm', type: 'city', lat: 59.33, lon: 18.07 },
          ],
        },
        { name: 'Norway', type: 'country', lat: 62, lon: 10 },
      ],
    },
    ...overrides,
  });
}

function makeBoundaryGazetteer(): string {
  return JSON.stringify({
    id: 'test-boundary',
    name: 'Test Boundary Gazetteer',
    locale: 'en',
    kind: 'boundary',
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
          lon: 18,
          geometry: {
            type: 'Polygon',
            coordinates: [[[10, 55], [25, 55], [25, 70], [10, 70], [10, 55]]],
          },
        },
      ],
    },
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

let db: Database;
beforeEach(() => {
  db = createTestDb();
});

// ── importGazetteer ──────────────────────────────────────────────────────────

describe('importGazetteer', () => {
  it('imports a valid point gazetteer and returns metadata', () => {
    const result = importGazetteer(db, makePointGazetteer());
    expect(result.id).toBe('test-custom');
    expect(result.name).toBe('Test Gazetteer');
    expect(result.locale).toBe('en');
    // root + 2 countries + 1 city = 4 nodes
    expect(result.nodeCount).toBe(4);
  });

  it('imports a valid boundary gazetteer with geometry', () => {
    const result = importGazetteer(db, makeBoundaryGazetteer());
    expect(result.id).toBe('test-boundary');
    expect(result.nodeCount).toBeGreaterThan(0);
  });

  it('upserts on duplicate id', () => {
    importGazetteer(db, makePointGazetteer());
    const updated = makePointGazetteer({ name: 'Updated Name' });
    const result = importGazetteer(db, updated);
    expect(result.name).toBe('Updated Name');

    // Only one row in the DB after upsert
    const exported = exportGazetteer(db, 'test-custom');
    expect(exported).not.toBeNull();
    const parsed = JSON.parse(exported!);
    expect(parsed.name).toBe('Updated Name');
  });

  it('rejects a bundled id with "bundled ID"', () => {
    const json = makePointGazetteer({ id: 'sv-socknar' });
    expect(() => importGazetteer(db, json)).toThrow('bundled ID');
  });

  it('rejects invalid JSON with "Invalid JSON"', () => {
    expect(() => importGazetteer(db, 'not-json{')).toThrow('Invalid JSON');
  });

  it('rejects oversized JSON with "50 MB"', () => {
    // Create a string just over 50 MB
    const padding = 'x'.repeat(50 * 1024 * 1024 + 1);
    const json = `{"_pad":"${padding}"}`;
    expect(() => importGazetteer(db, json)).toThrow('50 MB');
  });

  it('rejects missing id', () => {
    const json = makePointGazetteer({ id: undefined });
    expect(() => importGazetteer(db, json)).toThrow('id');
  });

  it('rejects missing name', () => {
    const json = makePointGazetteer({ name: undefined });
    expect(() => importGazetteer(db, json)).toThrow('name');
  });

  it('rejects missing locale', () => {
    const json = makePointGazetteer({ locale: undefined });
    expect(() => importGazetteer(db, json)).toThrow('locale');
  });

  it('rejects missing root', () => {
    const json = makePointGazetteer({ root: undefined });
    expect(() => importGazetteer(db, json)).toThrow('root');
  });

  it('rejects invalid node missing lat', () => {
    const json = JSON.stringify({
      id: 'test-custom',
      name: 'Test',
      locale: 'en',
      root: { name: 'World', type: 'world', lon: 0 }, // missing lat
    });
    expect(() => importGazetteer(db, json)).toThrow('lat');
  });

  it('rejects invalid aliases (non-string array)', () => {
    const json = JSON.stringify({
      id: 'test-custom',
      name: 'Test',
      locale: 'en',
      root: { name: 'World', type: 'world', lat: 0, lon: 0, aliases: [123] },
    });
    expect(() => importGazetteer(db, json)).toThrow('aliases');
  });

  it('rejects invalid geometry type', () => {
    const json = JSON.stringify({
      id: 'test-custom',
      name: 'Test',
      locale: 'en',
      root: {
        name: 'World',
        type: 'world',
        lat: 0,
        lon: 0,
        geometry: { type: 'LineString', coordinates: [] },
      },
    });
    expect(() => importGazetteer(db, json)).toThrow('geometry.type');
  });

  it('rejects invalid kind "language"', () => {
    const json = makePointGazetteer({ kind: 'language' });
    expect(() => importGazetteer(db, json)).toThrow('kind');
  });
});

// ── exportGazetteer ──────────────────────────────────────────────────────────

describe('exportGazetteer', () => {
  it('exports an imported gazetteer as JSON string with matching id', () => {
    importGazetteer(db, makePointGazetteer());
    const exported = exportGazetteer(db, 'test-custom');
    expect(exported).not.toBeNull();
    const parsed = JSON.parse(exported!);
    expect(parsed.id).toBe('test-custom');
  });

  it('exports a bundled gazetteer', () => {
    const exported = exportGazetteer(db, 'sv-socknar');
    expect(exported).not.toBeNull();
    const parsed = JSON.parse(exported!);
    expect(parsed.id).toBe('sv-socknar');
  });

  it('returns null for an unknown id', () => {
    const result = exportGazetteer(db, 'nonexistent-gazetteer-xyz');
    expect(result).toBeNull();
  });
});

// ── deleteGazetteer ──────────────────────────────────────────────────────────

describe('deleteGazetteer', () => {
  it('deletes an imported gazetteer and returns true', () => {
    importGazetteer(db, makePointGazetteer());
    const deleted = deleteGazetteer(db, 'test-custom');
    expect(deleted).toBe(true);
    expect(exportGazetteer(db, 'test-custom')).toBeNull();
  });

  it('returns false when deleting a bundled gazetteer', () => {
    const result = deleteGazetteer(db, 'sv-socknar');
    expect(result).toBe(false);
  });

  it('returns false when deleting an unknown id', () => {
    const result = deleteGazetteer(db, 'nonexistent-xyz');
    expect(result).toBe(false);
  });

  it('removes the deleted id from enabled gazetteer config', () => {
    importGazetteer(db, makePointGazetteer());
    setDbSetting(
      db,
      'gazetteer_config',
      JSON.stringify({ enabledGazetteers: ['sv-socknar', 'test-custom'] }),
    );

    deleteGazetteer(db, 'test-custom');

    const configJson = getDbSetting(db, 'gazetteer_config');
    expect(configJson).not.toBeNull();
    const config = JSON.parse(configJson!) as { enabledGazetteers: string[] };
    expect(config.enabledGazetteers).not.toContain('test-custom');
    expect(config.enabledGazetteers).toContain('sv-socknar');
  });
});

// ── listGazetteers ───────────────────────────────────────────────────────────

describe('listGazetteers', () => {
  it('returns bundled gazetteers with bundled: true', () => {
    const list = listGazetteers(db);
    const bundled = list.filter(g => g.bundled);
    expect(bundled.length).toBeGreaterThan(0);
    bundled.forEach(g => expect(g.bundled).toBe(true));
  });

  it('returns imported gazetteers with bundled: false and source metadata', () => {
    const json = JSON.stringify({
      id: 'test-custom',
      name: 'Test Gazetteer',
      locale: 'en',
      kind: 'point',
      source: {
        name: 'TestSource',
        url: 'https://example.com',
        license: 'MIT',
        fetched: '2024-01-01',
      },
      root: { name: 'World', type: 'world', lat: 0, lon: 0 },
    });
    importGazetteer(db, json);

    const list = listGazetteers(db);
    const imported = list.filter(g => !g.bundled);
    expect(imported.length).toBe(1);
    expect(imported[0].id).toBe('test-custom');
    expect(imported[0].bundled).toBe(false);
    expect(imported[0].source?.name).toBe('TestSource');
  });

  it('returns bundled and imported together', () => {
    importGazetteer(db, makePointGazetteer());
    const list = listGazetteers(db);
    const ids = list.map(g => g.id);
    expect(ids).toContain('sv-socknar');
    expect(ids).toContain('test-custom');
  });
});

// ── getImportedGazetteers ────────────────────────────────────────────────────

describe('getImportedGazetteers', () => {
  it('returns empty array when no gazetteers have been imported', () => {
    const result = getImportedGazetteers(db);
    expect(result).toEqual([]);
  });

  it('returns parsed Gazetteer objects with correct structure', () => {
    importGazetteer(db, makePointGazetteer());
    const result = getImportedGazetteers(db);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('test-custom');
    expect(result[0].name).toBe('Test Gazetteer');
    expect(result[0].locale).toBe('en');
    expect(result[0].root).toBeDefined();
    expect(result[0].root.name).toBe('World');
  });
});

// ── getGazetteerSchema ───────────────────────────────────────────────────────

describe('getGazetteerSchema', () => {
  it('returns object with $schema containing "json-schema.org"', () => {
    const schema = getGazetteerSchema();
    expect(typeof schema).toBe('object');
    expect(schema['$schema']).toContain('json-schema.org');
  });

  it('has required fields ["id", "root"]', () => {
    const schema = getGazetteerSchema();
    const required = schema['required'] as string[];
    expect(required).toContain('id');
    expect(required).toContain('root');
  });
});
