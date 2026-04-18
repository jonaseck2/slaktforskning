import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from 'node-sqlite3-wasm';
import { getDbSetting, setDbSetting, deleteDbSetting } from '../../src/api/db_settings';
import { createTestDb } from './helpers';

describe('db_settings', () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it('getDbSetting returns null for missing key', () => {
    expect(getDbSetting(db, 'nonexistent')).toBeNull();
  });

  it('setDbSetting + getDbSetting round-trips a value', () => {
    setDbSetting(db, 'theme', 'dark');
    expect(getDbSetting(db, 'theme')).toBe('dark');
  });

  it('setDbSetting overwrites existing value', () => {
    setDbSetting(db, 'theme', 'dark');
    setDbSetting(db, 'theme', 'light');
    expect(getDbSetting(db, 'theme')).toBe('light');
  });

  it('deleteDbSetting removes the key', () => {
    setDbSetting(db, 'lang', 'sv');
    deleteDbSetting(db, 'lang');
    expect(getDbSetting(db, 'lang')).toBeNull();
  });

  it('deleteDbSetting is safe for missing key', () => {
    expect(() => deleteDbSetting(db, 'nonexistent')).not.toThrow();
  });

  it('handles JSON values', () => {
    const config = { enabledGazetteers: ['sv-parishes', 'dk-sogne'] };
    setDbSetting(db, 'gazetteer_config', JSON.stringify(config));
    const raw = getDbSetting(db, 'gazetteer_config');
    expect(JSON.parse(raw!)).toEqual(config);
  });

  it('stores multiple independent keys', () => {
    setDbSetting(db, 'a', '1');
    setDbSetting(db, 'b', '2');
    expect(getDbSetting(db, 'a')).toBe('1');
    expect(getDbSetting(db, 'b')).toBe('2');
  });
});
