// Media-side Tauri commands. Mirrors the Electron `nativeImage`-based
// thumbnail path in `src/main/ipc/media.ts` (media:thumbnailDataUrl) and
// the website-export preview-thumbnail baker in
// `src/main/ipc/website-export.ts` (buildPreviewThumbnails).
//
// All file resolution is against the active DB's `<dbname>-media/` sibling
// folder (see `.claude/rules/media.md`). The renderer-side `tauri-window-api.ts`
// looks up the media row to get its `file_ref`, then hands it here. We do
// not touch the database from this module.

use base64::Engine;
use image::ImageReader;
use std::io::Cursor;
use std::path::{Path, PathBuf};

use crate::db;

const PREVIEW_THUMB_COUNT: usize = 24;
const PREVIEW_THUMB_WIDTH: u32 = 400;
const PREVIEW_THUMB_QUALITY: u8 = 70;
const PREVIEW_THUMB_BUDGET_BYTES: usize = 5 * 1024 * 1024;
const DEFAULT_THUMB_WIDTH: u32 = 256;
const DEFAULT_THUMB_QUALITY: u8 = 70;

fn db_dir() -> Result<PathBuf, String> {
    let p = db::current_path().ok_or_else(|| "no DB open".to_string())?;
    Ok(PathBuf::from(p)
        .parent()
        .unwrap_or(Path::new("."))
        .to_path_buf())
}

fn resolve_file_ref(file_ref: &str) -> Result<PathBuf, String> {
    let p = Path::new(file_ref);
    if p.is_absolute() {
        Ok(PathBuf::from(file_ref))
    } else {
        Ok(db_dir()?.join(file_ref))
    }
}

/// Decode → resize → JPEG-encode an image at `abs_path`. Returns Ok(None)
/// when the file is unreadable or not a decodable image (matches Electron's
/// `nativeImage.isEmpty()` early-return: gracefully drop, don't crash).
fn make_thumbnail_jpeg(abs_path: &Path, max_width: u32, quality: u8) -> Result<Option<Vec<u8>>, String> {
    if !abs_path.exists() {
        return Ok(None);
    }
    // ImageReader::open + with_guessed_format handles HEIC/PDF/SVG by
    // failing the format guess — we treat those as "no thumbnail" rather
    // than an error. The Electron path also silently skips non-images.
    let reader = match ImageReader::open(abs_path) {
        Ok(r) => r,
        Err(_) => return Ok(None),
    };
    let reader = match reader.with_guessed_format() {
        Ok(r) => r,
        Err(_) => return Ok(None),
    };
    let img = match reader.decode() {
        Ok(i) => i,
        Err(_) => return Ok(None),
    };

    // Match Electron's `.resize({ width })` semantics: scale by width,
    // preserve aspect ratio, never upscale beyond the source.
    let resized = if img.width() > max_width {
        let new_h = ((img.height() as u64) * (max_width as u64) / (img.width() as u64)) as u32;
        img.thumbnail(max_width, new_h.max(1))
    } else {
        img
    };

    let rgb = resized.to_rgb8();
    let mut buf = Cursor::new(Vec::<u8>::new());
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, quality)
        .encode_image(&rgb)
        .map_err(|e| format!("jpeg encode: {e}"))?;
    Ok(Some(buf.into_inner()))
}

/// Generate a JPEG thumbnail data URL for a media file_ref. Returns None
/// on missing files / undecodable formats — same shape as Electron's
/// `media:thumbnailDataUrl`. The Electron path caches under
/// `<dbname>-media/.thumbs/`; we skip the disk cache for now (the renderer
/// already caches in-memory via Vue keep-alive). Adding it later is a
/// pure-Rust change with no API impact.
#[tauri::command(rename_all = "camelCase")]
pub fn media_thumbnail(file_ref: String, max_width: Option<u32>) -> Result<Option<String>, String> {
    let abs = resolve_file_ref(&file_ref)?;
    let width = max_width.unwrap_or(DEFAULT_THUMB_WIDTH).max(1);
    let jpeg = match make_thumbnail_jpeg(&abs, width, DEFAULT_THUMB_QUALITY)? {
        Some(j) => j,
        None => return Ok(None),
    };
    let b64 = base64::engine::general_purpose::STANDARD.encode(&jpeg);
    Ok(Some(format!("data:image/jpeg;base64,{b64}")))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaRefInput {
    pub id: String,
    pub file_ref: Option<String>,
}

/// Locate the dist-static SPA bundle's `index.html` and return its
/// contents. The website-export preview iframe in
/// `src/renderer/views/WebsiteExportView.vue` loads this string into a
/// Blob URL after the renderer-side polyfill bakes thumbnails into it.
///
/// Search order — first match wins so dev sessions don't need a build:
///   1. <repo>/dist-static/index.html (relative to the cwd Tauri runs from)
///   2. <repo>/.claude/worktrees/<wt>/dist-static/index.html
///   3. CARGO_MANIFEST_DIR/../dist-static/index.html (dev-time fallback)
///
/// In a packaged build this would be a tauri::Manager::resolve()-resolved
/// resource; that wiring lands with the dist-static-bundling task in a
/// follow-up plan.
#[tauri::command]
pub fn website_load_static_index_html() -> Result<String, String> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("dist-static").join("index.html"));
        candidates.push(cwd.join("..").join("dist-static").join("index.html"));
    }
    // CARGO_MANIFEST_DIR points at src-tauri/; ../dist-static is the
    // sibling SPA bundle in the same worktree.
    let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
    candidates.push(manifest.join("..").join("dist-static").join("index.html"));

    for p in &candidates {
        if let Ok(s) = std::fs::read_to_string(p) {
            return Ok(s);
        }
    }
    Err(format!(
        "dist-static/index.html not found. Tried: {}",
        candidates.iter().map(|p| p.display().to_string()).collect::<Vec<_>>().join("; "),
    ))
}

/// Bake preview thumbnails for the website-export preview iframe. Mirrors
/// `buildPreviewThumbnails` in `src/main/ipc/website-export.ts`:
///   - Take the first 24 image refs the caller provides
///   - Resize to 400px wide JPEG at quality 70
///   - Stop once we hit the 5 MB total-bytes budget
///   - Skip individual broken images rather than aborting
///
/// The caller (renderer-side `tauri-window-api.ts`) is responsible for
/// passing only image media (filtered by extension or MIME) — keeps the
/// Rust side dumb.
#[tauri::command(rename_all = "camelCase")]
pub fn website_bake_preview_thumbnails(
    media_refs: Vec<MediaRefInput>,
) -> Result<std::collections::HashMap<String, String>, String> {
    let mut out = std::collections::HashMap::<String, String>::new();
    let mut total = 0usize;
    for entry in media_refs.into_iter().take(PREVIEW_THUMB_COUNT) {
        if total >= PREVIEW_THUMB_BUDGET_BYTES {
            break;
        }
        let Some(file_ref) = entry.file_ref else { continue };
        let abs = match resolve_file_ref(&file_ref) {
            Ok(p) => p,
            Err(_) => continue,
        };
        let jpeg = match make_thumbnail_jpeg(&abs, PREVIEW_THUMB_WIDTH, PREVIEW_THUMB_QUALITY) {
            Ok(Some(j)) => j,
            _ => continue,
        };
        if total + jpeg.len() > PREVIEW_THUMB_BUDGET_BYTES {
            continue;
        }
        total += jpeg.len();
        let b64 = base64::engine::general_purpose::STANDARD.encode(&jpeg);
        out.insert(entry.id, format!("data:image/jpeg;base64,{b64}"));
    }
    Ok(out)
}
