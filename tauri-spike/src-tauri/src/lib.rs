// Tauri-spike entry. Wires DB commands. Mirrors the Electron app's IPC
// surface to whatever extent the spike needs to prove end-to-end works.

mod db;
mod mcp;

use db::{AncestorNode, DbStats, PersonRow, RunResult};
use mcp::McpProbe;
use serde_json::Value as JsonValue;

#[tauri::command]
fn db_open(path: String) -> Result<(), String> {
    db::open_db(&path)
}

#[tauri::command]
fn db_close() {
    db::close_db();
}

#[tauri::command]
fn db_is_open() -> bool {
    db::is_open()
}

#[tauri::command]
fn db_stats() -> Result<DbStats, String> {
    db::db_stats()
}

#[tauri::command]
fn persons_list(limit: u32, offset: u32) -> Result<Vec<PersonRow>, String> {
    db::persons_list(limit, offset)
}

#[tauri::command]
fn get_ancestor_tree(focus_id: String, max_depth: u32) -> Result<Vec<AncestorNode>, String> {
    db::get_ancestor_tree(&focus_id, max_depth)
}

#[tauri::command]
async fn probe_mcp_sidecar(repo_root: String, db_path: String) -> McpProbe {
    mcp::probe_mcp_sidecar(&repo_root, &db_path).await
}

#[tauri::command]
fn open_second_window(app: tauri::AppHandle, label: String) -> Result<(), String> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};
    WebviewWindowBuilder::new(&app, label, WebviewUrl::default())
        .title("Spike — second window")
        .inner_size(900.0, 600.0)
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn broadcast_data_changed(app: tauri::AppHandle, kind: String) -> Result<(), String> {
    use tauri::Emitter;
    app.emit("data:changed", kind).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Generic primitives bound to Tauri commands. Mirrors src/api/db.ts surface
// (queryOne / queryAll / runSql / runSqlChanges + db.exec). The renderer-side
// TS shim invokes these via tauri::invoke after Phase 2.5 lands.
// ---------------------------------------------------------------------------

#[tauri::command(rename_all = "camelCase")]
fn db_batch(sql: String) -> Result<(), String> {
    db::db_batch(&sql)
}

#[tauri::command(rename_all = "camelCase")]
fn db_run(sql: String, params: Option<Vec<JsonValue>>) -> Result<RunResult, String> {
    db::db_run(&sql, &params.unwrap_or_default())
}

#[tauri::command(rename_all = "camelCase")]
fn db_run_changes(sql: String, params: Option<Vec<JsonValue>>) -> Result<u64, String> {
    db::db_run_changes(&sql, &params.unwrap_or_default())
}

#[tauri::command(rename_all = "camelCase")]
fn db_get(sql: String, params: Option<Vec<JsonValue>>) -> Result<Option<JsonValue>, String> {
    db::db_get(&sql, &params.unwrap_or_default())
}

#[tauri::command(rename_all = "camelCase")]
fn db_all(sql: String, params: Option<Vec<JsonValue>>) -> Result<Vec<JsonValue>, String> {
    db::db_all(&sql, &params.unwrap_or_default())
}

/// Returns the absolute path to the default database file inside the app's
/// per-user data directory. Creates the parent dir if missing. The renderer
/// uses this on first boot so the spike persists across launches without a
/// file picker.
#[tauri::command]
fn default_db_path(app: tauri::AppHandle) -> Result<String, String> {
    use std::fs;
    use tauri::Manager;
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("create_dir_all: {e}"))?;
    let p = dir.join("family.db");
    Ok(p.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            db_open,
            db_close,
            db_is_open,
            db_stats,
            persons_list,
            get_ancestor_tree,
            probe_mcp_sidecar,
            open_second_window,
            broadcast_data_changed,
            // Generic primitives the TS shim invokes
            db_batch,
            db_run,
            db_run_changes,
            db_get,
            db_all,
            default_db_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
