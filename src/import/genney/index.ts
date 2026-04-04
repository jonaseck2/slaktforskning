/**
 * Genney import orchestrator.
 *
 * Phases:
 *  1. Ensure Derby jars are present (download from Maven Central if needed)
 *  2. Detect schema name via DerbyExtractor --list-schemas
 *  3. Extract tables as NDJSON via DerbyExtractor (Docker or local Java)
 *  4. Transform + import via transform.ts
 *
 * Also handles .gcc / .backup files (Phase 4):
 *  - Unzip to temp dir
 *  - Detect encryption (service.properties)
 *  - If unencrypted: run Derby import on extracted folder
 *  - If encrypted: fall back to newest GEDCOM in archive
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import { spawn, spawnSync } from 'child_process';
import { Worker } from 'worker_threads';
import type { Database } from 'node-sqlite3-wasm';
import { transformGenney, type GenneyTables, type ImportSummary } from './transform';
// parseNdJson is used inside PARSE_WORKER_CODE (eval worker), not imported directly

// Parses NDJSON off the main thread using an eval worker (no build changes needed).
// JSON.parse on large tables (e.g. 5910 citation rows) would otherwise block
// the Electron main process event loop for several seconds.
const PARSE_WORKER_CODE = `
const { workerData, parentPort } = require('worker_threads');
const tables = {
  PERSON: [], FAMILY: [], COUPLE_FAMILY: [], SPOUSE_FAMILY: [],
  EVENT: [], EVENT_PLACE: [], SPLACE: [], SOURCE: [],
  CITATION: [], CITATION_SOURCE: [], OWNER_CITATION: [], REMARK: [],
};
for (const line of workerData.ndjson.split('\\n')) {
  const trimmed = line.trim();
  if (!trimmed) continue;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed.table && Array.isArray(parsed.rows)) tables[parsed.table] = parsed.rows;
  } catch {}
}
parentPort.postMessage(tables);
`;

function parseNdJsonInWorker(ndjson: string): Promise<GenneyTables> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(PARSE_WORKER_CODE, { eval: true, workerData: { ndjson } });
    worker.once('message', (tables: GenneyTables) => resolve(tables));
    worker.once('error', reject);
  });
}

// ── Derby jar coordinates (Apache Derby 10.17.1.0 on Maven Central) ────────
const DERBY_VERSION = '10.17.1.0';
const DERBY_JARS = [
  { name: 'derby.jar',       artifact: 'derby' },
  { name: 'derbyshared.jar', artifact: 'derbyshared' },
  { name: 'derbytools.jar',  artifact: 'derbytools' },
];
const MAVEN_BASE = `https://repo1.maven.org/maven2/org/apache/derby`;

const LIB_DIR = path.join(__dirname, 'lib');

// ── Public API ─────────────────────────────────────────────────────────────

export interface GenneyImportOptions {
  /** Override auto-detected schema name */
  schema?: string;
  /** Progress callback (message string) */
  onProgress?: (msg: string) => void;
}

export interface GenneyImportResult {
  summary: ImportSummary;
  /** Path to GEDCOM used as fallback (only set when .gcc was encrypted) */
  gedcomFallbackPath?: string;
}

/**
 * Import from a Genney Derby database directory OR a .gcc/.backup archive.
 */
export async function importFromGenney(
  db: Database,
  sourcePath: string,
  options: GenneyImportOptions = {},
): Promise<GenneyImportResult> {
  const { onProgress = () => { /* noop */ } } = options;

  const stat = fs.statSync(sourcePath);
  const isArchive = !stat.isDirectory();

  let derbyPath = sourcePath;
  let tempDir: string | null = null;
  let gedcomFallbackPath: string | undefined;

  try {
    if (isArchive) {
      const result = await extractArchive(sourcePath, onProgress);
      tempDir = result.tempDir;
      if (result.gedcomPath) {
        // Encrypted — caller should use GEDCOM fallback
        return { summary: emptyImportSummary(), gedcomFallbackPath: result.gedcomPath };
      }
      derbyPath = result.derbyPath;
    }

    onProgress('Checking Derby extraction tools…');
    await ensureJars(onProgress);

    const schema = options.schema ?? await detectSchema(derbyPath, onProgress);
    onProgress(`Importing schema: ${schema}`);

    const ndjson = await runExtractor(derbyPath, schema, onProgress);
    onProgress('Parsing Derby output…');
    const tables = await parseNdJsonInWorker(ndjson);

    onProgress('Transforming and importing data…');
    // Single transaction: without this each API call is its own autocommit,
    // causing thousands of individual WAL flushes (hundreds of MB of writes).
    db.exec('BEGIN IMMEDIATE');
    let summary: ImportSummary;
    try {
      summary = transformGenney(db, tables);
      db.exec('COMMIT');
    } catch (transformErr) {
      try { db.exec('ROLLBACK'); } catch { /* ignore */ }
      throw transformErr;
    }

    return { summary, gedcomFallbackPath };
  } finally {
    if (tempDir) {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
}

// ── Jar management ─────────────────────────────────────────────────────────

async function ensureJars(onProgress: (msg: string) => void): Promise<void> {
  if (!fs.existsSync(LIB_DIR)) fs.mkdirSync(LIB_DIR, { recursive: true });

  for (const jar of DERBY_JARS) {
    const dest = path.join(LIB_DIR, jar.name);
    if (fs.existsSync(dest)) continue;
    const url = `${MAVEN_BASE}/${jar.artifact}/${DERBY_VERSION}/${jar.artifact}-${DERBY_VERSION}.jar`;
    onProgress(`Downloading ${jar.name}…`);
    await downloadFile(url, dest);
  }
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => {
      file.close();
      try { fs.unlinkSync(dest); } catch { /* ignore */ }
      reject(err);
    });
  });
}

