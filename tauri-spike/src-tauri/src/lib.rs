// Tauri-spike entry. Wires DB commands. Mirrors the Electron app's IPC
// surface to whatever extent the spike needs to prove end-to-end works.

mod db;
mod mcp;
mod ui_server;

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

/// Returns the path of the currently-open DB, or None if none open. Backs
/// `window.api.db.getCurrent()`.
#[tauri::command]
fn db_current_path() -> Option<String> {
    db::current_path()
}

/// Show a native open-file dialog for picking a .db file. Returns the chosen
/// absolute path, or None if the user cancelled. The renderer then re-opens
/// the shim against this path. Backs `window.api.db.openExisting()`.
#[tauri::command]
async fn db_pick_existing(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter("SQLite database", &["db", "sqlite", "sqlite3"])
        .pick_file(move |chosen| {
            let _ = tx.send(chosen.map(|p| p.to_string()));
        });
    rx.await.map_err(|e| format!("dialog cancelled: {e}"))
}

/// Show a file picker for media, copy the chosen file into the active DB's
/// `<dbname>-media/` sibling folder (creating it if missing), and return the
/// relative file_ref + format the renderer's createMedia() expects. Mirrors
/// src/main/ipc/media.ts → media:attach.
#[tauri::command]
async fn media_pick_and_copy(app: tauri::AppHandle) -> Result<JsonValue, String> {
    use std::path::{Path, PathBuf};
    use tauri_plugin_dialog::DialogExt;

    let db_path = match db::current_path() {
        Some(p) => p,
        None => return Err("no DB open".into()),
    };

    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("Välj mediafil")
        .pick_file(move |chosen| { let _ = tx.send(chosen.map(|p| p.to_string())); });
    let src_str = match rx.await.map_err(|e| format!("dialog: {e}"))? {
        Some(p) => p,
        None => return Ok(serde_json::json!({ "canceled": true })),
    };
    let src = PathBuf::from(&src_str);

    let db_path = PathBuf::from(db_path);
    let db_dir = db_path.parent().unwrap_or_else(|| Path::new("."));
    let db_stem = db_path.file_stem().and_then(|s| s.to_str()).unwrap_or("family");
    let media_folder_name = format!("{db_stem}-media");
    let media_dir = db_dir.join(&media_folder_name);
    std::fs::create_dir_all(&media_dir).map_err(|e| format!("mkdir media: {e}"))?;

    let filename = src.file_name().and_then(|s| s.to_str()).unwrap_or("file").to_string();
    let mut dest = media_dir.join(&filename);
    if dest.exists() {
        // Disambiguate with a millis-suffix so two photos with the same name
        // don't clobber each other (matches the Electron path).
        let stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
        let ext = src.extension().and_then(|s| s.to_str()).unwrap_or("");
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let new_name = if ext.is_empty() {
            format!("{stem}_{now}")
        } else {
            format!("{stem}_{now}.{ext}")
        };
        dest = media_dir.join(new_name);
    }
    std::fs::copy(&src, &dest).map_err(|e| format!("copy: {e}"))?;

    let file_ref = format!("{}/{}", media_folder_name, dest.file_name().and_then(|s| s.to_str()).unwrap_or(""));
    let ext = dest.extension().and_then(|s| s.to_str()).map(|s| s.to_lowercase());
    let title = dest.file_stem().and_then(|s| s.to_str()).unwrap_or("media").to_string();

    Ok(serde_json::json!({
        "canceled": false,
        "fileRef": file_ref,
        "format": ext,
        "title": title,
    }))
}

/// Read a media file (resolved relative to the active DB's directory) and
/// return a base64 data URL. Backs window.api.media.readAsDataUrl().
#[tauri::command]
fn media_read_as_data_url(file_ref: String) -> Result<Option<String>, String> {
    use std::path::PathBuf;
    let db_path = match db::current_path() {
        Some(p) => p,
        None => return Err("no DB open".into()),
    };
    let db_dir = PathBuf::from(&db_path).parent().unwrap_or(std::path::Path::new(".")).to_path_buf();
    let abs = if std::path::Path::new(&file_ref).is_absolute() {
        PathBuf::from(&file_ref)
    } else {
        db_dir.join(&file_ref)
    };
    if !abs.exists() {
        return Ok(None);
    }
    let bytes = std::fs::read(&abs).map_err(|e| format!("read: {e}"))?;
    let mime = match abs.extension().and_then(|s| s.to_str()).map(|s| s.to_lowercase()).as_deref() {
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("png") => "image/png",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("heic") | Some("heif") => "image/heic",
        Some("svg") => "image/svg+xml",
        Some("pdf") => "application/pdf",
        Some("mp4") => "video/mp4",
        Some("mov") => "video/quicktime",
        _ => "application/octet-stream",
    };
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(Some(format!("data:{mime};base64,{b64}")))
}

/// Show a native save-file dialog for creating a new .db. Returns the chosen
/// absolute path, or None if the user cancelled. Backs `window.api.db.createNew()`.
#[tauri::command]
async fn db_pick_new(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter("SQLite database", &["db"])
        .set_file_name("family.db")
        .save_file(move |chosen| {
            let _ = tx.send(chosen.map(|p| p.to_string()));
        });
    rx.await.map_err(|e| format!("dialog cancelled: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
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
            db_current_path,
            db_pick_existing,
            db_pick_new,
            media_pick_and_copy,
            media_read_as_data_url,
            ui_server::ui_eval_response,
        ])
        .setup(|app| {
            ui_server::spawn(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
