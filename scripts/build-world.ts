/**
 * Build world gazetteers from GeoNames data.
 *
 * Produces TWO gazetteers:
 *   1. world-countries — All countries (~250 entries) with ISO codes as aliases
 *   2. world-admin1    — Countries + first-level admin divisions (~4,000 entries)
 *
 * Coordinates are population-weighted centroids computed from cities15000.txt.
 *
 * Source: GeoNames (https://www.geonames.org/) — CC BY 4.0
 *
 * Usage: npx tsx scripts/build-world.ts
 *
 * Prerequisites:
 *   curl -o /tmp/countryInfo.txt https://download.geonames.org/export/dump/countryInfo.txt
 *   curl -o /tmp/admin1CodesASCII.txt https://download.geonames.org/export/dump/admin1CodesASCII.txt
 *   curl -o /tmp/cities15000.zip https://download.geonames.org/export/dump/cities15000.zip
 *   unzip -o /tmp/cities15000.zip -d /tmp/geonames_cities/
 */

import * as fs from 'fs';
import * as path from 'path';
import type { GazetteerNode } from '../src/api/place-gazetteers/types';
import { weightedCentroid } from '../src/gazetteer-build/geo';

const DATA_DIR = path.join(__dirname, '..', 'src', 'api', 'place-gazetteers', 'data');

const COUNTRY_INFO_FILE = '/tmp/countryInfo.txt';
const ADMIN1_FILE = '/tmp/admin1CodesASCII.txt';
const CITIES_FILE = '/tmp/geonames_cities/cities15000.txt';

interface CountryInfo {
  iso2: string;
  iso3: string;
  name: string;
}

interface Admin1Info {
  countryCode: string;
  admin1Code: string;  // e.g. "US.CA"
  name: string;
}

interface CityRow {
  countryCode: string;
  admin1: string;
  lat: number;
  lon: number;
  population: number;
}

// ── Helpers ─────────────────────────────────────────────────────────

function cityWeightedCentroid(cities: CityRow[]): { lat: number; lon: number } | null {
  return weightedCentroid(cities.map(c => ({ lat: c.lat, lon: c.lon, weight: c.population })));
}

// ── Parsers ─────────────────────────────────────────────────────────

function parseCountryInfo(filePath: string): Map<string, CountryInfo> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const countries = new Map<string, CountryInfo>();

  for (const line of content.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const cols = line.split('\t');
    // countryInfo.txt columns: 0=ISO2, 1=ISO3, 2=ISONumeric, 3=fips, 4=Country, 5=Capital,
    // 6=Area, 7=Population, 8=Continent, ...
    const iso2 = cols[0];
    const iso3 = cols[1];
    const name = cols[4];
    if (!iso2 || !name) continue;

    countries.set(iso2, { iso2, iso3, name });
  }

  return countries;
}

function parseAdmin1Codes(filePath: string): Map<string, Admin1Info[]> {
  const content = fs.readFileSync(filePath, 'utf-8');
  // Group by country code
  const byCountry = new Map<string, Admin1Info[]>();

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    const cols = line.split('\t');
    // admin1CodesASCII.txt columns: 0=code (CC.admin1), 1=name, 2=nameAscii, 3=geonameId
    const code = cols[0]; // e.g. "US.CA"
    const name = cols[1];
    if (!code || !name) continue;

    const dotIdx = code.indexOf('.');
    if (dotIdx < 0) continue;
    const countryCode = code.substring(0, dotIdx);

    if (!byCountry.has(countryCode)) byCountry.set(countryCode, []);
    byCountry.get(countryCode)!.push({
      countryCode,
      admin1Code: code,
      name,
    });
  }

  return byCountry;
}

function parseCities(filePath: string): CityRow[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const cities: CityRow[] = [];

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    const cols = line.split('\t');
    // GeoNames columns: 0=id, 1=name, 2=asciiName, 3=altNames, 4=lat, 5=lon,
    // 6=featureClass, 7=featureCode, 8=countryCode, 9=cc2, 10=admin1, 11=admin2,
    // ... 14=population
    const countryCode = cols[8];
    const admin1 = cols[10];
    const lat = parseFloat(cols[4]);
    const lon = parseFloat(cols[5]);
    const population = parseInt(cols[14], 10) || 0;

    if (!countryCode) continue;

    cities.push({ countryCode, admin1, lat, lon, population });
  }

  return cities;
}

// ── Gazetteer builders ──────────────────────────────────────────────

function buildWorldCountries(
  countries: Map<string, CountryInfo>,
  citiesByCountry: Map<string, CityRow[]>,
): GazetteerNode[] {
  const nodes: GazetteerNode[] = [];

  for (const [, country] of [...countries.entries()].sort((a, b) =>
    a[1].name.localeCompare(b[1].name, 'en')
  )) {
    const cities = citiesByCountry.get(country.iso2) || [];
    const centroid = cityWeightedCentroid(cities);
    // Skip countries with no city data for coordinates
    if (!centroid) continue;

    const aliases: string[] = [country.iso2];
    if (country.iso3) aliases.push(country.iso3);

    nodes.push({
      name: country.name,
      type: 'country',
      aliases,
      lat: centroid.lat,
      lon: centroid.lon,
    });
  }

  return nodes;
}

