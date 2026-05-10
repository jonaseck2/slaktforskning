import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';
import { exportGedcom } from '../../src/gedcom/exporter';
import { createTestDb } from './helpers';

const FIXTURES = join(__dirname, '..', 'fixtures', 'gedcom', 'fact-value');

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf-8');
}

interface NormalizedFact {
  tag: string;
  lineValue: string;
  date?: string;
  place?: string;
  notes?: string;
  cause?: string;
  type?: string;
}

function normalizeFacts(gedcomText: string): NormalizedFact[] {
  const ast = parseGedcom(gedcomText);
  const facts: NormalizedFact[] = [];
  for (const root of ast) {
    if (root.tag !== 'INDI') continue;
    for (const child of root.children) {
      if (child.level !== 1) continue;
      if (['NAME', 'SEX', 'FAMC', 'FAMS', 'CHAN'].includes(child.tag)) continue;
      const fact: NormalizedFact = { tag: child.tag, lineValue: child.value || '' };
      for (const sub of child.children) {
        if (sub.tag === 'DATE') fact.date = sub.value;
        if (sub.tag === 'PLAC') fact.place = sub.value;
        if (sub.tag === 'NOTE') fact.notes = sub.value;
        if (sub.tag === 'CAUS') fact.cause = sub.value;
        if (sub.tag === 'TYPE') fact.type = sub.value;
      }
      facts.push(fact);
    }
  }
  return facts;
}

async function roundTrip(gedcomText: string): string {
  const db = await createTestDb();
  await importGedcom(db, parseGedcom(gedcomText));
  return await exportGedcom(db, '5.5.1').ged;
}

describe('GEDCOM fact-value round-trip', async () => {
  it('preserves OCCU line value through import → export', async () => {
    const original = loadFixture('occupation-with-notes.ged');
    const exported = await roundTrip(original);

    const factsA = normalizeFacts(original);
    const factsB = normalizeFacts(exported);

    expect(factsB).toEqual(factsA);
  });

  it('preserves multiple fact-shaped events with mixed sub-tags', async () => {
    const original = loadFixture('mixed-facts.ged');
    const exported = await roundTrip(original);

    const factsA = normalizeFacts(original).sort((a, b) => a.tag.localeCompare(b.tag));
    const factsB = normalizeFacts(exported).sort((a, b) => a.tag.localeCompare(b.tag));

    expect(factsB).toEqual(factsA);
  });

  it('preserves DEAT with CAUS and NOTE (no fact value)', async () => {
    const original = loadFixture('death-with-cause-and-notes.ged');
    const exported = await roundTrip(original);

    const factsA = normalizeFacts(original);
    const factsB = normalizeFacts(exported);

    expect(factsB).toEqual(factsA);
  });

  it('triple-trip is idempotent (export, import, export same)', async () => {
    const original = loadFixture('mixed-facts.ged');
    const onceExported = await roundTrip(original);
    const twiceExported = await roundTrip(onceExported);

    const factsB = normalizeFacts(onceExported).sort((a, b) => a.tag.localeCompare(b.tag));
    const factsC = normalizeFacts(twiceExported).sort((a, b) => a.tag.localeCompare(b.tag));

    expect(factsC).toEqual(factsB);
  });
});
