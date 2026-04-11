import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createTestDb } from './helpers';
import { createMedia, addMediaLink } from '../../src/api/media';
import { createPerson } from '../../src/api/persons';
import { createRelationship } from '../../src/api/relationships';
import { createEvent } from '../../src/api/events';
import { addEventParticipant } from '../../src/api/relationships';
import { getUntaggedMedia, getMediaForPersonContext, getMediaFileBase64 } from '../../src/api/media_ai';
import type { Database } from 'node-sqlite3-wasm';

let db: Database;
beforeEach(() => { db = createTestDb(); });

describe('getUntaggedMedia', () => {
  it('returns media with no person links', () => {
    const m1 = createMedia(db, { title: 'Photo 1', file_ref: '/tmp/a.jpg' });
    const m2 = createMedia(db, { title: 'Photo 2', file_ref: '/tmp/b.jpg' });
    const person = createPerson(db, { given_name: 'Anna', surname: 'Test' });

    // Link m1 to person — m1 should NOT appear in untagged
    addMediaLink(db, { media_id: m1.id, entity_type: 'person', entity_id: person.id });

    const untagged = getUntaggedMedia(db);
    expect(untagged).toHaveLength(1);
    expect(untagged[0].id).toBe(m2.id);
    expect(untagged[0].entity_link_count).toBe(0);
  });

  it('orders by entity link count descending', () => {
    const m1 = createMedia(db, { title: 'Unlinked' });
    const m2 = createMedia(db, { title: 'Linked to event' });
    const event = createEvent(db, { event_type: 'birth' });
    addMediaLink(db, { media_id: m2.id, entity_type: 'event', entity_id: event.id });

    const untagged = getUntaggedMedia(db);
    expect(untagged).toHaveLength(2);
    // m2 has 1 link, m1 has 0 — m2 should be first
    expect(untagged[0].id).toBe(m2.id);
    expect(untagged[0].entity_link_count).toBe(1);
    expect(untagged[1].id).toBe(m1.id);
    expect(untagged[1].entity_link_count).toBe(0);
  });

  it('excludes media with person links even if it has other links', () => {
    const m1 = createMedia(db, { title: 'Both linked' });
    const person = createPerson(db, { given_name: 'Bob' });
    const event = createEvent(db, { event_type: 'death' });
    addMediaLink(db, { media_id: m1.id, entity_type: 'person', entity_id: person.id });
    addMediaLink(db, { media_id: m1.id, entity_type: 'event', entity_id: event.id });

    const untagged = getUntaggedMedia(db);
    expect(untagged).toHaveLength(0);
  });

  it('respects limit parameter', () => {
    for (let i = 0; i < 5; i++) {
      createMedia(db, { title: `Photo ${i}` });
    }
    const untagged = getUntaggedMedia(db, 2);
    expect(untagged).toHaveLength(2);
  });

  it('includes linked_entity_types summary', () => {
    const m1 = createMedia(db, { title: 'Multi-linked' });
    const event = createEvent(db, { event_type: 'birth' });
    const rel = createRelationship(db, { type: 'couple' });
    addMediaLink(db, { media_id: m1.id, entity_type: 'event', entity_id: event.id });
    addMediaLink(db, { media_id: m1.id, entity_type: 'relationship', entity_id: rel.id });

    const untagged = getUntaggedMedia(db);
    expect(untagged).toHaveLength(1);
    expect(untagged[0].linked_entity_types).toContain('event');
    expect(untagged[0].linked_entity_types).toContain('relationship');
  });
});

