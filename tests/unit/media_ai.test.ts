import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, beforeEach } from 'vitest';
import type { Database } from 'node-sqlite3-wasm';
import { createPerson } from '../../src/api/persons';
import { createRelationship } from '../../src/api/relationships';
import { createEvent } from '../../src/api/events';
import { addEventParticipant } from '../../src/api/relationships';
import { getUntaggedMedia, getMediaForPersonContext, getMediaFileBase64 } from '../../src/api/media_ai';
import { createMedia, addMediaLink } from '../../src/api/media';
import { createTestDb } from './helpers';

let db: Database;
beforeEach(async () => { db = await createTestDb(); });

describe('getUntaggedMedia', async () => {
  it('returns media with no person links', async () => {
    const m1 = await createMedia(db, { title: 'Photo 1', file_ref: '/tmp/a.jpg' });
    const m2 = await createMedia(db, { title: 'Photo 2', file_ref: '/tmp/b.jpg' });
    const person = await createPerson(db, { given_name: 'Anna', surname: 'Test' });

    // Link m1 to person — m1 should NOT appear in untagged
    await addMediaLink(db, { media_id: m1.id, entity_type: 'person', entity_id: person.id });

    const untagged = await getUntaggedMedia(db);
    expect(untagged).toHaveLength(1);
    expect(untagged[0].id).toBe(m2.id);
    expect(untagged[0].entity_link_count).toBe(0);
  });

  it('orders by entity link count descending', async () => {
    const m1 = await createMedia(db, { title: 'Unlinked' });
    const m2 = await createMedia(db, { title: 'Linked to event' });
    const event = await createEvent(db, { event_type: 'birth' });
    await addMediaLink(db, { media_id: m2.id, entity_type: 'event', entity_id: event.id });

    const untagged = await getUntaggedMedia(db);
    expect(untagged).toHaveLength(2);
    // m2 has 1 link, m1 has 0 — m2 should be first
    expect(untagged[0].id).toBe(m2.id);
    expect(untagged[0].entity_link_count).toBe(1);
    expect(untagged[1].id).toBe(m1.id);
    expect(untagged[1].entity_link_count).toBe(0);
  });

  it('excludes media with person links even if it has other links', async () => {
    const m1 = await createMedia(db, { title: 'Both linked' });
    const person = await createPerson(db, { given_name: 'Bob' });
    const event = await createEvent(db, { event_type: 'death' });
    await addMediaLink(db, { media_id: m1.id, entity_type: 'person', entity_id: person.id });
    await addMediaLink(db, { media_id: m1.id, entity_type: 'event', entity_id: event.id });

    const untagged = await getUntaggedMedia(db);
    expect(untagged).toHaveLength(0);
  });

  it('respects limit parameter', async () => {
    for (let i = 0; i < 5; i++) {
      await createMedia(db, { title: `Photo ${i}` });
    }
    const untagged = await getUntaggedMedia(db, 2);
    expect(untagged).toHaveLength(2);
  });

  it('includes linked_entity_types summary', async () => {
    const m1 = await createMedia(db, { title: 'Multi-linked' });
    const event = await createEvent(db, { event_type: 'birth' });
    const rel = await createRelationship(db, { type: 'couple' });
    await addMediaLink(db, { media_id: m1.id, entity_type: 'event', entity_id: event.id });
    await addMediaLink(db, { media_id: m1.id, entity_type: 'relationship', entity_id: rel.id });

    const untagged = await getUntaggedMedia(db);
    expect(untagged).toHaveLength(1);
    expect(untagged[0].linked_entity_types).toContain('event');
    expect(untagged[0].linked_entity_types).toContain('relationship');
  });
});

