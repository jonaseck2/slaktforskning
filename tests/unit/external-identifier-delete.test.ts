// Deleting an entity takes its external_identifiers with it — and undoing
// that delete brings them back.
//
// Measured 2026-08-29: of the 8 paths that delete an entity this table spans,
// the 3 merge paths repoint (v0.275.0) and 5 delete paths leaked, against the
// table's own comment saying the owning entity's delete path is responsible.
// An orphan row is not inert: it is what made an approved consolidation
// cluster reappear on every re-run.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { queryAll, runSql } from '../../src/api/db';
import { bulkAddExternalIdentifiers } from '../../src/api/external_identifiers';
import { deleteMedia } from '../../src/api/media';
import { deletePlace } from '../../src/api/places';
import { deleteRepository } from '../../src/api/repositories';
import { deleteSource, deleteCitation, createCitation } from '../../src/api/sources';
import { deleteSourceUndo, deleteCitationUndo } from '../../src/api/undo_wrappers';
import { undoManager } from '../../src/api/undo';
import { createTestDb } from './helpers';

let db: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => { db = await createTestDb(); undoManager.clear(); });

async function rows(): Promise<Array<{ entity_type: string; entity_id: string; system: string; value: string }>> {
  return queryAll(db, 'SELECT entity_type, entity_id, system, value FROM external_identifiers ORDER BY value');
}

async function seedIdent(entity_type: string, entity_id: string, value: string): Promise<void> {
  await bulkAddExternalIdentifiers(db, [{ entity_type, entity_id, system: 'gramps.handle', value }]);
}

describe('deleting an entity takes its identifiers with it', () => {
  it('source — and the identifiers of the citations that cascade with it', async () => {
    const sid = crypto.randomUUID();
    await runSql(db, 'INSERT INTO sources (id, title) VALUES (?,?)', [sid, 'Källa']);
    const cit = await createCitation(db, { source_id: sid, page: '52' });
    await seedIdent('source', sid, 'src-1');
    await seedIdent('citation', cit.id, 'cit-1');
    // A control: an identifier on an unrelated source must survive.
    const other = crypto.randomUUID();
    await runSql(db, 'INSERT INTO sources (id, title) VALUES (?,?)', [other, 'Annan']);
    await seedIdent('source', other, 'keep-me');

    expect(await rows()).toHaveLength(3);
    await deleteSource(db, sid);
    expect((await rows()).map(r => r.value)).toEqual(['keep-me']);
  });

  it('citation', async () => {
    const sid = crypto.randomUUID();
    await runSql(db, 'INSERT INTO sources (id, title) VALUES (?,?)', [sid, 'Källa']);
    const cit = await createCitation(db, { source_id: sid, page: '52' });
    await seedIdent('citation', cit.id, 'cit-1');
    await deleteCitation(db, cit.id);
    expect(await rows()).toEqual([]);
  });

  it('place', async () => {
    const id = crypto.randomUUID();
    await runSql(db, 'INSERT INTO places (id, name) VALUES (?,?)', [id, 'Valbo']);
    await seedIdent('place', id, 'plac-1');
    await deletePlace(db, id);
    expect(await rows()).toEqual([]);
  });

  it('media', async () => {
    const id = crypto.randomUUID();
    await runSql(db, 'INSERT INTO media (id, title, file_ref) VALUES (?,?,?)', [id, 'Foto', 'x-media/p.jpg']);
    await seedIdent('media', id, 'med-1');
    await deleteMedia(db, id);
    expect(await rows()).toEqual([]);
  });

  it('repository', async () => {
    const id = crypto.randomUUID();
    await runSql(db, 'INSERT INTO repositories (id, name) VALUES (?,?)', [id, 'Riksarkivet']);
    await seedIdent('repository', id, 'repo-1');
    await deleteRepository(db, id);
    expect(await rows()).toEqual([]);
  });
});

describe('undoing the delete brings the identifiers back', () => {
  it('source — its own and its citations’, with ids intact', async () => {
    const sid = crypto.randomUUID();
    await runSql(db, 'INSERT INTO sources (id, title) VALUES (?,?)', [sid, 'Källa']);
    const cit = await createCitation(db, { source_id: sid, page: '52' });
    await seedIdent('source', sid, 'src-1');
    await seedIdent('citation', cit.id, 'cit-1');
    const before = await queryAll<{ id: string }>(db, 'SELECT id FROM external_identifiers ORDER BY id');

    await deleteSourceUndo(db, sid);
    expect(await rows()).toEqual([]);

    await undoManager.undo();
    expect((await rows()).map(r => r.value)).toEqual(['cit-1', 'src-1']);
    // Ids are preserved, not re-minted — anything holding one still resolves.
    expect(await queryAll<{ id: string }>(db, 'SELECT id FROM external_identifiers ORDER BY id')).toEqual(before);
  });

  it('citation', async () => {
    const sid = crypto.randomUUID();
    await runSql(db, 'INSERT INTO sources (id, title) VALUES (?,?)', [sid, 'Källa']);
    const cit = await createCitation(db, { source_id: sid, page: '52' });
    await seedIdent('citation', cit.id, 'cit-1');

    await deleteCitationUndo(db, cit.id);
    expect(await rows()).toEqual([]);
    await undoManager.undo();
    expect((await rows()).map(r => r.value)).toEqual(['cit-1']);
  });
});

// ── The census guard ────────────────────────────────────────────────────────
// The five fixes above are a fact about today's code. A sixth delete path
// added later would leak again with nothing to say so. This reads the source
// rather than the runtime: a path no test exercises is invisible to a runtime
// check, which is the whole failure mode `.claude/rules/evidence.md` names.

describe('every path that deletes one of these entities clears its identifiers', () => {
  it('census of src/api — no path deletes an owning row without handling the table', () => {
    const files = [
      'src/api/sources.ts', 'src/api/places.ts', 'src/api/media.ts',
      'src/api/repositories.ts', 'src/api/duplicates/sources.ts',
      'src/api/duplicates/places.ts', 'src/api/duplicates/media.ts',
    ];
    const owning = ['sources', 'places', 'media', 'repositories', 'citations'];

    const found: Array<{ fn: string; deletes: string; handles: boolean }> = [];
    for (const rel of files) {
      const src = readFileSync(join(__dirname, '../..', rel), 'utf-8');
      const parts = src.split(/\nexport (?:async )?function /).slice(1);
      for (const part of parts) {
        const fn = part.slice(0, part.indexOf('(')).trim();
        const deleted = [...part.matchAll(/DELETE FROM (\w+)/g)].map(m => m[1]).filter(t => owning.includes(t));
        if (deleted.length === 0) continue;
        found.push({
          fn,
          deletes: [...new Set(deleted)].sort().join(','),
          handles: /[Ee]xternalIdentifiers|external_identifiers/.test(part),
        });
      }
    }

    // Zero-guards: a census that matches nothing must fail, not pass.
    expect(files.length, 'file list emptied').toBeGreaterThan(0);
    expect(found.length, 'regex matched no delete paths — the census is broken, not the code')
      .toBeGreaterThanOrEqual(8);

    const leaking = found.filter(f => !f.handles).map(f => `${f.fn} (deletes ${f.deletes})`);
    expect(leaking, 'these paths delete an entity but leave its external_identifiers behind').toEqual([]);
  });
});