function buildWorldAdmin1(
  countries: Map<string, CountryInfo>,
  admin1ByCountry: Map<string, Admin1Info[]>,
  citiesByCountry: Map<string, CityRow[]>,
  citiesByAdmin1: Map<string, CityRow[]>,
): GazetteerNode[] {
  const nodes: GazetteerNode[] = [];

  for (const [, country] of [...countries.entries()].sort((a, b) =>
    a[1].name.localeCompare(b[1].name, 'en')
  )) {
    const countryCities = citiesByCountry.get(country.iso2) || [];
    const countryCentroid = cityWeightedCentroid(countryCities);
    if (!countryCentroid) continue;

    const aliases: string[] = [country.iso2];
    if (country.iso3) aliases.push(country.iso3);

    // Build admin1 children
    const admin1List = admin1ByCountry.get(country.iso2) || [];
    const children: GazetteerNode[] = [];

    for (const admin1 of admin1List.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const admin1Cities = citiesByAdmin1.get(admin1.admin1Code) || [];
      const admin1Centroid = cityWeightedCentroid(admin1Cities);
      if (!admin1Centroid) continue;

      children.push({
        name: admin1.name,
        type: 'admin1',
        lat: admin1Centroid.lat,
        lon: admin1Centroid.lon,
      });
    }

    const countryNode: GazetteerNode = {
      name: country.name,
      type: 'country',
      aliases,
      lat: countryCentroid.lat,
      lon: countryCentroid.lon,
    };
    if (children.length > 0) {
      countryNode.children = children;
    }

    nodes.push(countryNode);
  }

  return nodes;
}

// ── Main ────────────────────────────────────────────────────────────

function main() {
  // Check prerequisites
  for (const file of [COUNTRY_INFO_FILE, ADMIN1_FILE, CITIES_FILE]) {
    if (!fs.existsSync(file)) {
      console.error(`Required file not found: ${file}`);
      console.error('Download prerequisites first — see script header for commands.');
      process.exit(1);
    }
  }

  console.log('Parsing GeoNames data...');

  const countries = parseCountryInfo(COUNTRY_INFO_FILE);
  console.log(`  Countries: ${countries.size}`);

  const admin1ByCountry = parseAdmin1Codes(ADMIN1_FILE);
  const totalAdmin1 = [...admin1ByCountry.values()].reduce((s, a) => s + a.length, 0);
  console.log(`  Admin1 divisions: ${totalAdmin1}`);

  const cities = parseCities(CITIES_FILE);
  console.log(`  Cities (pop >= 15,000): ${cities.length}`);

  // Group cities by country and by admin1
  const citiesByCountry = new Map<string, CityRow[]>();
  const citiesByAdmin1 = new Map<string, CityRow[]>();

  for (const city of cities) {
    const cc = city.countryCode;
    if (!citiesByCountry.has(cc)) citiesByCountry.set(cc, []);
    citiesByCountry.get(cc)!.push(city);

    const admin1Key = `${cc}.${city.admin1}`;
    if (!citiesByAdmin1.has(admin1Key)) citiesByAdmin1.set(admin1Key, []);
    citiesByAdmin1.get(admin1Key)!.push(city);
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);

  // 1. World Countries
  console.log('\nBuilding world-countries...');
  const countryNodes = buildWorldCountries(countries, citiesByCountry);

  const countriesGazetteer = {
    id: 'world-countries',
    name: 'World Countries',
    locale: 'en',
    description: 'All countries with ISO alpha-2 and alpha-3 codes. Coordinates are population-weighted centroids.',
    source: {
      name: 'GeoNames',
      url: 'https://www.geonames.org/',
      license: 'CC BY 4.0',
      fetched: today,
    },
    root: {
      name: 'World',
      type: 'root',
      lat: 0,
      lon: 0,
      children: countryNodes,
    },
  };

  const countriesPath = path.join(DATA_DIR, 'world-countries.json');
  const countriesJson = JSON.stringify(countriesGazetteer, null, 2);
  fs.writeFileSync(countriesPath, countriesJson + '\n');
  const countriesSizeKb = (Buffer.byteLength(countriesJson) / 1024).toFixed(1);
  console.log(`  ${countryNodes.length} countries → world-countries.json (${countriesSizeKb} KB)`);

  // 2. World Admin1
  console.log('\nBuilding world-admin1...');
  const admin1Nodes = buildWorldAdmin1(countries, admin1ByCountry, citiesByCountry, citiesByAdmin1);

  let totalAdmin1Children = 0;
  for (const node of admin1Nodes) {
    totalAdmin1Children += (node.children?.length ?? 0);
  }

  const admin1Gazetteer = {
    id: 'world-admin1',
    name: 'World Administrative Divisions (Level 1)',
    locale: 'en',
    description: 'Countries with first-level administrative divisions (states, provinces, regions). Coordinates are population-weighted centroids.',
    source: {
      name: 'GeoNames',
      url: 'https://www.geonames.org/',
      license: 'CC BY 4.0',
      fetched: today,
    },
    root: {
      name: 'World',
      type: 'root',
      lat: 0,
      lon: 0,
      children: admin1Nodes,
    },
  };

  const admin1Path = path.join(DATA_DIR, 'world-admin1.json');
  const admin1Json = JSON.stringify(admin1Gazetteer, null, 2);
  fs.writeFileSync(admin1Path, admin1Json + '\n');
  const admin1SizeKb = (Buffer.byteLength(admin1Json) / 1024).toFixed(1);
  console.log(`  ${admin1Nodes.length} countries, ${totalAdmin1Children} admin1 divisions → world-admin1.json (${admin1SizeKb} KB)`);

  console.log('\nDone!');
}

main();
