import type { Database } from 'node-sqlite3-wasm';
import { loadGazetteers } from '../place-gazetteers';
import { getAllGazetteers } from '../place-gazetteers/bundled';
import type { GazetteerConfig } from '../place-gazetteers/types';
import { getImportedGazetteers } from '../gazetteers';
import { getDbSetting } from '../db_settings';
import type { CheckResult } from './check-utils';
import {
  checkBirthAfterDeath,
  checkEventAfterDeath,
  checkBurialBeforeDeath,
  checkLifespan,
  checkFutureDates,
  checkBaptismLate,
  checkDeathWithoutBirth,
  checkNoBirthEvent,
} from './checks-chronology';
import {
  checkParenthoodAge,
  checkSiblingAgeLarge,
  checkDuplicateParentChild,
  checkMultipleBiologicalParents,
  checkNoParents,
  checkCircularAncestry,
  checkDuplicateRelationship,
  checkMarriageAge,
  checkMarriageAfterDeath,
  checkMarriageBeforeBirth,
  checkCoupleWithSelf,
} from './checks-relationships';
import {
  checkPersonNoName,
  checkUnsourcedLifeEvent,
  checkInvalidDates,
  checkUnrelatedPerson,
  checkTextControlChars,
  checkMultipleBirthNames,
  checkPartialName,
  checkLikelyInlineBirthName,
  checkEventDateOriginalNonDate,
} from './checks-quality';
import { checkOrphanedSource, checkSourceMissingTitle, checkOrphanedRepository } from './checks-source';
import {
  checkSimultaneousDistantLocations,
  checkGazetteerMatchQuality,
  checkPlaceMissingComma,
  checkPlaceNameNoRegion,
} from './checks-location';
import { checkMediaFileMissing, checkOrphanedMedia, checkMediaRegionOutOfBounds, checkPhotoAfterSubjectDeath, checkPhotoBeforeSubjectBirth } from './checks-media';
import {
  checkOrphanedPlace,
  checkCircularPlaceHierarchy,
  checkPlaceCoordinatesInvalid,
  checkPlaceDatesInverted,
  checkPlaceNameLooksLikeDate,
  checkPlaceNameBrokenLansbokstav,
} from './checks-place';
import { checkPossibleDuplicatePerson, checkDuplicateIdentifier, checkDuplicatePlace, checkDuplicateMedia, checkDuplicateSource } from './checks-duplicates';
import { checkEventOutsideLifespan, checkEventOutsideLifespanForEvent } from './event_outside_lifespan';

// Re-export public types
export type { CheckResult, CheckSeverity } from './check-utils';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** A named check function that can be run individually. */
export interface NamedCheck {
  name: string;
  /**
   * Returns sync or async — the heavy place-resolver checks yield mid-loop so
   * the worker stays responsive to queued list/get-setting IPC during runAll.
   */
  fn: (db: Database, dbDir?: string) => CheckResult[] | Promise<CheckResult[]>;
  /** If true, this check is expensive and skipped for per-person runs. */
  global?: boolean;
}

/**
 * Loads the gazetteer set used by quality checks. Reads `gazetteer_config`
 * from db_settings and always merges in the language gazetteers — country/
 * region aliases like "Skottland", "Tyskland", "USA" must resolve even when
 * the user's config enables only a subset of data gazetteers (e.g.
 * `["sv-parishes"]` auto-set on Genney import). Language gazetteers only
 * inject aliases into other gazetteers — they never appear as candidates
 * themselves.
 */
function loadGazetteersForChecks(db: Database) {
  const configJson = getDbSetting(db, 'gazetteer_config');
  const gazConfig: GazetteerConfig = configJson
    ? JSON.parse(configJson)
    : { enabledGazetteers: getAllGazetteers().map(g => g.id) };
  const langIds = getAllGazetteers().filter(g => g.kind === 'language').map(g => g.id);
  const enabledWithLangs = Array.from(new Set([...gazConfig.enabledGazetteers, ...langIds]));
  const imported = getImportedGazetteers(db);
  return loadGazetteers(
    { enabledGazetteers: enabledWithLangs },
    getAllGazetteers(),
    imported,
  );
}

/**
 * Returns the ordered list of all check functions.
 * Each entry is independent — callers can run them one at a time
 * (yielding the event loop between each) to avoid blocking.
 */
