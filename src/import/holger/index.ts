/**
 * Holger/OurKind import orchestrator.
 *
 * Accepts:
 *   - A directory containing EDBDatabase.EDBCat → direct ElevateDB binary import
 *   - A .ged file → used directly with profile='holger'
 *   - A .zip file → unzipped to a temp dir; the largest .ged inside is used
 *   - A folder (without EDBCat) → recursively scanned for .ged files
 *
 * ElevateDB path (recommended):
 *   Point at the ourkind_V8 directory that contains Perstab.EDBTbl etc.
 *   Runs EDBExtractor.py inside a python:3.12-slim Docker container,
 *   captures NDJSON output, then transforms + imports via transformHolgerEdb().
 *
 * GEDCOM path (fallback):
 *   If the directory/zip contains no EDBDatabase.EDBCat, falls back to the
 *   largest .ged file found and calls importGedcom() with profile='holger'.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
// spawn is used (not exec) — no shell injection risk, args passed as array
import { spawn } from 'child_process';
import { Worker } from 'worker_threads';
import { unzipSync } from 'fflate';
import type { Database } from 'node-sqlite3-wasm';
import { readGedcomFile } from '../../gedcom/encoding';
import { parseGedcom } from '../../gedcom/parser';
import { importGedcom } from '../../import/gedcom';
import type { ImportReport } from '../../import/gedcom';
import { transformHolgerEdb, parseEdbNdjson, type EdbImportSummary, type EdbRow } from './transformEdb';

// ---------------------------------------------------------------------------
// GEDCOM path types
// ---------------------------------------------------------------------------

export interface HolgerImportOptions {
  /** Path to a .ged file, .zip file, or folder */
  sourcePath: string;
  /**
   * Optional: path to the local OurKind Media directory.
   * If supplied, Windows-style FILE paths in OBJE records are remapped here.
   */
  mediaDir?: string;
  onProgress?: (msg: string) => void;
}

export interface HolgerImportResult {
  report: ImportReport;
  gedPath: string;
}

// ---------------------------------------------------------------------------
// EDB path types
// ---------------------------------------------------------------------------

export interface HolgerEdbImportOptions {
  /** Path to the OurKind database directory (containing *.EDBTbl) */
  edbPath: string;
  onProgress?: (msg: string) => void;
}

export interface HolgerEdbImportResult {
  summary: EdbImportSummary;
}

// ---------------------------------------------------------------------------
// GEDCOM helpers
// ---------------------------------------------------------------------------

const HOLGER_EXPORT_INSTRUCTIONS =
  'No GEDCOM file found. Export from Holger: Arkiv → Exportera GEDCOM → ' +
  'Generellt format, teckenrepresentation ANSI. Then provide the .ged or .zip file.';

function pickGedFromFolder(folderPath: string): string | null {
  const walk = (dir: string): string[] => {
    let results: string[] = [];
    try {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        try {
          const stat = fs.statSync(full);
          if (stat.isDirectory()) results = results.concat(walk(full));
          else if (entry.toLowerCase().endsWith('.ged')) results.push(full);
        } catch { /* skip unreadable entries */ }
      }
    } catch { /* skip unreadable dirs */ }
    return results;
  };
  const files = walk(folderPath).sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
  return files[0] ?? null;
}

