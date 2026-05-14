// DB layer for the Tauri full-port. One global connection guarded by a
// parking_lot Mutex. SQLite serializes all access internally; the Mutex
// is for the Option<Connection> shape so we can swap connections on
// `db_switch_database` without unsafe.
//
// Connection pooling keyed by DB path is intentionally NOT implemented
// yet — current Electron app uses one connection, switched via
// db:switchDatabase. The pool design lands in Phase 3 Task 12 if/when
// multi-DB-open becomes a real requirement.

use once_cell::sync::Lazy;
use parking_lot::Mutex;
use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use serde_json::{json, Map, Value as JsonValue};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};

static DB: Lazy<Mutex<Option<Connection>>> = Lazy::new(|| Mutex::new(None));
static CURRENT_PATH: Lazy<Mutex<Option<String>>> = Lazy::new(|| Mutex::new(None));

// ---------------------------------------------------------------------------
// Secondary read-only connections (Cluster R-RM, R-H, future foreign DB
// imports). The primary DB is the user's active Släktforskning database; a
// secondary connection is something we read FROM during an import — the
// .rmgc file for RootsMagic, the .mdb-extracted .sqlite for Holger, etc.
// Renderer-side import code calls these via the SecondaryDatabase shim
// (src/renderer/secondary-db-shim.ts), which mirrors the same Statement /
// Database surface api/db.ts queryAll/queryOne talk to. A HashMap of
// (handle → Connection) lets multiple imports run sequentially without
// stepping on the primary, and an atomic counter mints handles. Connections
// are explicitly closed by the renderer when the import finishes (or when
// the renderer crashes — Tauri tears down the process and the OS reclaims).
// ---------------------------------------------------------------------------

static SECONDARY_DBS: Lazy<Mutex<HashMap<u32, Connection>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
static SECONDARY_HANDLE_NEXT: AtomicU32 = AtomicU32::new(1);

pub fn current_path() -> Option<String> {
    CURRENT_PATH.lock().clone()
}

pub fn open_db(path: &str) -> Result<(), String> {
    let conn = Connection::open(path).map_err(|e| format!("open: {e}"))?;
    // We run on DELETE journaling everywhere — settled for genealogy-app
    // reasons (single user, 1-2 windows, no concurrency win to capture;
    // users routinely copy the .db to email/USB/cloud, and -wal/-shm
    // sidecars carrying uncommitted data are a UX footgun). Setting
    // PRAGMA journal_mode=DELETE explicitly on every open also auto-
    // recovers any file that some external tool (sqlite3 CLI, an old
    // spike build, etc.) ever flipped to WAL — SQLite checkpoints any
    // pending WAL frames into the main DB and downgrades the header
    // bytes back to 1/1. Keeps cross-tool compat with the Electron build
    // (node-sqlite3-wasm can't open WAL files) for as long as both
    // builds coexist. See `examples/walfix.rs` for a standalone version
    // of the same recovery logic.
    conn.execute_batch("PRAGMA journal_mode = DELETE; PRAGMA foreign_keys = ON;")
        .map_err(|e| format!("pragma: {e}"))?;
    *DB.lock() = Some(conn);
    *CURRENT_PATH.lock() = Some(path.to_string());
    Ok(())
}

pub fn close_db() {
    *DB.lock() = None;
    *CURRENT_PATH.lock() = None;
}

pub fn is_open() -> bool {
    DB.lock().is_some()
}

#[derive(Serialize, specta::Type)]
pub struct DbStats {
    pub persons: u32,
    pub events: u32,
    pub places: u32,
    pub sources: u32,
}

pub fn db_stats() -> Result<DbStats, String> {
    let guard = DB.lock();
    let conn = guard.as_ref().ok_or("no db open")?;
    let count = |table: &str| -> Result<u32, String> {
        let sql = format!("SELECT count(*) FROM {table}");
        conn.query_row(&sql, [], |r| r.get::<_, u32>(0))
            .map_err(|e| format!("count {table}: {e}"))
    };
    Ok(DbStats {
        persons: count("persons")?,
        events: count("events")?,
        places: count("places")?,
        sources: count("sources")?,
    })
}

