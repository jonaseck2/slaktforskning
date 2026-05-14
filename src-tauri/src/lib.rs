// Tauri-spike entry. Wires DB commands. Mirrors the Electron app's IPC
// surface to whatever extent the spike needs to prove end-to-end works.

mod db;
mod import;
mod mcp;
mod media;
mod ui_server;
mod wire;

use db::{AncestorNode, DbStats, PersonRow, RunResult};
use mcp::McpProbe;
use wire::JsonValueWire;

#[specta::specta]
#[tauri::command]
fn db_open(path: String) -> Result<(), String> {
    db::open_db(&path)
}

#[specta::specta]
#[tauri::command]
fn db_close() {
    db::close_db();
}

#[specta::specta]
#[tauri::command]
fn db_is_open() -> bool {
    db::is_open()
}

#[specta::specta]
#[tauri::command]
async fn db_stats() -> Result<DbStats, String> {
    tokio::task::spawn_blocking(db::db_stats)
        .await
        .map_err(|e| format!("join: {e}"))?
}

#[specta::specta]
#[tauri::command]
async fn persons_list(limit: u32, offset: u32) -> Result<Vec<PersonRow>, String> {
    tokio::task::spawn_blocking(move || db::persons_list(limit, offset))
        .await
        .map_err(|e| format!("join: {e}"))?
}

#[specta::specta]
#[tauri::command]
async fn get_ancestor_tree(focus_id: String, max_depth: u32) -> Result<Vec<AncestorNode>, String> {
    tokio::task::spawn_blocking(move || db::get_ancestor_tree(&focus_id, max_depth))
        .await
        .map_err(|e| format!("join: {e}"))?
}

#[specta::specta]
#[tauri::command]
async fn probe_mcp_sidecar(
    app: tauri::AppHandle,
    repo_root: String,
    db_path: String,
) -> McpProbe {
    mcp::probe_mcp_sidecar(&app, &repo_root, &db_path).await
}

#[specta::specta]
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

#[specta::specta]
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

// All db_* commands are declared `async fn` so Tauri schedules them on the
// tokio runtime instead of running synchronously on the main (Wry) thread.
// The async bodies in src-tauri/src/db.rs further dispatch to a blocking
// thread via `spawn_blocking`. See the rationale comment in db.rs above
// `db_batch`. Keeping these declared `fn` (sync) was the root cause of the
// 1-2 s GUI lock-ups during list scrolling and chart drawing in the
// pre-fix Tauri build.

#[specta::specta]
#[tauri::command(rename_all = "camelCase")]
async fn db_batch(sql: String) -> Result<(), String> {
    db::db_batch(sql).await
}

#[specta::specta]
#[tauri::command(rename_all = "camelCase")]
async fn db_run(sql: String, params: Option<Vec<JsonValueWire>>) -> Result<RunResult, String> {
    db::db_run(sql, wire::unwrap_params(params)).await
}

/// Bulk-run one prepared SQL string against many parameter rows in a single
/// IPC roundtrip + a single connection-mutex hold. The renderer importer
/// loop's per-row `db_run` was the dominant cost on a 1.5 GB Holger import
/// (millions of rows × ~1 ms IPC each = hours). Batching collapses N
/// roundtrips into one. The Rust side iterates the rows under one
/// `prepare_cached` and one mutex hold; the surrounding JS-side
/// `BEGIN/COMMIT` is unchanged.
#[specta::specta]
#[tauri::command(rename_all = "camelCase")]
async fn db_batch_run(
    sql: String,
    params_list: Vec<Vec<JsonValueWire>>,
) -> Result<Vec<RunResult>, String> {
    db::db_batch_run(sql, wire::unwrap_params_list(params_list)).await
}

#[specta::specta]
#[tauri::command(rename_all = "camelCase")]
async fn db_run_changes(sql: String, params: Option<Vec<JsonValueWire>>) -> Result<u32, String> {
    // u32 not u64 so the binding renders as `number`. SQLite per-statement
    // change counts comfortably fit a u32 for any realistic workload
    // (4 billion rows of a single statement = absurd). If a single
    // statement ever changes more than u32::MAX rows we'll know.
    let n = db::db_run_changes(sql, wire::unwrap_params(params)).await?;
    Ok(n.try_into().map_err(|_| format!("change count overflow: {n}"))?)
}

#[specta::specta]
#[tauri::command(rename_all = "camelCase")]
async fn db_get(
    sql: String,
    params: Option<Vec<JsonValueWire>>,
) -> Result<Option<JsonValueWire>, String> {
    Ok(db::db_get(sql, wire::unwrap_params(params))
        .await?
        .map(JsonValueWire))
}

