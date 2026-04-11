import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import { createMedia, deleteMedia } from '../../src/api/media';
import { createPerson, deletePerson } from '../../src/api/persons';
import {
  createMediaRegion,
  getMediaRegions,
  getRegionsForPerson,
  updateMediaRegion,
  deleteMediaRegion,
} from '../../src/api/media_regions';
import type { Database } from 'node-sqlite3-wasm';

let db: Database;

beforeEach(() => {
  db = createTestDb();
});

describe('media_regions CRUD', () => {
  it('creates a region with all fields', () => {
    const m = createMedia(db, { title: 'photo.jpg' });
    const p = createPerson(db, { given_name: 'Anna' });
    const region = createMediaRegion(db, {
      media_id: m.id,
      person_id: p.id,
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.4,
      label: 'Anna face',
    });

    expect(region.id).toBeTruthy();
    expect(region.media_id).toBe(m.id);
    expect(region.person_id).toBe(p.id);
    expect(region.x).toBe(0.1);
    expect(region.y).toBe(0.2);
    expect(region.width).toBe(0.3);
    expect(region.height).toBe(0.4);
    expect(region.label).toBe('Anna face');
    expect(region.created_at).toBeTruthy();
  });

  it('creates a region without person_id', () => {
    const m = createMedia(db, { title: 'photo.jpg' });
    const region = createMediaRegion(db, {
      media_id: m.id,
      x: 0.5,
      y: 0.5,
      width: 0.2,
      height: 0.2,
    });

    expect(region.person_id).toBeNull();
    expect(region.label).toBeNull();
  });

  it('lists regions for a media item', () => {
    const m = createMedia(db, { title: 'group.jpg' });
    createMediaRegion(db, { media_id: m.id, x: 0.1, y: 0.1, width: 0.2, height: 0.2 });
    createMediaRegion(db, { media_id: m.id, x: 0.5, y: 0.5, width: 0.2, height: 0.2 });

    const regions = getMediaRegions(db, m.id);
    expect(regions).toHaveLength(2);
  });

  it('does not return regions from other media items', () => {
    const m1 = createMedia(db, { title: 'a.jpg' });
    const m2 = createMedia(db, { title: 'b.jpg' });
    createMediaRegion(db, { media_id: m1.id, x: 0.1, y: 0.1, width: 0.2, height: 0.2 });
    createMediaRegion(db, { media_id: m2.id, x: 0.3, y: 0.3, width: 0.2, height: 0.2 });

    expect(getMediaRegions(db, m1.id)).toHaveLength(1);
    expect(getMediaRegions(db, m2.id)).toHaveLength(1);
  });

  it('updates person_id and label', () => {
    const m = createMedia(db, { title: 'photo.jpg' });
    const p = createPerson(db, { given_name: 'Erik' });
    const region = createMediaRegion(db, { media_id: m.id, x: 0.1, y: 0.1, width: 0.2, height: 0.2 });

    const updated = updateMediaRegion(db, region.id, { person_id: p.id, label: 'Erik' });
    expect(updated).not.toBeNull();
    expect(updated!.person_id).toBe(p.id);
    expect(updated!.label).toBe('Erik');
  });

  it('clears person_id with null', () => {
    const m = createMedia(db, { title: 'photo.jpg' });
    const p = createPerson(db, { given_name: 'Anna' });
    const region = createMediaRegion(db, { media_id: m.id, person_id: p.id, x: 0.1, y: 0.1, width: 0.2, height: 0.2 });

    const updated = updateMediaRegion(db, region.id, { person_id: null });
    expect(updated!.person_id).toBeNull();
  });

  it('returns null when updating non-existent region', () => {
    const result = updateMediaRegion(db, 'nonexistent', { label: 'test' });
    expect(result).toBeNull();
  });

  it('deletes a region', () => {
    const m = createMedia(db, { title: 'photo.jpg' });
    const region = createMediaRegion(db, { media_id: m.id, x: 0.1, y: 0.1, width: 0.2, height: 0.2 });

    expect(deleteMediaRegion(db, region.id)).toBe(true);
    expect(getMediaRegions(db, m.id)).toHaveLength(0);
  });

  it('returns false when deleting non-existent region', () => {
    expect(deleteMediaRegion(db, 'nonexistent')).toBe(false);
  });
});

describe('cascade and SET NULL behavior', () => {
  it('cascades delete when media is deleted', () => {
    const m = createMedia(db, { title: 'photo.jpg' });
    createMediaRegion(db, { media_id: m.id, x: 0.1, y: 0.1, width: 0.2, height: 0.2 });
    createMediaRegion(db, { media_id: m.id, x: 0.5, y: 0.5, width: 0.2, height: 0.2 });

    deleteMedia(db, m.id);

    expect(getMediaRegions(db, m.id)).toHaveLength(0);
  });

  it('sets person_id to NULL when person is deleted', () => {
    const m = createMedia(db, { title: 'photo.jpg' });
    const p = createPerson(db, { given_name: 'Anna' });
    const region = createMediaRegion(db, { media_id: m.id, person_id: p.id, x: 0.1, y: 0.1, width: 0.2, height: 0.2 });

    deletePerson(db, p.id);

    const regions = getMediaRegions(db, m.id);
    expect(regions).toHaveLength(1);
    expect(regions[0].person_id).toBeNull();
  });
});

describe('getRegionsForPerson', () => {
  it('returns regions with media title', () => {
    const m = createMedia(db, { title: 'Family photo 1950' });
    const p = createPerson(db, { given_name: 'Sven' });
    createMediaRegion(db, { media_id: m.id, person_id: p.id, x: 0.1, y: 0.1, width: 0.3, height: 0.4 });

    const regions = getRegionsForPerson(db, p.id);
    expect(regions).toHaveLength(1);
    expect(regions[0].media_title).toBe('Family photo 1950');
    expect(regions[0].person_id).toBe(p.id);
  });

  it('returns empty array for person with no regions', () => {
    const p = createPerson(db, { given_name: 'Nobody' });
    expect(getRegionsForPerson(db, p.id)).toHaveLength(0);
  });

  it('returns regions from multiple media items', () => {
    const m1 = createMedia(db, { title: 'Photo A' });
    const m2 = createMedia(db, { title: 'Photo B' });
    const p = createPerson(db, { given_name: 'Eva' });
    createMediaRegion(db, { media_id: m1.id, person_id: p.id, x: 0.1, y: 0.1, width: 0.2, height: 0.2 });
    createMediaRegion(db, { media_id: m2.id, person_id: p.id, x: 0.3, y: 0.3, width: 0.2, height: 0.2 });

    const regions = getRegionsForPerson(db, p.id);
    expect(regions).toHaveLength(2);
    expect(regions.map(r => r.media_title).sort()).toEqual(['Photo A', 'Photo B']);
  });
});
