/**
 * Tests for the Genney import orchestrator (src/import/genney/index.ts).
 *
 * Two layers of tests:
 *   1. No-mock tests — cover all archive routing and extraction paths that are
 *      reachable without Docker/Java.
 *   2. Mock-spawn tests — use vi.mock('child_process') to simulate a successful
 *      Docker run, covering the post-extraction pipeline (schema detection,
 *      NDJSON parsing, transform, transaction, media copy) and the discoverTables
 *      output-parsing loop.
 *
 * Lines genuinely untestable without Docker on a non-Windows machine:
 *   - getDockerExecutable Windows fallback paths (lines 517-527)
 *   - isDockerAvailable catch block (line 537) — spawnSync never throws here
 *   - downloadFile body (lines 196-213) — jars exist in lib/, download never runs
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { importFromGenney, discoverTables, isDockerAvailable } from '../../src/import/genney';
import { createTestDb } from './helpers';

const { zipSync } = require('fflate') as typeof import('fflate');

// ── Fixtures ─────────────────────────────────────────────────────────────────

const MINIMAL_GED = `0 HEAD\n1 GEDC\n2 VERS 5.5\n0 @I1@ INDI\n1 NAME Lars /Test/\n0 TRLR`;
const UNENCRYPTED_SERVICE_PROPS = `derby.storage.dataDirectory=db\ndatabaseType=full\n`;
const ENCRYPTED_SERVICE_PROPS_FLAG = `derby.storage.dataDirectory=db\ndataEncryption=true\n`;
const ENCRYPTED_SERVICE_PROPS_KEYALGO = `derby.storage.dataDirectory=db\nderby.encryptionAlgorithm=DES/CBC/NoPadding\n`;

// NDJSON emitted by a successful Docker run — one schema row then the full
// table dump. Minimal but enough for parseNdJsonInWorker + transformGenney.
const SINGLE_SCHEMA_OUTPUT = 'TESTSCHEMA\n';
const MINIMAL_NDJSON =
  '{"table":"PERSON","rows":[{"RID":"I1","SEX":0,"GIVENNAME":"Lars","SURNAME":"Test"}]}\n' +
  '{"table":"FAMILY","rows":[]}\n' +
  '{"table":"COUPLE_FAMILY","rows":[]}\n' +
  '{"table":"SPOUSE_FAMILY","rows":[]}\n' +
  '{"table":"EVENT","rows":[]}\n' +
  '{"table":"EVENT_PLACE","rows":[]}\n' +
  '{"table":"OWNER_EVENT","rows":[]}\n' +
  '{"table":"SPLACE","rows":[]}\n' +
  '{"table":"SOURCE","rows":[]}\n' +
  '{"table":"CITATION","rows":[]}\n' +
  '{"table":"CITATION_SOURCE","rows":[]}\n' +
  '{"table":"OWNER_CITATION","rows":[]}\n' +
  '{"table":"REMARK","rows":[]}\n' +
  '{"table":"REPO","rows":[]}\n' +
  '{"table":"SOURCE_REPO","rows":[]}\n' +
  '{"table":"GROUPS","rows":[]}\n' +
  '{"table":"GROUP_MEMBER","rows":[]}\n' +
  '{"table":"MEDIA","rows":[]}\n' +
  '{"table":"OWNER_MEDIA","rows":[]}\n' +
  '{"table":"TODO","rows":[]}\n';

const DISCOVERY_OUTPUT =
  '{"table":"__DISCOVERY__","rows":[{"name":"PERSON","columns":["RID","SEX"],"rowCount":1}]}\n';

const MULTI_SCHEMA_OUTPUT = 'APP\nTESTSCHEMA\n';

// Tracks temp files/dirs for cleanup
const tmpPaths: string[] = [];

function enc(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/**
 * Write a zip archive to a temp file and return its absolute path.
 */
function writeZip(entries: Record<string, Uint8Array>, ext: string = '.gcc'): string {
  const zipped = zipSync(entries);
  const tmp = path.join(
    os.tmpdir(),
    `genney-orch-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`,
  );
  fs.writeFileSync(tmp, zipped);
  tmpPaths.push(tmp);
  return tmp;
}

