/**
 * Imports every .ged in a directory into one in-memory DB and prints row counts.
 *
 * Used to prove an importer change is inert: run on the merge-base and on the
 * branch, diff the output. Any difference means stored data changed.
 *
 *   npx tsx scripts/import-row-counts.ts "export-import/min släkt"
 */
import pkg from 'node-sqlite3-wasm';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { initializeSchema } from '../src/api/schema';
import { parseGedcom } from '../src/gedcom/parser';
import { importGedcom } from '../src/import/gedcom';

const { Database } = pkg as unknown as { Database: new (path: string) => never };

const TABLES = [
  'persons', 'person_names', 'person_identifiers', 'events', 'event_participants',
  'relationships', 'places', 'sources', 'citations', 'media', 'notes', 'repositories',
];

async function main(): Promise<void> {
  const dir = process.argv[2];
  if (!dir) throw new Error('usage: import-row-counts.ts <dir>');

  const db = new Database(':memory:');
  await initializeSchema(db as never);

  const origLog = console.log;
  console.log = (...args: unknown[]): void => {
    if (!String(args[0]).startsWith('[import-timing]')) origLog(...args);
  };
  for (const f of readdirSync(dir).filter(n => n.endsWith('.ged')).sort()) {
    await importGedcom(db as never, parseGedcom(readFileSync(join(dir, f), 'utf-8')));
  }
  console.log = origLog;

  for (const t of TABLES) {
    const rows = (db as unknown as { all(q: string): { c: number }[] })
      .all(`SELECT COUNT(*) c FROM ${t}`);
    console.log(`${t.padEnd(22)} ${rows[0].c}`);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
