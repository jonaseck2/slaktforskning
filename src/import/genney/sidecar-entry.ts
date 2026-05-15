/**
 * Genney sidecar entry — one-shot Bun process that runs `importFromGenney`
 * against a target SQLite file and reports the summary back to the Rust
 * host over stdout as a single JSON envelope.
 *
 * Spawned by `genney_import` in src-tauri/src/lib.rs (Rust spawns Bun with
 * the bundled `dist-genney/genney-import.bundle.mjs` as the script arg).
 *
 * Wire protocol:
 *   stdin: nothing
 *   argv: --source <path> --db <path> [--media-dir <path>] [--dest-media-dir <path>] [--schema <name>]
 *   stdout: NDJSON
 *     - progress lines: { type: 'progress', message: string }
 *     - final result line: { type: 'result', summary: ImportSummary, gedcomFallbackPath?: string }
 *     - on error: { type: 'error', error: string }
 *   exit: 0 on success, 1 on error
 *
 * The sidecar opens the same SQLite file the renderer has open. Multi-process
 * write contention is bounded by SQLite's DELETE journaling + IMMEDIATE
 * transaction (importFromGenney already wraps the transform in
 * `BEGIN IMMEDIATE`). The renderer is expected NOT to mutate the DB while
 * the sidecar is running — the polyfill awaits the sidecar's result before
 * firing `data-changed`.
 *
 * Why a sidecar at all (vs. running in the renderer like Holger): the Genney
 * importer needs Node-shape `child_process.spawn` (Docker / local Java for
 * Derby extraction), `worker_threads` (NDJSON parsing), and `https.get` (jar
 * download from Maven Central). The Tauri webview has none of those. Bun
 * does, so the importer's existing logic runs as-is.
 */

import path from 'node:path';
import fs from 'node:fs';
import { Database } from '../../shared/sqlite3-wasm';
import { importFromGenney } from './index';

function emit(obj: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function parseArgs(argv: string[]): {
  source: string;
  db: string;
  mediaDir?: string;
  destMediaDir?: string;
  schema?: string;
} {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const value = argv[i + 1];
    if (typeof value === 'string' && !value.startsWith('--')) {
      out[key] = value;
      i++;
    }
  }
  if (!out.source) throw new Error('missing --source');
  if (!out.db) throw new Error('missing --db');
  return {
    source: out.source,
    db: out.db,
    mediaDir: out['media-dir'] || undefined,
    destMediaDir: out['dest-media-dir'] || undefined,
    schema: out.schema || undefined,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // Clean up stale Emscripten lock dir from a prior crashed run.
  const lockPath = args.db + '.lock';
  if (fs.existsSync(lockPath) && fs.statSync(lockPath).isDirectory()) {
    try { fs.rmSync(lockPath, { recursive: true }); } catch { /* ignore */ }
  }

  // Pre-flight: the renderer should always have created the DB file first
  // (via dbOpen). If it isn't there, fail fast with a clear error so the
  // Rust caller can surface "no DB open" instead of a cryptic open failure.
  if (!fs.existsSync(args.db)) {
    throw new Error(`db file does not exist: ${args.db}`);
  }
  const dir = path.dirname(args.db);
  fs.mkdirSync(dir, { recursive: true });

  const db = new Database(args.db);
  try {
    const result = await importFromGenney(db, args.source, {
      mediaDir: args.mediaDir,
      destMediaDir: args.destMediaDir,
      schema: args.schema,
      onProgress: (message) => emit({ type: 'progress', message }),
    });
    emit({
      type: 'result',
      summary: result.summary,
      gedcomFallbackPath: result.gedcomFallbackPath ?? null,
    });
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
}

main().then(
  () => process.exit(0),
  (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    emit({ type: 'error', error: message, stack });
    process.exit(1);
  },
);
