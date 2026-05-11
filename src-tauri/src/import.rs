// Holger / OurKind import support — Rust-side fs work that the Tauri
// renderer can't do itself. The renderer's polyfill in
// src/renderer/tauri-window-api.ts orchestrates this:
//
//   1. holger_extract_ged(source) → returns the .ged bytes (base64) for
//      a `.zip`, `.ged`, or directory input. Handles the common Holger
//      shape (a backup zip with the .ged at any depth) without forcing
//      the renderer to know about zip layouts.
//   2. (renderer parses + imports the .ged via the existing
//      importFromHolgerWithBytes path)
//   3. holger_bulk_copy_media(srcDir, destDir) → recursive copy of the
//      user-selected Media folder into <dbname>-media/. Run BEFORE the
//      import so consolidate's fast-path can hit existing dest files.
//   4. holger_consolidate_media(dbPath) → walks the `media` table on the
//      primary connection, copies any absolute file_ref into
//      <dbname>-media/, and rewrites the row to the relative form.
//      Equivalent to `consolidateMediaFolder` in src/api/media_consolidate.ts
//      but in Rust because the renderer has no fs.
//
// Cleanup:
//   - holger_extract_ged returns a temp_dir alongside the bytes; the
//     renderer calls fs_remove_dir on it once the import completes.
//   - holger_bulk_copy_media + holger_consolidate_media don't allocate
//     any cleanup state.

use base64::Engine;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use crate::db;

// ---------------------------------------------------------------------------
// 1. Extract / read the .ged file
// ---------------------------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractGedResult {
    /// .ged bytes, base64 (the renderer decodes to Uint8Array, then
    /// decodeGedcomBytes does the encoding sniff).
    pub ged_bytes_b64: String,
    /// Absolute path of the temp dir created when extracting from a zip,
    /// or None for direct .ged / directory inputs. The renderer is
    /// expected to call `fs_remove_dir` on it once the import is done.
    pub temp_dir: Option<String>,
    /// Filename of the .ged the bytes came from (debug aid; not load-bearing).
    pub ged_name: String,
}

/// Extract a .ged file from a Holger backup. Accepts:
///   - `.ged` file → reads it directly
///   - `.zip` archive → extracts to a temp dir, returns the largest
///     embedded .ged (Holger backups bundle one .ged at any depth + a
///     Media tree)
///   - directory → walks recursively for .ged files, picks the largest
pub fn extract_ged(source_path: &str) -> Result<ExtractGedResult, String> {
    let source = Path::new(source_path);
    let meta = fs::metadata(source).map_err(|e| format!("stat {source_path}: {e}"))?;

    if meta.is_dir() {
        let ged_path = pick_largest_ged_in_dir(source)?
            .ok_or_else(|| holger_export_instructions())?;
        let bytes = fs::read(&ged_path).map_err(|e| format!("read {}: {e}", ged_path.display()))?;
        return Ok(ExtractGedResult {
            ged_bytes_b64: base64::engine::general_purpose::STANDARD.encode(&bytes),
            temp_dir: None,
            ged_name: ged_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown.ged")
                .to_string(),
        });
    }

    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
        .unwrap_or_default();

    match ext.as_str() {
        "ged" => {
            let bytes = fs::read(source).map_err(|e| format!("read {source_path}: {e}"))?;
            Ok(ExtractGedResult {
                ged_bytes_b64: base64::engine::general_purpose::STANDARD.encode(&bytes),
                temp_dir: None,
                ged_name: source
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("unknown.ged")
                    .to_string(),
            })
        }
        "zip" => extract_largest_ged_from_zip(source),
        other => Err(format!(
            "Unsupported file: .{other}. Provide a .ged, .zip, or directory."
        )),
    }
}

