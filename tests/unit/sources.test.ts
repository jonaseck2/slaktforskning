import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createEvent } from '../../src/api/events';
import { createPerson } from '../../src/api/persons';
import { createRelationship } from '../../src/api/relationships';
import { createPlace } from '../../src/api/places';
import {
  createSource,
  getSource,
  listSources,
  updateSource,
  deleteSource,
  searchSources,
  createCitation,
  getCitation,
  getCitationsForSource,
  getCitationsForEvent,
  getCitationsForPerson,
  getCitationsForRelationship,
  getCitationsForPlace,
  deleteCitation,
  updateCitation,
} from '../../src/api/sources';
import { createTestDb } from './helpers';

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
});

describe('sources', () => {
  it('creates a source', () => {
    const source = createSource(db, {
      title: '1880 US Federal Census',
      author: 'US Census Bureau',
      source_type: 'census',
    });
    expect(source.id).toBeDefined();
    expect(source.title).toBe('1880 US Federal Census');
  });

  it('lists and gets sources', () => {
    createSource(db, { title: 'Source A' });
    createSource(db, { title: 'Source B' });
    const list = listSources(db);
    expect(list).toHaveLength(2);
    expect(list[0].title).toBe('Source A');
    expect(getSource(db, list[0].id)).not.toBeNull();
  });

  it('updates a source', () => {
    const source = createSource(db, { title: 'Draft' });
    const updated = updateSource(db, source.id, { title: 'Final Title', author: 'Author' });
    expect(updated!.title).toBe('Final Title');
    expect(updated!.author).toBe('Author');
  });

  it('searches sources by title, author, and publication info', () => {
    createSource(db, { title: 'Swedish Church Records', author: 'Riksarkivet' });
    createSource(db, { title: 'US Federal Census', author: 'Census Bureau', publication_info: 'Washington DC' });

    expect(searchSources(db, 'Swedish')).toHaveLength(1);
    expect(searchSources(db, 'Riksarkivet')).toHaveLength(1);
    expect(searchSources(db, 'Washington')).toHaveLength(1);
    expect(searchSources(db, 'Census')).toHaveLength(1);
    expect(searchSources(db, 'zzz_nomatch')).toHaveLength(0);
  });

  it('deletes a source and cascades to citations', () => {
    const source = createSource(db, { title: 'To Delete' });
    createCitation(db, { source_id: source.id, page: 'p. 1' });
    expect(deleteSource(db, source.id)).toBe(true);
    expect(getSource(db, source.id)).toBeNull();
    expect(getCitationsForSource(db, source.id)).toHaveLength(0);
  });
});

describe('citations', () => {
  it('creates a citation linking source to event', () => {
    const event = createEvent(db, { event_type: 'birth' });
    const source = createSource(db, { title: 'Birth Record' });
    const citation = createCitation(db, {
      source_id: source.id,
      event_id: event.id,
      page: 'p. 42',
      confidence: 3,
      transcription: 'Born 12 June 1845 in Stockholm',
    });
    expect(citation.id).toBeDefined();
    expect(citation.source_id).toBe(source.id);
    expect(citation.confidence).toBe(3);
    expect(citation.transcription).toBe('Born 12 June 1845 in Stockholm');
  });

  it('gets citations for a source', () => {
    const source = createSource(db, { title: 'Census' });
    createCitation(db, { source_id: source.id, page: 'p. 1' });
    createCitation(db, { source_id: source.id, page: 'p. 2' });
    expect(getCitationsForSource(db, source.id)).toHaveLength(2);
  });

  it('gets citations for an event', () => {
    const event = createEvent(db, { event_type: 'birth' });
    const source = createSource(db, { title: 'Record' });
    createCitation(db, { source_id: source.id, event_id: event.id });
    expect(getCitationsForEvent(db, event.id)).toHaveLength(1);
  });

  it('gets a citation by id', () => {
    const source = createSource(db, { title: 'Record' });
    const citation = createCitation(db, { source_id: source.id, page: 'p. 7' });
    const fetched = getCitation(db, citation.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.page).toBe('p. 7');
  });

  it('deletes a citation', () => {
    const source = createSource(db, { title: 'Record' });
    const citation = createCitation(db, { source_id: source.id });
    expect(deleteCitation(db, citation.id)).toBe(true);
    expect(getCitation(db, citation.id)).toBeNull();
  });

  it('gets citations for a person', () => {
    const person = createPerson(db, {});
    const source = createSource(db, { title: 'Record' });
    createCitation(db, { source_id: source.id, person_id: person.id });
    createCitation(db, { source_id: source.id, person_id: person.id });
    expect(getCitationsForPerson(db, person.id)).toHaveLength(2);
    expect(getCitationsForPerson(db, 'nonexistent')).toHaveLength(0);
  });

  it('gets citations for a relationship', () => {
    const rel = createRelationship(db, { type: 'couple' });
    const source = createSource(db, { title: 'Record' });
    createCitation(db, { source_id: source.id, relationship_id: rel.id });
    expect(getCitationsForRelationship(db, rel.id)).toHaveLength(1);
    expect(getCitationsForRelationship(db, 'nonexistent')).toHaveLength(0);
  });

  it('gets citations for a place', () => {
    const place = createPlace(db, { name: 'Stockholm' });
    const source = createSource(db, { title: 'Record' });
    createCitation(db, { source_id: source.id, place_id: place.id });
    expect(getCitationsForPlace(db, place.id)).toHaveLength(1);
    expect(getCitationsForPlace(db, 'nonexistent')).toHaveLength(0);
  });

  it('updateCitation updates editable fields', () => {
    const source = createSource(db, { title: 'Test', source_type: 'other' });
    const event = createEvent(db, { event_type: 'birth', date_type: 'unknown' });
    const cit = createCitation(db, { source_id: source.id, event_id: event.id });

    const updated = updateCitation(db, cit.id, {
      page: 'p. 42',
      confidence: 3,
      transcription: 'Verbatim text from source',
    });

    expect(updated?.page).toBe('p. 42');
    expect(updated?.confidence).toBe(3);
    expect(updated?.transcription).toBe('Verbatim text from source');
    expect(updated?.notes).toBe(cit.notes);
  });

  it('updateCitation with empty updates returns citation unchanged', () => {
    const source = createSource(db, { title: 'Test', source_type: 'other' });
    const cit = createCitation(db, { source_id: source.id, page: 'p. 1' });
    const result = updateCitation(db, cit.id, {});
    expect(result?.page).toBe('p. 1');
  });
});
