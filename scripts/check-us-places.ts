// Find US-place outliers in bengt-inte-trasig.db
// - Loads enabled gazetteers via bundled.ts
// - Pulls every place whose name contains USA / U.S.A. / America / Förenta
// - Resolves each via resolvePlace
// - Flags outliers: country != USA, ambiguous, or resolved via non-US gazetteer

import { Database } from 'node-sqlite3-wasm';
import { resolvePlace } from '../src/api/place-gazetteers/resolver';
import { getAllGazetteers } from '../src/api/place-gazetteers/bundled';
import type { Gazetteer } from '../src/api/place-gazetteers/types';

const DB_PATH = '/Users/jonasahnstedt/git/slaktforskning/export-import/bengt-inte-trasig.db';

const db = new Database(DB_PATH, { readOnly: true });

const cfgRow = db.get(`SELECT value FROM db_settings WHERE key = 'gazetteer_config'`) as
  | { value: string }
  | undefined;
const enabledIds: string[] = cfgRow ? JSON.parse(cfgRow.value).enabledGazetteers : [];
const allGaz = getAllGazetteers();
const gaz: Gazetteer[] = allGaz.filter(g => enabledIds.includes(g.id));
console.log(`Loaded ${gaz.length} of ${allGaz.length} gazetteers`);

const rows = db.all(
  `SELECT id, name FROM places
   WHERE name LIKE '%USA%' OR name LIKE '%U.S.A%' OR name LIKE '%America%' OR name LIKE '%Förenta%'
   ORDER BY name`
) as { id: string; name: string }[];

console.log(`Querying ${rows.length} US-tagged places\n`);

interface Outlier {
  name: string;
  reason: string;
  resolved: string;
  gazetteer: string;
  quality: string;
}

const outliers: Outlier[] = [];
let resolved = 0;
let unresolved = 0;

for (const row of rows) {
  const result = resolvePlace(row.name, gaz);
  if (!result) {
    unresolved++;
    outliers.push({
      name: row.name,
      reason: 'UNRESOLVED',
      resolved: '-',
      gazetteer: '-',
      quality: '-',
    });
    continue;
  }
  resolved++;
  const path = result.matchedPath.join(' > ');
  const gazId = result.gazetteer;
  const top = result.matchedPath[0]?.toLowerCase() ?? '';

  // Outlier rules:
  // 1. Resolved tree root is not USA / United States
  const isUS =
    top.includes('united states') ||
    top.includes('usa') ||
    gazId.startsWith('us-');
  if (!isUS) {
    outliers.push({
      name: row.name,
      reason: 'NOT_US',
      resolved: path,
      gazetteer: gazId,
      quality: result.matchQuality,
    });
    continue;
  }
  // 2. Ambiguous match
  if (result.matchQuality === 'ambiguous') {
    outliers.push({
      name: row.name,
      reason: 'AMBIGUOUS',
      resolved: path,
      gazetteer: gazId,
      quality: result.matchQuality,
    });
    continue;
  }
  // 3. Heuristic: state name in input but resolved state doesn't match
  // E.g. "Miami, USA" → state inferred from path; if input mentions a state
  // that disagrees with the path, flag it.
  const components = row.name.split(',').map(s => s.trim().toLowerCase());
  const pathLower = result.matchedPath.map(p => p.toLowerCase());
  // Skip pure-country forms ("USA", "California, USA", etc.) — they only have 1-2 meaningful components
  if (components.length >= 3) {
    // Look for any input component (other than last = USA) that is a known
    // state — if it's a known state and not on the path, that's a red flag.
    const stateAliases: Record<string, string> = {
      'kalifornien': 'california',
      'californien': 'california',
      'calif': 'california',
      'calif.': 'california',
      'kalifornia': 'california',
      'new york': 'new york',
      'ny': 'new york',
      'mass': 'massachusetts',
      'michican': 'michigan',
    };
    const states = new Set([
      'california', 'oregon', 'washington', 'alaska', 'hawaii', 'nevada', 'arizona', 'idaho',
      'montana', 'wyoming', 'utah', 'colorado', 'new mexico', 'texas', 'oklahoma', 'kansas',
      'nebraska', 'south dakota', 'north dakota', 'minnesota', 'iowa', 'missouri', 'arkansas',
      'louisiana', 'mississippi', 'alabama', 'tennessee', 'kentucky', 'illinois', 'wisconsin',
      'michigan', 'indiana', 'ohio', 'florida', 'georgia', 'south carolina', 'north carolina',
      'virginia', 'west virginia', 'maryland', 'delaware', 'new jersey', 'pennsylvania',
      'new york', 'connecticut', 'rhode island', 'massachusetts', 'vermont', 'new hampshire',
      'maine', 'district of columbia',
    ]);
    for (const c of components.slice(0, -1)) {
      const canonical = stateAliases[c] ?? c;
      if (states.has(canonical) && !pathLower.includes(canonical)) {
        outliers.push({
          name: row.name,
          reason: `STATE_MISMATCH (input has "${c}" → ${canonical}, path = ${pathLower.slice(1).join(' > ')})`,
          resolved: path,
          gazetteer: gazId,
          quality: result.matchQuality,
        });
        break;
      }
    }
  }
}

console.log(`Resolved: ${resolved}, Unresolved: ${unresolved}, Outliers: ${outliers.length}\n`);

const byReason = new Map<string, Outlier[]>();
for (const o of outliers) {
  const key = o.reason.split(' (')[0];
  if (!byReason.has(key)) byReason.set(key, []);
  byReason.get(key)!.push(o);
}

for (const [reason, list] of byReason) {
  console.log(`\n=== ${reason} (${list.length}) ===`);
  for (const o of list.slice(0, 80)) {
    console.log(`  "${o.name}"`);
    console.log(`    → ${o.resolved}  [${o.gazetteer}, ${o.quality}]`);
    if (o.reason !== reason) console.log(`    ${o.reason}`);
  }
  if (list.length > 80) console.log(`  ... and ${list.length - 80} more`);
}

db.close();
