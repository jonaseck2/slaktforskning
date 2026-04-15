import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers';
import { createMedia, getMedia, updateMedia } from '../../src/api/media';

describe('updateMedia', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => { db = createTestDb(); });

  it('updates title', () => {
    const m = createMedia(db, { title: 'Old title' });
    const updated = updateMedia(db, m.id, { title: 'New title' });
    expect(updated?.title).toBe('New title');
    expect(getMedia(db, m.id)?.title).toBe('New title');
  });

  it('updates notes', () => {
    const m = createMedia(db, { title: 'Test', notes: '' });
    const updated = updateMedia(db, m.id, { notes: 'Some notes' });
    expect(updated?.notes).toBe('Some notes');
  });

  it('updates format', () => {
    const m = createMedia(db, { title: 'Test', format: 'jpg' });
    const updated = updateMedia(db, m.id, { format: 'png' });
    expect(updated?.format).toBe('png');
  });

  it('updates is_printable', () => {
    const m = createMedia(db, { title: 'Test' });
    const updated = updateMedia(db, m.id, { is_printable: true });
    expect(updated?.is_printable).toBeTruthy();
  });

  it('partial update preserves other fields', () => {
    const m = createMedia(db, { title: 'Keep', notes: 'Keep notes', format: 'jpg' });
    const updated = updateMedia(db, m.id, { title: 'Changed' });
    expect(updated?.title).toBe('Changed');
    expect(updated?.notes).toBe('Keep notes');
    expect(updated?.format).toBe('jpg');
  });

  it('returns null for non-existent id', () => {
    expect(updateMedia(db, 'non-existent', { title: 'x' })).toBeNull();
  });
});
