/* eslint-disable */
// Analyze all places in ben-inte-trasig.db, categorize quality issues.
// Run with: npx tsx /tmp/analyze-ben-places.ts

import Database from 'node-sqlite3-wasm';
import { resolvePlace } from '/Users/jonasahnstedt/git/slaktforskning/src/api/place-gazetteers/resolver';
import { loadGazetteers } from '/Users/jonasahnstedt/git/slaktforskning/src/api/place-gazetteers/merge';
import { getAllGazetteers } from '/Users/jonasahnstedt/git/slaktforskning/src/api/place-gazetteers/bundled';
import type { Gazetteer, GazetteerNode } from '/Users/jonasahnstedt/git/slaktforskning/src/api/place-gazetteers/types';

const db = new (Database as any).Database('/tmp/ben-analysis.db');

// Build place path
const all = db.all('SELECT id, name, parent_place_id FROM places');
const byId = new Map<string, { id: string; name: string; parent_place_id: string | null }>(
  all.map((r: any) => [r.id, r]),
);
function buildPath(id: string): string {
  const parts: string[] = [];
  let cur: string | null = id;
  let i = 0;
  while (cur && i++ < 20) {
    const r = byId.get(cur);
    if (!r) break;
    parts.push(r.name);
    cur = r.parent_place_id;
  }
  return parts.join(', ');
}

// Default config: enable all bundled
const allBundled = getAllGazetteers();
const config = {
  enabledGazetteers: allBundled.map(g => g.id), // include language gazetteers
};
const gazetteers: Gazetteer[] = loadGazetteers(config, allBundled);

// Build a global name index for token-scan checks
const globalIndex = new Map<string, { gazId: string; depth: number }[]>();
function indexNode(node: GazetteerNode, gazId: string, depth: number) {
  const norm = (s: string) => s.toLowerCase().trim();
  const add = (k: string) => {
    if (!globalIndex.has(k)) globalIndex.set(k, []);
    globalIndex.get(k)!.push({ gazId, depth });
  };
  add(norm(node.name));
  if (node.aliases) for (const a of node.aliases) add(norm(a));
  if (node.children) for (const c of node.children) indexNode(c, gazId, depth + 1);
}
for (const g of gazetteers) indexNode(g.root, g.id, 1);

// Filter: only care about places used in events (matches checkGazetteerMatchQuality)
const usedRows = db.all("SELECT DISTINCT place_id FROM events WHERE place_id IS NOT NULL");
const used = new Set<string>(usedRows.map((r: any) => r.place_id));

const places = all.filter((p: any) => used.has(p.id));

const buckets: Record<string, { count: number; samples: string[]; subBuckets?: Record<string, { count: number; samples: string[] }> }> = {};
function add(bucket: string, sample: string, sub?: string) {
  if (!buckets[bucket]) buckets[bucket] = { count: 0, samples: [], subBuckets: {} };
  buckets[bucket].count++;
  if (buckets[bucket].samples.length < 8) buckets[bucket].samples.push(sample);
  if (sub) {
    if (!buckets[bucket].subBuckets![sub]) buckets[bucket].subBuckets![sub] = { count: 0, samples: [] };
    buckets[bucket].subBuckets![sub].count++;
    if (buckets[bucket].subBuckets![sub].samples.length < 5) buckets[bucket].subBuckets![sub].samples.push(sample);
  }
}

// Some Swedish county codes -> drop them when scanning words
const COUNTY_CODES = new Set(['A','AB','C','D','E','F','G','H','I','K','L','M','N','O','P','R','S','T','U','W','X','Y','Z','AC','BD']);

function tokenSplit(s: string): string[] {
  // Split on whitespace, drop punctuation-only
  return s.replace(/[()]/g, ' ').split(/\s+/).filter(t => t && !COUNTY_CODES.has(t));
}

function findKnownTokensInUnmatched(unmatched: string[]): { component: string; matches: string[] }[] {
  const out: { component: string; matches: string[] }[] = [];
  for (const c of unmatched) {
    const toks = tokenSplit(c);
    if (toks.length < 2) continue;
    // Greedy longest-match scan
    const found: string[] = [];
    let i = 0;
    while (i < toks.length) {
      let best = -1;
      for (let j = toks.length; j > i; j--) {
        const slice = toks.slice(i, j).join(' ').toLowerCase();
        if (globalIndex.has(slice)) { best = j; break; }
      }
      if (best > i) {
        found.push(toks.slice(i, best).join(' '));
        i = best;
      } else {
        i++;
      }
    }
    if (found.length >= 2) out.push({ component: c, matches: found });
  }
  return out;
}

// ---- Run all checks ----
let total = 0;
let exact = 0, partial = 0, ambiguous = 0, unmatched = 0;

