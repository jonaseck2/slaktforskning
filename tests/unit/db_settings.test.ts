import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from 'node-sqlite3-wasm';
import { getDbSetting, setDbSetting, deleteDbSetting } from '../../src/api/db_settings';
import { createTestDb } from './helpers';

describe('db_settings', async () => {
  let db: Database;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it('getDbSetting returns null for missing key', async () => {
    expect(await getDbSetting(db, 'nonexistent')).toBeNull();
  });

  it('setDbSetting + getDbSetting round-trips a value', async () => {
    await setDbSetting(db, 'theme', 'dark');
    expect(await getDbSetting(db, 'theme')).toBe('dark');
  });

  it('setDbSetting overwrites existing value', async () => {
    await setDbSetting(db, 'theme', 'dark');
    await setDbSetting(db, 'theme', 'light');
    expect(await getDbSetting(db, 'theme')).toBe('light');
  });

  it('deleteDbSetting removes the key', async () => {
    await setDbSetting(db, 'lang', 'sv');
    await deleteDbSetting(db, 'lang');
    expect(await getDbSetting(db, 'lang')).toBeNull();
  });

  it('deleteDbSetting is safe for missing key', async () => {
    await expect(await deleteDbSetting(db, 'nonexistent')).resolves.not.toThrow();
  });

  it('handles JSON values', async () => {
    const config = { enabledGazetteers: ['sv-parishes', 'dk-sogne'] };
    await setDbSetting(db, 'gazetteer_config', JSON.stringify(config));
    const raw = await getDbSetting(db, 'gazetteer_config');
    expect(JSON.parse(raw!)).toEqual(config);
  });

  it('stores multiple independent keys', async () => {
    await setDbSetting(db, 'a', '1');
    await setDbSetting(db, 'b', '2');
    expect(await getDbSetting(db, 'a')).toBe('1');
    expect(await getDbSetting(db, 'b')).toBe('2');
  });
});