describe('getMediaForPersonContext', () => {
  it('returns media directly linked to person', () => {
    const person = createPerson(db, { given_name: 'Anna' });
    const m1 = createMedia(db, { title: 'Portrait' });
    addMediaLink(db, { media_id: m1.id, entity_type: 'person', entity_id: person.id });

    const results = getMediaForPersonContext(db, person.id);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(m1.id);
    expect(results[0].context).toBe('Directly linked to person');
  });

  it('returns media linked to events person participated in', () => {
    const person = createPerson(db, { given_name: 'Anna' });
    const event = createEvent(db, { event_type: 'baptism' });
    addEventParticipant(db, { event_id: event.id, person_id: person.id, role: 'primary' });
    const m1 = createMedia(db, { title: 'Baptism record' });
    addMediaLink(db, { media_id: m1.id, entity_type: 'event', entity_id: event.id });

    const results = getMediaForPersonContext(db, person.id);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(m1.id);
    expect(results[0].context).toContain('baptism');
  });

  it('returns media linked to relationships person is in', () => {
    const person1 = createPerson(db, { given_name: 'Anna' });
    const person2 = createPerson(db, { given_name: 'Bob' });
    const rel = createRelationship(db, { type: 'couple', person1_id: person1.id, person2_id: person2.id });
    const m1 = createMedia(db, { title: 'Wedding photo' });
    addMediaLink(db, { media_id: m1.id, entity_type: 'relationship', entity_id: rel.id });

    const results = getMediaForPersonContext(db, person1.id);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(m1.id);
    expect(results[0].context).toContain('couple');
  });

  it('returns media linked to family members', () => {
    const parent = createPerson(db, { given_name: 'Anna', surname: 'Smith' });
    const child = createPerson(db, { given_name: 'Bob', surname: 'Smith' });
    createRelationship(db, { type: 'parent_child', person1_id: parent.id, person2_id: child.id });

    const m1 = createMedia(db, { title: 'Child photo' });
    addMediaLink(db, { media_id: m1.id, entity_type: 'person', entity_id: child.id });

    const results = getMediaForPersonContext(db, parent.id);
    // Should include: child's photo (via family member)
    const familyMedia = results.find(r => r.context_entity_id === child.id);
    expect(familyMedia).toBeDefined();
    expect(familyMedia!.context).toContain('Bob');
  });

  it('deduplicates media appearing through multiple paths', () => {
    const person = createPerson(db, { given_name: 'Anna' });
    const event = createEvent(db, { event_type: 'birth' });
    addEventParticipant(db, { event_id: event.id, person_id: person.id, role: 'primary' });

    const m1 = createMedia(db, { title: 'Shared photo' });
    // Link to both person and event
    addMediaLink(db, { media_id: m1.id, entity_type: 'person', entity_id: person.id });
    addMediaLink(db, { media_id: m1.id, entity_type: 'event', entity_id: event.id });

    const results = getMediaForPersonContext(db, person.id);
    // Should appear only once (deduped)
    const matching = results.filter(r => r.id === m1.id);
    expect(matching).toHaveLength(1);
  });

  it('returns empty array for person with no related media', () => {
    const person = createPerson(db, { given_name: 'Loner' });
    const results = getMediaForPersonContext(db, person.id);
    expect(results).toHaveLength(0);
  });
});

describe('getMediaFileBase64', () => {
  it('returns null for nonexistent media', () => {
    const result = getMediaFileBase64(db, 'nonexistent-id');
    expect(result).toBeNull();
  });

  it('returns null for media with no file_ref', () => {
    const m = createMedia(db, { title: 'No file' });
    const result = getMediaFileBase64(db, m.id);
    expect(result).toBeNull();
  });

  it('returns null when file does not exist on disk', () => {
    const m = createMedia(db, { title: 'Missing file', file_ref: '/nonexistent/path/photo.jpg' });
    const result = getMediaFileBase64(db, m.id);
    expect(result).toBeNull();
  });

  it('reads a real file from disk and returns base64', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-ai-test-'));
    const tmpFile = path.join(tmpDir, 'test-image.png');
    // Write a minimal PNG file (1x1 pixel)
    const pngData = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    fs.writeFileSync(tmpFile, pngData);

    try {
      const m = createMedia(db, { title: 'Real file', file_ref: tmpFile });
      const result = getMediaFileBase64(db, m.id);
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

  it('returns correct MIME type for various extensions', () => {
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
        const m = createMedia(db, { title: tc.name, file_ref: tmpFile });
        const result = getMediaFileBase64(db, m.id);
        expect(result).not.toBeNull();
        expect(result!.mimeType).toBe(tc.expectedMime);
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
