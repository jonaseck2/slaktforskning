import { describe, it, expect, beforeEach } from 'vitest';
import { transformGenney, remapGenneyMediaPath, type GenneyTables } from '../../src/import/genney/transform';
import { createTestDb } from './helpers';

let db: ReturnType<typeof createTestDb>;
beforeEach(() => { db = createTestDb(); });

function emptyTables(): GenneyTables {
  return {
    PERSON: [], FAMILY: [], COUPLE_FAMILY: [], SPOUSE_FAMILY: [],
    EVENT: [], EVENT_PLACE: [], OWNER_EVENT: [], SPLACE: [], SOURCE: [],
    CITATION: [], CITATION_SOURCE: [], OWNER_CITATION: [], REMARK: [],
    REPO: [], SOURCE_REPO: [], GROUPS: [], GROUP_MEMBER: [],
    MEDIA: [], OWNER_MEDIA: [], TODO: [],
  };
}

function buildPersonCitationFixture(): GenneyTables {
  return {
    ...emptyTables(),
    PERSON: [{ RID: 'I1', SEX: 0, GIVENNAME: 'Erik', SURNAME: 'Svensson' }],
    SOURCE: [{ RID: 'S1', TITLE: 'Test Source' }],
    CITATION: [{ RID: 'C1', WHEREINTEXT: 'p. 5', CERTAINTY: 2, TEXT: 'Some text', NOTE: '', DATE: '' }],
    CITATION_SOURCE: [{ CITATION: 'C1', SOURCE: 'S1' }],
    OWNER_CITATION: [{ OWNER: 'I1', CITATION: 'C1' }],
  };
}

function buildEventCitationFixture(): GenneyTables {
  return {
    ...emptyTables(),
    PERSON: [{ RID: 'I1', SEX: 0, GIVENNAME: 'Erik', SURNAME: 'Svensson' }],
    SOURCE: [{ RID: 'S1', TITLE: 'Test Source' }],
    CITATION: [{ RID: 'C1', WHEREINTEXT: 'p. 5', CERTAINTY: 2, TEXT: 'Some text', NOTE: '', DATE: '' }],
    CITATION_SOURCE: [{ CITATION: 'C1', SOURCE: 'S1' }],
    EVENT: [{ RID: 'E1', TYPE: 'BIRT', DATE: '1 JAN 1900', OWNER: 'I1' }],
    OWNER_EVENT: [{ OWNER: 'I1', EVENT: 'E1' }],
    OWNER_CITATION: [{ OWNER: 'E1', CITATION: 'C1' }],
  };
}

describe('transformGenney — person citations', () => {
  it('converts a person-owned citation to a MENTION event + event citation', () => {
    const summary = transformGenney(db, buildPersonCitationFixture());

    // One MENTION event created
    const events = db.all('SELECT * FROM events WHERE event_type = ?', ['mention']) as Array<{ id: string }>;
    expect(events).toHaveLength(1);

    // An event_participant links the person to the MENTION event
    const participants = db.all(
      'SELECT ep.* FROM event_participants ep WHERE ep.event_id = ?',
      [events[0].id]
    ) as Array<{ role: string }>;
    expect(participants).toHaveLength(1);
    expect(participants[0].role).toBe('primary');

    // The citation is attached to the event, not the person
    const citations = db.all('SELECT * FROM citations', []) as Array<{
      event_id: string | null;
      person_id: string | null;
    }>;
    expect(citations).toHaveLength(1);
    expect(citations[0].person_id).toBeNull();
    expect(citations[0].event_id).toBe(events[0].id);

    expect(summary.citations).toBe(1);
    expect(summary.events).toBeGreaterThanOrEqual(1);
  });

  it('leaves event-owned citations as event citations (no MENTION created)', () => {
    const summary = transformGenney(db, buildEventCitationFixture());

    const mentions = db.all('SELECT * FROM events WHERE event_type = ?', ['mention']) as unknown[];
    expect(mentions).toHaveLength(0);

    const citations = db.all('SELECT * FROM citations', []) as Array<{
      event_id: string | null;
      person_id: string | null;
    }>;
    expect(citations).toHaveLength(1);
    expect(citations[0].person_id).toBeNull();
    expect(citations[0].event_id).toBeTruthy();

    void summary;
  });
});

describe('remapGenneyMediaPath', () => {
  it('remaps Windows path after media\\ segment', () => {
    expect(remapGenneyMediaPath(
      'C:\\Users\\linda\\Documents\\Genney\\media\\JA Nord.jpg',
      '/tmp/extracted/media'
    )).toBe('/tmp/extracted/media/JA Nord.jpg');
  });

  it('remaps Windows path with subdirectory', () => {
    expect(remapGenneyMediaPath(
      'C:\\Users\\linda\\Genney\\media\\Christina\\photo.jpg',
      '/tmp/extracted/media'
    )).toBe('/tmp/extracted/media/Christina/photo.jpg');
  });

  it('passes through http URLs unchanged', () => {
    expect(remapGenneyMediaPath(
      'http://www.example.com/photo.jpg',
      '/tmp/media'
    )).toBe('http://www.example.com/photo.jpg');
  });

  it('passes through https URLs unchanged', () => {
    expect(remapGenneyMediaPath(
      'https://example.com/page',
      '/tmp/media'
    )).toBe('https://example.com/page');
  });

  it('returns ref unchanged when no media segment found', () => {
    expect(remapGenneyMediaPath(
      'C:\\Users\\linda\\Documents\\photo.jpg',
      '/tmp/media'
    )).toBe('C:\\Users\\linda\\Documents\\photo.jpg');
  });

  it('handles capital Media', () => {
    expect(remapGenneyMediaPath(
      'C:\\OurKind\\Media\\photo.jpg',
      '/tmp/media'
    )).toBe('/tmp/media/photo.jpg');
  });

  it('strips trailing slash from mediaDir', () => {
    expect(remapGenneyMediaPath(
      'C:\\Genney\\media\\photo.jpg',
      '/tmp/media/'
    )).toBe('/tmp/media/photo.jpg');
  });
});
