/**
 * Runs tag accounting over every .ged under export-import/samples/ and prints
 * the undeclared paths per file.
 *
 * Not a CI gate — the directory is gitignored and absent on a clean checkout.
 * Run it locally when adding tag handling, to see what the real-world corpus
 * drops that the synthetic fixtures do not.
 *
 *   npx tsx scripts/accounting-over-samples.ts [dir] [--out <file>]
 *
 * Console output is a summary. `--out` writes the complete census: every
 * distinct undeclared path with its occurrence count, one per line, sorted by
 * count. `.claude/rules/evidence.md` — a survey that truncates is a report,
 * and a report reflects its author's coverage decisions rather than the data.
 * The previous version printed 30 of 755 paths and the other 725 could not be
 * worked through by anyone.
 */
import { readdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
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

/** `[dir] [--out <file>]`, in either order. */
function parseArgs(argv: string[]): { root: string; outFile: string | null } {
  let root: string | null = null;
  let outFile: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') { outFile = argv[++i] ?? null; continue; }
    if (argv[i].startsWith('--out=')) { outFile = argv[i].slice('--out='.length); continue; }
    if (root === null) root = argv[i];
  }
  return { root: root ?? 'export-import/samples', outFile };
}

async function main(): Promise<void> {
  const { root, outFile } = parseArgs(process.argv.slice(2));
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
    // Per file: a count, plus the top few for orientation. The census is the file.
    origLog(`\n### ${file} — ${undeclared.length} undeclared paths`);
    for (const u of undeclared.slice(0, 15)) {
      origLog(`  ${String(u.count).padStart(6)}  ${u.path}`);
    }
    for (const u of undeclared) {
      totals.set(u.path, (totals.get(u.path) ?? 0) + u.count);
    }
    if (undeclared.length > 15) {
      origLog(`  … and ${undeclared.length - 15} more (use --out for the full census)`);
    }
  }

  const ranked = [...totals].sort((a, b) => b[1] - a[1]);
  origLog(`\n===== GRAND TOTAL: ${totals.size} distinct undeclared paths, ${failed} files failed to import =====`);
  for (const [path, count] of ranked.slice(0, 30)) {
    origLog(`  ${String(count).padStart(7)}  ${path}`);
  }
  if (outFile) {
    const body = ranked.map(([p, c]) => `${String(c).padStart(8)}  ${p}`).join('\n');
    writeFileSync(outFile, `${body}\n`);
    origLog(`\nCensus written to ${outFile} — ${ranked.length} lines, one per distinct path.`);
  } else {
    origLog(`\n${Math.max(0, ranked.length - 30)} paths not printed. Re-run with --out <file> for the census.`);
  }
}

// Not top-level await — tsconfig's module target rejects it in scripts/.
main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
