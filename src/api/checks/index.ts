import type { Database } from 'node-sqlite3-wasm';
import { loadGazetteers, getAllGazetteers } from '../place-gazetteers';
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
  checkNoName,
  checkLivingWithDeathEvent,
  checkNotLivingWithoutDeathEvent,
  checkUnsourcedLifeEvent,
  checkInvalidDates,
  checkUnrelatedPerson,
  checkTextControlChars,
  checkMultipleBirthNames,
  checkPartialName,
  checkLivingOver120,
} from './checks-quality';
import { checkOrphanedSource } from './checks-source';
import {
  checkSimultaneousDistantLocations,
  checkGazetteerMatchQuality,
} from './checks-location';
import { checkMediaFileMissing, checkOrphanedMedia, checkMediaRegionOutOfBounds, checkPhotoAfterSubjectDeath, checkPhotoBeforeSubjectBirth } from './checks-media';
import { checkOrphanedPlace, checkCircularPlaceHierarchy, checkPlaceCoordinatesInvalid, checkPlaceDatesInverted } from './checks-place';

// Re-export public types
export type { CheckResult, CheckSeverity } from './check-utils';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** A named check function that can be run individually. */
export interface NamedCheck {
  name: string;
  fn: (db: Database, dbDir?: string) => CheckResult[];
  /** If true, this check is expensive and skipped for per-person runs. */
  global?: boolean;
}

/**
 * Returns the ordered list of all check functions.
 * Each entry is independent — callers can run them one at a time
 * (yielding the event loop between each) to avoid blocking.
 */
export function getAllCheckFunctions(): NamedCheck[] {
  return [
    // A. Chronological — Person
    { name: 'checkBirthAfterDeath',       fn: (db) => checkBirthAfterDeath(db) },
    { name: 'checkEventAfterDeath',       fn: (db) => checkEventAfterDeath(db) },
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
    { name: 'checkGazetteerMatchQuality', global: true, fn: (db) => {
      const configJson = getDbSetting(db, 'gazetteer_config');
      const gazConfig: GazetteerConfig = configJson
        ? JSON.parse(configJson)
        : { enabledGazetteers: getAllGazetteers().map(g => g.id) };
      const imported = getImportedGazetteers(db);
      const gazetteers = loadGazetteers(gazConfig, imported);
      const rejectedJson = getDbSetting(db, 'gazetteer_rejections');
      const rejectedPlaceIds = new Set<string>(rejectedJson ? JSON.parse(rejectedJson) : []);
      const raw = checkGazetteerMatchQuality(db, gazetteers);
      return raw.filter(r => !r.placeIds?.some(id => rejectedPlaceIds.has(id)));
    }},

    // F. Data Completeness
    { name: 'checkNoName',                fn: (db) => checkNoName(db) },
    { name: 'checkLivingWithDeathEvent',  fn: (db) => checkLivingWithDeathEvent(db) },
    { name: 'checkNotLivingWithoutDeathEvent', fn: (db) => checkNotLivingWithoutDeathEvent(db) },
    { name: 'checkUnsourcedLifeEvent(birth)', fn: (db) => checkUnsourcedLifeEvent(db, 'birth') },
    { name: 'checkUnsourcedLifeEvent(death)', fn: (db) => checkUnsourcedLifeEvent(db, 'death') },
    { name: 'checkMultipleBirthNames',    fn: (db) => checkMultipleBirthNames(db) },
    { name: 'checkPartialName',           fn: (db) => checkPartialName(db) },
    { name: 'checkLivingOver120',         fn: (db) => checkLivingOver120(db) },

    // G. Data Validation
    { name: 'checkInvalidDates',          fn: (db) => checkInvalidDates(db) },
    { name: 'checkUnrelatedPerson',       fn: (db) => checkUnrelatedPerson(db) },
    { name: 'checkMediaFileMissing',      global: true, fn: (db, dbDir) => checkMediaFileMissing(db, dbDir) },
    { name: 'checkOrphanedMedia',         fn: (db) => checkOrphanedMedia(db) },
    { name: 'checkMediaRegionOutOfBounds', fn: (db) => checkMediaRegionOutOfBounds(db) },
    { name: 'checkPhotoAfterSubjectDeath', fn: (db) => checkPhotoAfterSubjectDeath(db) },
    { name: 'checkPhotoBeforeSubjectBirth', fn: (db) => checkPhotoBeforeSubjectBirth(db) },
    { name: 'checkOrphanedSource',        fn: (db) => checkOrphanedSource(db) },
    { name: 'checkTextControlChars',      fn: (db) => checkTextControlChars(db) },
    { name: 'checkOrphanedPlace',         fn: (db) => checkOrphanedPlace(db) },
    { name: 'checkCircularPlaceHierarchy', fn: (db) => checkCircularPlaceHierarchy(db) },
    { name: 'checkPlaceCoordinatesInvalid', fn: (db) => checkPlaceCoordinatesInvalid(db) },
    { name: 'checkPlaceDatesInverted',    fn: (db) => checkPlaceDatesInverted(db) },
  ];
}

function runAllCheckFunctions(db: Database, dbDir?: string, opts?: { skipGlobal?: boolean }): CheckResult[] {
  const results: CheckResult[] = [];
  console.log('[checks] runAllCheckFunctions starting');
  const t0 = Date.now();

  for (const check of getAllCheckFunctions()) {
    if (opts?.skipGlobal && check.global) continue;
    const start = Date.now();
    const res = check.fn(db, dbDir);
    const ms = Date.now() - start;
    console.log(`[checks] ${check.name}: ${ms}ms → ${res.length} result(s)`);
    results.push(...res);
  }

  console.log(`[checks] total: ${Date.now() - t0}ms`);
  return results;
}

export function runAllChecks(db: Database, dbDir?: string): CheckResult[] {
  return runAllCheckFunctions(db, dbDir);
}

export function runChecksForPerson(db: Database, personId: string, dbDir?: string): CheckResult[] {
  // Skip expensive global checks (media file existence, gazetteer matching) that
  // aren't person-scoped and cause multi-minute hangs on large databases.
  return runAllCheckFunctions(db, dbDir, { skipGlobal: true })
    .filter(r => r.personIds.includes(personId));
}

export function runChecksForPlace(db: Database, placeId: string, dbDir?: string): CheckResult[] {
  // Include global checks — gazetteer match quality is the main place-scoped signal.
  return runAllCheckFunctions(db, dbDir)
    .filter(r => r.placeIds?.includes(placeId));
}

export function runChecksForMedia(db: Database, mediaId: string, dbDir?: string): CheckResult[] {
  // Include global checks — media file existence is the main media-scoped signal.
  return runAllCheckFunctions(db, dbDir)
    .filter(r => r.mediaIds?.includes(mediaId));
}