describe('getMediaForPersonContext', async () => {
  it('returns media directly linked to person', async () => {
    const person = await createPerson(db, { given_name: 'Anna' });
    const m1 = await createMedia(db, { title: 'Portrait' });
    await addMediaLink(db, { media_id: m1.id, entity_type: 'person', entity_id: person.id });

    const results = await getMediaForPersonContext(db, person.id);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(m1.id);
    expect(results[0].context).toBe('Directly linked to person');
  });

  it('returns media linked to events person participated in', async () => {
    const person = await createPerson(db, { given_name: 'Anna' });
    const event = await createEvent(db, { event_type: 'baptism' });
    await addEventParticipant(db, { event_id: event.id, person_id: person.id, role: 'primary' });
    const m1 = await createMedia(db, { title: 'Baptism record' });
    await addMediaLink(db, { media_id: m1.id, entity_type: 'event', entity_id: event.id });

    const results = await getMediaForPersonContext(db, person.id);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(m1.id);
    expect(results[0].context).toContain('baptism');
  });

  it('returns media linked to relationships person is in', async () => {
    const person1 = await createPerson(db, { given_name: 'Anna' });
    const person2 = await createPerson(db, { given_name: 'Bob' });
    const rel = await createRelationship(db, { type: 'couple', person1_id: person1.id, person2_id: person2.id });
    const m1 = await createMedia(db, { title: 'Wedding photo' });
    await addMediaLink(db, { media_id: m1.id, entity_type: 'relationship', entity_id: rel.id });

    const results = await getMediaForPersonContext(db, person1.id);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(m1.id);
    expect(results[0].context).toContain('couple');
  });

  it('returns media linked to family members', async () => {
    const parent = await createPerson(db, { given_name: 'Anna', surname: 'Smith' });
    const child = await createPerson(db, { given_name: 'Bob', surname: 'Smith' });
    await createRelationship(db, { type: 'parent_child', person1_id: parent.id, person2_id: child.id });

    const m1 = await createMedia(db, { title: 'Child photo' });
    await addMediaLink(db, { media_id: m1.id, entity_type: 'person', entity_id: child.id });

    const results = await getMediaForPersonContext(db, parent.id);
    // Should include: child's photo (via family member)
    const familyMedia = results.find(r => r.context_entity_id === child.id);
    expect(familyMedia).toBeDefined();
    expect(familyMedia!.context).toContain('Bob');
  });

  it('deduplicates media appearing through multiple paths', async () => {
    const person = await createPerson(db, { given_name: 'Anna' });
    const event = await createEvent(db, { event_type: 'birth' });
    await addEventParticipant(db, { event_id: event.id, person_id: person.id, role: 'primary' });

    const m1 = await createMedia(db, { title: 'Shared photo' });
    // Link to both person and event
    await addMediaLink(db, { media_id: m1.id, entity_type: 'person', entity_id: person.id });
    await addMediaLink(db, { media_id: m1.id, entity_type: 'event', entity_id: event.id });

    const results = await getMediaForPersonContext(db, person.id);
    // Should appear only once (deduped)
    const matching = results.filter(r => r.id === m1.id);
    expect(matching).toHaveLength(1);
  });

  it('returns empty array for person with no related media', async () => {
    const person = await createPerson(db, { given_name: 'Loner' });
    const results = await getMediaForPersonContext(db, person.id);
    expect(results).toHaveLength(0);
  });
});

describe('getMediaFileBase64', async () => {
  it('returns null for nonexistent media', async () => {
    const result = await getMediaFileBase64(db, 'nonexistent-id');
    expect(result).toBeNull();
  });

  it('returns null for media with no file_ref', async () => {
    const m = await createMedia(db, { title: 'No file' });
    const result = await getMediaFileBase64(db, m.id);
    expect(result).toBeNull();
  });

  it('returns null when file does not exist on disk', async () => {
    const m = await createMedia(db, { title: 'Missing file', file_ref: '/nonexistent/path/photo.jpg' });
    const result = await getMediaFileBase64(db, m.id);
    expect(result).toBeNull();
  });

  it('reads a real file from disk and returns base64', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-ai-test-'));
    const tmpFile = path.join(tmpDir, 'test-image.png');
    // Write a minimal PNG file (1x1 pixel)
    const pngData = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    fs.writeFileSync(tmpFile, pngData);

    try {
      const m = await createMedia(db, { title: 'Real file', file_ref: tmpFile });
      const result = await getMediaFileBase64(db, m.id);
      expect(result).not.toBeNull();
      expect(result!.mimeType).toBe('image/png');
      expect(result!.fileName).toBe('test-image.png');
      expect(result!.base64.length).toBeGreaterThan(0);
      // Verify round-trip: decode base64 back to buffer
      const decoded = Buffer.from(result!.base64, 'base64');
      expect(decoded.equals(pngData)).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns correct MIME type for various extensions', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-ai-mime-'));
    const testCases = [
      { name: 'photo.jpg', expectedMime: 'image/jpeg' },
      { name: 'doc.pdf', expectedMime: 'application/pdf' },
      { name: 'icon.svg', expectedMime: 'image/svg+xml' },
      { name: 'unknown.xyz', expectedMime: 'application/octet-stream' },
    ];

    try {
      for (const tc of testCases) {
        const tmpFile = path.join(tmpDir, tc.name);
        fs.writeFileSync(tmpFile, 'test-content');
        const m = await createMedia(db, { title: tc.name, file_ref: tmpFile });
        const result = await getMediaFileBase64(db, m.id);
        expect(result).not.toBeNull();
        expect(result!.mimeType).toBe(tc.expectedMime);
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