export function getAllCheckFunctions(): NamedCheck[] {
  // Lazily load gazetteers once per call and share across the three
  // gazetteer-aware checks below. Loading deep-clones ~42 MB of bundled
  // data and merges language translations, so doing it three times per
  // runAll dominated post-import CPU. Sharing also keeps the resolver's
  // identity-keyed `getGlobalNameDepth` cache warm between checks.
  let cachedGazetteers: ReturnType<typeof loadGazetteersForChecks> | null = null;
  let cachedGazDb: Database | null = null;
  function gazetteersFor(db: Database) {
    if (cachedGazetteers && cachedGazDb === db) return cachedGazetteers;
    cachedGazetteers = loadGazetteersForChecks(db);
    cachedGazDb = db;
    return cachedGazetteers;
  }

  return [
    // A. Chronological — Person
    { name: 'checkBirthAfterDeath',       fn: (db) => checkBirthAfterDeath(db) },
    { name: 'checkEventAfterDeath',       fn: (db) => checkEventAfterDeath(db) },
    { name: 'checkEventOutsideLifespan',  fn: (db) => checkEventOutsideLifespan(db) },
    { name: 'checkBurialBeforeDeath',     fn: (db) => checkBurialBeforeDeath(db) },
    { name: 'checkLifespan',              fn: (db) => checkLifespan(db) },
    { name: 'checkFutureDates',           fn: (db) => checkFutureDates(db) },
    { name: 'checkBaptismLate',           fn: (db) => checkBaptismLate(db) },
    { name: 'checkDeathWithoutBirth',     fn: (db) => checkDeathWithoutBirth(db) },
    { name: 'checkNoBirthEvent',          fn: (db) => checkNoBirthEvent(db) },

    // B. Parenthood Age
    { name: 'checkParenthoodAge',         fn: (db) => checkParenthoodAge(db) },

    // C. Sibling & Family Structure
    { name: 'checkSiblingAgeLarge',       fn: (db) => checkSiblingAgeLarge(db) },
    { name: 'checkDuplicateParentChild',  fn: (db) => checkDuplicateParentChild(db) },
    { name: 'checkMultipleBiologicalParents', fn: (db) => checkMultipleBiologicalParents(db) },
    { name: 'checkNoParents',             fn: (db) => checkNoParents(db) },

    // D. Relationship Integrity
    { name: 'checkCircularAncestry',      fn: (db) => checkCircularAncestry(db) },
    { name: 'checkDuplicateRelationship', fn: (db) => checkDuplicateRelationship(db) },
    { name: 'checkMarriageAge',           fn: (db) => checkMarriageAge(db) },
    { name: 'checkMarriageAfterDeath',    fn: (db) => checkMarriageAfterDeath(db) },
    { name: 'checkMarriageBeforeBirth',   fn: (db) => checkMarriageBeforeBirth(db) },
    { name: 'checkCoupleWithSelf',        fn: (db) => checkCoupleWithSelf(db) },

    // E. Geographic
    { name: 'checkSimultaneousDistantLocations', fn: (db) => checkSimultaneousDistantLocations(db) },

    // E2. Gazetteer match quality (global)
    { name: 'checkGazetteerMatchQuality', global: true, fn: async (db) => {
      const gazetteers = gazetteersFor(db);
      const rejectedJson = getDbSetting(db, 'gazetteer_rejections');
      const rejectedPlaceIds = new Set<string>(rejectedJson ? JSON.parse(rejectedJson) : []);
      const raw = await checkGazetteerMatchQuality(db, gazetteers);
      return raw.filter(r => !r.placeIds?.some(id => rejectedPlaceIds.has(id)));
    }},

    // E3. Missing-comma in place names (global, resolver-aware)
    { name: 'checkPlaceMissingComma', global: true, fn: (db) => {
      return checkPlaceMissingComma(db, gazetteersFor(db));
    }},

    // E4. Bare unresolvable places without region context (global, resolver-aware)
    { name: 'checkPlaceNameNoRegion', global: true, fn: (db) => {
      return checkPlaceNameNoRegion(db, gazetteersFor(db));
    }},

    // F. Data Completeness
    { name: 'checkPersonNoName',          fn: (db) => checkPersonNoName(db) },
    { name: 'checkUnsourcedLifeEvent(birth)', fn: (db) => checkUnsourcedLifeEvent(db, 'birth') },
    { name: 'checkUnsourcedLifeEvent(death)', fn: (db) => checkUnsourcedLifeEvent(db, 'death') },
    { name: 'checkMultipleBirthNames',    fn: (db) => checkMultipleBirthNames(db) },
    { name: 'checkPartialName',           fn: (db) => checkPartialName(db) },
    { name: 'checkLikelyInlineBirthName', fn: (db) => checkLikelyInlineBirthName(db) },

    // G. Data Validation
    { name: 'checkInvalidDates',          fn: (db) => checkInvalidDates(db) },
    { name: 'checkEventDateOriginalNonDate', fn: (db) => checkEventDateOriginalNonDate(db) },
    { name: 'checkUnrelatedPerson',       fn: (db) => checkUnrelatedPerson(db) },
    { name: 'checkMediaFileMissing',      global: true, fn: (db, dbDir) => checkMediaFileMissing(db, dbDir) },
    { name: 'checkOrphanedMedia',         fn: (db) => checkOrphanedMedia(db) },
    { name: 'checkMediaRegionOutOfBounds', fn: (db) => checkMediaRegionOutOfBounds(db) },
    { name: 'checkPhotoAfterSubjectDeath', fn: (db) => checkPhotoAfterSubjectDeath(db) },
    { name: 'checkPhotoBeforeSubjectBirth', fn: (db) => checkPhotoBeforeSubjectBirth(db) },
    { name: 'checkOrphanedSource',        fn: (db) => checkOrphanedSource(db) },
    { name: 'checkSourceMissingTitle',    fn: (db) => checkSourceMissingTitle(db) },
    { name: 'checkOrphanedRepository',    fn: (db) => checkOrphanedRepository(db) },
    { name: 'checkTextControlChars',      fn: (db) => checkTextControlChars(db) },
    { name: 'checkOrphanedPlace',         fn: (db) => checkOrphanedPlace(db) },
    { name: 'checkCircularPlaceHierarchy', fn: (db) => checkCircularPlaceHierarchy(db) },
    { name: 'checkPlaceCoordinatesInvalid', fn: (db) => checkPlaceCoordinatesInvalid(db) },
    { name: 'checkPlaceDatesInverted',    fn: (db) => checkPlaceDatesInverted(db) },
    { name: 'checkPlaceNameLooksLikeDate', fn: (db) => checkPlaceNameLooksLikeDate(db) },
    { name: 'checkPlaceNameBrokenLansbokstav', fn: (db) => checkPlaceNameBrokenLansbokstav(db) },

    // H. Duplicates
    { name: 'checkPossibleDuplicatePerson', fn: (db) => checkPossibleDuplicatePerson(db) },
    { name: 'checkDuplicateIdentifier',     fn: (db) => checkDuplicateIdentifier(db) },
    { name: 'checkDuplicatePlace',          fn: (db) => checkDuplicatePlace(db) },
    { name: 'checkDuplicateMedia',          fn: (db) => checkDuplicateMedia(db) },
    { name: 'checkDuplicateSource',         fn: (db) => checkDuplicateSource(db) },
  ];
}

