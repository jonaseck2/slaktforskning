import { describe, it, expect, beforeEach } from 'vitest';
import { registerMediaTools } from '../../src/mcp/tools/prod/media';
import { createPerson } from '../../src/api/persons';
import { createEvent } from '../../src/api/events';
import { addEventParticipant, createRelationship } from '../../src/api/relationships';
import { createMedia, addMediaLink } from '../../src/api/media';
import { createTestDb } from './helpers';
import { createCaptureServer, callTool, makeCtx } from './helpers/mcpHarness';

let db: ReturnType<typeof createTestDb>;
let tools: ReturnType<typeof createCaptureServer>['tools'];

beforeEach(() => {
  db = createTestDb();
  const cap = createCaptureServer();
  registerMediaTools(cap.server, makeCtx(db));
  tools = cap.tools;
});

describe('attach_media', () => {
  it('registers the tool', () => {
    expect(tools.has('attach_media')).toBe(true);
  });

  it('creates a media row and a media_link in one transaction', async () => {
    const person = createPerson(db, { sex: 'F', given_name: 'Anna', surname: 'Lindgren' });
    const res = await callTool<{ media: { id: string; title: string }; link: { id: string; link_type: string | null } }>(
      tools,
      'attach_media',
      {
        title: 'Portrait',
        file_ref: '/tmp/p.jpg',
        format: 'jpg',
        entity_type: 'person',
        entity_id: person.id,
        link_type: 'portrait',
      },
    );

    expect(res.media.id).toBeTruthy();
    expect(res.media.title).toBe('Portrait');
    expect(res.link.id).toBeTruthy();

    // Assert DB state
    const mediaRows = db.prepare('SELECT * FROM media WHERE id = ?').all([res.media.id]) as any[];
    expect(mediaRows).toHaveLength(1);
    expect(mediaRows[0].title).toBe('Portrait');
    expect(mediaRows[0].format).toBe('jpg');

    const linkRows = db.prepare('SELECT * FROM media_links WHERE entity_id = ?').all([person.id]) as any[];
    expect(linkRows).toHaveLength(1);
    expect(linkRows[0].media_id).toBe(res.media.id);
    expect(linkRows[0].entity_type).toBe('person');
    expect(linkRows[0].link_type).toBe('portrait');
  });

  it('attaches to an event entity', async () => {
    const person = createPerson(db, { sex: 'M', given_name: 'Erik', surname: 'Svensson' });
    const event = createEvent(db, { event_type: 'birth', date_original: '1850' });
    addEventParticipant(db, { event_id: event.id, person_id: person.id, role: 'primary' });

    const res = await callTool<{ media: { id: string }; link: { id: string } }>(
      tools,
      'attach_media',
      {
        title: 'Birth record',
        entity_type: 'event',
        entity_id: event.id,
      },
    );

    expect(res.media.id).toBeTruthy();
    expect(res.link.id).toBeTruthy();

    const linkRows = db.prepare('SELECT * FROM media_links WHERE entity_id = ?').all([event.id]) as any[];
    expect(linkRows).toHaveLength(1);
    expect(linkRows[0].entity_type).toBe('event');
  });

  it('creates media with notes', async () => {
    const person = createPerson(db, { sex: 'M', given_name: 'Lars', surname: 'Karlsson' });
    const res = await callTool<{ media: { id: string; notes: string } }>(
      tools,
      'attach_media',
      {
        title: 'Parish record',
        notes: 'From Husförhörslängd',
        entity_type: 'person',
        entity_id: person.id,
      },
    );

    expect(res.media.notes).toBe('From Husförhörslängd');
    const mediaRows = db.prepare('SELECT * FROM media WHERE id = ?').all([res.media.id]) as any[];
    expect(mediaRows[0].notes).toBe('From Husförhörslängd');
  });

  it('rolls back media row when link insert fails due to invalid entity_type CHECK constraint', async () => {
    // Bypass Zod validation by calling the handler directly with an entity_type
    // that violates the DB CHECK constraint — this exercises the catch/ROLLBACK path
    await expect(
      callTool(tools, 'attach_media', {
        title: 'Bad',
        entity_type: 'invalid_entity_type',  // not in CHECK(entity_type IN (...))
        entity_id: 'some-id',
      }),
    ).rejects.toThrow();

    // No media row should have been committed (transaction was rolled back)
    const count = db.prepare('SELECT COUNT(*) AS c FROM media').get([]) as { c: number };
    expect(count.c).toBe(0);

    // No link row should exist either
    const linkCount = db.prepare('SELECT COUNT(*) AS c FROM media_links').get([]) as { c: number };
    expect(linkCount.c).toBe(0);
  });
});

