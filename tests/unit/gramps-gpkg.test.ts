import { describe, it, expect } from 'vitest';
import { createTar } from 'nanotar';
import { gzipSync } from 'fflate';
import { extractGrampsArchive } from '../../src/import/gramps/archive';

// 67-byte 1x1 transparent PNG
const PNG = new Uint8Array([
  0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00,0x00,0x00,0x0d,0x49,0x48,0x44,0x52,
  0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01,0x08,0x06,0x00,0x00,0x00,0x1f,0x15,0xc4,
  0x89,0x00,0x00,0x00,0x0d,0x49,0x44,0x41,0x54,0x78,0x9c,0x62,0x00,0x01,0x00,0x00,
  0x05,0x00,0x01,0x0d,0x0a,0x2d,0xb4,0x00,0x00,0x00,0x00,0x49,0x45,0x4e,0x44,0xae,
  0x42,0x60,0x82,
]);

const GPKG_XML = `<?xml version="1.0" encoding="UTF-8"?>
<database xmlns="http://gramps-project.org/xml/1.7.1/">
  <header><created date="2026-06-06" version="5.2.0"/></header>
  <events>
    <event handle="_e1" id="E1"><type>Birth</type><dateval val="1850-01-15"/></event>
    <event handle="_e2" id="E2"><type>Birth</type><dateval val="1845-06-20"/></event>
    <event handle="_e3" id="E3"><type>Birth</type><dateval val="1875-03-10"/></event>
  </events>
  <people>
    <person handle="_p1" id="I1"><gender>F</gender><name type="Birth Name"><first>Anna</first><surname>Andersson</surname></name><eventref hlink="_e1" role="Primary"/><objref hlink="_m1"/></person>
    <person handle="_p2" id="I2"><gender>M</gender><name type="Birth Name"><first>Erik</first><surname>Andersson</surname></name><eventref hlink="_e2" role="Primary"/></person>
    <person handle="_p3" id="I3"><gender>F</gender><name type="Birth Name"><first>Lisa</first><surname>Andersson</surname></name><eventref hlink="_e3" role="Primary"/><childof hlink="_f1"/></person>
  </people>
  <families><family handle="_f1" id="F1"><rel type="Married"/><father hlink="_p2"/><mother hlink="_p1"/><childref hlink="_p3"/></family></families>
  <objects><object handle="_m1" id="O1"><file src="blank.png" mime="image/png"/></object></objects>
</database>`;

export function buildGpkgBytes(xml = GPKG_XML): Uint8Array {
  const tar = createTar([
    { name: 'data.gramps', data: new TextEncoder().encode(xml) },
    { name: 'media/blank.png', data: PNG },
  ]);
  return gzipSync(tar);
}

describe('extractGrampsArchive', () => {
  it('extracts XML + media from a tar.gz .gpkg', () => {
    const { xml, media } = extractGrampsArchive(buildGpkgBytes());
    expect(xml).toContain('<person handle="_p1"');
    expect(media).toHaveLength(1);
    expect(media[0].name).toBe('blank.png');
    expect(media[0].bytes).toEqual(PNG);
  });

  it('returns empty media for plain (un-gzipped) .gramps XML', () => {
    const xmlBytes = new TextEncoder().encode('<?xml version="1.0"?><database><people/></database>');
    const { xml, media } = extractGrampsArchive(xmlBytes);
    expect(xml).toContain('<database>');
    expect(media).toEqual([]);
  });

  it('returns empty media for gzipped .gramps XML', () => {
    const xmlBytes = new TextEncoder().encode('<?xml version="1.0"?><database><people/></database>');
    const { media } = extractGrampsArchive(gzipSync(xmlBytes));
    expect(media).toEqual([]);
  });
});

export { PNG, GPKG_XML };

import { beforeEach } from 'vitest';
import { writeFileSync, mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importFromGramps, importFromGrampsBytes } from '../../src/import/gramps';
import { queryAll } from '../../src/api/db';
import { createTestDb } from './helpers';

let db: ReturnType<typeof createTestDb>;
beforeEach(async () => { db = await createTestDb(); });

describe('importFromGrampsBytes — .gpkg with in-memory writer', () => {
  it('imports 3 persons + 1 media row, writes the media file, rewrites file_ref', async () => {
    const writes: Record<string, Uint8Array> = {};
    const { summary } = await importFromGrampsBytes(db, buildGpkgBytes(), {
      mediaWriter: async (filename, bytes) => { writes[filename] = bytes; },
      mediaFolderName: 'fam-media',
    });
    expect(summary.persons).toBe(3);
    expect(summary.media).toBe(1);
    expect(writes['blank.png']).toEqual(PNG);
    const rows = await queryAll<{ file_ref: string }>(db, 'SELECT file_ref FROM media');
    expect(rows.map((r) => r.file_ref)).toEqual(['fam-media/blank.png']);
  });
});

describe('importFromGramps — .gpkg path variant with fs writer', () => {
  it('writes the media file to disk and rewrites file_ref', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gpkg-test-'));
    const gpkgPath = join(dir, 'sample.gpkg');
    writeFileSync(gpkgPath, buildGpkgBytes());
    const mediaDir = join(dir, 'sample-media');
    const { summary } = await importFromGramps(db, gpkgPath, {
      mediaWriter: async (filename, bytes) => {
        const { mkdirSync, writeFileSync: wf } = await import('node:fs');
        mkdirSync(mediaDir, { recursive: true });
        wf(join(mediaDir, filename), bytes);
      },
      mediaFolderName: 'sample-media',
    });
    expect(summary.persons).toBe(3);
    expect(existsSync(join(mediaDir, 'blank.png'))).toBe(true);
    expect(readFileSync(join(mediaDir, 'blank.png'))).toEqual(Buffer.from(PNG));
    const rows = await queryAll<{ file_ref: string }>(db, 'SELECT file_ref FROM media');
    expect(rows.map((r) => r.file_ref)).toEqual(['sample-media/blank.png']);
  });
});

describe('importFromGramps — plain .gramps regression (no writer)', () => {
  it('still imports persons from gzipped XML with no media options', async () => {
    const xml = GPKG_XML.replace(/<objects>[\s\S]*<\/objects>/, '').replace(/<objref[^/]*\/>/g, '');
    const { summary } = await importFromGrampsBytes(db, gzipSync(new TextEncoder().encode(xml)));
    expect(summary.persons).toBe(3);
    expect(summary.media).toBe(0);
  });
});