async function runAllCheckFunctions(db: Database, dbDir?: string, opts?: { skipGlobal?: boolean }): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  console.log('[checks] runAllCheckFunctions starting');
  const t0 = Date.now();

  for (const check of getAllCheckFunctions()) {
    if (opts?.skipGlobal && check.global) continue;
    console.log(`[checks] ${check.name}: starting`);
    const start = Date.now();
    const res = await check.fn(db, dbDir);
    const ms = Date.now() - start;
    console.log(`[checks] ${check.name}: done in ${ms}ms → ${res.length} result(s)`);
    results.push(...res);
  }

  console.log(`[checks] total: ${Date.now() - t0}ms`);
  return results;
}

export async function runAllChecks(db: Database, dbDir?: string): Promise<CheckResult[]> {
  return runAllCheckFunctions(db, dbDir);
}

export async function runChecksForPerson(db: Database, personId: string, dbDir?: string): Promise<CheckResult[]> {
  // Skip expensive global checks (media file existence, gazetteer matching) that
  // aren't person-scoped and cause multi-minute hangs on large databases.
  const all = await runAllCheckFunctions(db, dbDir, { skipGlobal: true });
  return all.filter(r => r.personIds.includes(personId));
}

export async function runChecksForPlace(db: Database, placeId: string, dbDir?: string): Promise<CheckResult[]> {
  // Include global checks — gazetteer match quality is the main place-scoped signal.
  const all = await runAllCheckFunctions(db, dbDir);
  return all.filter(r => r.placeIds?.includes(placeId));
}

export async function runChecksForMedia(db: Database, mediaId: string, dbDir?: string): Promise<CheckResult[]> {
  // Include global checks — media file existence is the main media-scoped signal.
  const all = await runAllCheckFunctions(db, dbDir);
  return all.filter(r => r.mediaIds?.includes(mediaId));
}

/**
 * Run only the checks that apply to a single event. Used by the save-time
 * toast hook in event-creating modals — runs synchronously, no gazetteer or
 * media-file I/O, returns only the rows that would have appeared in the
 * Quality view for this event.
 */
export function runChecksForEvent(db: Database, eventId: string): CheckResult[] {
  return checkEventOutsideLifespanForEvent(db, eventId);
}