#[specta::specta]
#[tauri::command(rename_all = "camelCase")]
async fn db_all(
    sql: String,
    params: Option<Vec<JsonValueWire>>,
) -> Result<Vec<JsonValueWire>, String> {
    Ok(db::db_all(sql, wire::unwrap_params(params))
        .await?
        .into_iter()
        .map(JsonValueWire)
        .collect())
}

/// Returns the absolute path to the default database file. Resolution order:
///   1. `SLAKTFORSKNING_DB` env override (used by the Playwright fixture).
///   2. `<exe-dir>/family.db` when the exe's directory is writable. This makes
///      the app portable — drop the zip on a USB stick, the family.db lives
///      alongside the exe and travels with it.
///   3. `<app_data_dir>/family.db` as the fallback for installer setups
///      where the exe lives in Program Files (read-only without admin).
///
/// Creates the parent dir if missing. The renderer calls this on first boot
/// so the database persists across launches without a file picker.
#[specta::specta]
#[tauri::command]
fn default_db_path(app: tauri::AppHandle) -> Result<String, String> {
    use std::fs;
    use std::io::Write;
    use std::path::{Path, PathBuf};
    use tauri::Manager;

    fn is_dir_writable(dir: &Path) -> bool {
        let probe = dir.join(".slaktforskning-write-probe");
        match fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&probe)
        {
            Ok(mut f) => {
                let ok = f.write_all(b"").is_ok();
                drop(f);
                let _ = fs::remove_file(&probe);
                ok
            }
            Err(_) => false,
        }
    }

    if let Ok(override_path) = std::env::var("SLAKTFORSKNING_DB") {
        if !override_path.is_empty() {
            let p = PathBuf::from(&override_path);
            if let Some(parent) = p.parent() {
                if !parent.as_os_str().is_empty() {
                    fs::create_dir_all(parent)
                        .map_err(|e| format!("create_dir_all: {e}"))?;
                }
            }
            return Ok(override_path);
        }
    }

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            if is_dir_writable(exe_dir) {
                return Ok(exe_dir.join("family.db").to_string_lossy().into_owned());
            }
        }
    }

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("create_dir_all: {e}"))?;
    Ok(dir.join("family.db").to_string_lossy().into_owned())
}

/// Returns the path of the currently-open DB, or None if none open. Backs
/// `window.api.db.getCurrent()`.
#[specta::specta]
#[tauri::command]
fn db_current_path() -> Option<String> {
    db::current_path()
}

/// Show a native open-file dialog for picking a .db file. Returns the chosen
/// absolute path, or None if the user cancelled. The renderer then re-opens
/// the shim against this path. Backs `window.api.db.openExisting()`.
#[specta::specta]
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
#[specta::specta]
#[tauri::command]
async fn media_pick_and_copy(app: tauri::AppHandle) -> Result<JsonValueWire, String> {
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
        None => return Ok(JsonValueWire(serde_json::json!({ "canceled": true }))),
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

    Ok(JsonValueWire(serde_json::json!({
        "canceled": false,
        "fileRef": file_ref,
        "format": ext,
        "title": title,
    })))
}

/// Generic file/folder picker. The renderer-side polyfill uses this to back
/// every Electron `dialog.showOpenDialog` / `showSaveDialog` call site.
#[specta::specta]
#[tauri::command]
async fn dialog_pick(
    app: tauri::AppHandle,
    kind: String,
    title: Option<String>,
    extensions: Option<Vec<String>>,
    extension_label: Option<String>,
    default_name: Option<String>,
) -> Result<JsonValueWire, String> {
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
    Ok(JsonValueWire(serde_json::json!({ "canceled": chosen.is_none(), "path": chosen })))
}

/// Read a file as utf-8 text. Used by import flows that need to feed the
/// chosen file's contents to a JS parser running in the renderer.
#[specta::specta]
#[tauri::command]
fn fs_read_text(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("read: {e}"))
}

/// Write utf-8 text to a file. Used by GEDCOM export.
#[specta::specta]
#[tauri::command]
fn fs_write_text(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| format!("write: {e}"))
}

/// Read a file as raw bytes (returned as base64 since serde-json can't
/// represent binary directly). Used for archive imports / binary parsing.
#[specta::specta]
#[tauri::command]
fn fs_read_bytes_base64(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("read: {e}"))?;
    use base64::Engine;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

