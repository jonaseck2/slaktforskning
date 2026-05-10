import { describe, it, expect, beforeEach } from 'vitest';
import type { Database } from 'node-sqlite3-wasm';
import { createMedia, deleteMedia } from '../../src/api/media';
import { createPerson, deletePerson } from '../../src/api/persons';
import {
  createMediaRegion,
  getMediaRegions,
  getRegionsForPerson,
  updateMediaRegion,
  deleteMediaRegion,
} from '../../src/api/media_regions';
import { createTestDb } from './helpers';

let db: Database;

beforeEach(async () => {
  db = await createTestDb();
});

describe('media_regions CRUD', async () => {
  it('creates a region with all fields', async () => {
    const m = await createMedia(db, { title: 'photo.jpg' });
    const p = await createPerson(db, { given_name: 'Anna' });
    const region = await createMediaRegion(db, {
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

  it('creates a region without person_id', async () => {
    const m = await createMedia(db, { title: 'photo.jpg' });
    const region = await createMediaRegion(db, {
      media_id: m.id,
      x: 0.5,
      y: 0.5,
      width: 0.2,
      height: 0.2,
    });

    expect(region.person_id).toBeNull();
    expect(region.label).toBeNull();
  });

  it('lists regions for a media item', async () => {
    const m = await createMedia(db, { title: 'group.jpg' });
    await createMediaRegion(db, { media_id: m.id, x: 0.1, y: 0.1, width: 0.2, height: 0.2 });
    await createMediaRegion(db, { media_id: m.id, x: 0.5, y: 0.5, width: 0.2, height: 0.2 });

    const regions = await getMediaRegions(db, m.id);
    expect(regions).toHaveLength(2);
  });

  it('does not return regions from other media items', async () => {
    const m1 = await createMedia(db, { title: 'a.jpg' });
    const m2 = await createMedia(db, { title: 'b.jpg' });
    await createMediaRegion(db, { media_id: m1.id, x: 0.1, y: 0.1, width: 0.2, height: 0.2 });
    await createMediaRegion(db, { media_id: m2.id, x: 0.3, y: 0.3, width: 0.2, height: 0.2 });

    expect(await getMediaRegions(db, m1.id)).toHaveLength(1);
    expect(await getMediaRegions(db, m2.id)).toHaveLength(1);
  });

  it('updates person_id and label', async () => {
    const m = await createMedia(db, { title: 'photo.jpg' });
    const p = await createPerson(db, { given_name: 'Erik' });
    const region = await createMediaRegion(db, { media_id: m.id, x: 0.1, y: 0.1, width: 0.2, height: 0.2 });

    const updated = await updateMediaRegion(db, region.id, { person_id: p.id, label: 'Erik' });
    expect(updated).not.toBeNull();
    expect(updated!.person_id).toBe(p.id);
    expect(updated!.label).toBe('Erik');
  });

  it('clears person_id with null', async () => {
    const m = await createMedia(db, { title: 'photo.jpg' });
    const p = await createPerson(db, { given_name: 'Anna' });
    const region = await createMediaRegion(db, { media_id: m.id, person_id: p.id, x: 0.1, y: 0.1, width: 0.2, height: 0.2 });

    const updated = await updateMediaRegion(db, region.id, { person_id: null });
    expect(updated!.person_id).toBeNull();
  });

  it('updates only person_id without changing label', async () => {
    const m = await createMedia(db, { title: 'photo.jpg' });
    const p = await createPerson(db, { given_name: 'Sven' });
    const region = await createMediaRegion(db, { media_id: m.id, x: 0.1, y: 0.1, width: 0.2, height: 0.2, label: 'Original' });

    const updated = await updateMediaRegion(db, region.id, { person_id: p.id });
    expect(updated!.person_id).toBe(p.id);
    expect(updated!.label).toBe('Original'); // unchanged
  });

  it('updates only label without changing person_id', async () => {
    const m = await createMedia(db, { title: 'photo.jpg' });
    const p = await createPerson(db, { given_name: 'Sven' });
    const region = await createMediaRegion(db, { media_id: m.id, person_id: p.id, x: 0.1, y: 0.1, width: 0.2, height: 0.2 });

    const updated = await updateMediaRegion(db, region.id, { label: 'New label' });
    expect(updated!.label).toBe('New label');
    expect(updated!.person_id).toBe(p.id); // unchanged
  });

  it('returns existing region unchanged when no fields passed', async () => {
    const m = await createMedia(db, { title: 'photo.jpg' });
    const p = await createPerson(db, { given_name: 'Erik' });
    const region = await createMediaRegion(db, { media_id: m.id, person_id: p.id, x: 0.1, y: 0.1, width: 0.2, height: 0.2, label: 'Face' });

    const updated = await updateMediaRegion(db, region.id, {});
    expect(updated!.id).toBe(region.id);
    expect(updated!.person_id).toBe(p.id);
    expect(updated!.label).toBe('Face');
  });

  it('returns null when updating non-existent region', async () => {
    const result = await updateMediaRegion(db, 'nonexistent', { label: 'test' });
    expect(result).toBeNull();
  });

  it('deletes a region', async () => {
    const m = await createMedia(db, { title: 'photo.jpg' });
    const region = await createMediaRegion(db, { media_id: m.id, x: 0.1, y: 0.1, width: 0.2, height: 0.2 });

    expect(await deleteMediaRegion(db, region.id)).toBe(true);
    expect(await getMediaRegions(db, m.id)).toHaveLength(0);
  });

  it('returns false when deleting non-existent region', async () => {
    expect(await deleteMediaRegion(db, 'nonexistent')).toBe(false);
  });
});

describe('cascade and SET NULL behavior', async () => {
  it('cascades delete when media is deleted', async () => {
    const m = await createMedia(db, { title: 'photo.jpg' });
    await createMediaRegion(db, { media_id: m.id, x: 0.1, y: 0.1, width: 0.2, height: 0.2 });
    await createMediaRegion(db, { media_id: m.id, x: 0.5, y: 0.5, width: 0.2, height: 0.2 });

    await deleteMedia(db, m.id);

    expect(await getMediaRegions(db, m.id)).toHaveLength(0);
  });

  it('sets person_id to NULL when person is deleted', async () => {
    const m = await createMedia(db, { title: 'photo.jpg' });
    const p = await createPerson(db, { given_name: 'Anna' });
    await createMediaRegion(db, { media_id: m.id, person_id: p.id, x: 0.1, y: 0.1, width: 0.2, height: 0.2 });

    await deletePerson(db, p.id);

    const regions = await getMediaRegions(db, m.id);
    expect(regions).toHaveLength(1);
    expect(regions[0].person_id).toBeNull();
  });
});

describe('getRegionsForPerson', async () => {
  it('returns regions with media title', async () => {
    const m = await createMedia(db, { title: 'Family photo 1950' });
    const p = await createPerson(db, { given_name: 'Sven' });
    await createMediaRegion(db, { media_id: m.id, person_id: p.id, x: 0.1, y: 0.1, width: 0.3, height: 0.4 });

    const regions = await getRegionsForPerson(db, p.id);
    expect(regions).toHaveLength(1);
    expect(regions[0].media_title).toBe('Family photo 1950');
    expect(regions[0].person_id).toBe(p.id);
  });

  it('returns empty array for person with no regions', async () => {
    const p = await createPerson(db, { given_name: 'Nobody' });
    expect(await getRegionsForPerson(db, p.id)).toHaveLength(0);
  });

  it('returns regions from multiple media items', async () => {
    const m1 = await createMedia(db, { title: 'Photo A' });
    const m2 = await createMedia(db, { title: 'Photo B' });
    const p = await createPerson(db, { given_name: 'Eva' });
    await createMediaRegion(db, { media_id: m1.id, person_id: p.id, x: 0.1, y: 0.1, width: 0.2, height: 0.2 });
    await createMediaRegion(db, { media_id: m2.id, person_id: p.id, x: 0.3, y: 0.3, width: 0.2, height: 0.2 });

    const regions = await getRegionsForPerson(db, p.id);
    expect(regions).toHaveLength(2);
    expect(regions.map(r => r.media_title).sort()).toEqual(['Photo A', 'Photo B']);
  });
});
