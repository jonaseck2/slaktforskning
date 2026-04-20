import type { Database } from 'node-sqlite3-wasm';
import { countNodes } from '../gazetteer-build/tree';
import type { Gazetteer, GazetteerSource, GazetteerInfo } from './place-gazetteers/types';
import { getAllGazetteers } from './place-gazetteers/bundled';
import { getDbSetting, setDbSetting } from './db_settings';
import { queryOne, queryAll, runSql } from './db';

const MAX_JSON_BYTES = 50 * 1024 * 1024; // 50 MB

const BUNDLED_IDS = new Set(getAllGazetteers().map(g => g.id));

export interface ImportGazetteerResult {
  id: string;
  name: string;
  locale: string;
  nodeCount: number;
}

function validateNode(node: unknown, path: string): void {
  if (!node || typeof node !== 'object') {
    throw new Error(`Invalid node at ${path}: must be an object`);
  }
  const n = node as Record<string, unknown>;
  if (typeof n.name !== 'string' || !n.name) {
    throw new Error(`Invalid node at ${path}: missing required string field "name"`);
  }
  if (typeof n.type !== 'string' || !n.type) {
    throw new Error(`Invalid node at ${path}: missing required string field "type"`);
  }
  if (typeof n.lat !== 'number') {
    throw new Error(`Invalid node at ${path}: missing required number field "lat"`);
  }
  if (typeof n.lon !== 'number') {
    throw new Error(`Invalid node at ${path}: missing required number field "lon"`);
  }
  if (n.aliases !== undefined) {
    if (!Array.isArray(n.aliases) || !n.aliases.every((a: unknown) => typeof a === 'string')) {
      throw new Error(`Invalid node at ${path}: "aliases" must be a string array`);
    }
  }
  if (n.children !== undefined) {
    if (!Array.isArray(n.children)) {
      throw new Error(`Invalid node at ${path}: "children" must be an array`);
    }
    for (let i = 0; i < n.children.length; i++) {
      validateNode(n.children[i], `${path}.children[${i}]`);
    }
  }
  if (n.geometry !== undefined) {
    if (!n.geometry || typeof n.geometry !== 'object') {
      throw new Error(`Invalid node at ${path}: "geometry" must be an object`);
    }
    const geo = n.geometry as Record<string, unknown>;
    if (geo.type !== 'Polygon' && geo.type !== 'MultiPolygon') {
      throw new Error(`Invalid node at ${path}: geometry.type must be "Polygon" or "MultiPolygon"`);
    }
    if (!Array.isArray(geo.coordinates)) {
      throw new Error(`Invalid node at ${path}: geometry.coordinates must be an array`);
    }
  }
}

function validateGazetteer(obj: unknown): Gazetteer {
  if (!obj || typeof obj !== 'object') {
    throw new Error('Gazetteer must be a JSON object');
  }
  const g = obj as Record<string, unknown>;

  if (typeof g.id !== 'string' || !g.id) {
    throw new Error('Missing required string field "id"');
  }
  if (typeof g.name !== 'string' || !g.name) {
    throw new Error('Missing required string field "name"');
  }
  if (typeof g.locale !== 'string' || !g.locale) {
    throw new Error('Missing required string field "locale"');
  }
  if (!g.root) {
    throw new Error('Missing required field "root"');
  }
  if (g.kind !== undefined && g.kind !== 'point' && g.kind !== 'boundary') {
    throw new Error('Field "kind" must be "point" or "boundary"');
  }

  validateNode(g.root, 'root');

  return obj as Gazetteer;
}