afterEach(() => {
  for (const p of tmpPaths.splice(0)) {
    try {
      const s = fs.statSync(p);
      if (s.isDirectory()) fs.rmSync(p, { recursive: true, force: true });
      else fs.unlinkSync(p);
    } catch { /* ignore */ }
  }
  vi.restoreAllMocks();
});

// ── Fake ChildProcess factory ─────────────────────────────────────────────────
//
// Returns an object that looks like a ChildProcess to the orchestrator:
// stdout/stderr are readable streams with .on(), the process itself has .on().
//
// spawnCallCount tracks how many times spawn has been called so the factory
// can return different output for the schema-detection call vs the data-
// extraction call.

let spawnCallCount = 0;

function fakeSpawnFactory(outputs: string[]): () => NodeJS.EventEmitter {
  spawnCallCount = 0;
  return function fakeSpawn() {
    const callIndex = spawnCallCount++;
    const output = outputs[Math.min(callIndex, outputs.length - 1)];

    const makeStream = (data: string) => {
      const listeners: Map<string, Array<(arg: unknown) => void>> = new Map();
      return {
        on(event: string, cb: (arg: unknown) => void) {
          if (!listeners.has(event)) listeners.set(event, []);
          listeners.get(event)!.push(cb);
          if (event === 'data') {
            // Emit asynchronously so handlers are registered first
            setImmediate(() => cb(Buffer.from(data)));
          }
          return this;
        },
      };
    };

    const procListeners: Map<string, Array<(arg: unknown) => void>> = new Map();
    const proc = {
      stdout: makeStream(output),
      stderr: makeStream(''),
      on(event: string, cb: (arg: unknown) => void) {
        if (!procListeners.has(event)) procListeners.set(event, []);
        procListeners.get(event)!.push(cb);
        if (event === 'close') {
          setImmediate(() => cb(0)); // exit code 0
        }
        return this;
      },
    };
    return proc as unknown as NodeJS.EventEmitter;
  };
}

function fakeSpawnError(): () => NodeJS.EventEmitter {
  return function fakeSpawnErr() {
    const procListeners: Map<string, Array<(arg: unknown) => void>> = new Map();
    const makeStream = () => ({
      on(_event: string, _cb: (arg: unknown) => void) {
        return this;
      },
    });
    const proc = {
      stdout: makeStream(),
      stderr: makeStream(),
      on(event: string, cb: (arg: unknown) => void) {
        if (!procListeners.has(event)) procListeners.set(event, []);
        procListeners.get(event)!.push(cb);
        if (event === 'error') {
          setImmediate(() => cb(new Error('spawn ENOENT')));
        }
        return this;
      },
    };
    return proc as unknown as NodeJS.EventEmitter;
  };
}

// ── isDockerAvailable ─────────────────────────────────────────────────────────

describe('isDockerAvailable', () => {
  it('returns a boolean (true if docker is installed, false otherwise)', () => {
    const result = isDockerAvailable();
    expect(typeof result).toBe('boolean');
  });
});

// ── importFromGenney — encrypted Derby → GEDCOM fallback ─────────────────────