/** Returns true if the directory looks like an OurKind ElevateDB database. */
function hasEdbCatalog(dirPath: string): boolean {
  try {
    return fs.existsSync(path.join(dirPath, 'EDBDatabase.EDBCat'));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// GEDCOM import (existing path, unchanged)
// ---------------------------------------------------------------------------

export async function importFromHolger(
  db: Database,
  opts: HolgerImportOptions,
): Promise<HolgerImportResult> {
  const { sourcePath, mediaDir, onProgress } = opts;
  const progress = (msg: string) => onProgress?.(msg);

  let gedPath: string;
  let tmpDir: string | null = null;

  const stat = fs.statSync(sourcePath);
  const ext = path.extname(sourcePath).toLowerCase();

  if (stat.isDirectory()) {
    // Folder: scan recursively for .ged files
    const found = pickGedFromFolder(sourcePath);
    if (!found) throw new Error(HOLGER_EXPORT_INSTRUCTIONS);
    gedPath = found;
    progress(`Found ${path.basename(gedPath)} in folder`);
  } else if (ext === '.zip') {
    // Zip: extract to temp dir, find largest .ged
    progress('Extracting zip…');
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holger-'));
    const zipBuf = fs.readFileSync(sourcePath);
    const entries = unzipSync(new Uint8Array(zipBuf));
    const gedEntries = Object.entries(entries)
      .filter(([name]) => name.toLowerCase().endsWith('.ged'))
      .sort(([, a], [, b]) => b.length - a.length);
    if (gedEntries.length === 0) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      throw new Error(HOLGER_EXPORT_INSTRUCTIONS);
    }
    const [gedName, gedData] = gedEntries[0];
    gedPath = path.join(tmpDir, path.basename(gedName));
    fs.writeFileSync(gedPath, Buffer.from(gedData));
    progress(`Using ${path.basename(gedPath)} from zip`);
  } else if (ext === '.ged') {
    // Direct .ged file
    gedPath = sourcePath;
  } else {
    throw new Error(`Unsupported file: ${ext}. Provide a .ged or .zip file.`);
  }

  try {
    progress('Reading GEDCOM…');
    const text = readGedcomFile(gedPath);
    progress('Parsing GEDCOM…');
    const tree = parseGedcom(text);
    progress('Importing…');
    const report = importGedcom(db, tree, {
      profile: 'holger',
      ...(mediaDir ? { mediaDir } : {}),
    });
    progress(`Done — ${report.persons} persons, ${report.families} families`);
    return { report, gedPath };
  } finally {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// EDB import (new path)
// ---------------------------------------------------------------------------

/**
 * Find EDBExtractor.py in the source tree or packaged resources.
 */
function findEdbExtractor(): string {
  const candidates = [
    path.join(process.cwd(), 'src', 'import', 'holger', 'EDBExtractor.py'),
    path.join(__dirname, '..', '..', '..', 'src', 'import', 'holger', 'EDBExtractor.py'),
    path.join(__dirname, 'EDBExtractor.py'),
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch { /* skip */ }
  }
  throw new Error(
    'EDBExtractor.py not found. ' +
    `Tried:\n${candidates.join('\n')}`
  );
}

/**
 * Run EDBExtractor.py inside a python:3.12-slim Docker container.
 * Uses spawn (not exec) — args are passed as an array, no shell injection risk.
 * Returns the full stdout (NDJSON).
 */
function runEdbDocker(
  edbPath: string,
  onProgress?: (msg: string) => void,
): Promise<string> {
  const extractorPy = findEdbExtractor();

  // Copy EDBExtractor.py to a temp work dir (avoids path issues in bundles)
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edb-work-'));
  try {
    fs.copyFileSync(extractorPy, path.join(workDir, 'EDBExtractor.py'));
  } catch (err) {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
    return Promise.reject(err);
  }

  // All args are hardcoded strings or sanitised paths — no shell injection risk.
  const dockerArgs = [
    'run', '--rm',
    '-v', `${workDir}:/work`,
    '-v', `${edbPath}:/data:ro`,
    'python:3.12-slim',
    'python3', '/work/EDBExtractor.py', '--db-path', '/data',
  ];

  return new Promise((resolve, reject) => {
    const child = spawn('docker', dockerArgs);
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
      const line = chunk.toString().trim();
      if (line && onProgress) onProgress(line.slice(0, 120));
    });

    child.on('error', (err) => {
      try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
      reject(err);
    });

    child.on('close', (code) => {
      try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
      if (code !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString();
        reject(new Error(`EDB extractor failed (exit ${code}):\n${stderr}`));
        return;
      }
      resolve(Buffer.concat(stdoutChunks).toString('utf-8'));
    });
  });
}

/** Parse NDJSON in a worker thread to avoid blocking the event loop. */
const PARSE_WORKER_CODE = `
const { workerData, parentPort } = require('worker_threads');
const rows = [];
for (const line of workerData.ndjson.split('\\n')) {
  const trimmed = line.trim();
  if (!trimmed) continue;
  try { rows.push(JSON.parse(trimmed)); } catch {}
}
parentPort.postMessage(rows);
`;

function parseNdjsonInWorker(ndjson: string): Promise<EdbRow[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(PARSE_WORKER_CODE, { eval: true, workerData: { ndjson } });
    worker.once('message', (rows: EdbRow[]) => resolve(rows));
    worker.once('error', reject);
  });
}

/**
 * Import directly from an OurKind ElevateDB database directory.
 *
 * Requires Docker to be installed. On first run, pulls python:3.12-slim (~50 MB).
 */
export async function importFromHolgerEdb(
  db: Database,
  opts: HolgerEdbImportOptions,
): Promise<HolgerEdbImportResult> {
  const { edbPath, onProgress } = opts;
  const progress = (msg: string) => onProgress?.(msg);

  if (!fs.existsSync(edbPath) || !fs.statSync(edbPath).isDirectory()) {
    throw new Error(`EDB path is not a directory: ${edbPath}`);
  }
  if (!hasEdbCatalog(edbPath)) {
    throw new Error(
      `No EDBDatabase.EDBCat found in ${edbPath}. ` +
      'Provide the OurKind database directory (e.g. ourkind_V8).',
    );
  }

  progress('Running EDB extractor (may pull python:3.12-slim on first run)…');
  const ndjson = await runEdbDocker(edbPath, (msg) => progress(msg));

  progress('Parsing extractor output…');
  const rows = await parseNdjsonInWorker(ndjson);

  progress('Importing…');
  db.exec('BEGIN IMMEDIATE');
  let summary: EdbImportSummary;
  try {
    summary = transformHolgerEdb(db, rows, progress);
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  }

  return { summary };
}
