/**
 * Build Swedish language gazetteer from GeoNames alternate names.
 *
 * Produces ONE gazetteer:
 *   lang-sv-geonames — Swedish translations for countries, admin1 divisions,
 *                      and major cities (population >= 100,000)
 *
 * Only entries that DIFFER from the English canonical name in world-countries.json
 * and world-admin1.json are included.
 *
 * Source: GeoNames (https://www.geonames.org/) — CC BY 4.0
 *
 * Usage: npx tsx scripts/build-lang-sv-geonames.ts
 *
 * Prerequisites:
 *   curl -o /tmp/alternateNamesV2.zip https://download.geonames.org/export/dump/alternateNamesV2.zip
 *   unzip -o /tmp/alternateNamesV2.zip -d /tmp/geonames_altnames/
 *   curl -o /tmp/countryInfo.txt https://download.geonames.org/export/dump/countryInfo.txt
 *   curl -o /tmp/admin1CodesASCII.txt https://download.geonames.org/export/dump/admin1CodesASCII.txt
 *   curl -o /tmp/cities15000.zip https://download.geonames.org/export/dump/cities15000.zip
 *   unzip -o /tmp/cities15000.zip -d /tmp/
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import type { GazetteerNode } from '../src/api/place-gazetteers/types';

const DATA_DIR = path.join(__dirname, '..', 'src', 'api', 'place-gazetteers', 'data');

const ALTNAMES_FILE = '/tmp/geonames_altnames/alternateNamesV2.txt';
const COUNTRY_INFO_FILE = '/tmp/countryInfo.txt';
const ADMIN1_FILE = '/tmp/admin1CodesASCII.txt';
const CITIES_FILE = '/tmp/cities15000.txt';
const CITY_MIN_POPULATION = 100_000;

const WORLD_COUNTRIES_FILE = path.join(DATA_DIR, 'world-countries.json');
const WORLD_ADMIN1_FILE = path.join(DATA_DIR, 'world-admin1.json');

// ── Types ────────────────────────────────────────────────────────────

interface Gazetteer {
  id: string;
  root: GazetteerNode;
}

// ── Parsers ─────────────────────────────────────────────────────────

/**
 * Parse countryInfo.txt and return a map from geonameId → ISO2 code.
 * Also returns a map from ISO2 → geonameId for cross-referencing.
 */
function parseCountryInfo(filePath: string): {
  geonameIdToIso2: Map<string, string>;
  iso2ToGeonameId: Map<string, string>;
} {
  const content = fs.readFileSync(filePath, 'utf-8');
  const geonameIdToIso2 = new Map<string, string>();
  const iso2ToGeonameId = new Map<string, string>();

  for (const line of content.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const cols = line.split('\t');
    const iso2 = cols[0];
    const geonameId = cols[16]; // column 16 (0-indexed)
    if (!iso2 || !geonameId) continue;
    geonameIdToIso2.set(geonameId.trim(), iso2);
    iso2ToGeonameId.set(iso2, geonameId.trim());
  }

  return { geonameIdToIso2, iso2ToGeonameId };
}

/**
 * Parse admin1CodesASCII.txt and return a map from geonameId → "CC.admin1Code".
 */
function parseAdmin1Codes(filePath: string): Map<string, string> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const geonameIdToCode = new Map<string, string>();

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    const cols = line.split('\t');
    // columns: 0=code (CC.admin1), 1=name, 2=nameAscii, 3=geonameId
    const code = cols[0];
    const geonameId = cols[3];
    if (!code || !geonameId) continue;
    geonameIdToCode.set(geonameId.trim(), code);
  }

  return geonameIdToCode;
}

/**
 * Parse cities15000.txt and return cities with population >= threshold.
 * Returns: geonameId -> { name, iso2, admin1Code, population }
 */
function parseCities(filePath: string, minPopulation: number): Map<string, {
  name: string; iso2: string; admin1Code: string; population: number;
}> {
  const result = new Map<string, { name: string; iso2: string; admin1Code: string; population: number }>();
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    const cols = line.split('\t');
    // cities15000 columns:
    // 0=geonameId, 1=name, 2=asciiName, 3=altNames, 4=lat, 5=lon, 6=featureClass,
    // 7=featureCode, 8=countryCode, 9=cc2, 10=admin1Code, 11=admin2, 12=admin3,
    // 13=admin4, 14=population, ...
    const geonameId = cols[0];
    const name = cols[1];
    const featureClass = cols[6];
    const iso2 = cols[8];
    const admin1Code = cols[10];
    const population = parseInt(cols[14] ?? '0', 10) || 0;
    if (featureClass !== 'P') continue;
    if (population < minPopulation) continue;
    if (!geonameId || !name || !iso2) continue;
    result.set(geonameId, { name, iso2, admin1Code: admin1Code ?? '', population });
  }
  return result;
}

