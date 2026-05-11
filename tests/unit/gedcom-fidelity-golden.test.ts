/**
 * Golden-DB-seed round-trip test.
 *
 * Seed a comprehensive in-memory DB exercising every NON-LOSSY column at
 * least once, including multi-field interactions on the same row. Round-trip
 * through GEDCOM and assert the canonicalised DB equals the original.
 *
 * Tables documented in src/api/gedcom_fidelity_registry.ts as fully-lossy
 * (groups, group_links, research_tasks, task_links, media, media_links) are
 * intentionally omitted from the seed — the per-field test already verifies
 * their lossy claim. The goal of THIS test is to catch multi-field interaction
 * regressions on the round-trip-able subset (e.g. exporter changing the emit
 * order of cause/value/notes such that import can no longer re-associate
 * them with the right row).
 *
 * See CLAUDE.md "⚠️ Prime Directive (cont.): Round-Trip Fidelity".
 */
import { describe, it, expect } from 'vitest';
import type { Database } from 'node-sqlite3-wasm';
import { createPerson, addPersonName, addPersonIdentifier } from '../../src/api/persons';
import { createPlace } from '../../src/api/places';
import { createEvent } from '../../src/api/events';
import { createRelationship, addEventParticipant } from '../../src/api/relationships';
import { createSource, createCitation } from '../../src/api/sources';
import { createRepository, linkSourceRepository } from '../../src/api/repositories';
import { createGroup, addGroupLink } from '../../src/api/groups';
import { createMedia } from '../../src/api/media';
import {
  roundTrip,
  canonicaliseDb,
  type RegistryVersion,
} from '../helpers/gedcom_fidelity';
import { createTestDb } from './helpers';

const VERSIONS: RegistryVersion[] = ['v551', 'v70'];