fn extract_largest_ged_from_zip(zip_path: &Path) -> Result<ExtractGedResult, String> {
    let file = fs::File::open(zip_path).map_err(|e| format!("open zip: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("read zip: {e}"))?;

    // Two-pass: first find the largest .ged entry by uncompressed size,
    // then extract just that one. Keeps memory bounded for backup zips
    // that bundle a multi-GB Media tree.
    let mut best_idx: Option<usize> = None;
    let mut best_size: u64 = 0;
    let mut best_name: String = String::new();
    for i in 0..archive.len() {
        let entry = archive
            .by_index(i)
            .map_err(|e| format!("zip index {i}: {e}"))?;
        if entry.is_dir() {
            continue;
        }
        let name = entry.name().to_string();
        if !name.to_ascii_lowercase().ends_with(".ged") {
            continue;
        }
        if entry.size() >= best_size {
            best_size = entry.size();
            best_idx = Some(i);
            best_name = name;
        }
    }
    let idx = best_idx.ok_or_else(holger_export_instructions)?;

    let temp_dir = make_temp_dir("holger-")?;
    let ged_basename = Path::new(&best_name)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("import.ged")
        .to_string();
    let dest = temp_dir.join(&ged_basename);

    let mut entry = archive
        .by_index(idx)
        .map_err(|e| format!("zip index {idx}: {e}"))?;
    let mut bytes = Vec::with_capacity(entry.size() as usize);
    entry
        .read_to_end(&mut bytes)
        .map_err(|e| format!("read zip entry: {e}"))?;
    fs::write(&dest, &bytes)
        .map_err(|e| format!("write {}: {e}", dest.display()))?;

    Ok(ExtractGedResult {
        ged_bytes_b64: base64::engine::general_purpose::STANDARD.encode(&bytes),
        temp_dir: Some(temp_dir.to_string_lossy().into_owned()),
        ged_name: ged_basename,
    })
}

fn pick_largest_ged_in_dir(dir: &Path) -> Result<Option<PathBuf>, String> {
    let mut best: Option<(PathBuf, u64)> = None;
    for entry in walkdir::WalkDir::new(dir).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        let p = entry.path();
        let is_ged = p
            .extension()
            .and_then(|e| e.to_str())
            .map(|s| s.eq_ignore_ascii_case("ged"))
            .unwrap_or(false);
        if !is_ged {
            continue;
        }
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        match &best {
            Some((_, prev)) if *prev >= size => {}
            _ => best = Some((p.to_path_buf(), size)),
        }
    }
    Ok(best.map(|(p, _)| p))
}

fn holger_export_instructions() -> String {
    "No GEDCOM file found. Export from Holger: Arkiv → Exportera GEDCOM → \
     Generellt format, teckenrepresentation ANSI. Then provide the .ged or .zip file."
        .to_string()
}

// ---------------------------------------------------------------------------
// 2. Bulk-copy a media folder into <dbname>-media/
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct BulkCopyResult {
    pub copied: u64,
    pub skipped: u64,
    pub ms: u64,
}

/// Mirror of `bulkCopyMediaFolder` in src/api/media_consolidate.ts but in
/// Rust. Recursively walks `src_dir` and copies every file to the matching
/// relative position under `dest_dir`. Skip-on-exists (idempotent —
/// rerunning a failed import doesn't blow away earlier copies). Empty
/// directories are not preserved (mirrors fsp.cp default behaviour for
/// our use case — every media file we care about lives at a leaf).
pub fn bulk_copy_media(src_dir: &str, dest_dir: &str) -> Result<BulkCopyResult, String> {
    let src = Path::new(src_dir);
    let dest = Path::new(dest_dir);
    let t = SystemTime::now();

    if !src.is_dir() {
        return Err(format!("source is not a directory: {src_dir}"));
    }
    fs::create_dir_all(dest).map_err(|e| format!("mkdir dest: {e}"))?;

    let mut copied: u64 = 0;
    let mut skipped: u64 = 0;
    for entry in walkdir::WalkDir::new(src).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        let rel = entry
            .path()
            .strip_prefix(src)
            .map_err(|e| format!("strip prefix: {e}"))?;
        let dest_path = dest.join(rel);
        if dest_path.exists() {
            skipped += 1;
            continue;
        }
        if let Some(parent) = dest_path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("mkdir {}: {e}", parent.display()))?;
        }
        fs::copy(entry.path(), &dest_path)
            .map_err(|e| format!("copy {} → {}: {e}", entry.path().display(), dest_path.display()))?;
        copied += 1;
    }
    let ms = SystemTime::now()
        .duration_since(t)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    Ok(BulkCopyResult { copied, skipped, ms })
}