describe('tag_person_in_media', () => {
  it('registers the tool', () => {
    expect(tools.has('tag_person_in_media')).toBe(true);
  });

  it('creates a media_region for an existing media item', async () => {
    const media = createMedia(db, { title: 'Group photo' });
    const person = createPerson(db, { sex: 'F', given_name: 'Maja', surname: 'Nilsson' });

    const region = await callTool<{
      id: string;
      media_id: string;
      person_id: string;
      x: number;
      y: number;
      width: number;
      height: number;
      label: string | null;
    }>(tools, 'tag_person_in_media', {
      media_id: media.id,
      person_id: person.id,
      x: 0.1,
      y: 0.2,
      width: 0.15,
      height: 0.25,
      label: 'Maja',
    });

    expect(region.id).toBeTruthy();
    expect(region.media_id).toBe(media.id);
    expect(region.person_id).toBe(person.id);
    expect(region.x).toBe(0.1);
    expect(region.y).toBe(0.2);
    expect(region.width).toBe(0.15);
    expect(region.height).toBe(0.25);
    expect(region.label).toBe('Maja');

    // Assert DB state
    const rows = db.prepare('SELECT * FROM media_regions WHERE media_id = ?').all([media.id]) as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(region.id);
    expect(rows[0].person_id).toBe(person.id);
    expect(rows[0].x).toBe(0.1);
    expect(rows[0].y).toBe(0.2);
  });

  it('creates a region without a person_id (anonymous region)', async () => {
    const media = createMedia(db, { title: 'Old photo' });

    const region = await callTool<{ id: string; person_id: string | null }>(
      tools,
      'tag_person_in_media',
      {
        media_id: media.id,
        x: 0.5,
        y: 0.5,
        width: 0.1,
        height: 0.1,
      },
    );

    expect(region.id).toBeTruthy();
    expect(region.person_id).toBeNull();

    const rows = db.prepare('SELECT * FROM media_regions WHERE id = ?').all([region.id]) as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].person_id).toBeNull();
  });

  it('creates multiple regions for the same media item', async () => {
    const media = createMedia(db, { title: 'Family photo' });
    const p1 = createPerson(db, { sex: 'M', given_name: 'Per', surname: 'Eriksson' });
    const p2 = createPerson(db, { sex: 'F', given_name: 'Stina', surname: 'Eriksson' });

    await callTool(tools, 'tag_person_in_media', {
      media_id: media.id,
      person_id: p1.id,
      x: 0.1,
      y: 0.1,
      width: 0.1,
      height: 0.2,
    });
    await callTool(tools, 'tag_person_in_media', {
      media_id: media.id,
      person_id: p2.id,
      x: 0.6,
      y: 0.1,
      width: 0.1,
      height: 0.2,
    });

    const rows = db.prepare('SELECT * FROM media_regions WHERE media_id = ?').all([media.id]) as any[];
    expect(rows).toHaveLength(2);
  });
});