/**
 * Read world-countries.json and world-admin1.json and build lookup structures:
 * - countryNames: set of canonical English country names
 * - iso2ToCountryName: map from ISO2 code → canonical country name
 * - admin1CodeToAdmin1Name: map from "ISO2::admin1NameLower" → canonical admin1 name
 */
function readGazetteers(
  countriesPath: string,
  admin1Path: string,
): {
  countryNames: Set<string>;
  iso2ToCountryName: Map<string, string>;
  admin1CodeToAdmin1Name: Map<string, string>;
  countryNameToContinent: Map<string, string>;
} {
  const countriesGaz: Gazetteer = JSON.parse(fs.readFileSync(countriesPath, 'utf-8'));
  const admin1Gaz: Gazetteer = JSON.parse(fs.readFileSync(admin1Path, 'utf-8'));

  const countryNames = new Set<string>();
  const iso2ToCountryName = new Map<string, string>();
  const countryNameToContinent = new Map<string, string>();

  // Extract country info from world-countries.json (post-Phase-2.1 shape:
  // root.children = continents, each continent's children = countries).
  for (const continentNode of countriesGaz.root.children ?? []) {
    const continentName = continentNode.name;
    for (const node of continentNode.children ?? []) {
      countryNames.add(node.name);
      countryNameToContinent.set(node.name, continentName);
      for (const alias of node.aliases ?? []) {
        if (alias.length === 2) {
          iso2ToCountryName.set(alias, node.name);
        }
      }
    }
  }

  // Extract admin1 info from world-admin1.json (post-Phase-2.2 shape:
  // root.children = continents, each continent's children = countries with admin1).
  // Key: "ISO2::admin1NameLower", Value: canonical admin1 name.
  const admin1CodeToAdmin1Name = new Map<string, string>();
  for (const continentNode of admin1Gaz.root.children ?? []) {
    for (const countryNode of continentNode.children ?? []) {
      let iso2: string | null = null;
      for (const alias of countryNode.aliases ?? []) {
        if (alias.length === 2) { iso2 = alias; break; }
      }
      if (!iso2) continue;
      for (const admin1Node of countryNode.children ?? []) {
        const lookupKey = `${iso2}::${admin1Node.name.toLowerCase()}`;
        admin1CodeToAdmin1Name.set(lookupKey, admin1Node.name);
      }
    }
  }

  return {
    countryNames,
    iso2ToCountryName,
    admin1CodeToAdmin1Name,
    countryNameToContinent,
  };
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  // Check prerequisites
  for (const file of [ALTNAMES_FILE, COUNTRY_INFO_FILE, ADMIN1_FILE, CITIES_FILE, WORLD_COUNTRIES_FILE, WORLD_ADMIN1_FILE]) {
    if (!fs.existsSync(file)) {
      console.error(`Required file not found: ${file}`);
      if (file === ALTNAMES_FILE) {
        console.error('  Run: curl -o /tmp/alternateNamesV2.zip https://download.geonames.org/export/dump/alternateNamesV2.zip');
        console.error('       unzip -o /tmp/alternateNamesV2.zip -d /tmp/geonames_altnames/');
      } else if (file === COUNTRY_INFO_FILE) {
        console.error('  Run: curl -o /tmp/countryInfo.txt https://download.geonames.org/export/dump/countryInfo.txt');
      } else if (file === ADMIN1_FILE) {
        console.error('  Run: curl -o /tmp/admin1CodesASCII.txt https://download.geonames.org/export/dump/admin1CodesASCII.txt');
      } else if (file === CITIES_FILE) {
        console.error('  Run: curl -o /tmp/cities15000.zip https://download.geonames.org/export/dump/cities15000.zip');
        console.error('       unzip -o /tmp/cities15000.zip -d /tmp/');
      } else {
        console.error('  Run build-world.ts first to generate world-countries.json and world-admin1.json');
      }
      process.exit(1);
    }
  }

  console.log('Parsing reference data...');
  const { geonameIdToIso2, iso2ToGeonameId: _iso2ToGeonameId } = parseCountryInfo(COUNTRY_INFO_FILE);
  const geonameIdToAdmin1Code = parseAdmin1Codes(ADMIN1_FILE);

  console.log(`  Country geonameIds: ${geonameIdToIso2.size}`);
  console.log(`  Admin1 geonameIds: ${geonameIdToAdmin1Code.size}`);

  console.log('Reading existing gazetteers...');
  const {
    countryNames,
    iso2ToCountryName,
    admin1CodeToAdmin1Name,
    countryNameToContinent,
  } = readGazetteers(WORLD_COUNTRIES_FILE, WORLD_ADMIN1_FILE);

  console.log(`  Canonical countries: ${countryNames.size}`);

  // Build reverse maps:
  // admin1Code ("DE.01") → canonical country name + canonical admin1 name
  // We need to parse admin1CodesASCII.txt again to get names alongside codes,
  // then match to world-admin1.json entries.

  // Read admin1 name mapping (code → ascii name)
  const admin1CodeToAsciiName = new Map<string, string>();
  const admin1Txt = fs.readFileSync(ADMIN1_FILE, 'utf-8');
  for (const line of admin1Txt.split('\n')) {
    if (!line.trim()) continue;
    const cols = line.split('\t');
    const code = cols[0]; // e.g. "DE.01"
    const name = cols[1]; // original name
    const asciiName = cols[2]; // ASCII name
    if (!code || !name) continue;
    admin1CodeToAsciiName.set(code, name);
    // Also store by ascii for fallback
    if (asciiName) admin1CodeToAsciiName.set(`${code}::ascii`, asciiName);
  }

  // Build a mapping from admin1Code → canonical path key in world-admin1
  // Strategy: match by ISO2 + name
  const admin1CodeToPathKey = new Map<string, { countryName: string; admin1Name: string }>();

  for (const [code, name] of admin1CodeToAsciiName) {
    if (code.includes('::')) continue; // skip ascii variants
    const dotIdx = code.indexOf('.');
    if (dotIdx < 0) continue;
    const iso2 = code.substring(0, dotIdx);
    const countryName = iso2ToCountryName.get(iso2);
    if (!countryName) continue;

    // Try exact match in world-admin1
    const lookupKey = `${iso2}::${name.toLowerCase()}`;
    if (admin1CodeToAdmin1Name.has(lookupKey)) {
      admin1CodeToPathKey.set(code, {
        countryName,
        admin1Name: admin1CodeToAdmin1Name.get(lookupKey)!,
      });
      continue;
    }

    // Try ASCII name match
    const asciiName = admin1CodeToAsciiName.get(`${code}::ascii`);
    if (asciiName) {
      const lookupKeyAscii = `${iso2}::${asciiName.toLowerCase()}`;
      if (admin1CodeToAdmin1Name.has(lookupKeyAscii)) {
        admin1CodeToPathKey.set(code, {
          countryName,
          admin1Name: admin1CodeToAdmin1Name.get(lookupKeyAscii)!,
        });
      }
    }
  }

  console.log(`  Admin1 codes matched to canonical paths: ${admin1CodeToPathKey.size}`);

  console.log('Parsing cities15000.txt for cities >= 100k population...');
  const citiesByGeonameId = parseCities(CITIES_FILE, CITY_MIN_POPULATION);
  console.log(`  Cities: ${citiesByGeonameId.size}`);

  // Build set of all geonameIds we care about
  const countryGeonameIds = new Set(geonameIdToIso2.keys());
  const admin1GeonameIds = new Set(geonameIdToAdmin1Code.keys());
  const allRelevantIds = new Set([
    ...countryGeonameIds,
    ...admin1GeonameIds,
    ...citiesByGeonameId.keys(),
  ]);

  console.log(`\nParsing alternateNamesV2.txt for Swedish names (this may take a minute)...`);

  // Collect Swedish alternate names for relevant geonameIds
  // geonameId → best Swedish name (prefer isPreferredName=1, then isShortName=1)
  const svCountryNames = new Map<string, { name: string; preferred: boolean; short: boolean }[]>();
  const svAdmin1Names = new Map<string, { name: string; preferred: boolean; short: boolean }[]>();
  const svCityNames = new Map<string, { name: string; preferred: boolean; short: boolean }[]>();

  let linesRead = 0;
  let svEntriesFound = 0;
  let relevantSvEntries = 0;

  const rl = readline.createInterface({
    input: fs.createReadStream(ALTNAMES_FILE),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    linesRead++;
    if (linesRead % 1_000_000 === 0) {
      process.stdout.write(`  ${(linesRead / 1_000_000).toFixed(0)}M lines read...\r`);
    }

    // columns: 0=alternateNameId, 1=geonameid, 2=isolanguage, 3=alternate name,
    //          4=isPreferredName, 5=isShortName, 6=isColloquial, 7=isHistoric
    const tabIdx1 = line.indexOf('\t');
    if (tabIdx1 < 0) continue;
    const tabIdx2 = line.indexOf('\t', tabIdx1 + 1);
    if (tabIdx2 < 0) continue;
    const tabIdx3 = line.indexOf('\t', tabIdx2 + 1);
    if (tabIdx3 < 0) continue;
    const tabIdx4 = line.indexOf('\t', tabIdx3 + 1);
    const tabIdx5 = tabIdx4 >= 0 ? line.indexOf('\t', tabIdx4 + 1) : -1;
    const tabIdx6 = tabIdx5 >= 0 ? line.indexOf('\t', tabIdx5 + 1) : -1;
    const tabIdx7 = tabIdx6 >= 0 ? line.indexOf('\t', tabIdx6 + 1) : -1;

    const isolanguage = line.substring(tabIdx2 + 1, tabIdx3);
    if (isolanguage !== 'sv') continue;

    svEntriesFound++;

    const geonameId = line.substring(tabIdx1 + 1, tabIdx2);
    if (!allRelevantIds.has(geonameId)) continue;

    relevantSvEntries++;

    const altName = line.substring(tabIdx3 + 1, tabIdx4 >= 0 ? tabIdx4 : undefined);
    const isPreferred = tabIdx4 >= 0 && tabIdx5 >= 0 ? line.substring(tabIdx4 + 1, tabIdx5) === '1' : false;
    const isShort = tabIdx5 >= 0 && tabIdx6 >= 0 ? line.substring(tabIdx5 + 1, tabIdx6) === '1' : false;
    const isColloquial = tabIdx6 >= 0 && tabIdx7 >= 0 ? line.substring(tabIdx6 + 1, tabIdx7) === '1' : false;
    const isHistoric = tabIdx7 >= 0 ? line.substring(tabIdx7 + 1).trim() === '1' : false;

    // Skip colloquial and historic names
    if (isColloquial || isHistoric) continue;

    const entry = { name: altName.trim(), preferred: isPreferred, short: isShort };

    if (countryGeonameIds.has(geonameId)) {
      if (!svCountryNames.has(geonameId)) svCountryNames.set(geonameId, []);
      svCountryNames.get(geonameId)!.push(entry);
    } else if (admin1GeonameIds.has(geonameId)) {
      if (!svAdmin1Names.has(geonameId)) svAdmin1Names.set(geonameId, []);
      svAdmin1Names.get(geonameId)!.push(entry);
    } else if (citiesByGeonameId.has(geonameId)) {
      if (!svCityNames.has(geonameId)) svCityNames.set(geonameId, []);
      svCityNames.get(geonameId)!.push(entry);
    }
  }

  console.log(`\n  Total lines read: ${linesRead.toLocaleString()}`);
  console.log(`  Swedish entries found: ${svEntriesFound.toLocaleString()}`);
  console.log(`  Relevant Swedish entries: ${relevantSvEntries.toLocaleString()}`);
  console.log(`  Countries with sv names: ${svCountryNames.size}`);
  console.log(`  Admin1 divisions with sv names: ${svAdmin1Names.size}`);
  console.log(`  Cities with sv names: ${svCityNames.size}`);

  // Pick best name from multiple entries:
  // Priority: isPreferred=1 first, then isShort=1, then first found
  function pickBestName(entries: { name: string; preferred: boolean; short: boolean }[]): string {
    const preferred = entries.filter(e => e.preferred);
    if (preferred.length > 0) return preferred[0].name;
    const short = entries.filter(e => e.short);
    if (short.length > 0) return short[0].name;
    return entries[0].name;
  }

  // Build translations output
  // Path-key format: canonical merged-tree path joined by ' › ' (U+203A) —
  // mergeTranslations in merge.ts splits on this separator. Every key starts
  // at 'World' (or 'World (Historical)' for sibling tree).
  // Structure (single namespace; the target id key is informational):
  //   { '__merged__': { 'World › Europe › Denmark': ['Danmark'], ... } }
  const SEP = ' › ';
  const translations: Record<string, string[]> = {};

  // Countries — keyed 'World › <continent> › <country>'.
  for (const [geonameId, entries] of svCountryNames) {
    const iso2 = geonameIdToIso2.get(geonameId);
    if (!iso2) continue;
    const canonicalName = iso2ToCountryName.get(iso2);
    if (!canonicalName) continue;
    const continent = countryNameToContinent.get(canonicalName);
    if (!continent) continue;

    const svName = pickBestName(entries);
    if (svName === canonicalName) continue;

    translations[`World${SEP}${continent}${SEP}${canonicalName}`] = [svName];
  }

  // Admin1 — keyed 'World › <continent> › <country> › <admin1>'.
  for (const [geonameId, entries] of svAdmin1Names) {
    const admin1Code = geonameIdToAdmin1Code.get(geonameId);
    if (!admin1Code) continue;
    const pathInfo = admin1CodeToPathKey.get(admin1Code);
    if (!pathInfo) continue;
    const continent = countryNameToContinent.get(pathInfo.countryName);
    if (!continent) continue;

    const svName = pickBestName(entries);
    if (svName === pathInfo.admin1Name) continue;

    translations[`World${SEP}${continent}${SEP}${pathInfo.countryName}${SEP}${pathInfo.admin1Name}`] = [svName];
  }

  // Cities — keyed 'World › <continent> › <country> › <admin1> › <city>'
  // (or shorter chain when admin1 is unknown). The merge engine's lookup
  // silently skips unmatched paths, so unknown city paths are harmless.
  let cityCount = 0;
  for (const [geonameId, entries] of svCityNames) {
    const city = citiesByGeonameId.get(geonameId);
    if (!city) continue;
    const canonicalCountryName = iso2ToCountryName.get(city.iso2);
    if (!canonicalCountryName) continue;
    const continent = countryNameToContinent.get(canonicalCountryName);
    if (!continent) continue;

    const admin1Lookup = `${city.iso2}.${city.admin1Code}`;
    const admin1Info = admin1CodeToPathKey.get(admin1Lookup);

    const svName = pickBestName(entries);
    if (svName === city.name) continue;

    const pathKey = admin1Info
      ? `World${SEP}${continent}${SEP}${canonicalCountryName}${SEP}${admin1Info.admin1Name}${SEP}${city.name}`
      : `World${SEP}${continent}${SEP}${canonicalCountryName}${SEP}${city.name}`;
    translations[pathKey] = [svName];
    cityCount++;
  }

  console.log(`  Cities with exonyms: ${cityCount}`);
  console.log(`\nTranslations:`);
  console.log(`  Total keys: ${Object.keys(translations).length}`);

  // Spot-check
  const checks = [
    { key: `World${SEP}Europe${SEP}Denmark`, expected: 'Danmark' },
    { key: `World${SEP}Europe${SEP}Germany`, expected: 'Tyskland' },
    { key: `World${SEP}South America${SEP}Brazil`, expected: 'Brasilien' },
  ];
  for (const check of checks) {
    const val = translations[check.key];
    const found = val ? val[0] : '(missing)';
    const ok = val && val[0] === check.expected ? 'ok' : 'FAIL';
    console.log(`  ${ok} ${check.key} -> ${found} (expected: ${check.expected})`);
  }

  // Build output gazetteer
  const today = new Date().toISOString().slice(0, 10);

  const langGazetteer = {
    id: 'lang-sv-geonames',
    name: 'Swedish place names (GeoNames)',
    locale: 'sv',
    kind: 'language',
    description: 'Swedish translations for countries, admin1 divisions, and major cities (canonical-path keys)',
    source: {
      name: 'GeoNames',
      url: 'https://www.geonames.org/',
      license: 'CC BY 4.0',
      fetched: today,
    },
    root: { name: 'sv', type: 'language', lat: 0, lon: 0 },
    translations: {
      __merged__: sortedObject(translations),
    },
  };

  function sortedObject(obj: Record<string, string[]>): Record<string, string[]> {
    return Object.fromEntries(
      Object.entries(obj).sort(([a], [b]) => a.localeCompare(b, 'en'))
    );
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const outPath = path.join(DATA_DIR, 'lang-sv-geonames.json');
  const outJson = JSON.stringify(langGazetteer, null, 2);
  fs.writeFileSync(outPath, outJson + '\n');

  const sizeKb = (Buffer.byteLength(outJson) / 1024).toFixed(1);
  console.log(`\nWrote lang-sv-geonames.json (${sizeKb} KB)`);
  console.log('Done!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