/// Write raw bytes (base64-encoded for the JSON wire) to a file. Creates
/// parent directories as needed. Used by archive export and per-media
/// writes during archive import in the Tauri build.
#[specta::specta]
#[tauri::command]
fn fs_write_bytes_base64(path: String, b64: String) -> Result<(), String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64.as_bytes())
        .map_err(|e| format!("decode base64: {e}"))?;
    if let Some(parent) = std::path::Path::new(&path).parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
        }
    }
    std::fs::write(&path, bytes).map_err(|e| format!("write: {e}"))
}

/// Write a base64-encoded blob to a fresh file inside the OS temp directory
/// and return its absolute path. Used when the renderer needs to hand a
/// binary file (a .rmgc, an extracted .mdb, etc.) to a Rust command that
/// requires a real on-disk path — typically to open it as a secondary
/// SQLite connection. `name` is appended to a millisecond-precision prefix
/// so concurrent imports don't collide; the renderer is responsible for
/// calling `fs_remove_file` after the import completes.
#[specta::specta]
#[tauri::command(rename_all = "camelCase")]
fn fs_write_temp_bytes_base64(name: String, b64: String) -> Result<String, String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64.as_bytes())
        .map_err(|e| format!("decode: {e}"))?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let safe_name = name.replace(['/', '\\', '\0'], "_");
    let path = std::env::temp_dir().join(format!("slaktforskning-{now}-{safe_name}"));
    std::fs::write(&path, &bytes).map_err(|e| format!("write: {e}"))?;
    Ok(path.to_string_lossy().into_owned())
}

/// Best-effort delete of a single file. Used to clean up temp files written
/// by `fs_write_temp_bytes_base64` after an import completes (success or
/// failure path). Missing-file errors are swallowed because the typical
/// caller doesn't care whether the cleanup actually had work to do.
#[specta::specta]
#[tauri::command]
fn fs_remove_file(path: String) -> Result<(), String> {
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("remove: {e}")),
    }
}

// ── Holger / OurKind import commands (Cluster R-H) ─────────────────────────
// The renderer's polyfill in src/renderer/tauri-window-api.ts drives the
// Holger import in three steps:
//   1. holger_extract_ged: reads .ged bytes out of a .zip / .ged / directory
//   2. (renderer parses + runs importFromHolgerWithBytes against the DB)
//   3. holger_bulk_copy_media + holger_consolidate_media: stage the media
//      folder under <dbname>-media/ and rewrite absolute file_ref values.
// All three live in src-tauri/src/import.rs; these are the thin invoke
// wrappers.

#[specta::specta]
#[tauri::command(rename_all = "camelCase")]
fn holger_extract_ged(source_path: String) -> Result<import::ExtractGedResult, String> {
    import::extract_ged(&source_path)
}

#[specta::specta]
#[tauri::command(rename_all = "camelCase")]
fn holger_bulk_copy_media(src_dir: String, dest_dir: String) -> Result<import::BulkCopyResult, String> {
    import::bulk_copy_media(&src_dir, &dest_dir)
}

#[specta::specta]
#[tauri::command(rename_all = "camelCase")]
fn holger_consolidate_media(
    db_path: String,
    bulk_copied_from_dir: Option<String>,
) -> Result<import::ConsolidateResult, String> {
    import::consolidate_media(&db_path, bulk_copied_from_dir.as_deref())
}

/// Recursively delete a directory (e.g. the temp dir created when
/// extracting a Holger backup zip). Used by the renderer's polyfill in
/// the `finally` block of `api.import.holgerRun`. No-op when missing.
#[specta::specta]
#[tauri::command]
fn fs_remove_dir(path: String) -> Result<(), String> {
    import::remove_dir(&path)
}

// ── Secondary read-only DB commands ────────────────────────────────────────
// Open an arbitrary SQLite file (e.g. a .rmgc) as a read-only secondary
// connection. The renderer drives the import via the SecondaryDatabase shim
// in src/renderer/secondary-db-shim.ts, which mirrors the same Statement /
// Database surface the importer's queryAll(rmDb, ...) calls expect. Used
// today by the RootsMagic importer (Cluster R-RM) and intentionally
// generic so Holger (Cluster R-H) and any future foreign-format importer
// can reuse the same primitives without bespoke Rust additions.

#[specta::specta]
#[tauri::command(rename_all = "camelCase")]
fn secondary_db_open(path: String) -> Result<u32, String> {
    db::secondary_db_open(&path)
}

#[specta::specta]
#[tauri::command(rename_all = "camelCase")]
fn secondary_db_close(handle: u32) {
    db::secondary_db_close(handle)
}