describe('get_media_for_person_context', () => {
  it('registers the tool', () => {
    expect(tools.has('get_media_for_person_context')).toBe(true);
  });

  it('returns empty array for person with no media', async () => {
    const person = createPerson(db, { sex: 'M', given_name: 'Nils', surname: 'Holm' });

    const result = await callTool<any[]>(tools, 'get_media_for_person_context', {
      person_id: person.id,
    });

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('returns media directly linked to person', async () => {
    const person = createPerson(db, { sex: 'F', given_name: 'Britta', surname: 'Andersson' });
    const media = createMedia(db, { title: 'Portrait of Britta' });
    addMediaLink(db, { media_id: media.id, entity_type: 'person', entity_id: person.id });

    const result = await callTool<any[]>(tools, 'get_media_for_person_context', {
      person_id: person.id,
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(media.id);
    expect(result[0].title).toBe('Portrait of Britta');
    expect(result[0].context).toContain('Directly linked to person');
    expect(result[0].context_entity_type).toBe('person');
    expect(result[0].context_entity_id).toBe(person.id);
  });

  it('returns media linked to events the person participated in', async () => {
    const person = createPerson(db, { sex: 'M', given_name: 'Axel', surname: 'Blom' });
    const event = createEvent(db, { event_type: 'baptism', date_original: '1880' });
    addEventParticipant(db, { event_id: event.id, person_id: person.id, role: 'primary' });
    const media = createMedia(db, { title: 'Baptism record' });
    addMediaLink(db, { media_id: media.id, entity_type: 'event', entity_id: event.id });

    const result = await callTool<any[]>(tools, 'get_media_for_person_context', {
      person_id: person.id,
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(media.id);
    expect(result[0].context).toContain('baptism');
    expect(result[0].context_entity_type).toBe('event');
    expect(result[0].context_entity_id).toBe(event.id);
  });

  it('returns media linked to relationships the person is in', async () => {
    const p1 = createPerson(db, { sex: 'M', given_name: 'Johan', surname: 'Berg' });
    const p2 = createPerson(db, { sex: 'F', given_name: 'Karin', surname: 'Berg' });
    const rel = createRelationship(db, { type: 'couple', person1_id: p1.id, person2_id: p2.id });
    const media = createMedia(db, { title: 'Wedding photo' });
    addMediaLink(db, { media_id: media.id, entity_type: 'relationship', entity_id: rel.id });

    const result = await callTool<any[]>(tools, 'get_media_for_person_context', {
      person_id: p1.id,
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(media.id);
    expect(result[0].context).toContain('couple');
    expect(result[0].context_entity_type).toBe('relationship');
    expect(result[0].context_entity_id).toBe(rel.id);
  });

  it('returns media linked to family members', async () => {
    const parent = createPerson(db, { sex: 'M', given_name: 'Olof', surname: 'Strand' });
    const child = createPerson(db, { sex: 'F', given_name: 'Sigrid', surname: 'Strand' });
    createRelationship(db, { type: 'parent_child', person1_id: parent.id, person2_id: child.id });
    const media = createMedia(db, { title: 'Family portrait' });
    addMediaLink(db, { media_id: media.id, entity_type: 'person', entity_id: parent.id });

    // Query from child's perspective — should find media of the parent (family member)
    const result = await callTool<any[]>(tools, 'get_media_for_person_context', {
      person_id: child.id,
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(media.id);
    expect(result[0].context_entity_type).toBe('person');
    expect(result[0].context_entity_id).toBe(parent.id);
  });

  it('deduplicates media that matches multiple contexts', async () => {
    const p1 = createPerson(db, { sex: 'M', given_name: 'Gustav', surname: 'Lund' });
    const p2 = createPerson(db, { sex: 'F', given_name: 'Helga', surname: 'Lund' });
    createRelationship(db, { type: 'couple', person1_id: p1.id, person2_id: p2.id });

    const media = createMedia(db, { title: 'Couple photo' });
    // Link to both person directly AND via couple relationship to test deduplication
    addMediaLink(db, { media_id: media.id, entity_type: 'person', entity_id: p1.id });
    // Even though rel link is also present, the direct link should dedup it
    const rel = (db.prepare('SELECT id FROM relationships WHERE person1_id = ?').get([p1.id]) as any);
    addMediaLink(db, { media_id: media.id, entity_type: 'relationship', entity_id: rel.id });

    const result = await callTool<any[]>(tools, 'get_media_for_person_context', {
      person_id: p1.id,
    });

    // Media should appear only once despite matching multiple contexts
    const ids = result.map((r: any) => r.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
    // The shared media should appear exactly once
    expect(ids.filter((id: string) => id === media.id)).toHaveLength(1);
  });
});