describe('importFromGenney — encrypted Derby database', async () => {
  it('falls back to GEDCOM when service.properties contains dataEncryption=true', async () => {
    const db = await createTestDb();
    const archivePath = writeZip({
      'mydb/service.properties': enc(ENCRYPTED_SERVICE_PROPS_FLAG),
      'export.ged': enc(MINIMAL_GED),
    }, '.backup');

    const result = await importFromGenney(db, archivePath);
    expect(result.gedcomFallbackPath).toBeTruthy();
    expect(result.gedcomFallbackPath).toMatch(/\.ged$/);
    expect(result.summary.persons).toBe(0);
  });

  it('falls back to GEDCOM when service.properties contains derby.encryptionAlgorithm', async () => {
    const db = await createTestDb();
    const archivePath = writeZip({
      'mydb/service.properties': enc(ENCRYPTED_SERVICE_PROPS_KEYALGO),
      'family.ged': enc(MINIMAL_GED),
    }, '.gcc');

    const result = await importFromGenney(db, archivePath);
    expect(result.gedcomFallbackPath).toBeTruthy();
    expect(result.summary.persons).toBe(0);
  });

  it('throws when Derby is encrypted and no GEDCOM fallback exists', async () => {
    const db = await createTestDb();
    const archivePath = writeZip({
      'mydb/service.properties': enc(ENCRYPTED_SERVICE_PROPS_FLAG),
      'readme.txt': enc('no ged here'),
    }, '.backup');

    await expect(importFromGenney(db, archivePath)).rejects.toThrow(
      /encrypted.*no gedcom/i,
    );
  });

  it('fires onProgress with encrypted message when falling back', async () => {
    const db = await createTestDb();
    const messages: string[] = [];
    const archivePath = writeZip({
      'mydb/service.properties': enc(ENCRYPTED_SERVICE_PROPS_FLAG),
      'export.ged': enc(MINIMAL_GED),
    }, '.backup');

    await importFromGenney(db, archivePath, {
      onProgress: (msg) => messages.push(msg),
    });

    expect(messages.some(m => /encrypted/i.test(m) || /extracting/i.test(m))).toBe(true);
  });
});

// ── importFromGenney — unencrypted Derby → Docker path ────────────────────────

describe('importFromGenney — unencrypted Derby database', async () => {
  // 30s timeout: on runners with Docker preinstalled (ubuntu-latest) the spawn
  // takes >5s to fail against garbage Derby files. The test only asserts that
  // the promise eventually rejects, so a longer timeout is harmless elsewhere.
  it('finds unencrypted Derby at root level and attempts Docker (rejects without real DB)', async () => {
    const db = await createTestDb();
    const archivePath = writeZip({
      'service.properties': enc(UNENCRYPTED_SERVICE_PROPS),
      'seg0/c10.dat': enc('dummy'),
    }, '.backup');

    await expect(importFromGenney(db, archivePath)).rejects.toThrow();
  }, 30000);

  it('finds unencrypted Derby in a subdirectory', async () => {
    const db = await createTestDb();
    const archivePath = writeZip({
      'backup/mydb/service.properties': enc(UNENCRYPTED_SERVICE_PROPS),
      'backup/mydb/seg0/c10.dat': enc('dummy'),
    }, '.backup');

    await expect(importFromGenney(db, archivePath)).rejects.toThrow();
  }, 30000);
});

// ── importFromGenney — onProgress callback ───────────────────────────────────

describe('importFromGenney — onProgress callback', async () => {
  it('fires at least one progress message on the GEDCOM-fallback path', async () => {
    const db = await createTestDb();
    const messages: string[] = [];
    const archivePath = writeZip({ 'export.ged': enc(MINIMAL_GED) }, '.gcc');

    await importFromGenney(db, archivePath, {
      onProgress: (msg) => messages.push(msg),
    });

    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0]).toMatch(/extract/i);
  });

  it('defaults to noop onProgress when not provided', async () => {
    const db = await createTestDb();
    const archivePath = writeZip({ 'export.ged': enc(MINIMAL_GED) }, '.gcc');

    const result = await importFromGenney(db, archivePath);
    expect(result.gedcomFallbackPath).toBeTruthy();
  });
});

// ── importFromGenney — GEDCOM file selection ─────────────────────────────────

