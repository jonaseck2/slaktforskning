import { describe, it, expect, beforeEach } from 'vitest';
import { createMedia, getMedia, updateMedia } from '../../src/api/media';
import { createTestDb } from './helpers';

describe('updateMedia', async () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(async () => { db = await createTestDb(); });

  it('updates title', async () => {
    const m = await createMedia(db, { title: 'Old title' });
    const updated = await updateMedia(db, m.id, { title: 'New title' });
    expect(updated?.title).toBe('New title');
    expect((await getMedia(db, m.id))?.title).toBe('New title');
  });

  it('updates notes', async () => {
    const m = await createMedia(db, { title: 'Test', notes: '' });
    const updated = await updateMedia(db, m.id, { notes: 'Some notes' });
    expect(updated?.notes).toBe('Some notes');
  });

  it('updates format', async () => {
    const m = await createMedia(db, { title: 'Test', format: 'jpg' });
    const updated = await updateMedia(db, m.id, { format: 'png' });
    expect(updated?.format).toBe('png');
  });

  it('updates is_printable', async () => {
    const m = await createMedia(db, { title: 'Test' });
    const updated = await updateMedia(db, m.id, { is_printable: true });
    expect(updated?.is_printable).toBeTruthy();
  });

  it('partial update preserves other fields', async () => {
    const m = await createMedia(db, { title: 'Keep', notes: 'Keep notes', format: 'jpg' });
    const updated = await updateMedia(db, m.id, { title: 'Changed' });
    expect(updated?.title).toBe('Changed');
    expect(updated?.notes).toBe('Keep notes');
    expect(updated?.format).toBe('jpg');
  });

  it('returns null for non-existent id', async () => {
    expect(await updateMedia(db, 'non-existent', { title: 'x' })).toBeNull();
  });
});