// ---------------------------------------------------------------------------
// 3. Consolidate absolute file_ref values in the `media` table
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct ConsolidateResult {
    /// Files copied + ref rewritten (or already at dest with same name).
    pub copied: u64,
    /// Refs left untouched (null, relative, etc.).
    pub skipped: u64,
    /// Source path didn't exist on disk.
    pub missing: u64,
    pub ms: u64,
}

#[derive(Deserialize)]
struct MediaRow {
    id: String,
    file_ref: Option<String>,
}

/// Mirror of `consolidateMediaFolder` (src/api/media_consolidate.ts), in
/// Rust because the Tauri renderer has no fs. Walks the `media` table on
/// the primary db connection, and for any row whose `file_ref` is an
/// absolute path:
///   - fast path: file is already at the matching relative position under
///     `<dbname>-media/` (because bulk_copy_media just put it there) →
///     rewrite the ref to the relative form, no syscall.
///   - slow path: copy the source file into `<dbname>-media/` (flat,
///     basename-only — no directory tree preservation here, matching the
///     Electron implementation's slow-path behaviour) and rewrite the ref.
///
/// `bulk_copied_from_dir` is the source dir that was just bulk-copied into
/// `<dbname>-media/`. Pass it to enable the fast path; without it every
/// row falls through to per-file copyFile.
///
/// All UPDATEs are wrapped in a single BEGIN IMMEDIATE / COMMIT transaction
/// — without it 12k UPDATEs become 12k WAL fsyncs.
pub fn consolidate_media(
    db_path: &str,
    bulk_copied_from_dir: Option<&str>,
) -> Result<ConsolidateResult, String> {
    let t = SystemTime::now();

    let db_path_buf = PathBuf::from(db_path);
    let db_dir = db_path_buf
        .parent()
        .ok_or_else(|| format!("db_path has no parent: {db_path}"))?
        .to_path_buf();
    let db_stem = db_path_buf
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| format!("db_path has no stem: {db_path}"))?;
    let folder_name = format!("{db_stem}-media");
    let media_dir = db_dir.join(&folder_name);
    fs::create_dir_all(&media_dir).map_err(|e| format!("mkdir media: {e}"))?;

    // Snapshot existing dest files (relative paths under media_dir). Used by
    // the fast path to confirm a bulk-copied file actually landed.
    let mut existing_rel: std::collections::HashSet<String> = std::collections::HashSet::new();
    for entry in walkdir::WalkDir::new(&media_dir).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        if let Ok(rel) = entry.path().strip_prefix(&media_dir) {
            // Normalise to forward slashes — file_ref values are stored
            // with forward slashes regardless of OS.
            let s = rel.to_string_lossy().replace('\\', "/");
            existing_rel.insert(s);
        }
    }

    // Read all media rows via the primary connection. We use db::db_all so
    // the same locking discipline as the renderer-side calls applies.
    let rows_json = db::db_all_sync("SELECT id, file_ref FROM media", &[])?;
    let rows: Vec<MediaRow> = rows_json
        .into_iter()
        .map(|v| serde_json::from_value(v).map_err(|e| format!("decode row: {e}")))
        .collect::<Result<_, _>>()?;

    if rows.is_empty() {
        return Ok(ConsolidateResult {
            copied: 0,
            skipped: 0,
            missing: 0,
            ms: SystemTime::now().duration_since(t).map(|d| d.as_millis() as u64).unwrap_or(0),
        });
    }

    let bulk_dir: Option<PathBuf> = bulk_copied_from_dir.map(PathBuf::from);

    let mut copied: u64 = 0;
    let mut skipped: u64 = 0;
    let mut missing: u64 = 0;

    db::db_batch_sync("BEGIN IMMEDIATE")?;
    let mut committed = false;
    let result: Result<(), String> = (|| {
        for row in &rows {
            let ref_value = match &row.file_ref {
                Some(s) if !s.is_empty() => s.clone(),
                _ => {
                    skipped += 1;
                    continue;
                }
            };
            // Already-relative refs: leave alone. We treat anything that
            // looks like a Windows drive letter or starts with `/` as
            // absolute; everything else is considered relative.
            if !is_absolute_ref(&ref_value) {
                skipped += 1;
                continue;
            }

            // Fast path: ref is under the bulk-copied source dir.
            if let Some(bulk) = &bulk_dir {
                if let Some(rel) = path_under(&ref_value, bulk) {
                    let rel_fwd = rel.replace('\\', "/");
                    if existing_rel.contains(&rel_fwd) {
                        let new_ref = format!("{folder_name}/{rel_fwd}");
                        update_ref(&row.id, &new_ref)?;
                        copied += 1;
                        continue;
                    }
                    // Source was under bulk dir but the file didn't make
                    // it into dest — count as missing, leave ref alone.
                    missing += 1;
                    continue;
                }
            }

            // Slow path: flat copy. Dest filename = source basename.
            let src = PathBuf::from(&ref_value);
            let filename = src
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("media")
                .to_string();
            let dest = media_dir.join(&filename);
            if !dest.exists() {
                match fs::copy(&src, &dest) {
                    Ok(_) => {}
                    Err(e) if e.kind() == io::ErrorKind::NotFound => {
                        // Source doesn't exist — leave the absolute ref
                        // alone so the diagnostic still points at the
                        // missing file.
                        missing += 1;
                        continue;
                    }
                    Err(e) => return Err(format!("copy {} → {}: {e}", src.display(), dest.display())),
                }
            }
            let new_ref = format!("{folder_name}/{filename}");
            update_ref(&row.id, &new_ref)?;
            copied += 1;
        }
        Ok(())
    })();

    if result.is_ok() {
        db::db_batch_sync("COMMIT")?;
        committed = true;
    }
    if !committed {
        let _ = db::db_batch_sync("ROLLBACK");
    }
    result?;

    let ms = SystemTime::now()
        .duration_since(t)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    Ok(ConsolidateResult { copied, skipped, missing, ms })
}

