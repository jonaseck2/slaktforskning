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
import { execSync, spawnSync } from 'child_process';
import type { Database } from 'node-sqlite3-wasm';
import { transformGenney, parseNdJson, type ImportSummary } from './transform';

// ── Derby jar coordinates (Apache Derby 10.17.1.0 on Maven Central) ────────
const DERBY_VERSION = '10.17.1.0';
const DERBY_JARS = [
  { name: 'derby.jar',       artifact: 'derby' },
  { name: 'derbyshared.jar', artifact: 'derbyshared' },
  { name: 'derbytools.jar',  artifact: 'derbytools' },
];
const MAVEN_BASE = `https://repo1.maven.org/maven2/org/apache/derby`;

const LIB_DIR = path.join(__dirname, 'lib');
const EXTRACTOR_JAVA = path.join(__dirname, 'DerbyExtractor.java');

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
    const tables = parseNdJson(ndjson);

    onProgress('Transforming and importing data…');
    const summary = transformGenney(db, tables);

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
  const output = await runDocker(derbyPath, ['--list-schemas']);
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
  onProgress('Running Derby extractor…');
  return runDocker(derbyPath, ['--db-path', '/derby', '--schema', schema]);
}

function runDocker(derbyPath: string, extraArgs: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    // Build classpath args for javac and java inside Docker
    const jarNames = DERBY_JARS.map(j => `/work/${j.name}`).join(':');
    const compileCmd = `javac -cp '${jarNames}' /work/DerbyExtractor.java -d /work`;
    const runCmd = `java -cp '/work:${jarNames}' DerbyExtractor ${extraArgs.join(' ')}`;
    const shellCmd = `${compileCmd} && ${runCmd}`;

    const args = [
      'run', '--rm',
      '-v', `${derbyPath}:/derby:ro`,
      '-v', `${LIB_DIR}:/work/lib:ro`,
      '-v', `${EXTRACTOR_JAVA}:/work/DerbyExtractor.java:ro`,
      // Use a named volume for work dir so we can write .class files
      '--tmpfs', '/work',
      'eclipse-temurin:21-jdk-alpine',
      'sh', '-c',
      // Copy jars and source to /work, then compile and run
      `cp /work/lib/*.jar /work/ && cp /work/DerbyExtractor.java /work/Extract.java 2>/dev/null; ${compileCmd} && ${runCmd}`,
    ];

    // Simpler: use a single tmpfs-backed work dir with copies
    const simplifiedShell = [
      'mkdir -p /tmp/work',
      `cp /work_lib/*.jar /tmp/work/ 2>/dev/null || true`,
      `cp /src/DerbyExtractor.java /tmp/work/`,
      `cd /tmp/work && javac -cp '/tmp/work/*' DerbyExtractor.java`,
      `java -cp '/tmp/work:/tmp/work/*' DerbyExtractor ${extraArgs.join(' ')}`,
    ].join(' && ');

    const dockerArgs = [
      'run', '--rm',
      '-v', `${derbyPath}:/derby:ro`,
      '-v', `${LIB_DIR}:/work_lib:ro`,
      '-v', `${__dirname}:/src:ro`,
      'eclipse-temurin:21-jdk-alpine',
      'sh', '-c', simplifiedShell,
    ];

    const result = spawnSync('docker', dockerArgs, {
      encoding: 'utf-8',
      maxBuffer: 256 * 1024 * 1024, // 256MB
    });

    if (result.error) { reject(result.error); return; }
    if (result.status !== 0) {
      reject(new Error(`Docker extractor failed (exit ${result.status}):\n${result.stderr}`));
      return;
    }
    resolve(result.stdout);
  });
}

// ── Archive support (.gcc / .backup) ───────────────────────────────────────

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
