import type { Database } from 'node-sqlite3-wasm';
import type { CheckResult } from './check-utils';

// Re-export public types
export type { CheckResult, CheckSeverity } from './check-utils';

// Import all check functions from category modules
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
  checkOrphanedSource,
  checkTextControlChars,
} from './checks-quality';

import {
  checkSimultaneousDistantLocations,
  checkMediaFileMissing,
  checkGazetteerMatchQuality,
} from './checks-location';

import { loadGazetteers, getAllGazetteers } from '../place-gazetteers';
import { getImportedGazetteers } from '../gazetteers';
import { getDbSetting } from '../db_settings';
import type { GazetteerConfig } from '../place-gazetteers/types';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function runAllCheckFunctions(db: Database, dbDir?: string): CheckResult[] {
  const results: CheckResult[] = [];
  console.log('[checks] runAllCheckFunctions starting');
  const t0 = Date.now();
  function run(name: string, fn: () => CheckResult[]): void {
    const start = Date.now();
    const res = fn();
    const ms = Date.now() - start;
    console.log(`[checks] ${name}: ${ms}ms → ${res.length} result(s)`);
    results.push(...res);
  }

  // A. Chronological — Person
  run('checkBirthAfterDeath',       () => checkBirthAfterDeath(db));
  run('checkEventAfterDeath',       () => checkEventAfterDeath(db));
  run('checkBurialBeforeDeath',     () => checkBurialBeforeDeath(db));
  run('checkLifespan',              () => checkLifespan(db));
  run('checkFutureDates',           () => checkFutureDates(db));
  run('checkBaptismLate',           () => checkBaptismLate(db));
  run('checkDeathWithoutBirth',     () => checkDeathWithoutBirth(db));
  run('checkNoBirthEvent',          () => checkNoBirthEvent(db));

  // B. Parenthood Age
  run('checkParenthoodAge',         () => checkParenthoodAge(db));

  // C. Sibling & Family Structure
  run('checkSiblingAgeLarge',       () => checkSiblingAgeLarge(db));
  run('checkDuplicateParentChild',  () => checkDuplicateParentChild(db));
  run('checkMultipleBiologicalParents', () => checkMultipleBiologicalParents(db));
  run('checkNoParents',             () => checkNoParents(db));

  // D. Relationship Integrity
  run('checkCircularAncestry',      () => checkCircularAncestry(db));
  run('checkDuplicateRelationship', () => checkDuplicateRelationship(db));
  run('checkMarriageAge',           () => checkMarriageAge(db));
  run('checkMarriageAfterDeath',    () => checkMarriageAfterDeath(db));
  run('checkMarriageBeforeBirth',   () => checkMarriageBeforeBirth(db));
  run('checkCoupleWithSelf',        () => checkCoupleWithSelf(db));

  // E. Geographic
  run('checkSimultaneousDistantLocations', () => checkSimultaneousDistantLocations(db));

  // E2. Gazetteer match quality
  const configJson = getDbSetting(db, 'gazetteer_config');
  const gazConfig: GazetteerConfig = configJson
    ? JSON.parse(configJson)
    : { enabledGazetteers: getAllGazetteers().map(g => g.id) };
  const imported = getImportedGazetteers(db);
  const gazetteers = loadGazetteers(gazConfig, imported);
  const rejectedJson = getDbSetting(db, 'gazetteer_rejections');
  const rejectedPlaceIds = new Set<string>(rejectedJson ? JSON.parse(rejectedJson) : []);
  run('checkGazetteerMatchQuality', () => {
    const raw = checkGazetteerMatchQuality(db, gazetteers);
    return raw.filter(r => !r.placeIds?.some(id => rejectedPlaceIds.has(id)));
  });

  // F. Data Completeness
  run('checkNoName',                () => checkNoName(db));
  run('checkLivingWithDeathEvent',  () => checkLivingWithDeathEvent(db));
  run('checkNotLivingWithoutDeathEvent', () => checkNotLivingWithoutDeathEvent(db));
  run('checkUnsourcedLifeEvent(birth)', () => checkUnsourcedLifeEvent(db, 'birth'));
  run('checkUnsourcedLifeEvent(death)', () => checkUnsourcedLifeEvent(db, 'death'));

  // G. Data Validation
  run('checkInvalidDates',          () => checkInvalidDates(db));
  run('checkUnrelatedPerson',       () => checkUnrelatedPerson(db));
  run('checkMediaFileMissing',      () => checkMediaFileMissing(db, dbDir));
  run('checkOrphanedSource',        () => checkOrphanedSource(db));
  run('checkTextControlChars',      () => checkTextControlChars(db));

  console.log(`[checks] total: ${Date.now() - t0}ms`);
  return results;
}

export function runAllChecks(db: Database, dbDir?: string): CheckResult[] {
  return runAllCheckFunctions(db, dbDir);
}

export function runChecksForPerson(db: Database, personId: string, dbDir?: string): CheckResult[] {
  return runAllCheckFunctions(db, dbDir).filter(r => r.personIds.includes(personId));
}
