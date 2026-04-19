import type { Database } from 'node-sqlite3-wasm';
import { queryAll } from '../db';
import type { CheckResult, CheckSeverity } from './check-utils';
import { findDuplicates } from '../duplicates';

export function checkPossibleDuplicatePerson(db: Database): CheckResult[] {
  const candidates = findDuplicates(db);
  return candidates.map(c => ({
    code: 'POSSIBLE_DUPLICATE_PERSON',
    severity: 'notice' as CheckSeverity,
    message: `Möjliga dubblettpersoner (poäng ${c.score})`,
    messageParams: { score: c.score, count: 2 },
    personIds: [c.person1_id, c.person2_id],
  }));
}
