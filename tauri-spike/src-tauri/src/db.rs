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
