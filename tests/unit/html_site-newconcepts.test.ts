// T27 — HTML site export carries Phase-2 concepts.
//
// The static SPA at src/static/ reuses the renderer's Vue views and section
// components. Only the data backing differs: static-api.ts replaces
// window.api with read-only queries against a preloaded JSON snapshot.
//
// This test verifies (a) buildSnapshot includes rows for every new table
// scoped to the in-scope persons and (b) buildStaticApi exposes
// window.api-shaped methods so the existing section components
// (EntityNotesSection, PersonAssociationsSection, etc.) render the new
// data in static mode without any code change.
import { describe, it, expect, beforeEach } from 'vitest';
import { createPerson } from '../../src/api/persons';
import { createEvent } from '../../src/api/events';
import { addEventParticipant } from '../../src/api/relationships';
import { createPlace } from '../../src/api/places';
import { createSource } from '../../src/api/sources';
import { createRepository, linkSourceRepository } from '../../src/api/repositories';
import { createNote, linkNoteToEntity } from '../../src/api/notes';
import { createPersonAssociation } from '../../src/api/person_associations';
import { createNameTranslation, createPlaceTranslation } from '../../src/api/translations';
import { createSourceCoverageEvent } from '../../src/api/source_coverage';
import { createCitation } from '../../src/api/sources';
import { buildSnapshot } from '../../src/api/html_site/snapshot';
import { buildStaticApi } from '../../src/static/static-api';
import { queryAll } from '../../src/api/db';
import { createTestDb } from './helpers';
import type { Database } from 'node-sqlite3-wasm';
import type { Note, PersonAssociation, NameTranslation, PlaceTranslation, SourceCoverageEvent, Repository } from '../../src/api/types';

let db: Database;
beforeEach(async () => { db = await createTestDb(); });