#[specta::specta]
#[tauri::command(rename_all = "camelCase")]
async fn secondary_db_run(
    handle: u32,
    sql: String,
    params: Option<Vec<JsonValueWire>>,
) -> Result<RunResult, String> {
    db::secondary_db_run(handle, sql, wire::unwrap_params(params)).await
}

#[specta::specta]
#[tauri::command(rename_all = "camelCase")]
async fn secondary_db_get(
    handle: u32,
    sql: String,
    params: Option<Vec<JsonValueWire>>,
) -> Result<Option<JsonValueWire>, String> {
    Ok(db::secondary_db_get(handle, sql, wire::unwrap_params(params))
        .await?
        .map(JsonValueWire))
}

#[specta::specta]
#[tauri::command(rename_all = "camelCase")]
async fn secondary_db_all(
    handle: u32,
    sql: String,
    params: Option<Vec<JsonValueWire>>,
) -> Result<Vec<JsonValueWire>, String> {
    Ok(db::secondary_db_all(handle, sql, wire::unwrap_params(params))
        .await?
        .into_iter()
        .map(JsonValueWire)
        .collect())
}

/// Reveal a file or folder in the OS file manager.
#[specta::specta]
#[tauri::command]
fn shell_reveal(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener().reveal_item_in_dir(&path).map_err(|e| format!("reveal: {e}"))
}

/// Returns the Cargo package version string (matches Cargo.toml `[package]
/// version`). Backs `window.api.app.getVersion()` in the Tauri build.
#[specta::specta]
#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Copy an existing file to a new path. Used by `backup.backup` to save a
/// snapshot of the active database. Both paths are absolute.
#[specta::specta]
#[tauri::command]
fn fs_copy_file(src: String, dest: String) -> Result<(), String> {
    std::fs::copy(&src, &dest).map(|_| ()).map_err(|e| format!("copy: {e}"))
}

/// Open a file or folder with the OS's default associated application.
/// Mirrors Electron's `shell.openPath(absPath)` used by media:openFile —
/// e.g. clicking "Open file" on a JPG media row launches Photos on macOS,
/// the default image viewer on Linux, etc.
#[specta::specta]
#[tauri::command]
fn shell_open_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| format!("open_path: {e}"))
}

/// Read a media file (resolved relative to the active DB's directory) and
/// return a base64 data URL. Backs window.api.media.readAsDataUrl().
///
/// Async + spawn_blocking for the same reason the db_* commands are: avatar
/// thumbnails are fetched per-row during list scrolls, and a sync command
/// would block the Wry main thread on every read + base64 encode.
#[specta::specta]
#[tauri::command]
async fn media_read_as_data_url(file_ref: String) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || {
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
    })
    .await
    .map_err(|e| format!("join: {e}"))?
}

/// Show a native save-file dialog for creating a new .db. Returns the chosen
/// absolute path, or None if the user cancelled. Backs `window.api.db.createNew()`.
#[specta::specta]
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

/// Read a file shipped as a Tauri bundled resource (declared in
/// `tauri.conf.json` under `bundle.resources`). Returns the file's UTF-8
/// contents. Used by the renderer's `app.readThirdPartyLicenses` polyfill
/// to surface the bundled THIRD_PARTY_LICENSES.txt; generic enough to be
/// reused for any other text resource we ship later.
///
/// Tauri's `app.path().resource_dir()` gives the platform-specific resource
/// root (on macOS that's `<bundle>.app/Contents/Resources/`). When a
/// resource is declared with a `..` prefix (e.g. `../THIRD_PARTY_LICENSES.txt`
/// because the file lives at the repo root next to `src-tauri/`), Tauri
/// rewrites the leading `..` to a literal `_up_` directory inside the bundle.
/// We try the flat name first (covers resources declared without `..`) and
/// fall back to the `_up_` location.
#[specta::specta]
#[tauri::command]
fn read_bundled_resource(app: tauri::AppHandle, name: String) -> Result<String, String> {
    use tauri::Manager;
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("resource_dir: {e}"))?;
    let candidates = [
        resource_dir.join(&name),
        resource_dir.join("_up_").join(&name),
    ];
    for p in &candidates {
        if p.exists() {
            return std::fs::read_to_string(p).map_err(|e| format!("read {}: {e}", p.display()));
        }
    }
    Err(format!(
        "bundled resource not found: {name} (looked in {:?})",
        candidates.iter().map(|p| p.display().to_string()).collect::<Vec<_>>()
    ))
}