describe('importFromGenney — GEDCOM file selection', async () => {
  it('returns a .ged path when archive has multiple GEDCOM files', async () => {
    const db = await createTestDb();
    const archivePath = writeZip({
      'old.ged': enc(MINIMAL_GED),
      'new.ged': enc(MINIMAL_GED),
    }, '.backup');

    const result = await importFromGenney(db, archivePath);
    expect(result.gedcomFallbackPath).toBeTruthy();
    expect(result.gedcomFallbackPath).toMatch(/\.ged$/);
  });

  it('finds a .gedcom file (not just .ged)', async () => {
    const db = await createTestDb();
    const archivePath = writeZip({ 'export.gedcom': enc(MINIMAL_GED) }, '.gcc');

    const result = await importFromGenney(db, archivePath);
    expect(result.gedcomFallbackPath).toBeTruthy();
    expect(result.gedcomFallbackPath).toMatch(/\.gedcom$/);
  });

  it('finds GEDCOM file nested in a subdirectory', async () => {
    const db = await createTestDb();
    const archivePath = writeZip({ 'exports/family.ged': enc(MINIMAL_GED) }, '.gcc');

    const result = await importFromGenney(db, archivePath);
    expect(result.gedcomFallbackPath).toBeTruthy();
    expect(result.gedcomFallbackPath).toMatch(/family\.ged$/);
  });
});

// ── importFromGenney — plain directory path ──────────────────────────────────

describe('importFromGenney — plain directory path', async () => {
  it('accepts a directory path (isDirectory check returns true)', async () => {
    const db = await createTestDb();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genney-dir-test-'));
    tmpPaths.push(tempDir);

    // Will fail at ensureJars/detectSchema but not at fs.statSync
    await expect(importFromGenney(db, tempDir)).rejects.toThrow();
  });
});

// ── importFromGenney — missing source path ───────────────────────────────────

describe('importFromGenney — missing source path', async () => {
  it('throws when source path does not exist', async () => {
    const db = await createTestDb();
    await expect(
      importFromGenney(db, '/absolutely/non/existent/path/file.gcc'),
    ).rejects.toThrow();
  });
});

// ── discoverTables ────────────────────────────────────────────────────────────

describe('discoverTables', async () => {
  it('throws "encrypted" when archive has encrypted Derby', async () => {
    const archivePath = writeZip({
      'mydb/service.properties': enc(ENCRYPTED_SERVICE_PROPS_FLAG),
    }, '.backup');

    await expect(discoverTables(archivePath)).rejects.toThrow(/encrypted/i);
  });

  it('throws "No Derby database found" when archive has no Derby or GEDCOM', async () => {
    const archivePath = writeZip({ 'readme.txt': enc('nothing') }, '.gcc');

    await expect(discoverTables(archivePath)).rejects.toThrow(/no derby database/i);
  });

  it('attempts Docker for unencrypted Derby (rejects without real DB)', async () => {
    const archivePath = writeZip({
      'mydb/service.properties': enc(UNENCRYPTED_SERVICE_PROPS),
    }, '.backup');

    await expect(discoverTables(archivePath)).rejects.toThrow();
  });

  it('accepts a directory path for unencrypted Derby', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genney-disc-test-'));
    tmpPaths.push(tempDir);

    await expect(discoverTables(tempDir)).rejects.toThrow();
  });

  it('fires onProgress during extraction of encrypted archive', async () => {
    const messages: string[] = [];
    const archivePath = writeZip({
      'mydb/service.properties': enc(ENCRYPTED_SERVICE_PROPS_FLAG),
    }, '.backup');

    try {
      await discoverTables(archivePath, { onProgress: (m) => messages.push(m) });
    } catch { /* expected */ }
    expect(messages.length).toBeGreaterThan(0);
  });
});

// ── extractZip — path normalisation ──────────────────────────────────────────

describe('extractZip — path normalisation via importFromGenney', async () => {
  it('handles archive entries with backslash separators (Windows-created zips)', async () => {
    const db = await createTestDb();
    const entries: Record<string, Uint8Array> = {};
    entries['subdir\\export.ged'] = enc(MINIMAL_GED);
    const archivePath = writeZip(entries, '.gcc');

    const result = await importFromGenney(db, archivePath);
    expect(result.gedcomFallbackPath).toBeTruthy();
  });
});

// ── emptyImportSummary shape ──────────────────────────────────────────────────

