/**
 * Standalone Genney schema discovery script.
 * Downloads Derby JARs if needed, extracts the .backup, and lists all tables
 * with column names and row counts.
 *
 * Usage: npx tsx scripts/discover-genney.ts <path-to.backup>
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import { spawnSync } from 'child_process';
import { Unzip, UnzipInflate } from 'fflate';

const DERBY_VERSION = '10.17.1.0';
const DERBY_JARS = [
  { name: 'derby.jar',       artifact: 'derby' },
  { name: 'derbyshared.jar', artifact: 'derbyshared' },
  { name: 'derbytools.jar',  artifact: 'derbytools' },
];
const MAVEN_BASE = `https://repo1.maven.org/maven2/org/apache/derby`;
const LIB_DIR = path.join(__dirname, '..', 'src', 'import', 'genney', 'lib');
const EXTRACTOR = path.join(__dirname, '..', 'src', 'import', 'genney', 'DerbyExtractor.java');

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        file.close(); fs.unlinkSync(dest);
        reject(new Error(`HTTP ${res.statusCode} for ${url}`)); return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => { file.close(); try { fs.unlinkSync(dest); } catch { /**/ } reject(err); });
  });
}

async function ensureJars(): Promise<void> {
  if (!fs.existsSync(LIB_DIR)) fs.mkdirSync(LIB_DIR, { recursive: true });
  for (const jar of DERBY_JARS) {
    const dest = path.join(LIB_DIR, jar.name);
    if (fs.existsSync(dest)) { console.log(`  ${jar.name} already present`); continue; }
    const url = `${MAVEN_BASE}/${jar.artifact}/${DERBY_VERSION}/${jar.artifact}-${DERBY_VERSION}.jar`;
    console.log(`  Downloading ${jar.name}…`);
    await downloadFile(url, dest);
    console.log(`  Downloaded ${jar.name}`);
  }
}

function extractZip(archivePath: string, destDir: string): void {
  const data = fs.readFileSync(archivePath);
  const errors: Error[] = [];
  const unzip = new Unzip((stream) => {
    const normalised = stream.name.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!normalised || normalised.endsWith('/')) return;
    const dest = path.join(destDir, ...normalised.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const fd = fs.openSync(dest, 'w');
    stream.ondata = (err, dat, final) => {
      if (err) { try { fs.closeSync(fd); } catch { /**/ } errors.push(err); return; }
      if (dat && dat.length > 0) fs.writeSync(fd, dat);
      if (final) fs.closeSync(fd);
    };
    stream.start();
  });
  unzip.register(UnzipInflate);
  unzip.push(data, true);
  if (errors.length > 0) throw errors[0];
}

function findDerbyDirs(baseDir: string): string[] {
  const results: string[] = [];
  if (fs.existsSync(path.join(baseDir, 'service.properties'))) { results.push(baseDir); return results; }
  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (fs.existsSync(path.join(full, 'service.properties'))) { results.push(full); }
      else walk(full);
    }
  }
  try { walk(baseDir); } catch { /**/ }
  return results;
}

async function main(): Promise<void> {
  const sourcePath = process.argv[2];
  if (!sourcePath) {
    console.error('Usage: npx tsx scripts/discover-genney.ts <path-to.backup>');
    process.exit(1);
  }

  console.log('\n=== Genney Schema Discovery ===\n');

  console.log('1. Ensuring Derby JARs…');
  await ensureJars();

  console.log('\n2. Extracting archive…');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genney-discover-'));
  try {
    extractZip(sourcePath, tempDir);
    console.log(`   Extracted to: ${tempDir}`);

    const derbyPaths = findDerbyDirs(tempDir);
    if (derbyPaths.length === 0) throw new Error('No Derby database found in archive.');
    const derbyPath = derbyPaths[0];
    console.log(`   Derby DB: ${derbyPath}`);

    // Check encryption
    const serviceProps = path.join(derbyPath, 'service.properties');
    if (fs.existsSync(serviceProps)) {
      const content = fs.readFileSync(serviceProps, 'utf-8');
      if (content.includes('derby.encryptionAlgorithm') || content.includes('dataEncryption=true')) {
        throw new Error('Derby database is encrypted.');
      }
    }

    console.log('\n3. Building work dir…');
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'derby-work-'));
    try {
      for (const jar of DERBY_JARS) {
        fs.copyFileSync(path.join(LIB_DIR, jar.name), path.join(workDir, jar.name));
      }
      fs.copyFileSync(EXTRACTOR, path.join(workDir, 'DerbyExtractor.java'));

      const jarPaths = DERBY_JARS.map(j => `/work/${j.name}`).join(':');

      console.log('\n4. Detecting schema…');
      const schemaResult = spawnSync('docker', [
        'run', '--rm',
        '-v', `${workDir}:/work`,
        '-v', `${derbyPath}:/derby:ro`,
        'eclipse-temurin:21-jdk-alpine',
        'sh', '-c',
        `cd /work && javac -cp '${jarPaths}' DerbyExtractor.java && java -cp '/work:${jarPaths}' DerbyExtractor --db-path /derby --list-schemas`,
      ], { encoding: 'utf-8', timeout: 120_000 });

      if (schemaResult.status !== 0) throw new Error(`Schema detection failed:\n${schemaResult.stderr}`);
      const schemas = schemaResult.stdout.trim().split('\n').filter(Boolean);
      const schema = schemas.find(s => s.trim() !== 'APP') ?? schemas[0];
      console.log(`   Schema: ${schema}`);

      console.log('\n5. Discovering tables…');
      const discoverResult = spawnSync('docker', [
        'run', '--rm',
        '-v', `${workDir}:/work`,
        '-v', `${derbyPath}:/derby:ro`,
        'eclipse-temurin:21-jdk-alpine',
        'sh', '-c',
        `cd /work && java -cp '/work:${jarPaths}' DerbyExtractor --db-path /derby --schema ${schema} --list-tables`,
      ], { encoding: 'utf-8', timeout: 120_000 });

      if (discoverResult.status !== 0) throw new Error(`Discovery failed:\n${discoverResult.stderr}`);

      for (const line of discoverResult.stdout.trim().split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed) as { table: string; rows: Array<{ name: string; columns: string[]; rowCount: number }> };
          if (parsed.table !== '__DISCOVERY__') continue;
          console.log('\n=== Tables Found ===\n');
          const known = new Set([
            'PERSON','FAMILY','COUPLE_FAMILY','SPOUSE_FAMILY','EVENT','EVENT_PLACE',
            'SPLACE','SOURCE','CITATION','CITATION_SOURCE','OWNER_CITATION','REMARK',
          ]);
          const newTables: typeof parsed.rows = [];
          for (const t of parsed.rows) {
            const marker = known.has(t.name) ? '  [known]' : '  [NEW]  ';
            console.log(`${marker} ${t.name.padEnd(30)} ${String(t.rowCount).padStart(6)} rows  cols: ${t.columns.join(', ')}`);
            if (!known.has(t.name)) newTables.push(t);
          }
          console.log(`\n  ${parsed.rows.length} tables total, ${newTables.length} new (not yet imported)\n`);
        } catch { /* skip */ }
      }
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