const missingCommaSamples: string[] = [];
const wrongLevelSamples: string[] = [];
const partialUnmatchedHistogram = new Map<string, number>();
const punctuationIssues: string[] = [];
const trailingCountySnSamples: string[] = [];
const finlandSamples: string[] = [];
const otherUnmatchedSamples: string[] = [];
const unmatchedBuckets: Record<string, { count: number; samples: string[] }> = {};
function bumpUnmatched(b: string, s: string) {
  if (!unmatchedBuckets[b]) unmatchedBuckets[b] = { count: 0, samples: [] };
  unmatchedBuckets[b].count++;
  if (unmatchedBuckets[b].samples.length < 10) unmatchedBuckets[b].samples.push(s);
}

function categorizeUnmatched(fullPath: string, components: string[]) {
  // Apply same diagnostics to sub-strings to find what *would* match
  const opens = (fullPath.match(/\(/g) || []).length;
  const closes = (fullPath.match(/\)/g) || []).length;

  // 1. Empty/junk
  if (!fullPath.trim() || /^[?\-– \.]+$/.test(fullPath)) { bumpUnmatched('EMPTY_OR_PLACEHOLDER', fullPath); return; }

  // 2. Unbalanced parens — likely OCR/typo damage
  if (opens !== closes) { bumpUnmatched('SYNTAX_DAMAGE', fullPath); return; }

  // 3. Try resolving each component on its own to find any anchor
  let anyComponentResolves = false;
  let anyTokenKnown: string | null = null;
  for (const c of components) {
    const r = resolvePlace(c, gazetteers);
    if (r) { anyComponentResolves = true; break; }
    // Check tokens
    const toks = tokenSplit(c);
    for (const t of toks) {
      if (globalIndex.has(t.toLowerCase())) { anyTokenKnown = t; break; }
    }
    if (anyTokenKnown) break;
  }

  // Try the whole string with various rescue strategies
  const strippedParens = fullPath.replace(/\s*\([^)]*\)/g, '').trim();
  const dotsToCommas = fullPath.replace(/\.\s*/g, ', ');
  const insertCommaBeforeKnown = (() => {
    // Find last component, see if its trailing whitespace-tokens contain known names → insert commas
    if (!components.length) return null;
    const last = components[components.length - 1];
    const toks = tokenSplit(last);
    if (toks.length < 2) return null;
    // Greedy left-to-right longest match
    const found: string[] = [];
    let i = 0;
    while (i < toks.length) {
      let best = -1;
      for (let j = toks.length; j > i; j--) {
        const slice = toks.slice(i, j).join(' ').toLowerCase();
        if (globalIndex.has(slice)) { best = j; break; }
      }
      if (best > i) { found.push(toks.slice(i, best).join(' ')); i = best; }
      else { found.push(toks[i]); i++; }
    }
    if (found.length >= 2) {
      const rebuilt = [...components.slice(0, -1), ...found].join(', ');
      return rebuilt;
    }
    return null;
  })();

  const strippedRescues = resolvePlace(strippedParens, gazetteers);
  const dotsRescues = resolvePlace(dotsToCommas, gazetteers);
  const commaRescues = insertCommaBeforeKnown ? resolvePlace(insertCommaBeforeKnown, gazetteers) : null;

  if (commaRescues) { bumpUnmatched('UNMATCHED_FIXABLE_MISSING_COMMA', `${fullPath}  →  ${insertCommaBeforeKnown}  →  ${commaRescues.matchedPath.join(', ')}`); return; }
  if (dotsRescues) { bumpUnmatched('UNMATCHED_FIXABLE_DOTS_AS_COMMAS', `${fullPath}  →  ${dotsToCommas}  →  ${dotsRescues.matchedPath.join(', ')}`); return; }
  if (strippedRescues && strippedParens !== fullPath) {
    bumpUnmatched('UNMATCHED_FIXABLE_STRIP_PARENS', `${fullPath}  →  ${strippedParens}  →  ${strippedRescues.matchedPath.join(', ')}`);
    return;
  }

  // 4. Multi-component but no recognizable region anchor
  if (components.length >= 2 && !anyComponentResolves) {
    if (anyTokenKnown) bumpUnmatched('UNMATCHED_PARTIAL_TOKEN_KNOWN', `${fullPath}  (token "${anyTokenKnown}" known elsewhere)`);
    else bumpUnmatched('UNMATCHED_NO_KNOWN_TOKENS', fullPath);
    return;
  }

  // 5. Single hyperlocal name with no parent context
  if (components.length === 1) {
    if (anyTokenKnown) bumpUnmatched('UNMATCHED_BARE_NAME_PARTIAL_TOKEN', fullPath);
    else bumpUnmatched('UNMATCHED_BARE_HYPERLOCAL', fullPath);
    return;
  }

  bumpUnmatched('UNMATCHED_OTHER', fullPath);
}