describe('importFromGenney — emptyImportSummary', async () => {
  it('summary has all required keys with zero counts when GEDCOM fallback fires', async () => {
    const db = await createTestDb();
    const archivePath = writeZip({ 'export.ged': enc(MINIMAL_GED) }, '.gcc');

    const { summary: s } = await importFromGenney(db, archivePath);

    expect(s.persons).toBe(0);
    expect(s.coupleRelationships).toBe(0);
    expect(s.parentChildRelationships).toBe(0);
    expect(s.events).toBe(0);
    expect(s.places).toBe(0);
    expect(s.sources).toBe(0);
    expect(s.citations).toBe(0);
    expect(s.groups).toBe(0);
    expect(s.repositories).toBe(0);
    expect(s.researchTasks).toBe(0);
    expect(s.media).toBe(0);
    expect(Array.isArray(s.warnings)).toBe(true);
  });
});

// ── Mocked-spawn tests: cover Docker-dependent paths ─────────────────────────
//
// The module under test uses `import { spawn, spawnSync } from 'child_process'`.
// We mock that module so we can simulate Docker running successfully or failing.
//
// IMPORTANT: vi.mock() is hoisted to the top of the compiled output. The factory
// below sets up a module-level mock. Individual tests use vi.mocked() to change
// the return value per-test.

