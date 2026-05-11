import { describe, it, expect, beforeEach } from 'vitest';
import { createSource } from '../../src/api/sources';
import {
  createRepository,
  getRepository,
  listRepositories,
  updateRepository,
  deleteRepository,
  linkSourceRepository,
  unlinkSourceRepository,
  getRepositoriesForSource,
} from '../../src/api/repositories';
import { createTestDb } from './helpers';

let db: any;

beforeEach(async () => {
  db = await createTestDb();
});

describe('repositories', async () => {
  it('creates and retrieves a repository', async () => {
    const repo = await createRepository(db, { name: 'Riksarkivet' });
    expect(repo.id).toBeDefined();
    expect(repo.name).toBe('Riksarkivet');
    expect(repo.city).toBeNull();

    const fetched = await getRepository(db, repo.id);
    expect(fetched?.name).toBe('Riksarkivet');
  });

  it('creates a repository with full contact details', async () => {
    const repo = await createRepository(db, {
      name: 'Landsarkivet i Härnösand',
      city: 'Härnösand',
      country: 'Sverige',
      web: 'https://riksarkivet.se',
      call_number: 'LAHÄ',
    });
    expect(repo.city).toBe('Härnösand');
    expect(repo.country).toBe('Sverige');
    expect(repo.call_number).toBe('LAHÄ');
  });

  it('lists repositories ordered by name', async () => {
    await createRepository(db, { name: 'Ångermanlands arkiv' });
    await createRepository(db, { name: 'Riksarkivet' });
    const repos = await listRepositories(db);
    expect(repos[0].name).toBe('Riksarkivet');
    expect(repos[1].name).toBe('Ångermanlands arkiv');
  });

  it('updates a repository', async () => {
    const repo = await createRepository(db, { name: 'Old Name' });
    const updated = await updateRepository(db, repo.id, { name: 'New Name', city: 'Stockholm' });
    expect(updated?.name).toBe('New Name');
    expect(updated?.city).toBe('Stockholm');
  });

  it('update with no fields returns the repository unchanged', async () => {
    const repo = await createRepository(db, { name: 'Unchanged' });
    const result = await updateRepository(db, repo.id, {});
    expect(result?.name).toBe('Unchanged');
  });

  it('deletes a repository', async () => {
    const repo = await createRepository(db, { name: 'To Delete' });
    expect(await deleteRepository(db, repo.id)).toBe(true);
    expect(await getRepository(db, repo.id)).toBeNull();
  });

  it('delete returns false for nonexistent id', async () => {
    expect(await deleteRepository(db, 'nonexistent')).toBe(false);
  });

  it('get returns null for nonexistent id', async () => {
    expect(await getRepository(db, 'nonexistent')).toBeNull();
  });
});

describe('source-repository links', async () => {
  it('links and retrieves repositories for a source', async () => {
    const source = await createSource(db, { title: 'Husförhörslängd 1800', source_type: 'church_record' });
    const repo = await createRepository(db, { name: 'Härnösands stiftsarkiv' });

    await linkSourceRepository(db, source.id, repo.id);
    const repos = await getRepositoriesForSource(db, source.id);
    expect(repos).toHaveLength(1);
    expect(repos[0].name).toBe('Härnösands stiftsarkiv');
  });

  it('linkSourceRepository is idempotent (INSERT OR IGNORE)', async () => {
    const source = await createSource(db, { title: 'Test Source' });
    const repo = await createRepository(db, { name: 'Test Archive' });

    await linkSourceRepository(db, source.id, repo.id);
    await linkSourceRepository(db, source.id, repo.id); // duplicate — should not throw
    expect(await getRepositoriesForSource(db, source.id)).toHaveLength(1);
  });

  it('unlinks a source-repository pair', async () => {
    const source = await createSource(db, { title: 'Test Source' });
    const repo = await createRepository(db, { name: 'Test Archive' });
    await linkSourceRepository(db, source.id, repo.id);

    expect(await unlinkSourceRepository(db, source.id, repo.id)).toBe(true);
    expect(await getRepositoriesForSource(db, source.id)).toHaveLength(0);
  });

  it('unlinkSourceRepository returns false for nonexistent link', async () => {
    const source = await createSource(db, { title: 'Test Source' });
    expect(await unlinkSourceRepository(db, source.id, 'nonexistent')).toBe(false);
  });

  it('returns empty array when source has no repositories', async () => {
    const source = await createSource(db, { title: 'Unlinked Source' });
    expect(await getRepositoriesForSource(db, source.id)).toHaveLength(0);
  });

  it('cascades delete: removing repository removes its source links', async () => {
    const source = await createSource(db, { title: 'Test Source' });
    const repo = await createRepository(db, { name: 'To Delete Archive' });
    await linkSourceRepository(db, source.id, repo.id);

    await deleteRepository(db, repo.id);
    expect(await getRepositoriesForSource(db, source.id)).toHaveLength(0);
  });
});