// ── Schema detection ────────────────────────────────────────────────────────

async function detectSchema(derbyPath: string, onProgress: (msg: string) => void): Promise<string> {
  onProgress('Detecting schema…');
  const output = await runDocker(derbyPath, ['--db-path', '/derby', '--list-schemas'], onProgress);
  const schemas = output.trim().split('\n').filter(Boolean);
  if (schemas.length === 1) return schemas[0].trim();
  if (schemas.length > 1) {
    // Prefer the first non-APP schema, or just take the first
    const preferred = schemas.find(s => s.trim() !== 'APP') ?? schemas[0];
    return preferred.trim();
  }
  throw new Error('No user schema found in Derby database. Is this a Genney database?');
}

// ── Extractor invocation ────────────────────────────────────────────────────

async function runExtractor(
  derbyPath: string,
  schema: string,
  onProgress: (msg: string) => void,
): Promise<string> {
  onProgress('Running Derby extractor (this may take a minute on first run while Docker pulls the image)…');
  return runDocker(derbyPath, ['--db-path', '/derby', '--schema', schema], onProgress);
}

/**
 * Find DerbyExtractor.java on the host filesystem.
 * Tries multiple candidate paths to handle both dev (source tree) and
 * packaged builds (resources directory).
 */
function findExtractorJava(): string {
  const candidates = [
    // Dev mode: process.cwd() is the project root
    path.join(process.cwd(), 'src', 'import', 'genney', 'DerbyExtractor.java'),
    // Dev mode: relative to .vite/build/ (3 levels up to project root)
    path.join(__dirname, '..', '..', '..', 'src', 'import', 'genney', 'DerbyExtractor.java'),
    // Packaged build: next to the bundle
    path.join(__dirname, 'DerbyExtractor.java'),
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch { /* skip */ }
  }
  throw new Error(
    'DerbyExtractor.java not found. ' +
    `Tried:\n${candidates.join('\n')}`
  );
}

function runDocker(
  derbyPath: string,
  extraArgs: string[],
  onProgress?: (msg: string) => void,
): Promise<string> {
  // Copy jars + DerbyExtractor.java to a temp work dir, then mount that dir.
  // This avoids __dirname path issues in the Vite bundle.
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'derby-work-'));
  try {
    for (const jar of DERBY_JARS) {
      fs.copyFileSync(path.join(LIB_DIR, jar.name), path.join(workDir, jar.name));
    }
    fs.copyFileSync(findExtractorJava(), path.join(workDir, 'DerbyExtractor.java'));
  } catch (err) {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
    return Promise.reject(err);
  }

  const jarPaths = DERBY_JARS.map(j => `/work/${j.name}`).join(':');
  const shellCmd = [
    'cd /work',
    `javac -cp '${jarPaths}' DerbyExtractor.java`,
    `java -cp '/work:${jarPaths}' DerbyExtractor ${extraArgs.join(' ')}`,
  ].join(' && ');

  const dockerArgs = [
    'run', '--rm',
    '-v', `${workDir}:/work`,
    '-v', `${derbyPath}:/derby:ro`,
    'eclipse-temurin:21-jdk-alpine',
    'sh', '-c', shellCmd,
  ];

  return new Promise((resolve, reject) => {
    // Use async spawn so the Electron main process event loop stays alive
    const child = spawn('docker', dockerArgs);
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
      // Forward Docker pull / stderr progress lines to the UI
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
        reject(new Error(`Docker extractor failed (exit ${code}):\n${stderr}`));
        return;
      }
      resolve(Buffer.concat(stdoutChunks).toString('utf-8'));
    });
  });
}

// ── Archive support (.gcc / .backup) ───────────────────────────────────────

/**
 * Repair Windows-style backslash path separators in extracted zip contents.
 *
 * Windows zip entries use '\' as the directory separator. macOS/Linux unzip
 * treats '\' as a valid filename character, so "seg0\c660.dat" becomes a
 * single flat file rather than a file inside a "seg0" directory. This function
 * walks the tree and moves any file whose name contains '\' into the correct
 * subdirectory, repeating until no such files remain.
 */