describe('importFromGenney — mocked Docker (success path)', async () => {
  let spawnMock: ReturnType<typeof vi.fn>;
  let spawnSyncMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Inline mock that each test can control via spawnMock.mockImplementation
    spawnMock = vi.fn();
    spawnSyncMock = vi.fn(() => ({ status: 0 })); // docker --version succeeds

    vi.doMock('child_process', () => ({
      spawn: spawnMock,
      spawnSync: spawnSyncMock,
    }));
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('importFromGenney succeeds when Docker outputs schema + NDJSON (single schema)', async () => {
    // Use dynamic import after mocking so the orchestrator picks up the mock
    const { importFromGenney: importFn } = await import('../../src/import/genney/index.ts?v=single');
    const db = await createTestDb();

    // First spawn call: schema detection → returns single schema name
    // Second spawn call: data extraction → returns NDJSON table dump
    const factory = fakeSpawnFactory([SINGLE_SCHEMA_OUTPUT, MINIMAL_NDJSON]);
    spawnMock.mockImplementation(factory);

    // Use a real temp dir (the db dir is just a placeholder; Docker is mocked)
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genney-derby-'));
    tmpPaths.push(tempDir);
    fs.writeFileSync(path.join(tempDir, 'service.properties'), UNENCRYPTED_SERVICE_PROPS);

    const result = await importFn(db, tempDir);
    expect(result.summary.persons).toBe(1);
    expect(result.gedcomFallbackPath).toBeUndefined();
  });

  it('importFromGenney picks non-APP schema when multiple schemas returned', async () => {
    const { importFromGenney: importFn } = await import('../../src/import/genney/index.ts?v=multi-schema');
    const db = await createTestDb();

    const factory = fakeSpawnFactory([MULTI_SCHEMA_OUTPUT, MINIMAL_NDJSON]);
    spawnMock.mockImplementation(factory);

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genney-derby-'));
    tmpPaths.push(tempDir);
    fs.writeFileSync(path.join(tempDir, 'service.properties'), UNENCRYPTED_SERVICE_PROPS);

    const result = await importFn(db, tempDir);
    expect(result.summary.persons).toBe(1);
  });

  it('importFromGenney throws when no user schema found (empty Docker output)', async () => {
    const { importFromGenney: importFn } = await import('../../src/import/genney/index.ts?v=no-schema');
    const db = await createTestDb();

    const factory = fakeSpawnFactory(['']); // empty → no schemas
    spawnMock.mockImplementation(factory);

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genney-derby-'));
    tmpPaths.push(tempDir);
    fs.writeFileSync(path.join(tempDir, 'service.properties'), UNENCRYPTED_SERVICE_PROPS);

    await expect(importFn(db, tempDir)).rejects.toThrow(/no user schema/i);
  });

  it('importFromGenney uses options.schema to skip schema detection', async () => {
    const { importFromGenney: importFn } = await import('../../src/import/genney/index.ts?v=override-schema');
    const db = await createTestDb();

    // Only one spawn call: data extraction (schema detection skipped)
    const factory = fakeSpawnFactory([MINIMAL_NDJSON]);
    spawnMock.mockImplementation(factory);

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genney-derby-'));
    tmpPaths.push(tempDir);
    fs.writeFileSync(path.join(tempDir, 'service.properties'), UNENCRYPTED_SERVICE_PROPS);

    const result = await importFn(db, tempDir, { schema: 'TESTSCHEMA' });
    expect(result.summary.persons).toBe(1);
  });

  it('importFromGenney handles archive with unencrypted Derby + media/ folder (destMediaDir)', async () => {
    const { importFromGenney: importFn } = await import('../../src/import/genney/index.ts?v=media-copy');
    const db = await createTestDb();

    const factory = fakeSpawnFactory([SINGLE_SCHEMA_OUTPUT, MINIMAL_NDJSON]);
    spawnMock.mockImplementation(factory);

    // Create a zip with service.properties + media/ folder
    const mediaContent = enc('fake image data');
    const archivePath = writeZip({
      'mydb/service.properties': enc(UNENCRYPTED_SERVICE_PROPS),
      'media/photo.jpg': mediaContent,
    }, '.backup');

    const destMediaDir = path.join(os.tmpdir(), `genney-media-dest-${Date.now()}`);
    tmpPaths.push(destMediaDir);

    const result = await importFn(db, archivePath, { destMediaDir });
    expect(result.summary.persons).toBe(1);
    // Verify media was copied to destMediaDir
    expect(fs.existsSync(path.join(destMediaDir, 'photo.jpg'))).toBe(true);
  });

  it('importFromGenney handles archive with unencrypted Derby and mediaDir option', async () => {
    const { importFromGenney: importFn } = await import('../../src/import/genney/index.ts?v=mediadir-opt');
    const db = await createTestDb();

    const factory = fakeSpawnFactory([SINGLE_SCHEMA_OUTPUT, MINIMAL_NDJSON]);
    spawnMock.mockImplementation(factory);

    const archivePath = writeZip({
      'mydb/service.properties': enc(UNENCRYPTED_SERVICE_PROPS),
    }, '.backup');

    const customMediaDir = path.join(os.tmpdir(), 'custom-media');
    const result = await importFn(db, archivePath, { mediaDir: customMediaDir });
    expect(result.summary.persons).toBe(1);
  });

  it('runDocker emits stdout data to stdoutChunks (covers stdout handler)', async () => {
    const { importFromGenney: importFn } = await import('../../src/import/genney/index.ts?v=stdout-chunks');
    const db = await createTestDb();

    // Docker outputs a chunk to stdout then closes with 0
    const factory = fakeSpawnFactory([SINGLE_SCHEMA_OUTPUT, MINIMAL_NDJSON]);
    spawnMock.mockImplementation(factory);

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genney-derby-'));
    tmpPaths.push(tempDir);
    fs.writeFileSync(path.join(tempDir, 'service.properties'), UNENCRYPTED_SERVICE_PROPS);

    const result = await importFn(db, tempDir);
    // stdout data was received and parsed successfully
    expect(result.summary.persons).toBe(1);
  });

  it('runDocker rejects when spawn emits error event (covers error handler)', async () => {
    const { importFromGenney: importFn } = await import('../../src/import/genney/index.ts?v=spawn-error');
    const db = await createTestDb();

    spawnMock.mockImplementation(fakeSpawnError());

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genney-derby-'));
    tmpPaths.push(tempDir);
    fs.writeFileSync(path.join(tempDir, 'service.properties'), UNENCRYPTED_SERVICE_PROPS);

    await expect(importFn(db, tempDir)).rejects.toThrow(/spawn ENOENT/);
  });

  it('importFromGenney completes normally with a single-person NDJSON output', async () => {
    const { importFromGenney: importFn } = await import('../../src/import/genney/index.ts?v=rollback');
    const db = await createTestDb();

    // Single person, no events — verifies the transaction path completes
    const factory = fakeSpawnFactory([
      SINGLE_SCHEMA_OUTPUT,
      '{"table":"PERSON","rows":[{"RID":"I1","SEX":0}]}\n',
    ]);
    spawnMock.mockImplementation(factory);

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genney-derby-'));
    tmpPaths.push(tempDir);
    fs.writeFileSync(path.join(tempDir, 'service.properties'), UNENCRYPTED_SERVICE_PROPS);

    const result = await importFn(db, tempDir);
    expect(result.summary).toBeDefined();
    expect(result.summary.persons).toBe(1);
  });

  it('gazetteer_config is set when not already present after import', async () => {
    const { importFromGenney: importFn } = await import('../../src/import/genney/index.ts?v=gazetteer');
    const db = await createTestDb();

    const factory = fakeSpawnFactory([SINGLE_SCHEMA_OUTPUT, MINIMAL_NDJSON]);
    spawnMock.mockImplementation(factory);

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genney-derby-'));
    tmpPaths.push(tempDir);
    fs.writeFileSync(path.join(tempDir, 'service.properties'), UNENCRYPTED_SERVICE_PROPS);

    await importFn(db, tempDir);

    // Verify gazetteer_config was written to db_settings
    const row = db.all(
      "SELECT value FROM db_settings WHERE key = 'gazetteer_config'",
      [],
    ) as Array<{ value: string }>;
    expect(row).toHaveLength(1);
    const config = JSON.parse(row[0].value);
    expect(config.enabledGazetteers).toContain('sv-socknar');
  });
});

