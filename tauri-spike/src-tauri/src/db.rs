// Minimal DB layer for the Tauri spike. One global connection guarded
// by a parking_lot Mutex; not optimised for concurrent reads. The
// production port would use a connection pool — for the spike, single
// connection is enough to prove the architecture.

use once_cell::sync::Lazy;
use parking_lot::Mutex;
use rusqlite::Connection;
use serde::Serialize;

static DB: Lazy<Mutex<Option<Connection>>> = Lazy::new(|| Mutex::new(None));

pub fn open_db(path: &str) -> Result<(), String> {
    let conn = Connection::open(path).map_err(|e| format!("open: {e}"))?;
    // WAL + foreign keys, mirroring src/main/database.ts.
    conn.execute_batch(
        "PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;"
    ).map_err(|e| format!("pragma: {e}"))?;
    *DB.lock() = Some(conn);
    Ok(())
}

pub fn close_db() {
    *DB.lock() = None;
}

pub fn is_open() -> bool {
    DB.lock().is_some()
}

#[derive(Serialize)]
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