describe('buildSnapshot carries Phase-2 concept rows', async () => {
  it('serializes notes, associations, translations, coverage, repositories for in-scope persons', async () => {
    const anna = await createPerson(db, { sex: 'F', given_name: 'Anna', surname: 'Svensson' });
    const bertil = await createPerson(db, { sex: 'M', given_name: 'Bertil', surname: 'Andersson' });

    // person_name id (needed for name_translations)
    const annaNames = await queryAll<{ id: string }>(db, 'SELECT id FROM person_names WHERE person_id = ?', [anna.id]);

    const stockholm = await createPlace(db, { name: 'Stockholm', place_type: 'city' });
    const birth = await createEvent(db, {
      event_type: 'birth', date_value: '1880-03-15', date_original: '1880', place_id: stockholm.id,
    });
    await addEventParticipant(db, { event_id: birth.id, person_id: anna.id, role: 'primary' });

    const source = await createSource(db, { title: 'Kyrkobok', source_type: 'church_record' });
    const repo = await createRepository(db, { name: 'Riksarkivet' });
    await linkSourceRepository(db, source.id, repo.id);
    await createCitation(db, { source_id: source.id, person_id: anna.id, page: 'p. 12' });

    const note = await createNote(db, { text: 'Family note', language: 'en' });
    await linkNoteToEntity(db, note.id, 'person', anna.id);
    await linkNoteToEntity(db, note.id, 'person', bertil.id);

    const association = await createPersonAssociation(db, {
      person_id: anna.id, related_person_id: bertil.id, role: 'godparent',
    });

    const nameTrans = await createNameTranslation(db, {
      person_name_id: annaNames[0].id, value: 'Анна', language: 'ru',
    });

    const placeTrans = await createPlaceTranslation(db, {
      place_id: stockholm.id, value: 'Стокгольм', language: 'ru',
    });

    const coverage = await createSourceCoverageEvent(db, {
      source_id: source.id, event_type: 'birth',
      date_value_from: '1850-01-01', date_value_to: '1900-12-31',
      place_id: stockholm.id,
    });

    const snap = await buildSnapshot(db, {
      siteTitle: 'Test',
      focusPersonId: anna.id,
      scope: { everyone: true },
      options: {
        includeMedia: false, includeReports: false, includePrints: false,
        excludeLiving: false, redactLiving: false, mediaPersonOnly: false,
      },
    });

    // The new snapshot keys are populated.
    expect(snap.notes.length).toBe(1);
    expect(snap.notes[0].id).toBe(note.id);
    expect(snap.noteLinks.length).toBe(2);
    expect(snap.personAssociations.length).toBe(1);
    expect(snap.personAssociations[0].id).toBe(association.id);
    expect(snap.nameTranslations.length).toBe(1);
    expect(snap.nameTranslations[0].id).toBe(nameTrans.id);
    expect(snap.placeTranslations.length).toBe(1);
    expect(snap.placeTranslations[0].id).toBe(placeTrans.id);
    expect(snap.sourceCoverage.length).toBe(1);
    expect(snap.sourceCoverage[0].id).toBe(coverage.id);
    expect(snap.repositories.length).toBe(1);
    expect(snap.repositories[0].id).toBe(repo.id);
    expect(snap.sourceRepositories.length).toBe(1);
    expect(snap.sourceRepositories[0].source_id).toBe(source.id);
    expect(snap.sourceRepositories[0].repository_id).toBe(repo.id);
  });

  it('scopes notes by person scope — out-of-scope persons drop their notes', async () => {
    const focus = await createPerson(db, { given_name: 'Focus', sex: 'M' });
    const stranger = await createPerson(db, { given_name: 'Stranger', sex: 'M' });
    const note = await createNote(db, { text: 'Stranger note' });
    await linkNoteToEntity(db, note.id, 'person', stranger.id);

    const snap = await buildSnapshot(db, {
      siteTitle: 'T', focusPersonId: focus.id,
      scope: { focusId: focus.id, ancestors: 0, descendants: 0 },
      options: {
        includeMedia: false, includeReports: false, includePrints: false,
        excludeLiving: false, redactLiving: false, mediaPersonOnly: false,
      },
    });
    expect(snap.persons.map(p => p.id)).toEqual([focus.id]);
    expect(snap.notes.length).toBe(0); // stranger's note doesn't make it in
    expect(snap.noteLinks.length).toBe(0);
  });
});