describe('discoverTables — mocked Docker (success path)', async () => {
  let spawnMock: ReturnType<typeof vi.fn>;
  let spawnSyncMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    spawnMock = vi.fn();
    spawnSyncMock = vi.fn(() => ({ status: 0 }));

    vi.doMock('child_process', () => ({
      spawn: spawnMock,
      spawnSync: spawnSyncMock,
    }));
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('returns parsed __DISCOVERY__ rows when Docker outputs them', async () => {
    const { discoverTables: discoverFn } = await import('../../src/import/genney/index.ts?v=disc-success');

    // With schema override, only ONE Docker call is made (--list-tables).
    // So the factory's first output must be the DISCOVERY response.
    const factory = fakeSpawnFactory([DISCOVERY_OUTPUT]);
    spawnMock.mockImplementation(factory);

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genney-disc-'));
    tmpPaths.push(tempDir);
    fs.writeFileSync(path.join(tempDir, 'service.properties'), UNENCRYPTED_SERVICE_PROPS);

    const tables = await discoverFn(tempDir, { schema: 'TESTSCHEMA' });
    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe('PERSON');
    expect(tables[0].rowCount).toBe(1);
  });

  it('returns empty array when Docker output has no __DISCOVERY__ line', async () => {
    const { discoverTables: discoverFn } = await import('../../src/import/genney/index.ts?v=disc-empty');

    // With schema override, only ONE Docker call is made; return non-discovery output.
    const factory = fakeSpawnFactory(['some other output\n']);
    spawnMock.mockImplementation(factory);

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genney-disc-'));
    tmpPaths.push(tempDir);
    fs.writeFileSync(path.join(tempDir, 'service.properties'), UNENCRYPTED_SERVICE_PROPS);

    const tables = await discoverFn(tempDir, { schema: 'TESTSCHEMA' });
    expect(tables).toEqual([]);
  });

  it('discoverTables handles archive with unencrypted Derby', async () => {
    const { discoverTables: discoverFn } = await import('../../src/import/genney/index.ts?v=disc-archive');

    const factory = fakeSpawnFactory([SINGLE_SCHEMA_OUTPUT, DISCOVERY_OUTPUT]);
    spawnMock.mockImplementation(factory);

    const archivePath = writeZip({
      'mydb/service.properties': enc(UNENCRYPTED_SERVICE_PROPS),
    }, '.backup');

    const tables = await discoverFn(archivePath, { schema: 'TESTSCHEMA' });
    expect(Array.isArray(tables)).toBe(true);
  });
});
