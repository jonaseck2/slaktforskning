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
import { fileURLToPath } from 'node:url';
import { Unzip, UnzipInflate } from 'fflate';
import type { Database } from 'node-sqlite3-wasm';
import { getDbSetting, setDbSetting } from '../../api/db_settings';
import { bulkCopyMediaFolder } from '../../api/media_consolidate';
import { transformGenney, type GenneyTables, type ImportSummary } from './transform';

// __dirname isn't auto-defined in Node ESM — recover it from import.meta.url.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// parseNdJson is used inside PARSE_WORKER_CODE (eval worker), not imported directly

// Parses NDJSON off the main thread using an eval worker (no build changes needed).
// JSON.parse on large tables (e.g. 5910 citation rows) would otherwise block
// the Electron main process event loop for several seconds.
const PARSE_WORKER_CODE = `
const { workerData, parentPort } = require('worker_threads');
const tables = {
  PERSON: [], FAMILY: [], COUPLE_FAMILY: [], SPOUSE_FAMILY: [],
  EVENT: [], EVENT_PLACE: [], OWNER_EVENT: [], SPLACE: [], SOURCE: [],
  CITATION: [], CITATION_SOURCE: [], OWNER_CITATION: [], REMARK: [],
  REPO: [], SOURCE_REPO: [], GROUPS: [], GROUP_MEMBER: [],
  MEDIA: [], OWNER_MEDIA: [], TODO: [],
  SUBMITTER: [], ADDRESS: [], INI: [],
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

// Where downloaded Derby jars + a runtime copy of DerbyExtractor.java live.
// Default: next to the importer source (the dev / Electron / sidecar-cwd path).
// Override via the GENNEY_LIB_DIR env var so the Tauri Bun sidecar can route
// the cache into a writable app-cache directory (the packaged bundle's
// resource_dir is read-only on macOS).
const LIB_DIR = process.env.GENNEY_LIB_DIR || path.join(__dirname, 'lib');

// ── Public API ─────────────────────────────────────────────────────────────

export interface GenneyImportOptions {
  /** Override auto-detected schema name */
  schema?: string;
  /** Progress callback (message string) */
  onProgress?: (msg: string) => void;
  /**
   * Local directory for remapping Windows-style FILEREF paths (Genney .gcc exports).
   * e.g. 'C:\\Users\\linda\\Documents\\Genney\\media\\photo.jpg' → '{mediaDir}/photo.jpg'
   * For .backup archives the media/ folder is auto-detected from the extracted archive.
   * User-provided value takes precedence over auto-detected.
   */
  mediaDir?: string;
  /**
   * Permanent destination for extracted media/ folder from .backup archives.
   * If set and a media/ dir is found in the extracted tempDir, it is copied here
   * before the temp dir is cleaned up. The copied path is then used as mediaDir.
   */
  destMediaDir?: string;
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
        // Encrypted-archive or no-Derby-DB case — caller should use the
        // extracted GEDCOM as a fallback. The .ged lives inside `tempDir`,
        // which this function's `finally` block deletes on the way out.
        // Copy it to a sibling temp location so the path the caller reads
        // back via `fs_read_bytes_base64` outlives the cleanup. Without
        // this, the caller gets `read: No such file or directory (os
        // error 2)` against a path the sidecar already deleted. Preserve
        // the original basename (e.g. `family.ged`, `export.gedcom`) so
        // log lines can identify the source file; nest under a per-run
        // dir so two concurrent imports don't collide on the same name.
        const stableDir = fs.mkdtempSync(
          path.join(os.tmpdir(), 'genney-fallback-'),
        );
        const stableGed = path.join(stableDir, path.basename(result.gedcomPath));
        fs.copyFileSync(result.gedcomPath, stableGed);
        return { summary: emptyImportSummary(), gedcomFallbackPath: stableGed };
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

    // Auto-detect media/ dir bundled in .backup archives (tempDir is set for archives)
    const extractedMediaDir = tempDir && fs.existsSync(path.join(tempDir, 'media'))
      ? path.join(tempDir, 'media')
      : undefined;

    let effectiveMediaDir: string | undefined = options.mediaDir ?? extractedMediaDir;

    // Copy extracted media to a permanent location so file_refs survive tempDir cleanup.
    // bulkCopyMediaFolder uses fsp.cp recursive — async, libuv-parallel — instead of
    // the previous fs.cpSync which blocked the main thread for the duration of the copy.
    if (extractedMediaDir && options.destMediaDir) {
      onProgress('Copying media files…');
      const { ms } = await bulkCopyMediaFolder(extractedMediaDir, options.destMediaDir);
      console.log(`[import-timing] genney bulkCopyMediaFolder done — ${ms}ms`);
      effectiveMediaDir = options.destMediaDir;
    }

    // Single transaction: without this each API call is its own autocommit,
    // causing thousands of individual WAL flushes (hundreds of MB of writes).
    db.exec('BEGIN IMMEDIATE');
    let summary: ImportSummary;
    try {
      summary = await transformGenney(db, tables, { mediaDir: effectiveMediaDir });

      // Auto-enable Swedish parishes gazetteer if no config exists yet
      const existingConfig = await getDbSetting(db, 'gazetteer_config');
      if (!existingConfig) {
        await setDbSetting(db, 'gazetteer_config', JSON.stringify({ enabledGazetteers: ['sv-socknar', 'sv-forsamlingar'] }));
      }

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

export interface TableDiscovery {
  name: string;
  columns: string[];
  rowCount: number;
}

/**
 * List all user tables in a Derby database's schema with column names and row counts.
 * Useful for investigating what data a Genney database contains.
 */
export async function discoverTables(
  sourcePath: string,
  options: GenneyImportOptions = {},
): Promise<TableDiscovery[]> {
  const { onProgress = () => { /* noop */ } } = options;

  const stat = require('fs').statSync(sourcePath);
  const isArchive = !stat.isDirectory();

  let derbyPath = sourcePath;
  let tempDir: string | null = null;

  try {
    if (isArchive) {
      const result = await extractArchive(sourcePath, onProgress);
      tempDir = result.tempDir;
      if (result.gedcomPath) throw new Error('Archive is encrypted — no Derby database available for discovery.');
      derbyPath = result.derbyPath;
    }

    await ensureJars(onProgress);
    const schema = options.schema ?? await detectSchema(derbyPath, onProgress);
    const output = await runDocker(
      derbyPath,
      ['--db-path', '/derby', '--schema', schema, '--list-tables'],
      onProgress,
    );

    for (const line of output.trim().split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed) as { table: string; rows: TableDiscovery[] };
        if (parsed.table === '__DISCOVERY__') return parsed.rows;
      } catch { /* skip */ }
    }
    return [];
  } finally {
    if (tempDir) {
      try { require('fs').rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
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
    const child = spawn(getDockerExecutable(), dockerArgs);
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
 * Extract a zip archive using fflate (pure JS — no external process needed).
 * Entry paths are normalised: backslashes → forward slashes, leading slashes
 * stripped. Works correctly with Windows-created Genney .backup archives.
 */
function extractZip(archivePath: string, destDir: string): void {
  const data = fs.readFileSync(archivePath);
  const errors: Error[] = [];

  // Streaming Unzip: each entry is written to disk in chunks — never allocates
  // a full decompressed buffer, so large Derby .backup archives don't OOM.
  const unzip = new Unzip((stream) => {
    const normalised = stream.name.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!normalised || normalised.endsWith('/')) return; // directory entry

    const dest = path.join(destDir, ...normalised.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const fd = fs.openSync(dest, 'w');

    stream.ondata = (err, dat, final) => {
      if (err) { try { fs.closeSync(fd); } catch { /* ignore */ } errors.push(err); return; }
      if (dat && dat.length > 0) fs.writeSync(fd, dat);
      if (final) fs.closeSync(fd);
    };
    stream.start();
  });

  unzip.register(UnzipInflate);
  // Buffer is a Uint8Array subclass — pass directly; processing is synchronous
  unzip.push(data, true);

  if (errors.length > 0) throw errors[0];
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

  extractZip(archivePath, tempDir);

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
    events: 0, places: 0, sources: 0, citations: 0,
    groups: 0, repositories: 0, researchTasks: 0, media: 0, warnings: [],
  };
}

/**
 * Resolve the docker executable path.
 * On Windows, Docker Desktop adds itself to the user PATH but Electron's spawned
 * processes may only see the system PATH. Fall back to known installation paths.
 */
function getDockerExecutable(): string {
  // Quick check: is 'docker' already resolvable via PATH?
  const probe = spawnSync('docker', ['--version'], { encoding: 'utf-8' });
  if (probe.status === 0) return 'docker';

  if (process.platform === 'win32') {
    const candidates = [
      path.join(process.env['ProgramFiles'] ?? 'C:\\Program Files', 'Docker', 'Docker', 'resources', 'bin', 'docker.exe'),
      path.join(process.env['LOCALAPPDATA'] ?? '', 'Programs', 'Docker', 'Docker', 'resources', 'bin', 'docker.exe'),
      path.join(process.env['ProgramW6432'] ?? 'C:\\Program Files', 'Docker', 'Docker', 'resources', 'bin', 'docker.exe'),
    ];
    for (const candidate of candidates) {
      try { if (fs.existsSync(candidate)) return candidate; } catch { /* skip */ }
    }
  }
  return 'docker'; // fall back — will produce a clear error on use
}

/** Check if Docker is available on this machine. */
export function isDockerAvailable(): boolean {
  try {
    const exe = getDockerExecutable();
    const result = spawnSync(exe, ['--version'], { encoding: 'utf-8' });
    return result.status === 0;
  } catch {
    return false;
  }
}