function fixWindowsPaths(baseDir: string): void {
  let iterations = 0;
  let found: boolean;
  do {
    found = false;
    const toFix: { from: string; to: string }[] = [];

    function scan(dir: string): void {
      let entries: fs.Dirent[];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (entry.name.includes('\\')) {
          const parts = entry.name.split('\\').filter(Boolean);
          const destDir = parts.length > 1 ? path.join(dir, ...parts.slice(0, -1)) : dir;
          toFix.push({ from: path.join(dir, entry.name), to: path.join(destDir, parts[parts.length - 1]) });
        } else if (entry.isDirectory()) {
          scan(path.join(dir, entry.name));
        }
      }
    }

    scan(baseDir);
    for (const { from, to } of toFix) {
      try {
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.renameSync(from, to);
        found = true;
      } catch { /* skip — another entry may have already created the target */ }
    }
    iterations++;
  } while (found && iterations < 20);
}

interface ArchiveResult {
  tempDir: string;
  derbyPath: string;
  /** Set if encrypted — path to GEDCOM file to use as fallback */
  gedcomPath?: string;
}

async function extractArchive(archivePath: string, onProgress: (msg: string) => void): Promise<ArchiveResult> {
  onProgress('Extracting archive…');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genney-import-'));

  // Unzip (macOS unzip / Linux unzip)
  // unzip exit codes: 0=success, 1=success with warnings (e.g. backslash path separators), ≥2=error
  const unzipResult = spawnSync('unzip', ['-q', archivePath, '-d', tempDir], { encoding: 'utf-8' });
  if (unzipResult.status !== null && unzipResult.status > 1) {
    throw new Error(`Failed to unzip archive: ${unzipResult.stderr || 'unknown error'}`);
  }

  // Genney backups created on Windows use backslash as the zip path separator.
  // macOS/Linux unzip treats backslash as a valid filename character, producing
  // flat files like "database\seg0\c660.dat" instead of a real directory tree.
  // Repair the structure before searching for Derby dirs.
  fixWindowsPaths(tempDir);

  // Find Derby database directories (contain service.properties)
  const derbyPaths = findDerbyDirs(tempDir);
  if (derbyPaths.length === 0) {
    // No Derby DB found — look for GEDCOM fallback
    const gedcomPath = findNewestGedcom(tempDir);
    if (gedcomPath) return { tempDir, derbyPath: '', gedcomPath };
    throw new Error('No Derby database found in archive. No GEDCOM fallback found either.');
  }

  const derbyPath = derbyPaths[0];

  // Check encryption
  const serviceProps = path.join(derbyPath, 'service.properties');
  if (fs.existsSync(serviceProps)) {
    const content = fs.readFileSync(serviceProps, 'utf-8');
    if (content.includes('derby.encryptionAlgorithm') || content.includes('dataEncryption=true')) {
      onProgress('Derby database is encrypted. Falling back to GEDCOM…');
      const gedcomPath = findNewestGedcom(tempDir);
      if (gedcomPath) return { tempDir, derbyPath: '', gedcomPath };
      throw new Error('Derby database is encrypted and no GEDCOM fallback found in archive.');
    }
  }

  return { tempDir, derbyPath };
}

function findDerbyDirs(baseDir: string): string[] {
  const results: string[] = [];
  // Check if the root itself is a Derby DB
  if (fs.existsSync(path.join(baseDir, 'service.properties'))) {
    results.push(baseDir);
    return results;
  }
  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (fs.existsSync(path.join(full, 'service.properties'))) {
        results.push(full);
      } else {
        walk(full);
      }
    }
  }
  try { walk(baseDir); } catch { /* ignore */ }
  return results;
}

function findNewestGedcom(baseDir: string): string | null {
  const gedFiles: { path: string; mtime: number }[] = [];
  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); }
      else if (entry.name.endsWith('.ged') || entry.name.endsWith('.gedcom')) {
        try {
          const stat = fs.statSync(full);
          gedFiles.push({ path: full, mtime: stat.mtimeMs });
        } catch { /* ignore */ }
      }
    }
  }
  try { walk(baseDir); } catch { /* ignore */ }
  if (gedFiles.length === 0) return null;
  gedFiles.sort((a, b) => b.mtime - a.mtime);
  return gedFiles[0].path;
}

function emptyImportSummary(): ImportSummary {
  return {
    persons: 0, coupleRelationships: 0, parentChildRelationships: 0,
    events: 0, places: 0, sources: 0, citations: 0, warnings: [],
  };
}

/** Check if Docker is available on this machine. */
export function isDockerAvailable(): boolean {
  try {
    const result = spawnSync('docker', ['--version'], { encoding: 'utf-8' });
    return result.status === 0;
  } catch {
    return false;
  }
}