async function seedComprehensive(db: Database): void {
  // ── Person 1: full name + identifier coverage ────────────────────────────
  const p1 = await createPerson(db, { sex: 'M', notes: 'P1 lifestory notes' }, { allowNameless: true });

  // First (birth) name with prefix/suffix/patronymic/qualifier/preferred/nickname
  // exercising the multi-field interaction: NPFX + NSFX + _PATR + _NQUAL + asterisk
  // marker for preferred_name + NICK all on the same NAME block.
  await addPersonName(db, p1.id, {
    given_name: 'Lars',
    surname: 'Eriksson',
    name_type: 'birth',
    sort_order: 0,
    name_prefix: 'Dr.',
    name_suffix: 'Jr.',
    patronymic_base: 'Erik',
    name_qualifier: 'patronymic',
    preferred_name: 'Lars',
    nickname: 'Lasse',
    date_from: '1850',
    date_to: '1885',
  });

  // Second (name_change) name — different name_type, different date range —
  // exercises NAME-block ordering preservation and per-name date sub-tags.
  await addPersonName(db, p1.id, {
    given_name: 'Lars',
    surname: 'Andersson',
    name_type: 'name_change',
    sort_order: 1,
    date_from: '1885',
    date_to: '1920',
  });

  // Two identifiers (REFN + RIN) — exercises emit order on a row with
  // repeated kind under the same INDI.
  await addPersonIdentifier(db, p1.id, { identifier_type: 'refn', identifier_value: 'L1' });
  await addPersonIdentifier(db, p1.id, { identifier_type: 'rin', identifier_value: '42' });

  // ── Person 2: spouse for the couple relationship ─────────────────────────
  const p2 = await createPerson(db, { sex: 'F', notes: '' }, { allowNameless: true });
  await addPersonName(db, p2.id, {
    given_name: 'Anna',
    surname: 'Bengtsdotter',
    name_type: 'birth',
    sort_order: 0,
  });

  // ── Place: standalone (no parent — places.parent_place_id is lossy → null
  // per registry, so don't seed a parent we can't round-trip). Address fields
  // are emitted via PLAC ADDR sub-tags.
  // Use a single-token name so the import-time hierarchy parser doesn't
  // re-shape it into a multi-row chain.
  const place = await createPlace(db, {
    name: 'Bjorkvik',
    place_type: 'town',
    latitude: 58.81,
    longitude: 16.65,
    date_from: '1850',
    date_to: '1950',
    notes: 'Parish in Sodermanland',
    street: 'Kyrkvagen 1',
    postal_code: '64010',
    city: 'Bjorkvik',
    country: 'Sverige',
  });

  // ── Couple relationship + subtype + notes (only round-trippable for couples)
  const rel = await createRelationship(db, {
    type: 'couple',
    person1_id: p1.id,
    person2_id: p2.id,
    subtype: 'married',
    notes: 'Married in Bjorkvik church',
  });

  // ── Marriage event linked to the relationship (FAM-level event) ──────────
  const marr = await createEvent(db, {
    event_type: 'marriage',
    date_type: 'exact',
    date_value: '1880-06-14',
    date_value_end: null,
    date_original: '14 JUN 1880',
    place_id: place.id,
    relationship_id: rel.id,
    cause: null,
    value: null,
    notes: 'Witnessed by parish elders',
  });

  // ── OCCU event for P1: fact-shaped event_type so events.value round-trips.
  // Multi-field interaction: value + notes + date + place all on the same row.
  const occu = await createEvent(db, {
    event_type: 'occupation',
    value: 'Carpenter',
    cause: null,
    notes: 'Worked at the shipyard',
    date_type: 'exact',
    date_value: '1885-03-15',
    date_value_end: null,
    date_original: '15 MAR 1885',
    place_id: place.id,
  });
  await addEventParticipant(db, { event_id: occu.id, person_id: p1.id, role: 'primary' });

  // ── DEAT event for P1: cause + place + dates ─────────────────────────────
  const deat = await createEvent(db, {
    event_type: 'death',
    value: null,
    cause: 'pneumonia',
    notes: '',
    date_type: 'exact',
    date_value: '1920-11-02',
    date_value_end: null,
    date_original: '2 NOV 1920',
    place_id: place.id,
  });
  await addEventParticipant(db, { event_id: deat.id, person_id: p1.id, role: 'primary' });

  // ── Source with author + publication_info + repository (free-text) +
  // url + source_type. call_number / abstract intentionally omitted —
  // registry documents both as lossy → null.
  const src = await createSource(db, {
    title: 'Bjorkvik Parish Records',
    author: 'Pastor Olsson',
    publication_info: 'compiled 1880',
    repository: 'Riksarkivet',
    url: 'https://example.org/bjorkvik',
    source_type: 'parish-register',
  });

  // ── Citation linked to OCCU event: page + date_accessed + confidence +
  // transcription + notes. Event-level so transcription round-trips
  // (per-field test documents non-event transcription as lossy → '').
  await createCitation(db, {
    source_id: src.id,
    event_id: occu.id,
    page: 'p. 42',
    date_accessed: '2026-04-01',
    confidence: 3,
    transcription: 'Lars Eriksson, snickare, born 1850 in Bjorkvik...',
    notes: 'Direct primary evidence',
  });

  // ── Repository with full address parts ───────────────────────────────────
  const repo = await createRepository(db, {
    name: 'Riksarkivet',
    address: 'Box 12541',
    city: 'Stockholm',
    postal_code: '10229',
    state: 'Stockholms lan',
    country: 'Sverige',
    phone: '+46 8 737 63 50',
    email: 'riksarkivet@example.org',
    web: 'https://riksarkivet.se',
    notes: 'Swedish national archives',
  });

  // Link source → repository (junction row in source_repositories).
  await linkSourceRepository(db, src.id, repo.id);

  // ── Two groups with mixed-type members (3 persons + 1 place + 2 media) ───
  // Exercises the polymorphic _GROUP_LINK round-trip: every link kind in
  // the same golden seed catches xref-resolution regressions across all
  // three host kinds.
  // Give media a file_ref so the importer's is_missing flag stays 0 (otherwise
  // it flips to 1, matching the registry's media.is_missing lossy claim).
  const m1 = await createMedia(db, { title: 'Family photo 1', file_ref: 'goldenseed/photo1.jpg', is_printable: false });
  const m2 = await createMedia(db, { title: 'Family photo 2', file_ref: 'goldenseed/photo2.jpg', is_printable: false });

  const g1 = await createGroup(db, {
    name: 'Emigrant cousins',
    notes: 'Three cousins, one parish, one ship.\nNeed passenger list.',
  });
  await addGroupLink(db, g1.id, 'person', p1.id);
  await addGroupLink(db, g1.id, 'person', p2.id);
  // Add a third person purely to exercise > 2 person-links per group.
  const p3 = await createPerson(db, { sex: 'M', notes: '' }, { allowNameless: true });
  await addPersonName(db, p3.id, { given_name: 'Olof', surname: 'Larsson', name_type: 'birth', sort_order: 0 });
  await addGroupLink(db, g1.id, 'person', p3.id);
  await addGroupLink(db, g1.id, 'place', place.id);
  await addGroupLink(db, g1.id, 'media', m1.id);
  await addGroupLink(db, g1.id, 'media', m2.id);

  const g2 = await createGroup(db, {
    name: 'Verify in Riksarkivet',
    notes: '',
  });
  await addGroupLink(db, g2.id, 'person', p1.id);
  await addGroupLink(db, g2.id, 'place', place.id);

  void g2;

  // Note on intentional omissions:
  //  - research_tasks / task_links — registry: lossy, row dropped on export
  //  - media / media_links — registry: lossy on multiple columns
  //    (is_printable, link_type, sort_order); per-field test covers them.
  //    The two media rows above appear in the golden seed because they're
  //    promoted to top-level OBJE records via _GROUP linkage (and therefore
  //    re-imported); the canonicaliseDb sort + audit-strip handles them.
  // Including any of the still-lossy tables here would force aggressive
  // canonicaliseDb drops that defeat the point of the golden test (catching
  // non-lossy regressions).
}

describe('GEDCOM fidelity golden-DB-seed round-trip', async () => {
  for (const version of VERSIONS) {
    it(`${version}: comprehensive seed survives DB → GEDCOM → DB`, async () => {
      const db = await createTestDb();
      await seedComprehensive(db);
      const before = await canonicaliseDb(db);

      const after = await canonicaliseDb(await roundTrip(db, version));

      expect(after, `golden round-trip mismatch under ${version}`).toEqual(before);
    });
  }
});