export function importGazetteer(db: Database, jsonString: string): ImportGazetteerResult {
  if (Buffer.byteLength(jsonString, 'utf8') > MAX_JSON_BYTES) {
    throw new Error('Gazetteer JSON exceeds 50 MB size limit');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (e) {
    throw new Error(`Invalid JSON: ${(e as Error).message}`);
  }

  const gazetteer = validateGazetteer(parsed);

  if (BUNDLED_IDS.has(gazetteer.id)) {
    throw new Error(`Cannot import gazetteer with bundled ID "${gazetteer.id}"`);
  }

  const nodeCount = countNodes(gazetteer.root);
  const sourceJson = gazetteer.source ? JSON.stringify(gazetteer.source) : null;
  const data = jsonString;

  runSql(db, `
    INSERT INTO gazetteers (id, name, locale, description, source_json, data)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      locale = excluded.locale,
      description = excluded.description,
      source_json = excluded.source_json,
      data = excluded.data
  `, [gazetteer.id, gazetteer.name, gazetteer.locale, gazetteer.description ?? null, sourceJson, data]);

  return { id: gazetteer.id, name: gazetteer.name, locale: gazetteer.locale, nodeCount };
}

export function exportGazetteer(db: Database, id: string): string | null {
  const row = queryOne<{ data: string }>(db, 'SELECT data FROM gazetteers WHERE id = ?', [id]);
  if (row) {
    return row.data;
  }

  const bundled = getAllGazetteers().find(g => g.id === id);
  if (bundled) {
    return JSON.stringify(bundled, null, 2);
  }

  return null;
}

export function deleteGazetteer(db: Database, id: string): boolean {
  if (BUNDLED_IDS.has(id)) {
    return false;
  }

  const existing = queryOne<{ id: string }>(db, 'SELECT id FROM gazetteers WHERE id = ?', [id]);
  if (!existing) {
    return false;
  }

  runSql(db, 'DELETE FROM gazetteers WHERE id = ?', [id]);

  const configJson = getDbSetting(db, 'gazetteer_config');
  if (configJson) {
    try {
      const config = JSON.parse(configJson) as { enabledGazetteers?: string[] };
      if (Array.isArray(config.enabledGazetteers)) {
        config.enabledGazetteers = config.enabledGazetteers.filter((gid: string) => gid !== id);
        setDbSetting(db, 'gazetteer_config', JSON.stringify(config));
      }
    } catch {
      // Malformed config — leave as-is
    }
  }

  return true;
}

type GazetteerRow = {
  id: string;
  name: string;
  locale: string;
  description: string | null;
  source_json: string | null;
};

export function listGazetteers(db: Database): GazetteerInfo[] {
  const bundled = getAllGazetteers().map((g): GazetteerInfo => ({
    id: g.id,
    name: g.name,
    locale: g.locale,
    description: g.description,
    source: g.source,
    bundled: true,
    kind: g.kind,
    rootName: g.root.name,
  }));

  const rows = queryAll<GazetteerRow & { data: string }>(db, 'SELECT id, name, locale, description, source_json, data FROM gazetteers ORDER BY created_at');
  const imported = rows.map((row): GazetteerInfo => {
    let kind: 'point' | 'boundary' | 'language' | undefined;
    let rootName: string | undefined;
    try {
      const parsed = JSON.parse(row.data);
      kind = parsed.kind;
      rootName = parsed.root?.name;
    } catch { /* ignore */ }
    return {
      id: row.id,
      name: row.name,
      locale: row.locale,
      description: row.description ?? undefined,
      source: row.source_json ? (JSON.parse(row.source_json) as GazetteerSource) : undefined,
      bundled: false,
      kind,
      rootName,
    };
  });

  return [...bundled, ...imported];
}

export function getImportedGazetteers(db: Database): Gazetteer[] {
  const rows = queryAll<{ data: string }>(db, 'SELECT data FROM gazetteers ORDER BY created_at');
  return rows.map(row => JSON.parse(row.data) as Gazetteer);
}

export function getGazetteerSchema(): Record<string, unknown> {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'Gazetteer',
    type: 'object',
    required: ['id', 'name', 'locale', 'root'],
    properties: {
      id: {
        type: 'string',
        description: 'Unique identifier for the gazetteer',
      },
      name: {
        type: 'string',
        description: 'Human-readable name of the gazetteer',
      },
      locale: {
        type: 'string',
        description: 'Locale/language code (e.g. "sv", "en")',
      },
      description: {
        type: 'string',
        description: 'Optional description of the gazetteer',
      },
      kind: {
        type: 'string',
        enum: ['point', 'boundary'],
        description: 'Gazetteer kind: point (default) for coordinate lookups, boundary for polygon overlays',
      },
      source: {
        type: 'object',
        description: 'Source metadata',
        required: ['name', 'url', 'license', 'fetched'],
        properties: {
          name: { type: 'string' },
          url: { type: 'string' },
          license: { type: 'string' },
          created: { type: 'string', description: 'ISO date when source dataset was established' },
          fetched: { type: 'string', description: 'ISO date of last fetch' },
          kgmid: { type: 'string', description: 'Google Knowledge Graph ID' },
        },
      },
      root: {
        $ref: '#/$defs/GazetteerNode',
      },
    },
    $defs: {
      GazetteerNode: {
        type: 'object',
        required: ['name', 'type', 'lat', 'lon'],
        properties: {
          name: { type: 'string' },
          type: { type: 'string', description: 'Node type (e.g. country, county, parish)' },
          lat: { type: 'number' },
          lon: { type: 'number' },
          aliases: {
            type: 'array',
            items: { type: 'string' },
          },
          children: {
            type: 'array',
            items: { $ref: '#/$defs/GazetteerNode' },
          },
          geometry: {
            type: 'object',
            description: 'GeoJSON Polygon or MultiPolygon geometry for boundary gazetteers',
            required: ['type', 'coordinates'],
            properties: {
              type: { type: 'string', enum: ['Polygon', 'MultiPolygon'] },
              coordinates: { type: 'array' },
            },
          },
        },
      },
    },
  };
}
