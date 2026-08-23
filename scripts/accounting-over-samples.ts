/**
 * Runs tag accounting over every .ged under export-import/samples/ and prints
 * the undeclared paths per file.
 *
 * Not a CI gate — the directory is gitignored and absent on a clean checkout.
 * Run it locally when adding tag handling, to see what the real-world corpus
 * drops that the synthetic fixtures do not.
 *
 *   npx tsx scripts/accounting-over-samples.ts [dir]
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import pkg from 'node-sqlite3-wasm';
import { initializeSchema } from '../src/api/schema';
import { parseGedcom } from '../src/gedcom/parser';
import { importGedcom } from '../src/import/gedcom';
import { matchDeclared } from '../src/import/gedcom/accounting-declared';

const { Database } = pkg as unknown as { Database: new (path: string) => never };

function gedFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) gedFiles(full, out);
    else if (entry.name.endsWith('.ged')) out.push(full);
  }
  return out;
}

async function main(): Promise<void> {
  const root = process.argv[2] ?? 'export-import/samples';
  if (!existsSync(root)) {
    console.log(`${root} not present — nothing to do.`);
    return;
  }

  // The importer is chatty on stdout; keep the report readable.
  const origLog = console.log;
  const quiet = (...args: unknown[]): void => {
    if (!String(args[0]).startsWith('[import-timing]')) origLog(...args);
  };

  const totals = new Map<string, number>();
  let failed = 0;

  for (const file of gedFiles(root).sort()) {
    const db = new Database(':memory:');
    await initializeSchema(db as never);
    console.log = quiet;
    let report: { unaccountedFor?: { path: string; count: number }[] };
    try {
      report = await importGedcom(db as never, parseGedcom(readFileSync(file, 'utf-8')));
    } catch (err) {
      console.log = origLog;
      failed++;
      origLog(`\n### ${file}\n  IMPORT FAILED: ${(err as Error).message}`);
      continue;
    }
    console.log = origLog;

    const undeclared = (report.unaccountedFor ?? []).filter(u => !matchDeclared(u.path));
    origLog(`\n### ${file} — ${undeclared.length} undeclared paths`);
    for (const u of undeclared.slice(0, 15)) {
      origLog(`  ${String(u.count).padStart(6)}  ${u.path}`);
    }
    for (const u of undeclared) {
      totals.set(u.path, (totals.get(u.path) ?? 0) + u.count);
    }
    if (undeclared.length > 15) origLog(`  … and ${undeclared.length - 15} more`);
  }

  origLog(`\n===== GRAND TOTAL: ${totals.size} distinct undeclared paths, ${failed} files failed to import =====`);
  for (const [path, count] of [...totals].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
    origLog(`  ${String(count).padStart(7)}  ${path}`);
  }
}

// Not top-level await — tsconfig's module target rejects it in scripts/.
main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
