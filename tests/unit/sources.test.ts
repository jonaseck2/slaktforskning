import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from './helpers';
import { createPerson } from '../../src/api/persons';
import { createEvent } from '../../src/api/events';
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
  deleteCitation,
} from '../../src/api/sources';

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
    const person = createPerson(db, { given_name: 'Test', surname: 'T' });
    const event = createEvent(db, { event_type: 'birth', person_id: person.id });
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
    const person = createPerson(db, { given_name: 'Test', surname: 'T' });
    const event = createEvent(db, { event_type: 'birth', person_id: person.id });
    const source = createSource(db, { title: 'Record' });
    createCitation(db, { source_id: source.id, event_id: event.id });
    expect(getCitationsForEvent(db, event.id)).toHaveLength(1);
  });

  it('deletes a citation', () => {
    const source = createSource(db, { title: 'Record' });
    const citation = createCitation(db, { source_id: source.id });
    expect(deleteCitation(db, citation.id)).toBe(true);
    expect(getCitation(db, citation.id)).toBeNull();
  });
});