for (const p of places as any[]) {
  total++;
  const fullPath = buildPath(p.id);
  const components = fullPath.split(',').map(s => s.trim()).filter(Boolean);

  // Basic syntactic issues (run on path text)
  const opens = (fullPath.match(/\(/g) || []).length;
  const closes = (fullPath.match(/\)/g) || []).length;
  if (opens !== closes) add('SYNTAX_UNBALANCED_PARENS', fullPath);
  if (/  /.test(fullPath)) add('SYNTAX_DOUBLE_SPACE', fullPath);
  if (/,[^ ,]/.test(fullPath) && !/(\d),(\d)/.test(fullPath)) add('SYNTAX_NO_SPACE_AFTER_COMMA', fullPath);

  const resolved = resolvePlace(fullPath, gazetteers);

  if (!resolved) {
    unmatched++;
    add('UNMATCHED', fullPath);
    if (otherUnmatchedSamples.length < 30) otherUnmatchedSamples.push(fullPath);
    categorizeUnmatched(fullPath, components);
    continue;
  }

  if (resolved.matchQuality === 'exact') {
    exact++;
    continue;
  }
  if (resolved.matchQuality === 'ambiguous') {
    ambiguous++;
    add('AMBIGUOUS', `${fullPath}  →  ${resolved.matchedPath.join(', ')} (${resolved.gazetteer})`);
    continue;
  }

  partial++;
  add('PARTIAL', `${fullPath}  →  ${resolved.matchedPath.join(', ')} (${resolved.gazetteer})`);

  // Diagnostic refinements on partial matches
  const known = findKnownTokensInUnmatched(resolved.unmatchedComponents);
  if (known.length > 0) {
    add('PARTIAL_MISSING_COMMA', `${fullPath}  →  ${resolved.matchedPath.join(', ')} (${resolved.gazetteer})  (split: ${known.map(k => k.matches.join('+')).join('; ')})`);
    if (missingCommaSamples.length < 30) missingCommaSamples.push(`${fullPath}  →  ${resolved.matchedPath.join(', ')} (${resolved.gazetteer})  [${known.map(k => k.matches.join('+')).join('; ')}]`);
  }

  // Wrong level: resolved into a foreign gazetteer when input mentions a country alias not in that gaz
  const lastComp = components[components.length - 1] || '';
  if (lastComp && !resolved.gazetteer.startsWith(lastComp.toLowerCase().slice(0, 2))) {
    // Heuristic: if last input component looks like a country name (we have it in any gazetteer at depth 1)
    const entries = globalIndex.get(lastComp.toLowerCase());
    if (entries && entries.some(e => e.depth === 1)) {
      const matchedRoot = resolved.matchedPath[0]?.toLowerCase() || '';
      if (!matchedRoot.includes(lastComp.toLowerCase())) {
        add('PARTIAL_WRONG_COUNTRY', `${fullPath}  →  ${resolved.matchedPath.join(', ')} (${resolved.gazetteer})`);
        if (wrongLevelSamples.length < 30) wrongLevelSamples.push(`${fullPath}  →  ${resolved.matchedPath.join(', ')} (${resolved.gazetteer})`);
      }
    }
  }

  for (const u of resolved.unmatchedComponents) {
    partialUnmatchedHistogram.set(u, (partialUnmatchedHistogram.get(u) || 0) + 1);
  }
}

// Trailing administrative tokens (not in resolver normalize list)
for (const p of places as any[]) {
  const path = buildPath(p.id);
  if (/\b(kn|kommun|sn|socken|fs|församling)\.?$/i.test(path)) {
    if (trailingCountySnSamples.length < 10) trailingCountySnSamples.push(path);
  }
}

console.log('\n=== TOTALS (places used by ≥1 event) ===');
console.log(`total used: ${total}`);
console.log(`exact:      ${exact}  (${(exact/total*100).toFixed(1)}%)`);
console.log(`partial:    ${partial}`);
console.log(`ambiguous:  ${ambiguous}`);
console.log(`unmatched:  ${unmatched}`);

console.log('\n=== BUCKETS ===');
for (const [k, v] of Object.entries(buckets).sort((a,b) => b[1].count - a[1].count)) {
  console.log(`\n${k}: ${v.count}`);
  for (const s of v.samples) console.log(`  • ${s}`);
}

console.log('\n=== PARTIAL: missing-comma candidates (top 30) ===');
for (const s of missingCommaSamples) console.log(`  • ${s}`);

console.log('\n=== PARTIAL: wrong-country candidates (top 30) ===');
for (const s of wrongLevelSamples) console.log(`  • ${s}`);

console.log('\n=== UNMATCHED — CATEGORIZED ===');
for (const [k, v] of Object.entries(unmatchedBuckets).sort((a,b) => b[1].count - a[1].count)) {
  console.log(`\n${k}: ${v.count}`);
  for (const s of v.samples) console.log(`  • ${s}`);
}

console.log('\n=== TOP-30 UNMATCHED COMPONENTS (across partial matches) ===');
const topUnmatched = [...partialUnmatchedHistogram.entries()].sort((a,b) => b[1] - a[1]).slice(0, 30);
for (const [u, n] of topUnmatched) console.log(`  ${n.toString().padStart(4)}× "${u}"`);

console.log('\n=== TRAILING ADMIN TOKEN SAMPLES ===');
for (const s of trailingCountySnSamples) console.log(`  • ${s}`);