/// Build the macOS menu bar with Cmd+N (new window) / Cmd+O (open DB) /
/// Cmd+, (settings) / Cmd+Z (undo) / Cmd+Shift+Z (redo). Other platforms
/// don't show the application menu but the accelerators still work.
fn build_menu(app: &tauri::AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};

    // Custom "About" item (id="about") instead of PredefinedMenuItem::about so
    // the click routes through on_menu_event → 'menu:item' → the renderer's
    // AboutModal (via the 'app:openAbout' window event), giving us a
    // branded in-app About dialog instead of the native macOS About panel.
    let app_menu = SubmenuBuilder::new(app, "Släktforskning")
        .item(&MenuItemBuilder::with_id("about", "About Släktforskning").build(app)?)
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
/// Construct the Specta builder. This is the single source of truth for the
/// app's IPC surface — `run()` builds it once, hands it to
/// `tauri::Builder::invoke_handler()` for runtime dispatch, and exports it to
/// `src/renderer/bindings.ts` in debug builds for the renderer's static
/// analysis. Adding a Tauri command means: annotate the Rust function with
/// `#[tauri::command] #[specta::specta]`, add it to `collect_commands!` here,
/// rebuild — the TypeScript binding appears in `bindings.ts` automatically.
pub fn specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new()
        .commands(tauri_specta::collect_commands![
            db_open,
            db_close,
            db_is_open,
            db_stats,
            persons_list,
            get_ancestor_tree,
            probe_mcp_sidecar,
            open_second_window,
            broadcast_data_changed,
            db_batch,
            db_run,
            db_batch_run,
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
            fs_write_bytes_base64,
            fs_write_temp_bytes_base64,
            fs_remove_file,
            fs_remove_dir,
            holger_extract_ged,
            holger_bulk_copy_media,
            holger_consolidate_media,
            secondary_db_open,
            secondary_db_close,
            secondary_db_run,
            secondary_db_get,
            secondary_db_all,
            shell_reveal,
            shell_open_path,
            app_version,
            fs_copy_file,
            read_bundled_resource,
            media::media_thumbnail,
            media::website_bake_preview_thumbnails,
            media::website_load_static_index_html,
            media::website_export_media,
            ui_server::ui_eval_response,
        ])
}

pub fn run() {
    // Build the Specta builder once. It's both the IPC dispatcher (passed
    // into `.invoke_handler` below) and the source of `bindings.ts` (exported
    // in debug builds + by `cargo test export_specta_bindings`).
    let specta = specta_builder();

    // Export bindings at app startup in debug builds. This is also produced
    // out-of-band by `cargo test export_specta_bindings` and by the
    // `bindgen` example binary (`cargo run --example bindgen`) so CI and the
    // build pipeline don't need to launch the app to refresh bindings.ts.
    #[cfg(debug_assertions)]
    specta
        .export(
            specta_typescript::Typescript::default(),
            "../src/renderer/bindings.ts",
        )
        .expect("Failed to export Specta TypeScript bindings");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // Shell plugin powers `mcp::spawn_bundled_mcp` (sidecar API). It is
        // intentionally minimal: capabilities/default.json grants no other
        // shell permissions, so the renderer cannot run arbitrary commands.
        .plugin(tauri_plugin_shell::init())
        // Auto-updater. Endpoints + pubkey live in tauri.conf.json under
        // `plugins.updater`. The renderer triggers checks via the
        // `plugin:updater|check` invoke (see src/renderer/tauri-window-api.ts).
        .plugin(tauri_plugin_updater::Builder::new().build())
        // IPC dispatch comes from the Specta builder — same command set
        // declared in `collect_commands!` above, no hand-maintained mirror.
        // Renames a Rust command parameter, breaks `tsc --noEmit` at the
        // matching renderer call site.
        .invoke_handler(specta.invoke_handler())
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

#[cfg(test)]
mod specta_export_tests {
    use super::*;

    /// Regenerate `src/renderer/bindings.ts` from the Specta builder.
    ///
    /// Runs as part of `cargo test`, which means CI refreshes bindings on
    /// every PR. If a developer forgets to commit the regenerated file, the
    /// next CI run produces a diff. The renderer's static analysis depends
    /// on `bindings.ts` being current, so this test exists to make that
    /// guaranteed mechanically.
    #[test]
    fn export_specta_bindings() {
        specta_builder()
            .export(
                specta_typescript::Typescript::default(),
                "../src/renderer/bindings.ts",
            )
            .expect("Failed to export Specta TypeScript bindings");
    }
}
