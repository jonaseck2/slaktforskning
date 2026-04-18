import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createPerson } from '../../src/api/persons';
import { createEvent } from '../../src/api/events';
import { addEventParticipant } from '../../src/api/relationships';
import { createRelationship } from '../../src/api/relationships';
import { createSource, createCitation, updateSource } from '../../src/api/sources';
import { createPlace } from '../../src/api/places';
import { generateHtmlSite } from '../../src/api/html_site/generator';
import { createTestDb } from './helpers';

let db: ReturnType<typeof createTestDb>;
let tmpDir: string;

beforeEach(() => {
  db = createTestDb();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'html-site-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function seedData() {
  // Create persons
  const p1 = createPerson(db, { sex: 'M', living: false, given_name: 'Johan', surname: 'Andersson' });
  const p2 = createPerson(db, { sex: 'F', living: false, given_name: 'Anna', surname: 'Svensson' });
  const p3 = createPerson(db, { sex: 'M', living: true, given_name: 'Erik', surname: 'Andersson' });

  // Create a place
  const place = createPlace(db, { name: 'Stockholm', place_type: 'city' });

  // Create events
  const birthEvent = createEvent(db, {
    event_type: 'birth',
    date_type: 'exact',
    date_value: '1850-03-15',
    place_id: place.id,
  });
  addEventParticipant(db, { event_id: birthEvent.id, person_id: p1.id, role: 'primary' });

  const deathEvent = createEvent(db, {
    event_type: 'death',
    date_type: 'exact',
    date_value: '1920-07-01',
  });
  addEventParticipant(db, { event_id: deathEvent.id, person_id: p1.id, role: 'primary' });

  // Create relationship
  createRelationship(db, { type: 'couple', person1_id: p1.id, person2_id: p2.id, subtype: 'marriage' });

  // Create source and citation
  const source = createSource(db, { title: 'Church Records', author: 'Parish of Stockholm' });
  createCitation(db, { source_id: source.id, person_id: p1.id, page: 'p. 42', notes: 'Birth entry' });

  return { p1, p2, p3, place, source };
}

describe('generateHtmlSite', () => {
  it('creates output directory structure', () => {
    seedData();
    const outDir = path.join(tmpDir, 'site');
    generateHtmlSite(db, outDir);

    expect(fs.existsSync(path.join(outDir, 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'style.css'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'places.html'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'sources.html'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'search.html'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'search.json'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'persons'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'places'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'sources'))).toBe(true);
  });

  it('returns correct counts', () => {
    seedData();
    const outDir = path.join(tmpDir, 'site');
    const result = generateHtmlSite(db, outDir);

    expect(result.personCount).toBe(3);
    expect(result.placeCount).toBe(1); // Stockholm has a birth event
    expect(result.sourceCount).toBe(1);
    expect(result.pageCount).toBeGreaterThan(5); // index + 3 persons + places/sources indexes + place + source + search
  });

  it('generates index page with all persons alphabetically', () => {
    seedData();
    const outDir = path.join(tmpDir, 'site');
    generateHtmlSite(db, outDir);

    const indexHtml = fs.readFileSync(path.join(outDir, 'index.html'), 'utf-8');
    expect(indexHtml).toContain('Persons (3)');
    expect(indexHtml).toContain('Andersson, Johan');
    expect(indexHtml).toContain('Svensson, Anna');
    expect(indexHtml).toContain('Andersson, Erik');
  });

  it('generates person page with events and relationships', () => {
    const { p1 } = seedData();
    const outDir = path.join(tmpDir, 'site');
    generateHtmlSite(db, outDir);

    const personHtml = fs.readFileSync(path.join(outDir, 'persons', `${p1.id}.html`), 'utf-8');
    expect(personHtml).toContain('Johan Andersson');
    expect(personHtml).toContain('1850-03-15');
    expect(personHtml).toContain('Birth');
    expect(personHtml).toContain('Stockholm');
    expect(personHtml).toContain('Couple');
    expect(personHtml).toContain('Anna Svensson');
    expect(personHtml).toContain('Church Records');
  });

  it('excludes living persons when excludeLiving is true', () => {
    const { p3 } = seedData();
    const outDir = path.join(tmpDir, 'site');
    const result = generateHtmlSite(db, outDir, { excludeLiving: true });

    expect(result.personCount).toBe(2); // Erik excluded
    const indexHtml = fs.readFileSync(path.join(outDir, 'index.html'), 'utf-8');
    expect(indexHtml).toContain('Persons (2)');
    expect(indexHtml).not.toContain('Erik');
    expect(fs.existsSync(path.join(outDir, 'persons', `${p3.id}.html`))).toBe(false);
  });

  it('generates search.json with expected entries', () => {
    seedData();
    const outDir = path.join(tmpDir, 'site');
    generateHtmlSite(db, outDir);

    const searchData = JSON.parse(fs.readFileSync(path.join(outDir, 'search.json'), 'utf-8'));
    expect(Array.isArray(searchData)).toBe(true);

    const personEntries = searchData.filter((e: { type: string }) => e.type === 'person');
    expect(personEntries.length).toBe(3);

    const placeEntries = searchData.filter((e: { type: string }) => e.type === 'place');
    expect(placeEntries.length).toBe(1);
    expect(placeEntries[0].text).toBe('Stockholm');

    const sourceEntries = searchData.filter((e: { type: string }) => e.type === 'source');
    expect(sourceEntries.length).toBe(1);
    expect(sourceEntries[0].text).toBe('Church Records');
  });

  it('generates place page with events', () => {
    const { place } = seedData();
    const outDir = path.join(tmpDir, 'site');
    generateHtmlSite(db, outDir);

    const placeHtml = fs.readFileSync(path.join(outDir, 'places', `${place.id}.html`), 'utf-8');
    expect(placeHtml).toContain('Stockholm');
    expect(placeHtml).toContain('Birth');
    expect(placeHtml).toContain('Johan Andersson');
  });

  it('generates source page with citations', () => {
    const { source } = seedData();
    const outDir = path.join(tmpDir, 'site');
    generateHtmlSite(db, outDir);

    const sourceHtml = fs.readFileSync(path.join(outDir, 'sources', `${source.id}.html`), 'utf-8');
    expect(sourceHtml).toContain('Church Records');
    expect(sourceHtml).toContain('Parish of Stockholm');
    expect(sourceHtml).toContain('p. 42');
  });

  it('uses custom site title', () => {
    seedData();
    const outDir = path.join(tmpDir, 'site');
    generateHtmlSite(db, outDir, { siteTitle: 'Andersson Family' });

    const indexHtml = fs.readFileSync(path.join(outDir, 'index.html'), 'utf-8');
    expect(indexHtml).toContain('Andersson Family');
  });

  it('generates valid HTML with DOCTYPE', () => {
    seedData();
    const outDir = path.join(tmpDir, 'site');
    generateHtmlSite(db, outDir);

    const indexHtml = fs.readFileSync(path.join(outDir, 'index.html'), 'utf-8');
    expect(indexHtml).toMatch(/^<!DOCTYPE html>/);
    expect(indexHtml).toContain('<meta charset="UTF-8">');
    expect(indexHtml).toContain('<meta name="viewport"');
  });

  it('handles empty database gracefully', () => {
    const outDir = path.join(tmpDir, 'site');
    const result = generateHtmlSite(db, outDir);

    expect(result.personCount).toBe(0);
    expect(result.placeCount).toBe(0);
    expect(result.sourceCount).toBe(0);
    expect(fs.existsSync(path.join(outDir, 'index.html'))).toBe(true);

    const indexHtml = fs.readFileSync(path.join(outDir, 'index.html'), 'utf-8');
    expect(indexHtml).toContain('Persons (0)');
  });

  it('escapes HTML in person names', () => {
    createPerson(db, { given_name: '<script>alert("xss")</script>', surname: 'Test&Co' });
    const outDir = path.join(tmpDir, 'site');
    generateHtmlSite(db, outDir);

    const indexHtml = fs.readFileSync(path.join(outDir, 'index.html'), 'utf-8');
    expect(indexHtml).not.toContain('<script>alert');
    expect(indexHtml).toContain('&lt;script&gt;');
    expect(indexHtml).toContain('Test&amp;Co');
  });

  it('generates person page without notes', () => {
    const p = createPerson(db, { given_name: 'Erik', surname: 'Test', sex: 'M', living: false });
    const outDir = path.join(tmpDir, 'site');
    generateHtmlSite(db, outDir);

    const html = fs.readFileSync(path.join(outDir, 'persons', `${p.id}.html`), 'utf-8');
    expect(html).toContain('Erik Test');
    // No "Notes" section for person without notes
    expect(html).not.toContain('<h3>Notes</h3>');
  });

  it('generates person page with notes', () => {
    const p = createPerson(db, { given_name: 'Anna', surname: 'Test', sex: 'F', living: false, notes: 'Important person note' });
    const outDir = path.join(tmpDir, 'site');
    generateHtmlSite(db, outDir);

    const html = fs.readFileSync(path.join(outDir, 'persons', `${p.id}.html`), 'utf-8');
    expect(html).toContain('<h3>Notes</h3>');
    expect(html).toContain('Important person note');
  });

  it('generates place page where placePath equals place name', () => {
    // A top-level place with no parent — placePath equals name
    const place = createPlace(db, { name: 'Stockholm' });
    const p = createPerson(db, { given_name: 'Erik', surname: 'Test', sex: 'M', living: false });
    const ev = createEvent(db, { event_type: 'birth', place_id: place.id, date_type: 'exact', date_value: '1850-01-01' });
    addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });

    const outDir = path.join(tmpDir, 'site');
    generateHtmlSite(db, outDir);

    const html = fs.readFileSync(path.join(outDir, 'places', `${place.id}.html`), 'utf-8');
    expect(html).toContain('Stockholm');
    // placePath === place.name → no duplicate subtitle
    const subtitleCount = (html.match(/class="subtitle"/g) || []).length;
    // Only place_type subtitle should appear (at most 1 for city type)
    expect(subtitleCount).toBeLessThanOrEqual(1);
  });

  it('generates place page with notes', () => {
    const place = createPlace(db, { name: 'Fröderyd', notes: 'Historic parish' });
    const p = createPerson(db, { given_name: 'Erik', surname: 'Test', sex: 'M', living: false });
    const ev = createEvent(db, { event_type: 'birth', place_id: place.id, date_type: 'exact', date_value: '1850-01-01' });
    addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });

    const outDir = path.join(tmpDir, 'site');
    generateHtmlSite(db, outDir);

    const html = fs.readFileSync(path.join(outDir, 'places', `${place.id}.html`), 'utf-8');
    expect(html).toContain('<h3>Notes</h3>');
    expect(html).toContain('Historic parish');
  });

  it('generates place page without notes', () => {
    const place = createPlace(db, { name: 'Malmö' });
    const p = createPerson(db, { given_name: 'Erik', surname: 'Test', sex: 'M', living: false });
    const ev = createEvent(db, { event_type: 'birth', place_id: place.id, date_type: 'exact', date_value: '1850-01-01' });
    addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });

    const outDir = path.join(tmpDir, 'site');
    generateHtmlSite(db, outDir);

    const html = fs.readFileSync(path.join(outDir, 'places', `${place.id}.html`), 'utf-8');
    expect(html).not.toContain('<h3>Notes</h3>');
  });

  it('generates source page with all optional fields', () => {
    const p = createPerson(db, { given_name: 'Erik', surname: 'Test', sex: 'M', living: false });
    const source = createSource(db, {
      title: 'Full Source',
      author: 'Author Name',
      publication_info: 'Published 1900',
      repository: 'Royal Archives',
      source_type: 'church_record',
      url: 'https://example.com',
    });
    // call_number and abstract not in createSource INSERT — set via update
    updateSource(db, source.id, { call_number: 'SE/RA/123', abstract: 'This is the abstract text' });
    createCitation(db, { source_id: source.id, person_id: p.id, page: 'p. 1' });

    const outDir = path.join(tmpDir, 'site');
    generateHtmlSite(db, outDir);

    const html = fs.readFileSync(path.join(outDir, 'sources', `${source.id}.html`), 'utf-8');
    expect(html).toContain('Author Name');
    expect(html).toContain('Published 1900');
    expect(html).toContain('Royal Archives');
    expect(html).toContain('Church record');
    expect(html).toContain('SE/RA/123');
    expect(html).toContain('https://example.com');
    expect(html).toContain('<h3>Abstract</h3>');
    expect(html).toContain('This is the abstract text');
  });

  it('generates source page without abstract or optional fields', () => {
    const p = createPerson(db, { given_name: 'Erik', surname: 'Test', sex: 'M', living: false });
    const source = createSource(db, { title: 'Minimal Source' });
    createCitation(db, { source_id: source.id, person_id: p.id, page: 'p. 1' });

    const outDir = path.join(tmpDir, 'site');
    generateHtmlSite(db, outDir);

    const html = fs.readFileSync(path.join(outDir, 'sources', `${source.id}.html`), 'utf-8');
    expect(html).toContain('Minimal Source');
    expect(html).not.toContain('<h3>Abstract</h3>');
  });

  it('handles events with date_original but no year match', () => {
    const p = createPerson(db, { given_name: 'Erik', surname: 'Test', sex: 'M', living: false });
    const ev = createEvent(db, { event_type: 'birth', date_original: 'Unknown date' });
    addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });

    const outDir = path.join(tmpDir, 'site');
    const result = generateHtmlSite(db, outDir);

    // Should not crash, person page should still generate
    expect(result.personCount).toBe(1);
    const searchData = JSON.parse(fs.readFileSync(path.join(outDir, 'search.json'), 'utf-8'));
    const entry = searchData.find((e: { url: string }) => e.url.includes(p.id));
    // No dates should appear since "Unknown date" has no 4-digit year
    expect(entry.text).not.toContain('Unknown');
  });

  it('handles events with no date_original and no date_value', () => {
    const p = createPerson(db, { given_name: 'Erik', surname: 'Test', sex: 'M', living: false });
    const ev = createEvent(db, { event_type: 'birth' });
    addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });

    const outDir = path.join(tmpDir, 'site');
    const result = generateHtmlSite(db, outDir);
    expect(result.personCount).toBe(1);
  });

  it('handles source page with citation via event_id but no person_id', () => {
    const p = createPerson(db, { given_name: 'Erik', surname: 'Test', sex: 'M', living: false });
    const ev = createEvent(db, { event_type: 'birth', date_type: 'exact', date_value: '1850-01-01' });
    addEventParticipant(db, { event_id: ev.id, person_id: p.id, role: 'primary' });
    const source = createSource(db, { title: 'Event Source' });
    // Citation via event_id, not person_id — tests the event participant lookup branch
    createCitation(db, { source_id: source.id, event_id: ev.id });

    const outDir = path.join(tmpDir, 'site');
    generateHtmlSite(db, outDir);

    const html = fs.readFileSync(path.join(outDir, 'sources', `${source.id}.html`), 'utf-8');
    expect(html).toContain('Erik Test');
    expect(html).toContain('Birth');
  });

  it('generates person page with relationship subtype', () => {
    const p1 = createPerson(db, { given_name: 'Erik', surname: 'Test', sex: 'M', living: false });
    const p2 = createPerson(db, { given_name: 'Anna', surname: 'Test', sex: 'F', living: false });
    createRelationship(db, { type: 'couple', person1_id: p1.id, person2_id: p2.id, subtype: 'marriage' });

    const outDir = path.join(tmpDir, 'site');
    generateHtmlSite(db, outDir);

    const html = fs.readFileSync(path.join(outDir, 'persons', `${p1.id}.html`), 'utf-8');
    expect(html).toContain('marriage');
  });

  it('handles relationship pointing to null person', () => {
    const p1 = createPerson(db, { given_name: 'Erik', surname: 'Test', sex: 'M', living: false });
    createRelationship(db, { type: 'couple', person1_id: p1.id });

    const outDir = path.join(tmpDir, 'site');
    const result = generateHtmlSite(db, outDir);
    expect(result.personCount).toBe(1);
  });

  it('includes person with only death date in search entry', () => {
    const p = createPerson(db, { given_name: 'Erik', surname: 'Test', sex: 'M', living: false });
    const deathEv = createEvent(db, { event_type: 'death', date_original: '1920' });
    addEventParticipant(db, { event_id: deathEv.id, person_id: p.id, role: 'primary' });

    const outDir = path.join(tmpDir, 'site');
    generateHtmlSite(db, outDir);

    const searchData = JSON.parse(fs.readFileSync(path.join(outDir, 'search.json'), 'utf-8'));
    const entry = searchData.find((e: { url: string }) => e.url.includes(p.id));
    expect(entry.text).toContain('1920');
  });
});
