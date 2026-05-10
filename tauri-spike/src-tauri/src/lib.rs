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

/// Generic file/folder picker. The renderer-side polyfill uses this to back
/// every Electron `dialog.showOpenDialog` / `showSaveDialog` call site.
#[tauri::command]
async fn dialog_pick(
    app: tauri::AppHandle,
    kind: String,
    title: Option<String>,
    extensions: Option<Vec<String>>,
    extension_label: Option<String>,
    default_name: Option<String>,
) -> Result<JsonValue, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = tokio::sync::oneshot::channel();
    let mut builder = app.dialog().file();
    if let Some(t) = title { builder = builder.set_title(t); }
    if let Some(name) = default_name { builder = builder.set_file_name(name); }
    if let Some(exts) = extensions {
        let label = extension_label.unwrap_or_else(|| "Files".into());
        let refs: Vec<&str> = exts.iter().map(|s| s.as_str()).collect();
        builder = builder.add_filter(&label, &refs);
    }
    match kind.as_str() {
        "openFile" => {
            builder.pick_file(move |chosen| { let _ = tx.send(chosen.map(|p| p.to_string())); });
        }
        "openDirectory" => {
            builder.pick_folder(move |chosen| { let _ = tx.send(chosen.map(|p| p.to_string())); });
        }
        "saveFile" => {
            builder.save_file(move |chosen| { let _ = tx.send(chosen.map(|p| p.to_string())); });
        }
        _ => return Err(format!("unknown pick kind: {kind}")),
    }
    let chosen = rx.await.map_err(|e| format!("dialog: {e}"))?;
    Ok(serde_json::json!({ "canceled": chosen.is_none(), "path": chosen }))
}

/// Read a file as utf-8 text. Used by import flows that need to feed the
/// chosen file's contents to a JS parser running in the renderer.
#[tauri::command]
fn fs_read_text(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("read: {e}"))
}

/// Write utf-8 text to a file. Used by GEDCOM export.
#[tauri::command]
fn fs_write_text(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| format!("write: {e}"))
}

/// Read a file as raw bytes (returned as base64 since serde-json can't
/// represent binary directly). Used for archive imports / binary parsing.
#[tauri::command]
fn fs_read_bytes_base64(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("read: {e}"))?;
    use base64::Engine;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

/// Reveal a file or folder in the OS file manager.
#[tauri::command]
fn shell_reveal(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener().reveal_item_in_dir(&path).map_err(|e| format!("reveal: {e}"))
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

/// Build the macOS menu bar with Cmd+N (new window) / Cmd+O (open DB) /
/// Cmd+, (settings) / Cmd+Z (undo) / Cmd+Shift+Z (redo). Other platforms
/// don't show the application menu but the accelerators still work.
fn build_menu(app: &tauri::AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    use tauri::menu::{AboutMetadataBuilder, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};

    let about_meta = AboutMetadataBuilder::new()
        .name(Some("Släktforskning".to_string()))
        .version(Some(env!("CARGO_PKG_VERSION").to_string()))
        .build();

    let app_menu = SubmenuBuilder::new(app, "Släktforskning")
        .item(&PredefinedMenuItem::about(app, Some("About Släktforskning"), Some(about_meta))?)
        .separator()
        .item(&MenuItemBuilder::with_id("settings", "Settings…").accelerator("CmdOrCtrl+,").build(app)?)
        .separator()
        .item(&PredefinedMenuItem::services(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, None)?)
        .item(&PredefinedMenuItem::hide_others(app, None)?)
        .item(&PredefinedMenuItem::show_all(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, None)?)
        .build()?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&MenuItemBuilder::with_id("new-window", "New Window").accelerator("CmdOrCtrl+N").build(app)?)
        .item(&MenuItemBuilder::with_id("open-db", "Open Database…").accelerator("CmdOrCtrl+O").build(app)?)
        .item(&MenuItemBuilder::with_id("new-db", "New Database…").accelerator("CmdOrCtrl+Shift+N").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("close-window", "Close Window").accelerator("CmdOrCtrl+W").build(app)?)
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .item(&MenuItemBuilder::with_id("undo", "Undo").accelerator("CmdOrCtrl+Z").build(app)?)
        .item(&MenuItemBuilder::with_id("redo", "Redo").accelerator("CmdOrCtrl+Shift+Z").build(app)?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .build()?;

    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&MenuItemBuilder::with_id("nav-persons", "Persons").accelerator("CmdOrCtrl+1").build(app)?)
        .item(&MenuItemBuilder::with_id("nav-places", "Places").accelerator("CmdOrCtrl+2").build(app)?)
        .item(&MenuItemBuilder::with_id("nav-sources", "Sources").accelerator("CmdOrCtrl+3").build(app)?)
        .item(&MenuItemBuilder::with_id("nav-media", "Media").accelerator("CmdOrCtrl+4").build(app)?)
        .item(&MenuItemBuilder::with_id("nav-quality", "Quality").accelerator("CmdOrCtrl+5").build(app)?)
        .item(&MenuItemBuilder::with_id("nav-reports", "Reports").accelerator("CmdOrCtrl+6").build(app)?)
        .separator()
        .item(&PredefinedMenuItem::fullscreen(app, None)?)
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .item(&PredefinedMenuItem::minimize(app, None)?)
        .item(&PredefinedMenuItem::maximize(app, None)?)
        .build()?;

    MenuBuilder::new(app)
        .items(&[&app_menu, &file_menu, &edit_menu, &view_menu, &window_menu])
        .build()
}

/// Open a new top-level window. Wired to the File → New Window menu item
/// and Cmd+N. Each window mounts its own Vue app, gets its own
/// window.api, and shares the same rusqlite connection in Rust.
fn open_new_window(app: &tauri::AppHandle) -> Result<(), String> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};
    let label = format!("win-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0));
    WebviewWindowBuilder::new(app, label, WebviewUrl::default())
        .title("Släktforskning")
        .inner_size(1280.0, 800.0)
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
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
            dialog_pick,
            fs_read_text,
            fs_write_text,
            fs_read_bytes_base64,
            shell_reveal,
            ui_server::ui_eval_response,
        ])
        .setup(|app| {
            ui_server::spawn(app.handle().clone());
            // Build + apply the application menu. Menu events fan out to
            // either a Rust handler (open-db, new-window) or are forwarded
            // to the focused webview as a 'menu:item' event the renderer
            // listens for (nav-*, undo, redo, settings).
            let menu = build_menu(app.handle())?;
            app.set_menu(menu)?;
            let app_for_events = app.handle().clone();
            app.on_menu_event(move |app, event| {
                use tauri::Emitter;
                let id = event.id().as_ref();
                match id {
                    "new-window" => { let _ = open_new_window(&app_for_events); }
                    _ => {
                        // Forward to renderer; the polyfill listens via
                        // listen('menu:item', ...) and dispatches to the
                        // matching window.api.* method.
                        let _ = app.emit("menu:item", id.to_string());
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
