// T09: GEDCOM HEAD originating-app metadata preservation.
//
// User goal: when a user imports a GEDCOM file produced by Ancestry / Holger
// / Genney / FamilySearch / etc., the file's HEAD block records where it
// came from (SOUR / NAME / CORP / VERS / LANG / COPR). Pre-T09, that origin
// was silently dropped on import — every re-export claimed the file was
// produced by Släktforskning. Now: the origin is captured in db_settings
// under `header_metadata` as JSON, and re-emitted on export as a custom
// `1 _ORIG_SOUR <json>` extension on the HEAD block.

import { describe, it, expect, beforeEach } from 'vitest';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';
import { exportGedcom } from '../../src/gedcom/exporter';
import { getDbSetting } from '../../src/api/db_settings';
import { createTestDb } from './helpers';

let db: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => { db = await createTestDb(); });

const SAMPLE_GEDCOM = `0 HEAD
1 SOUR FOO
2 NAME Foo App
2 CORP FooCorp
2 VERS 1.0
1 GEDC
2 VERS 7.0
1 LANG sv
1 COPR © 2020 FooCorp
0 @I1@ INDI
1 NAME Alice /Test/
1 SEX F
0 TRLR
`;

describe('GEDCOM HEAD metadata preservation (T09)', () => {
  it('import: captures SOUR/NAME/CORP/VERS/LANG/COPR into db_settings.header_metadata', async () => {
    await importGedcom(db, parseGedcom(SAMPLE_GEDCOM));

    const raw = await getDbSetting(db, 'header_metadata');
    expect(raw).toBeTruthy();
    const meta = JSON.parse(raw!);
    expect(meta).toEqual({
      source_app: 'FOO',
      source_name: 'Foo App',
      source_corp: 'FooCorp',
      source_version: '1.0',
      language: 'sv',
      copyright: '© 2020 FooCorp',
    });
  });

  it('export + re-import round-trips header_metadata via _ORIG_SOUR extension', async () => {
    await importGedcom(db, parseGedcom(SAMPLE_GEDCOM));
    const before = await getDbSetting(db, 'header_metadata');
    expect(before).toBeTruthy();

    const { ged } = await exportGedcom(db, '7.0');
    // The custom `1 _ORIG_SOUR <json>` line must appear in the HEAD block.
    expect(ged).toMatch(/1 _ORIG_SOUR \{.*"source_app":"FOO".*\}/);

    const db2 = await createTestDb();
    await importGedcom(db2, parseGedcom(ged));
    const after = await getDbSetting(db2, 'header_metadata');
    expect(after).toBeTruthy();
    expect(JSON.parse(after!)).toEqual(JSON.parse(before!));
  });
});