describe('buildStaticApi exposes window.api-shaped methods for new concepts', async () => {
  it('shared section components can read notes / associations / translations / coverage / repos via the static api', async () => {
    // Build a populated snapshot via the same path the website-export uses.
    const anna = await createPerson(db, { sex: 'F', given_name: 'Anna', surname: 'Svensson' });
    const bertil = await createPerson(db, { sex: 'M', given_name: 'Bertil', surname: 'Andersson' });
    const annaNames = await queryAll<{ id: string }>(db, 'SELECT id FROM person_names WHERE person_id = ?', [anna.id]);
    const stockholm = await createPlace(db, { name: 'Stockholm' });
    const birth = await createEvent(db, {
      event_type: 'birth', date_value: '1880', date_original: '1880', place_id: stockholm.id,
    });
    await addEventParticipant(db, { event_id: birth.id, person_id: anna.id, role: 'primary' });
    const source = await createSource(db, { title: 'Kyrkobok' });
    const repo = await createRepository(db, { name: 'Riksarkivet' });
    await linkSourceRepository(db, source.id, repo.id);
    await createCitation(db, { source_id: source.id, person_id: anna.id });

    const sharedNote = await createNote(db, { text: 'Shared note' });
    await linkNoteToEntity(db, sharedNote.id, 'person', anna.id);

    await createPersonAssociation(db, {
      person_id: anna.id, related_person_id: bertil.id, role: 'godparent',
    });
    await createNameTranslation(db, {
      person_name_id: annaNames[0].id, value: 'Анна', language: 'ru',
    });
    await createPlaceTranslation(db, {
      place_id: stockholm.id, value: 'Стокгольм', language: 'ru',
    });
    await createSourceCoverageEvent(db, {
      source_id: source.id, event_type: 'birth', date_value_from: '1850', date_value_to: '1900',
    });

    const snap = await buildSnapshot(db, {
      siteTitle: 'Site', focusPersonId: anna.id,
      scope: { everyone: true },
      options: {
        includeMedia: false, includeReports: false, includePrints: false,
        excludeLiving: false, redactLiving: false, mediaPersonOnly: false,
      },
    });
    const api = buildStaticApi(snap);

    // The shapes that the shared section components actually call:
    //
    //   EntityNotesSection → window.api.notes.forEntity('person', personId)
    //   PersonAssociationsSection → window.api.personAssociations.forPerson(id)
    //   PersonNameTranslationsSection → window.api.nameTranslations.forName(nameId)
    //   PlacePanel → window.api.placeTranslations.forPlace(placeId)
    //   SourceCoverageSection → window.api.sourceCoverage.forSource(sourceId)
    //   SourceRepositoriesSection → window.api.repositories.forSource(sourceId)
    //   RepositoryPanel → window.api.repositories.get(repoId)
    //                     window.api.repositories.list()
    const notes = await api.notes.forEntity('person', anna.id) as Note[];
    expect(notes.length).toBe(1);
    expect(notes[0].text).toBe('Shared note');

    const assocs = await api.personAssociations.forPerson(anna.id) as PersonAssociation[];
    expect(assocs.length).toBe(1);
    expect(assocs[0].related_person_id).toBe(bertil.id);

    const nameTrans = await api.nameTranslations.forName(annaNames[0].id) as NameTranslation[];
    expect(nameTrans.length).toBe(1);
    expect(nameTrans[0].value).toBe('Анна');

    const placeTrans = await api.placeTranslations.forPlace(stockholm.id) as PlaceTranslation[];
    expect(placeTrans.length).toBe(1);
    expect(placeTrans[0].value).toBe('Стокгольм');

    const coverage = await api.sourceCoverage.forSource(source.id) as SourceCoverageEvent[];
    expect(coverage.length).toBe(1);
    expect(coverage[0].event_type).toBe('birth');

    const reposBySrc = await api.repositories.forSource(source.id) as Repository[];
    expect(reposBySrc.length).toBe(1);
    expect(reposBySrc[0].name).toBe('Riksarkivet');

    const repoFetched = await api.repositories.get(repo.id);
    expect(repoFetched?.name).toBe('Riksarkivet');

    const allRepos = await api.repositories.list() as Repository[];
    expect(allRepos.length).toBe(1);
  });

  it('static api gracefully handles legacy snapshots without the new fields', async () => {
    // Older snapshot shape predating T26/T27 — no notes / associations / etc.
    const legacySnap = {
      meta: { siteTitle: '', focusPersonId: '', generatedAt: '' },
      persons: [], personNames: [], personIds: [],
      relationships: [], events: [], eventParticipants: [],
      places: [], sources: [], citations: [],
      media: [], mediaLinks: [], mediaRegions: [],
      settings: {},
      // NB: no notes / noteLinks / personAssociations / nameTranslations /
      // placeTranslations / sourceCoverage / repositories / sourceRepositories
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = buildStaticApi(legacySnap as any);

    expect(await api.notes.forEntity('person', 'whatever')).toEqual([]);
    expect(await api.personAssociations.forPerson('x')).toEqual([]);
    expect(await api.nameTranslations.forName('x')).toEqual([]);
    expect(await api.placeTranslations.forPlace('x')).toEqual([]);
    expect(await api.sourceCoverage.forSource('x')).toEqual([]);
    expect(await api.repositories.list()).toEqual([]);
    expect(await api.repositories.forSource('x')).toEqual([]);
    expect(await api.repositories.get('x')).toBeNull();
  });
});