fn update_ref(id: &str, new_ref: &str) -> Result<(), String> {
    db::db_run_sync(
        "UPDATE media SET file_ref = ? WHERE id = ?",
        &[serde_json::Value::String(new_ref.to_string()), serde_json::Value::String(id.to_string())],
    )
    .map(|_| ())
}

fn is_absolute_ref(s: &str) -> bool {
    if s.starts_with('/') {
        return true;
    }
    let bytes = s.as_bytes();
    // C:\ or C:/ or any other drive letter
    bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && (bytes[2] == b'\\' || bytes[2] == b'/')
}

/// If `p` is the same as `dir` or any descendant, return the relative
/// portion (forward slashes preserved as-is). Otherwise None. Treats
/// backslashes in `p` and `dir` as separators so Windows-style paths
/// from Holger work on macOS / Linux.
fn path_under(p: &str, dir: &Path) -> Option<String> {
    let p_norm = p.replace('\\', "/");
    let dir_str = dir.to_string_lossy().replace('\\', "/");
    let dir_with_slash = if dir_str.ends_with('/') {
        dir_str.clone()
    } else {
        format!("{dir_str}/")
    };
    p_norm.strip_prefix(&dir_with_slash).map(|s| s.to_string())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn make_temp_dir(prefix: &str) -> Result<PathBuf, String> {
    let now = SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let dir = std::env::temp_dir().join(format!("{prefix}{now}"));
    fs::create_dir_all(&dir).map_err(|e| format!("mktemp {}: {e}", dir.display()))?;
    Ok(dir)
}

/// Recursively delete a directory. No-op if missing. Used by the renderer
/// to clean up the temp dir created by `extract_ged` for `.zip` inputs.
pub fn remove_dir(path: &str) -> Result<(), String> {
    match fs::remove_dir_all(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("remove_dir {path}: {e}")),
    }
}
