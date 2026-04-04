import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
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

let db: any;

beforeEach(() => {
  db = createTestDb();
});

describe('repositories', () => {
  it('creates and retrieves a repository', () => {
    const repo = createRepository(db, { name: 'Riksarkivet' });
    expect(repo.id).toBeDefined();
    expect(repo.name).toBe('Riksarkivet');
    expect(repo.city).toBeNull();

    const fetched = getRepository(db, repo.id);
    expect(fetched?.name).toBe('Riksarkivet');
  });

  it('creates a repository with full contact details', () => {
    const repo = createRepository(db, {
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

  it('lists repositories ordered by name', () => {
    createRepository(db, { name: 'Ångermanlands arkiv' });
    createRepository(db, { name: 'Riksarkivet' });
    const repos = listRepositories(db);
    expect(repos[0].name).toBe('Riksarkivet');
    expect(repos[1].name).toBe('Ångermanlands arkiv');
  });

  it('updates a repository', () => {
    const repo = createRepository(db, { name: 'Old Name' });
    const updated = updateRepository(db, repo.id, { name: 'New Name', city: 'Stockholm' });
    expect(updated?.name).toBe('New Name');
    expect(updated?.city).toBe('Stockholm');
  });

  it('update with no fields returns the repository unchanged', () => {
    const repo = createRepository(db, { name: 'Unchanged' });
    const result = updateRepository(db, repo.id, {});
    expect(result?.name).toBe('Unchanged');
  });

  it('deletes a repository', () => {
    const repo = createRepository(db, { name: 'To Delete' });
    expect(deleteRepository(db, repo.id)).toBe(true);
    expect(getRepository(db, repo.id)).toBeNull();
  });

  it('delete returns false for nonexistent id', () => {
    expect(deleteRepository(db, 'nonexistent')).toBe(false);
  });

  it('get returns null for nonexistent id', () => {
    expect(getRepository(db, 'nonexistent')).toBeNull();
  });
});

describe('source-repository links', () => {
  it('links and retrieves repositories for a source', () => {
    const source = createSource(db, { title: 'Husförhörslängd 1800', source_type: 'church_record' });
    const repo = createRepository(db, { name: 'Härnösands stiftsarkiv' });

    linkSourceRepository(db, source.id, repo.id);
    const repos = getRepositoriesForSource(db, source.id);
    expect(repos).toHaveLength(1);
    expect(repos[0].name).toBe('Härnösands stiftsarkiv');
  });

  it('linkSourceRepository is idempotent (INSERT OR IGNORE)', () => {
    const source = createSource(db, { title: 'Test Source' });
    const repo = createRepository(db, { name: 'Test Archive' });

    linkSourceRepository(db, source.id, repo.id);
    linkSourceRepository(db, source.id, repo.id); // duplicate — should not throw
    expect(getRepositoriesForSource(db, source.id)).toHaveLength(1);
  });

  it('unlinks a source-repository pair', () => {
    const source = createSource(db, { title: 'Test Source' });
    const repo = createRepository(db, { name: 'Test Archive' });
    linkSourceRepository(db, source.id, repo.id);

    expect(unlinkSourceRepository(db, source.id, repo.id)).toBe(true);
    expect(getRepositoriesForSource(db, source.id)).toHaveLength(0);
  });

  it('unlinkSourceRepository returns false for nonexistent link', () => {
    const source = createSource(db, { title: 'Test Source' });
    expect(unlinkSourceRepository(db, source.id, 'nonexistent')).toBe(false);
  });

  it('returns empty array when source has no repositories', () => {
    const source = createSource(db, { title: 'Unlinked Source' });
    expect(getRepositoriesForSource(db, source.id)).toHaveLength(0);
  });

  it('cascades delete: removing repository removes its source links', () => {
    const source = createSource(db, { title: 'Test Source' });
    const repo = createRepository(db, { name: 'To Delete Archive' });
    linkSourceRepository(db, source.id, repo.id);

    deleteRepository(db, repo.id);
    expect(getRepositoriesForSource(db, source.id)).toHaveLength(0);
  });
});
