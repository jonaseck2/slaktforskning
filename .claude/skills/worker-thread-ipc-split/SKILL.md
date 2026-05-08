---
name: worker-thread-ipc-split
description: Worker-thread vs main-thread split for IPC handlers and bulk DB writes. Use when adding/modifying any IPC channel, any code in src/main/db-worker.ts, any src/api/ function reachable from a worker channel, any importer (GEDCOM, Holger, Genney, archive), any media file operation, or when investigating UI freezes / sluggish list views / slow imports. Covers banned sync I/O, bulk-write transaction rules, and the "lying bulk name" anti-pattern.
---

# Worker-Thread / Main-Thread Split

This skill is the trigger-on-intent companion to `.claude/rules/api.md` (which auto-loads only when you're already editing matching files). The **rule file is the canonical source** for the bug history and the full banned/allowed lists — read it. This skill exists so you check before you write the bug, not after.

## When to invoke

- "Add an IPC handler for X"
- "Why is the UI stuttering / freezing during Y?"
- "Speed up the import"
- "Add a media operation that..."
- Any edit to `src/main/db-worker.ts`, `src/main/ipc/**`, `src/shared/channels/**`, `src/api/media*.ts`, `src/import/**`, `src/gedcom/importer.ts`
- Reviewing a PR that touches any of the above

## The architecture in one paragraph

Every DB-touching IPC channel runs in a **single Node.js worker thread**, dispatched serially. One slow handler stalls **every** other IPC behind it. With a list view mounted (avatars, place rows, event rows), each renderer paint queues 10–50 IPC calls — and any sync I/O in a worker handler turns the app into a slideshow within seconds. The Electron main thread is reserved for Electron-only operations (dialog, BrowserWindow, printToPDF, file pickers).

## Three rules, all mandatory

### Rule 1 — No sync I/O in worker handlers

**Banned anywhere reachable from a worker channel** (incl. `src/api/*`):
- `fs.readFileSync`, `fs.writeFileSync`, `fs.appendFileSync`
- `fs.existsSync`, `fs.statSync`, `fs.accessSync`
- `fs.cpSync`, `fs.copyFileSync`, `fs.renameSync`
- `child_process.spawnSync`, `execSync`

**Use instead:** `fs/promises`. It dispatches to libuv's threadpool — multiple in-flight calls run in parallel and the worker yields between them.

For "is the file there?": `await fsp.access(p, fs.constants.F_OK)` (catch → false), not `existsSync`.

For per-row file ops at scale: a bounded-concurrency worker pool (8 in flight) saturates libuv without blowing it up.

**Exception — startup-only paths.** `openDb()` in [src/main/db-worker.ts](src/main/db-worker.ts) calls `mkdirSync` / `existsSync` / `rmSync` because it runs **once before the worker signals `ready`**. No IPC dispatch is in flight. This is documented and intentional. Do not generalize the exception.

### Rule 2 — Bulk writes ≥ 50 rows must use a single transaction

Each prepared `.run()` is its own autocommit, triggering a WAL fsync. For 12k rows that's hundreds of MB of disk writes and minutes of latency.

```typescript
runSql(db, 'BEGIN IMMEDIATE');
try {
  for (const row of rows) createThing(db, row);
  runSql(db, 'COMMIT');
} catch (err) {
  try { runSql(db, 'ROLLBACK'); } catch { /* ignore */ }
  throw err;
}
```

`BEGIN IMMEDIATE` acquires the write lock upfront (avoids upgrade deadlocks). Pair with `withStatementCache` (see `sqlite-finalize`) for repeated SQL.

### Rule 3 — Plural / "bulk" / "batch" names must be SQL-bulk

```typescript
// ❌ Lying: name says "Refs" (plural) but it's N×2 SQL queries
function getPersonProfilePicRefs(db, ids: string[]) {
  return Object.fromEntries(ids.map(id => [id, getPersonProfilePicRef(db, id)]));
}

// ✅ Honest: 2 queries total regardless of N (window function)
function getPersonProfilePicRefs(db, ids: string[]) {
  return queryAll(db, `SELECT ... FROM (SELECT ..., ROW_NUMBER() OVER (PARTITION BY person_id ...) ...) WHERE rn = 1`, ids);
}
```

The IPC layer trusts the name. The renderer batches expecting one cheap call; a JS-loop fake-bulk silently undoes the batch.

## Bug history (read before writing)

Each of these passed lint, types, and tests. Each was caught by the user noticing the app stutter.

| Bug | Mechanism | Fix |
|---|---|---|
| `media:readAsDataUrl` 2.5 s freeze | `readFileSync` per avatar; 50-row list = 50 × 50 ms | `fsp.readFile` (v0.210.9) |
| `wrap-handler.ts` 4.5 min `persons:list` | `appendFileSync` to a 1 GB IPC log | env-gated buffered stream (v0.210.7) |
| `consolidateMediaFolder` minute-long freeze | `fs.cpSync` + 7 sequential `fsp.*` per file | `fsp.cp({ recursive: true })` + 8-way pool (v0.210.7) |
| Genney `.backup` import freeze | `fs.cpSync` on the media folder | bulk `fsp.cp` upfront (v0.210.7) |
| Diagnostic logging slow burn | unconditional `console.log` to file | env-gated (`SLAKTFORSKNING_IPC_LOG=1`) |

The pattern: **a sync I/O call that "looks fine" because it's fast on a single row, then ships, then a list view multiplies it by 50.**

## Diagnostic logging — same rule

If you add `console.log` instrumentation "just for debugging," gate it behind an env var **from day one**. Unconditional logging that writes synchronously becomes a slow-burning regression as the log file grows.

## Pre-commit reflex

Before committing any change in scope:

1. `git diff` and grep your hunks for `fs\.\w*Sync\(` — outside of `openDb()` startup, treat each hit as a bug.
2. Any new `for (const … of rows) <db-write>` loop — wrap it in `BEGIN IMMEDIATE` / `COMMIT`.
3. Any new function whose name suggests bulk (`getXyzs`, `bulkX`, `batchX`) — count the SQL queries it issues. If it scales with input size, rewrite or rename.
4. Run `npx vitest run tests/unit/ipc-worker-coverage.test.ts tests/unit/preload-coverage.test.ts tests/unit/static-api-coverage.test.ts`.
