import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createTestDb } from './helpers';
import { createPerson, addPersonName } from '../../src/api/persons';
import { createEvent } from '../../src/api/events';
import { addEventParticipant } from '../../src/api/relationships';
import { createRelationship } from '../../src/api/relationships';
import { createSource, createCitation } from '../../src/api/sources';
import { createPlace } from '../../src/api/places';
import { generateHtmlSite } from '../../src/api/html_site/generator';

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
});