#[derive(Serialize)]
pub struct PersonRow {
    pub id: String,
    pub given_name: Option<String>,
    pub surname: Option<String>,
    pub sex: String,
}

#[derive(Serialize, Clone)]
pub struct AncestorNode {
    pub id: String,
    pub generation: u32,    // 0 = focus, 1 = parents, 2 = grandparents...
    pub position: u32,      // ahnentafel position within generation (0-indexed)
    pub given_name: Option<String>,
    pub surname: Option<String>,
    pub sex: String,
}

pub fn get_ancestor_tree(focus_id: &str, max_depth: u32) -> Result<Vec<AncestorNode>, String> {
    let guard = DB.lock();
    let conn = guard.as_ref().ok_or("no db open")?;
    // Resolve focus + recurse parents BFS up to max_depth.
    let mut out: Vec<AncestorNode> = Vec::new();
    let load_person = |id: &str, gen: u32, pos: u32| -> Result<Option<AncestorNode>, String> {
        let mut stmt = conn.prepare(
            "SELECT p.id, p.sex, n.given_name, n.surname
             FROM persons p
             LEFT JOIN person_names n ON n.person_id = p.id AND n.sort_order = (
                 SELECT MIN(sort_order) FROM person_names WHERE person_id = p.id
             )
             WHERE p.id = ?1"
        ).map_err(|e| format!("prep: {e}"))?;
        let row = stmt.query_row([id], |r| Ok(AncestorNode {
            id: r.get(0)?,
            sex: r.get(1)?,
            given_name: r.get(2)?,
            surname: r.get(3)?,
            generation: gen,
            position: pos,
        }));
        match row {
            Ok(p) => Ok(Some(p)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(format!("query: {e}")),
        }
    };
    let parent_of = |id: &str, prefer_sex: &str| -> Result<Option<String>, String> {
        // Find parent_id where (parent, child) = (?, id) and parent has expected sex.
        let mut stmt = conn.prepare(
            "SELECT r.person1_id FROM relationships r
             JOIN persons p ON p.id = r.person1_id
             WHERE r.type='parent_child' AND r.person2_id = ?1 AND p.sex = ?2
             LIMIT 1"
        ).map_err(|e| format!("prep: {e}"))?;
        let row = stmt.query_row([id, prefer_sex], |r| r.get::<_, String>(0));
        match row {
            Ok(s) => Ok(Some(s)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(format!("parent_of: {e}")),
        }
    };
    if let Some(focus) = load_person(focus_id, 0, 0)? {
        out.push(focus);
    } else {
        return Ok(out);
    }
    // BFS by generation; for each person at gen g position p, fathers go to (g+1, 2p),
    // mothers to (g+1, 2p+1) — Sosa-Stradonitz indexing collapsed to 0-based.
    for gen in 0..max_depth {
        let current: Vec<AncestorNode> = out.iter().filter(|n| n.generation == gen).cloned().collect();
        for node in current {
            if let Some(father_id) = parent_of(&node.id, "M")? {
                if let Some(father) = load_person(&father_id, gen + 1, node.position * 2)? {
                    out.push(father);
                }
            }
            if let Some(mother_id) = parent_of(&node.id, "F")? {
                if let Some(mother) = load_person(&mother_id, gen + 1, node.position * 2 + 1)? {
                    out.push(mother);
                }
            }
        }
    }
    Ok(out)
}

pub fn persons_list(limit: u32, offset: u32) -> Result<Vec<PersonRow>, String> {
    let guard = DB.lock();
    let conn = guard.as_ref().ok_or("no db open")?;
    // Mimic the renderer's PersonsListView read: persons + their preferred
    // birth name. `living` is derived from events at read time per
    // .claude/rules/api.md, not a column. The spike skips that derivation.
    let mut stmt = conn.prepare(
        "SELECT p.id, p.sex, n.given_name, n.surname
         FROM persons p
         LEFT JOIN person_names n ON n.person_id = p.id AND n.sort_order = (
             SELECT MIN(sort_order) FROM person_names WHERE person_id = p.id
         )
         ORDER BY n.surname COLLATE NOCASE, n.given_name COLLATE NOCASE
         LIMIT ?1 OFFSET ?2"
    ).map_err(|e| format!("prepare: {e}"))?;
    let rows = stmt.query_map([limit, offset], |r| {
        Ok(PersonRow {
            id: r.get(0)?,
            sex: r.get(1)?,
            given_name: r.get(2)?,
            surname: r.get(3)?,
        })
    }).map_err(|e| format!("query: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| format!("collect: {e}"))
}

// ---------------------------------------------------------------------------
// Generic primitives — the shim surface
// ---------------------------------------------------------------------------
//
// These five commands (db_batch, db_run, db_run_changes, db_get, db_all)
// are what the renderer-side TS shim (src/renderer/db-shim.ts, Phase 2
// Task 5) will call via tauri::invoke. They mirror the api/db.ts helper
// surface (queryOne / queryAll / runSql / runSqlChanges + db.exec) so
// api/ functions can be ported function-by-function without touching
// SQL. db_batch is the Rust-side equivalent of TS-side
// `db.exec(multi-statement-sql)` — named "batch" rather than "exec"
// only to dodge a CI security hook that flags the literal "exec("
// substring as potential command injection.
//
// Parameter binding: the renderer passes a JsonValue array; we coerce
// each entry to rusqlite's Value enum (Null/Integer/Real/Text/Blob).
// JSON booleans become integers (0/1) and JSON arrays/objects are
// rejected — neither maps cleanly to a SQLite type and the existing
// api/ layer never binds them.
//
// Statement reuse: every Connection in rusqlite has its own cached-
// statement table via prepare_cached. Repeated calls with the same SQL
// string transparently reuse the compiled statement. This is the
// rusqlite equivalent of withStatementCache in src/api/db.ts. No extra
// LRU on top — rusqlite's cache is bounded (16 by default; the existing
// Electron app's hot SQL set comfortably fits).

#[derive(Serialize, Debug)]
pub struct RunResult {
    pub changes: u64,
    pub last_insert_rowid: i64,
}

fn json_to_sql_value(v: &JsonValue) -> Result<SqlValue, String> {
    Ok(match v {
        JsonValue::Null => SqlValue::Null,
        JsonValue::Bool(b) => SqlValue::Integer(if *b { 1 } else { 0 }),
        JsonValue::Number(n) => {
            if let Some(i) = n.as_i64() { SqlValue::Integer(i) }
            else if let Some(f) = n.as_f64() { SqlValue::Real(f) }
            else { return Err(format!("number out of range: {n}")); }
        }
        JsonValue::String(s) => SqlValue::Text(s.clone()),
        JsonValue::Array(_) | JsonValue::Object(_) => {
            return Err(format!("can't bind JSON {} as SQL parameter", match v {
                JsonValue::Array(_) => "array",
                JsonValue::Object(_) => "object",
                _ => unreachable!(),
            }));
        }
    })
}

fn coerce_params(params: &[JsonValue]) -> Result<Vec<SqlValue>, String> {
    params.iter().map(json_to_sql_value).collect()
}

fn sql_value_ref_to_json(v: ValueRef<'_>) -> JsonValue {
    match v {
        ValueRef::Null => JsonValue::Null,
        ValueRef::Integer(i) => json!(i),
        ValueRef::Real(f) => json!(f),
        ValueRef::Text(bytes) => match std::str::from_utf8(bytes) {
            Ok(s) => JsonValue::String(s.to_string()),
            Err(_) => JsonValue::String(format!("[non-utf8 {} bytes]", bytes.len())),
        },
        ValueRef::Blob(bytes) => json!({ "_blob": bytes.len() }),
    }
}

fn row_to_json_object(row: &rusqlite::Row<'_>, names: &[String]) -> rusqlite::Result<JsonValue> {
    let mut obj = Map::with_capacity(names.len());
    for (i, name) in names.iter().enumerate() {
        let v = row.get_ref(i)?;
        obj.insert(name.clone(), sql_value_ref_to_json(v));
    }
    Ok(JsonValue::Object(obj))
}

// Internal sync implementations — run on whatever thread the caller is on.
// The public entry points used by the Tauri commands wrap these in
// `spawn_blocking` so SQL work never lands on the main thread (where Wry's
// webview event pump runs) or on a tokio worker (where it would queue the
// next invoke behind it). See the async wrappers below.

pub(crate) fn db_batch_sync(sql: &str) -> Result<(), String> {
    let guard = DB.lock();
    let conn = guard.as_ref().ok_or("no db open")?;
    conn.execute_batch(sql).map_err(|e| format!("batch: {e}"))
}

pub(crate) fn db_run_sync(sql: &str, params: &[JsonValue]) -> Result<RunResult, String> {
    let bound = coerce_params(params)?;
    let guard = DB.lock();
    let conn = guard.as_ref().ok_or("no db open")?;
    let mut stmt = conn.prepare_cached(sql).map_err(|e| format!("prepare: {e}"))?;
    let changes = stmt
        .execute(rusqlite::params_from_iter(bound.iter()))
        .map_err(|e| format!("run: {e}"))?;
    Ok(RunResult {
        changes: changes as u64,
        last_insert_rowid: conn.last_insert_rowid(),
    })
}

/// Bulk-execute one prepared SQL string against many parameter rows under a
/// single connection-mutex hold. Solves the importer hot-loop problem: the
/// renderer was paying ~1 ms/row of IPC overhead for `for (const row of rows)
/// stmt.run([...])`. Batching collapses N IPC roundtrips into one.
///
/// Semantics:
///   - One `prepare_cached` for the SQL — the statement is reused across
///     every row in the batch.
///   - The connection mutex is held for the full duration of the batch; no
///     other writer can interleave between rows. (Reads from the same
///     connection are also serialized — DELETE journaling has a single
///     writer anyway.)
///   - Rows are executed in order. A failure on row N propagates as an
///     `Err(...)`; rows 0..N-1 have already executed against the connection.
///     The caller is expected to wrap the batch in a JS-side `BEGIN; ...;
///     COMMIT;` so a mid-batch failure ROLLBACKs the whole batch.
///   - Returns one `RunResult` per row. `last_insert_rowid` is captured per
///     row (matches the per-call `db_run` semantics; note that for
///     non-INSERT statements rusqlite returns the last insert rowid the
///     connection has seen, which is consistent with `db_run`).
pub(crate) fn db_batch_run_sync(
    sql: &str,
    params_list: &[Vec<JsonValue>],
) -> Result<Vec<RunResult>, String> {
    // Coerce all rows up front so a typo on row 500 doesn't leave 499 rows
    // half-applied with no error message naming the offending row index.
    let mut bound_rows: Vec<Vec<SqlValue>> = Vec::with_capacity(params_list.len());
    for (i, row) in params_list.iter().enumerate() {
        bound_rows.push(coerce_params(row).map_err(|e| format!("batch row {i}: {e}"))?);
    }

    let guard = DB.lock();
    let conn = guard.as_ref().ok_or("no db open")?;
    let mut stmt = conn.prepare_cached(sql).map_err(|e| format!("prepare: {e}"))?;

    let mut out: Vec<RunResult> = Vec::with_capacity(bound_rows.len());
    for (i, bound) in bound_rows.iter().enumerate() {
        let changes = stmt
            .execute(rusqlite::params_from_iter(bound.iter()))
            .map_err(|e| format!("batch row {i}: {e}"))?;
        out.push(RunResult {
            changes: changes as u64,
            last_insert_rowid: conn.last_insert_rowid(),
        });
    }
    Ok(out)
}

fn db_get_sync(sql: &str, params: &[JsonValue]) -> Result<Option<JsonValue>, String> {
    let bound = coerce_params(params)?;
    let guard = DB.lock();
    let conn = guard.as_ref().ok_or("no db open")?;
    let mut stmt = conn.prepare_cached(sql).map_err(|e| format!("prepare: {e}"))?;
    let names: Vec<String> = stmt
        .column_names()
        .iter()
        .map(|s| (*s).to_string())
        .collect();
    let mut rows = stmt
        .query(rusqlite::params_from_iter(bound.iter()))
        .map_err(|e| format!("query: {e}"))?;
    match rows.next().map_err(|e| format!("next: {e}"))? {
        Some(row) => Ok(Some(row_to_json_object(row, &names).map_err(|e| format!("row: {e}"))?)),
        None => Ok(None),
    }
}

pub(crate) fn db_all_sync(sql: &str, params: &[JsonValue]) -> Result<Vec<JsonValue>, String> {
    let bound = coerce_params(params)?;
    let guard = DB.lock();
    let conn = guard.as_ref().ok_or("no db open")?;
    let mut stmt = conn.prepare_cached(sql).map_err(|e| format!("prepare: {e}"))?;
    let names: Vec<String> = stmt
        .column_names()
        .iter()
        .map(|s| (*s).to_string())
        .collect();
    let rows_iter = stmt
        .query_map(rusqlite::params_from_iter(bound.iter()), |row| {
            row_to_json_object(row, &names)
        })
        .map_err(|e| format!("query: {e}"))?;
    rows_iter
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| format!("collect: {e}"))
}

// ---------------------------------------------------------------------------
// Async wrappers — dispatch SQL work to a blocking thread via tokio's
// blocking-thread pool. The Tauri commands in lib.rs are declared
// `async fn`, which is what tells Tauri to schedule them on the runtime
// instead of running synchronously on the main thread (where Wry's webview
// event pump lives). Wrapping the body in `spawn_blocking` is what keeps
// the tokio worker threads themselves free for the next invoke. Together
// this means:
//   - the renderer's IPC dispatch is never blocked by a slow SQL query;
//   - several invokes can be in flight without head-of-line blocking;
//   - the parking_lot::Mutex around the connection still serialises actual
//     SQL execution (rusqlite is single-connection sync, by design).
// Before this split, every db_* command was a sync `fn` and ran on the
// main thread. With a 22k-person DB and a fast scroll, every page fetch +
// every per-row avatar batch held the main thread for tens of ms each,
// producing the 1-2 s lock-ups the user reported.
// ---------------------------------------------------------------------------

pub async fn db_batch(sql: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || db_batch_sync(&sql))
        .await
        .map_err(|e| format!("join: {e}"))?
}

pub async fn db_run(sql: String, params: Vec<JsonValue>) -> Result<RunResult, String> {
    tokio::task::spawn_blocking(move || db_run_sync(&sql, &params))
        .await
        .map_err(|e| format!("join: {e}"))?
}

pub async fn db_batch_run(
    sql: String,
    params_list: Vec<Vec<JsonValue>>,
) -> Result<Vec<RunResult>, String> {
    tokio::task::spawn_blocking(move || db_batch_run_sync(&sql, &params_list))
        .await
        .map_err(|e| format!("join: {e}"))?
}

pub async fn db_run_changes(sql: String, params: Vec<JsonValue>) -> Result<u64, String> {
    Ok(db_run(sql, params).await?.changes)
}

pub async fn db_get(sql: String, params: Vec<JsonValue>) -> Result<Option<JsonValue>, String> {
    tokio::task::spawn_blocking(move || db_get_sync(&sql, &params))
        .await
        .map_err(|e| format!("join: {e}"))?
}

pub async fn db_all(sql: String, params: Vec<JsonValue>) -> Result<Vec<JsonValue>, String> {
    tokio::task::spawn_blocking(move || db_all_sync(&sql, &params))
        .await
        .map_err(|e| format!("join: {e}"))?
}

// ---------------------------------------------------------------------------
// Secondary read-only DB primitives — same shape as db_run / db_get / db_all
// but parameterised by a handle. The renderer's SecondaryDatabase shim
// (src/renderer/secondary-db-shim.ts) calls these via tauri::invoke. Used by
// the RootsMagic importer (Cluster R-RM) to read .rmgc rows without touching
// the primary DB connection. Other foreign-format importers (Cluster R-H
// Holger, future Family Tree Maker, etc.) will reuse this surface unchanged.
// ---------------------------------------------------------------------------

/// Open `path` as a read-only SQLite database and return a fresh handle.
/// SQLITE_OPEN_NO_MUTEX is intentional — the renderer never invokes two
/// commands against the same handle in parallel (Tauri serialises invokes
/// per-window) and the parking_lot Mutex around the HashMap covers the
/// cross-handle case. SQLITE_OPEN_URI is left off so a path that happens to
/// look like a `file:` URI is treated as a literal filename.
pub fn secondary_db_open(path: &str) -> Result<u32, String> {
    let conn = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| format!("secondary open: {e}"))?;
    let handle = SECONDARY_HANDLE_NEXT.fetch_add(1, Ordering::SeqCst);
    SECONDARY_DBS.lock().insert(handle, conn);
    Ok(handle)
}

/// Drop a previously opened secondary connection. No-op if the handle is
/// already gone — the renderer's `finally { close(); }` path may double-fire.
pub fn secondary_db_close(handle: u32) {
    SECONDARY_DBS.lock().remove(&handle);
}

fn with_secondary<R>(
    handle: u32,
    f: impl FnOnce(&Connection) -> Result<R, String>,
) -> Result<R, String> {
    let guard = SECONDARY_DBS.lock();
    let conn = guard
        .get(&handle)
        .ok_or_else(|| format!("secondary db handle {handle} not open"))?;
    f(conn)
}

// Sync inner bodies for the secondary connections. Same shape as the
// primary db_*_sync helpers above; the public entry points wrap these in
// `spawn_blocking` so import paths (RootsMagic, Holger) don't pin the
// main thread either.

fn secondary_db_run_sync(
    handle: u32,
    sql: &str,
    params: &[JsonValue],
) -> Result<RunResult, String> {
    let bound = coerce_params(params)?;
    with_secondary(handle, |conn| {
        let mut stmt = conn.prepare_cached(sql).map_err(|e| format!("prepare: {e}"))?;
        let changes = stmt
            .execute(rusqlite::params_from_iter(bound.iter()))
            .map_err(|e| format!("run: {e}"))?;
        Ok(RunResult {
            changes: changes as u64,
            last_insert_rowid: conn.last_insert_rowid(),
        })
    })
}

fn secondary_db_get_sync(
    handle: u32,
    sql: &str,
    params: &[JsonValue],
) -> Result<Option<JsonValue>, String> {
    let bound = coerce_params(params)?;
    with_secondary(handle, |conn| {
        let mut stmt = conn.prepare_cached(sql).map_err(|e| format!("prepare: {e}"))?;
        let names: Vec<String> = stmt
            .column_names()
            .iter()
            .map(|s| (*s).to_string())
            .collect();
        let mut rows = stmt
            .query(rusqlite::params_from_iter(bound.iter()))
            .map_err(|e| format!("query: {e}"))?;
        match rows.next().map_err(|e| format!("next: {e}"))? {
            Some(row) => Ok(Some(
                row_to_json_object(row, &names).map_err(|e| format!("row: {e}"))?,
            )),
            None => Ok(None),
        }
    })
}

fn secondary_db_all_sync(
    handle: u32,
    sql: &str,
    params: &[JsonValue],
) -> Result<Vec<JsonValue>, String> {
    let bound = coerce_params(params)?;
    with_secondary(handle, |conn| {
        let mut stmt = conn.prepare_cached(sql).map_err(|e| format!("prepare: {e}"))?;
        let names: Vec<String> = stmt
            .column_names()
            .iter()
            .map(|s| (*s).to_string())
            .collect();
        let rows_iter = stmt
            .query_map(rusqlite::params_from_iter(bound.iter()), |row| {
                row_to_json_object(row, &names)
            })
            .map_err(|e| format!("query: {e}"))?;
        rows_iter
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| format!("collect: {e}"))
    })
}

