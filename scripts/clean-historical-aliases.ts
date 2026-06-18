// Offline transform: strip modern-name aliases from the historical gazetteers.
// Re-runnable, deterministic, no network. Folded into the build scripts so a
// future SPARQL regeneration re-applies the cleanup — gazetteer data are build
// outputs, never hand-edited (see .claude/skills/gazetteers, "no frankensteins").
//
// Why: lang-world-historical / world-historical attach modern place names as
// aliases onto historical polities ("Iran" on Qajar Iran, "Spanien" on Spanish
// Empire, "Edum" on Edom, "New" on Estado Novo). Combined with the historical
// roots sitting shallow, those aliases used to outrank the correct modern
// match. The resolver's modern-beats-historical scoring is the primary fix;
// this removes the false aliases at the source so they can't resurface.
// Plan: docs/plans/2026-06-18-place-resolution-accuracy.md (Task 5).

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { Gazetteer, GazetteerNode } from '../src/api/place-gazetteers/types';
import { getAllGazetteers } from '../src/api/place-gazetteers/bundled';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

/** Universal normalization mirroring resolver.ts normalizeUniversal. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[()]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,:;]+$/, '')
    .trim();
}

// Fragments produced by over-aggressive suffix-stripping in the build — never
// legitimate standalone aliases for a historical polity (e.g. "New" from
// "Estado Novo" / "New State").
const FRAGMENT_DENYLIST = new Set(['new', 'old', 'the', 'state']);

const isHistoricalGaz = (g: Gazetteer): boolean =>
  g.id.includes('historical') || g.root?.name === 'World (Historical)';

/**
 * Build the set of normalized names a modern (non-historical, non-language)
 * gazetteer knows. ISO codes (2–3 all-caps) are skipped — they are not place
 * names and would over-match.
 */
export function buildModernNameSet(gazetteers: Gazetteer[]): Set<string> {
  const out = new Set<string>();
  const walk = (n: GazetteerNode) => {
    out.add(norm(n.name));
    for (const a of n.aliases ?? []) {
      if (!/^[A-Z]{2,3}$/.test(a.trim())) out.add(norm(a));
    }
    for (const c of n.children ?? []) walk(c);
  };
  for (const g of gazetteers) {
    if (isHistoricalGaz(g) || !g.root) continue;
    if (g.shape === 'language' || g.kind === 'language') continue;
    walk(g.root);
  }
  return out;
}

/**
 * Drop, in place, any alias of any node under `root` whose normalized form is
 * a modern place name or a junk fragment. Returns the count removed.
 */
export function cleanHistoricalAliases(root: GazetteerNode, modernNames: Set<string>): number {
  let removed = 0;
  const walk = (n: GazetteerNode) => {
    if (n.aliases) {
      const kept = n.aliases.filter(a => {
        const na = norm(a);
        const drop = modernNames.has(na) || FRAGMENT_DENYLIST.has(na);
        if (drop) removed++;
        return !drop;
      });
      if (kept.length) n.aliases = kept;
      else delete n.aliases;
    }
    for (const c of n.children ?? []) walk(c);
  };
  walk(root);
  return removed;
}

/**
 * Language gazetteers store exonyms as `translations[gazId][pathKey] = string[]`
 * rather than as node aliases. Drop, in place, any exonym that is a modern place
 * name or junk fragment. Returns the count removed.
 */
export function cleanTranslations(
  translations: Record<string, Record<string, string[]>>,
  modernNames: Set<string>,
): number {
  let removed = 0;
  for (const byPath of Object.values(translations)) {
    if (!byPath || typeof byPath !== 'object') continue;
    for (const key of Object.keys(byPath)) {
      const list = byPath[key];
      if (!Array.isArray(list)) continue;
      byPath[key] = list.filter(a => {
        const na = norm(a);
        const drop = modernNames.has(na) || FRAGMENT_DENYLIST.has(na);
        if (drop) removed++;
        return !drop;
      });
    }
  }
  return removed;
}

// CLI entry: rewrite the two historical JSONs in place, preserving each file's
// existing serialization (world-historical pretty, lang compact).
function main() {
  const DATA = path.join(scriptDir, '..', 'src', 'api', 'place-gazetteers', 'data');
  const modern = buildModernNameSet(getAllGazetteers());
  const files: Array<{ name: string; pretty: boolean }> = [
    { name: 'world-historical.json', pretty: true },
    { name: 'lang-world-historical.json', pretty: false },
  ];
  for (const { name, pretty } of files) {
    const p = path.join(DATA, name);
    const gaz: Gazetteer = JSON.parse(fs.readFileSync(p, 'utf-8'));
    if (!gaz.root) {
      console.log(`${name}: no root, skipped`);
      continue;
    }
    const n = cleanHistoricalAliases(gaz.root, modern);
    const gazWithTr = gaz as Gazetteer & { translations?: Record<string, Record<string, string[]>> };
    const t = gazWithTr.translations ? cleanTranslations(gazWithTr.translations, modern) : 0;
    const json = pretty ? JSON.stringify(gaz, null, 2) : JSON.stringify(gaz);
    fs.writeFileSync(p, json + '\n', 'utf-8');
    console.log(`${name}: removed ${n} node aliases + ${t} translation exonyms`);
  }
}

// tsx runs this file directly (no require.main guard needed — matches the other
// build scripts). Importing the exports for tests does NOT trigger main().
if (process.argv[1] && process.argv[1].endsWith('clean-historical-aliases.ts')) {
  main();
}
