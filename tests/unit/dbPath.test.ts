import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { getDefaultDbPath } from '../../src/shared/dbPath';

const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8')) as {
  name: string;
  productName?: string;
};

describe('getDefaultDbPath', () => {
  it('uses productName from package.json, not lowercase name', () => {
    const dbPath = getDefaultDbPath();
    expect(pkg.productName).toBeDefined();
    expect(dbPath).toContain(pkg.productName!);
  });

  it('does not use the lowercase package name as the directory', () => {
    const dbPath = getDefaultDbPath();
    // The directory segment must use productName; lowercase name would be wrong
    // e.g. "slaktforskning" vs "Släktforskning"
    const dir = dbPath.replace(/[/\\][^/\\]+$/, ''); // strip filename
    const dirName = dir.split(/[/\\]/).pop();
    expect(dirName).toBe(pkg.productName);
    expect(dirName).not.toBe(pkg.name);
  });

  it('ends with slaktforskning.db', () => {
    expect(getDefaultDbPath()).toMatch(/slaktforskning\.db$/);
  });
});