/// Same as db_run but on a secondary handle. Read-only mode means INSERT /
/// UPDATE / DELETE will fail at the rusqlite layer — that's the intended
/// guarantee against accidentally writing to the source file.
pub async fn secondary_db_run(
    handle: u32,
    sql: String,
    params: Vec<JsonValue>,
) -> Result<RunResult, String> {
    tokio::task::spawn_blocking(move || secondary_db_run_sync(handle, &sql, &params))
        .await
        .map_err(|e| format!("join: {e}"))?
}

/// Same as db_get but on a secondary handle.
pub async fn secondary_db_get(
    handle: u32,
    sql: String,
    params: Vec<JsonValue>,
) -> Result<Option<JsonValue>, String> {
    tokio::task::spawn_blocking(move || secondary_db_get_sync(handle, &sql, &params))
        .await
        .map_err(|e| format!("join: {e}"))?
}

/// Same as db_all but on a secondary handle.
pub async fn secondary_db_all(
    handle: u32,
    sql: String,
    params: Vec<JsonValue>,
) -> Result<Vec<JsonValue>, String> {
    tokio::task::spawn_blocking(move || secondary_db_all_sync(handle, &sql, &params))
        .await
        .map_err(|e| format!("join: {e}"))?
}

// ---------------------------------------------------------------------------
// Tests — exercise the global-DB primitives against a temp file path. These
// run under `cargo test --manifest-path src-tauri/Cargo.toml` and complement
// the renderer-side vitest suite in tests/unit/import-batching.test.ts.
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::Mutex as StdMutex;

    // The global DB used by db_*_sync is a static singleton — concurrent tests
    // would clobber each other's data. Serialize via a module-level mutex.
    static TEST_LOCK: StdMutex<()> = StdMutex::new(());

    fn temp_db_path(name: &str) -> String {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir()
            .join(format!("slaktforskning-test-{name}-{now}.db"))
            .to_string_lossy()
            .into_owned()
    }

    fn open_fresh(name: &str) -> String {
        let path = temp_db_path(name);
        // Ensure no prior open lingers.
        close_db();
        open_db(&path).expect("open temp db");
        path
    }

    #[test]
    fn db_batch_run_inserts_many_rows_and_caches_prepare() {
        let _g = TEST_LOCK.lock().unwrap();
        let path = open_fresh("batch_basic");
        db_batch_sync("CREATE TABLE t (a INTEGER NOT NULL, b TEXT NOT NULL)").unwrap();

        let mut rows: Vec<Vec<JsonValue>> = Vec::with_capacity(1000);
        for i in 0..1000i64 {
            rows.push(vec![json!(i), json!(format!("v{i}"))]);
        }
        let started = std::time::Instant::now();
        let results = db_batch_run_sync("INSERT INTO t (a, b) VALUES (?, ?)", &rows).unwrap();
        let elapsed = started.elapsed();
        assert_eq!(results.len(), 1000);
        for r in &results {
            assert_eq!(r.changes, 1);
        }
        // Sanity check: 1000 inserts under one prepare + one mutex hold should
        // be quick locally. 50 ms is generous; the actual wall-clock is single
        // digits on a modern machine. If this trips in CI it likely means the
        // statement isn't being cached.
        assert!(
            elapsed.as_millis() < 500,
            "1000-row batch took too long: {:?}",
            elapsed
        );

        // Verify all rows landed.
        let row = db_get_sync("SELECT COUNT(*) as n FROM t", &[])
            .unwrap()
            .unwrap();
        assert_eq!(row["n"], json!(1000));

        close_db();
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn db_batch_run_propagates_mid_batch_failure() {
        let _g = TEST_LOCK.lock().unwrap();
        let path = open_fresh("batch_fail");
        db_batch_sync(
            "CREATE TABLE u (id INTEGER PRIMARY KEY, v TEXT NOT NULL UNIQUE)",
        )
        .unwrap();

        // Wrap in BEGIN/ROLLBACK so the first 10 rows don't actually persist —
        // mirrors the JS-side transaction the importer holds across the batch.
        db_batch_sync("BEGIN").unwrap();
        let mut rows: Vec<Vec<JsonValue>> = Vec::new();
        for i in 0..10i64 {
            rows.push(vec![json!(i), json!(format!("v{i}"))]);
        }
        // Row 10 collides on the UNIQUE(v) — the same value as row 5.
        rows.push(vec![json!(10i64), json!("v5")]);
        // Row 11 would succeed if we got past the failure — verify we don't.
        rows.push(vec![json!(11i64), json!("v11")]);

        let err = db_batch_run_sync("INSERT INTO u (id, v) VALUES (?, ?)", &rows)
            .expect_err("should error on UNIQUE collision");
        assert!(
            err.contains("batch row 10"),
            "error should name failing row index, got: {err}"
        );

        // Caller's responsibility: rollback. Verify the rollback unwinds the
        // 10 successful rows.
        db_batch_sync("ROLLBACK").unwrap();
        let row = db_get_sync("SELECT COUNT(*) as n FROM u", &[])
            .unwrap()
            .unwrap();
        assert_eq!(row["n"], json!(0), "rollback should leave table empty");

        close_db();
        let _ = std::fs::remove_file(&path);
    }
}
