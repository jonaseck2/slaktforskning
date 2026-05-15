// Genney sidecar spawn for Tauri.
//
// The Genney importer (src/import/genney/index.ts) needs Node-shape
// child_process / worker_threads / https / fs that the Tauri webview lacks.
// It ships as a single ESM bundle (`dist-genney/genney-import.bundle.mjs`,
// produced by scripts/build-genney-sidecar.mjs) and runs under the shipped
// Bun binary spawned via tauri-plugin-shell's sidecar API. Same shape as
// the MCP sidecar in mcp.rs.
//
// Wire protocol on stdout: one JSON object per line.
//   - `{ "type": "progress", "message": string }` — incremental status from
//     the importer; emitted at every onProgress callback.
//   - `{ "type": "result", "summary": ImportSummary, "gedcomFallbackPath": string|null }`
//     — final success line, exit code 0.
//   - `{ "type": "error", "error": string, "stack"?: string }` — terminal
//     failure line, exit code 1.
//
// The renderer's polyfill (src/renderer/tauri-window-api.ts
// `api.import.genneyRun`) invokes `genney_import` and turns the
// `gedcomFallbackPath` (when set) into a subsequent GEDCOM import in the
// renderer process, mirroring the existing TS-side fallback behaviour.

use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

use crate::wire::JsonValueWire;

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct GenneyImportResult {
    /// JSON-serialised ImportSummary from src/import/genney/transform.ts.
    /// Returned as opaque JSON so changes to the TS-side summary shape
    /// don't require Rust edits — the renderer deserialises into the
    /// existing type. Wrapped in `JsonValueWire` because `serde_json::Value`
    /// has no Specta `Type` impl that survives bindings codegen.
    pub summary: JsonValueWire,
    /// When the source archive is encrypted or has no Derby DB, the
    /// importer falls back to extracting the newest GEDCOM file out of the
    /// archive and returns its temp-dir path here. The renderer is expected
    /// to read it back with `fs_read_bytes_base64` and pass it through the
    /// normal GEDCOM importer, then clean up via `fs_remove_dir`.
    pub gedcom_fallback_path: Option<String>,
    /// All progress messages the sidecar emitted, in order. The renderer
    /// uses these to drive the import-progress toast; capturing them on the
    /// Rust side avoids a separate event-channel wire.
    pub progress: Vec<String>,
}

#[derive(Deserialize)]
#[serde(tag = "type")]
enum SidecarLine {
    #[serde(rename = "progress")]
    Progress { message: String },
    #[serde(rename = "result")]
    Result {
        summary: JsonValue,
        #[serde(rename = "gedcomFallbackPath")]
        gedcom_fallback_path: Option<String>,
    },
    #[serde(rename = "error")]
    Error {
        error: String,
        #[serde(default)]
        #[allow(dead_code)]
        stack: Option<String>,
    },
}

/// Resolve the path to `genney-import.bundle.mjs`. Mirrors
/// `mcp::resolve_bundle_path` — bundled-resource lookup first (Tauri
/// rewrites the `..` prefix to `_up_`), then a dev fallback under the
/// supplied `repo_root` (typically the renderer's known repo root from a
/// build-time env), then a last-resort fallback to `cwd/dist-genney/...`.
fn resolve_bundle_path(app: &AppHandle, repo_root: &str) -> Result<PathBuf, String> {
    if let Ok(resource_dir) = app.path().resource_dir() {
        let candidates = [
            resource_dir
                .join("_up_")
                .join("dist-genney")
                .join("genney-import.bundle.mjs"),
            resource_dir
                .join("dist-genney")
                .join("genney-import.bundle.mjs"),
            resource_dir.join("genney-import.bundle.mjs"),
        ];
        for p in &candidates {
            if p.exists() {
                return Ok(p.clone());
            }
        }
    }
    let dev_path = PathBuf::from(repo_root)
        .join("dist-genney")
        .join("genney-import.bundle.mjs");
    if dev_path.exists() {
        return Ok(dev_path);
    }
    // Last-resort fallback: when the renderer passes an empty `repo_root`
    // (e.g. dev/e2e where it doesn't know its own location), fall back to
    // the Rust process's working directory. `tauri dev` and `tauri build
    // --no-bundle` both leave cwd at the project root.
    if let Ok(cwd) = std::env::current_dir() {
        let cwd_path = cwd.join("dist-genney").join("genney-import.bundle.mjs");
        if cwd_path.exists() {
            return Ok(cwd_path);
        }
    }
    Err(format!(
        "genney-import.bundle.mjs not found in resource_dir or {}; run `npm run build:genney-sidecar`",
        dev_path.display()
    ))
}

/// Spawn the Bun-based Genney sidecar with the supplied source / db / media
/// args, read its NDJSON stdout, and return the final summary (or error).
///
/// Multi-process write contention with the renderer's rusqlite connection
/// on the same .db file is bounded by SQLite's DELETE journaling. The
/// renderer-side polyfill awaits this command before firing `data-changed`,
/// so application-level writes don't interleave.
pub async fn run_import(
    app: &AppHandle,
    repo_root: &str,
    source_path: &str,
    db_path: &str,
    media_dir: Option<&str>,
    dest_media_dir: Option<&str>,
    schema: Option<&str>,
) -> Result<GenneyImportResult, String> {
    let bundle_path = resolve_bundle_path(app, repo_root)?;

    let sidecar = app
        .shell()
        .sidecar("bun")
        .map_err(|e| format!("locate bun sidecar: {e}"))?;

    let mut args: Vec<String> = vec![
        bundle_path.to_string_lossy().to_string(),
        "--source".to_string(),
        source_path.to_string(),
        "--db".to_string(),
        db_path.to_string(),
    ];
    if let Some(m) = media_dir {
        args.push("--media-dir".to_string());
        args.push(m.to_string());
    }
    if let Some(d) = dest_media_dir {
        args.push("--dest-media-dir".to_string());
        args.push(d.to_string());
    }
    if let Some(s) = schema {
        args.push("--schema".to_string());
        args.push(s.to_string());
    }

    // Route the Derby jar cache into a writable app-cache subdir so the
    // importer's `ensureJars` can download into it on first use. Without
    // this the cache defaults to `<bundle>/src/import/genney/lib/` which is
    // read-only inside a packaged macOS .app. Best-effort: if app_cache_dir
    // isn't resolvable, fall through and let ensureJars use its default.
    let mut sidecar = sidecar.args(args);
    if let Ok(cache_dir) = app.path().app_cache_dir() {
        let lib_dir = cache_dir.join("genney").join("lib");
        if std::fs::create_dir_all(&lib_dir).is_ok() {
            sidecar = sidecar.env("GENNEY_LIB_DIR", lib_dir.to_string_lossy().to_string());
        }
    }

    // Augment PATH so the sidecar's `spawnSync('docker' | 'java', ...)`
    // calls succeed on macOS when the app was launched from Finder/Dock —
    // GUI-launched processes inherit a stripped PATH (typically
    // `/usr/bin:/bin:/usr/sbin:/sbin`), without `/usr/local/bin` or
    // `/opt/homebrew/bin` where Docker Desktop and Homebrew Java live.
    // Linux Snap/Flatpak Docker also installs to non-default locations.
    // The importer's `getDockerExecutable` falls through to a literal
    // `'docker'` lookup that only resolves via PATH, so without this
    // augmentation a perfectly-running Docker Desktop reports as missing.
    {
        let existing = std::env::var("PATH").unwrap_or_default();
        #[cfg(target_os = "macos")]
        let extras = "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin";
        #[cfg(target_os = "linux")]
        let extras = "/usr/local/bin:/usr/bin:/bin:/snap/bin";
        #[cfg(target_os = "windows")]
        let extras = ""; // Windows-side fallback lives in the sidecar's
                         // `getDockerExecutable` (probes Program Files etc.).
        let sep = if cfg!(target_os = "windows") { ";" } else { ":" };
        let augmented = if existing.is_empty() {
            extras.to_string()
        } else if extras.is_empty() {
            existing
        } else {
            format!("{extras}{sep}{existing}")
        };
        if !augmented.is_empty() {
            sidecar = sidecar.env("PATH", augmented);
        }
    }

    let (mut rx, _child) = sidecar
        .spawn()
        .map_err(|e| format!("spawn bun sidecar: {e}"))?;

    let mut progress: Vec<String> = Vec::new();
    let mut stderr_buf = String::new();

    while let Some(ev) = rx.recv().await {
        match ev {
            CommandEvent::Stdout(bytes) => {
                let s = String::from_utf8_lossy(&bytes);
                let trimmed = s.trim();
                if trimmed.is_empty() {
                    continue;
                }
                // tauri-plugin-shell splits on \n, but each event can still
                // contain multiple lines if the writer flushed several at
                // once. Iterate.
                for line in trimmed.split('\n') {
                    let line = line.trim();
                    if line.is_empty() {
                        continue;
                    }
                    match serde_json::from_str::<SidecarLine>(line) {
                        Ok(SidecarLine::Progress { message }) => {
                            progress.push(message);
                        }
                        Ok(SidecarLine::Result {
                            summary,
                            gedcom_fallback_path,
                        }) => {
                            return Ok(GenneyImportResult {
                                summary: JsonValueWire(summary),
                                gedcom_fallback_path,
                                progress,
                            });
                        }
                        Ok(SidecarLine::Error { error, .. }) => {
                            return Err(error);
                        }
                        Err(_) => {
                            // Non-JSON stdout line — usually a stray
                            // console.log from a bundled dependency. Roll
                            // it into the progress trail so debugging gets
                            // something useful.
                            progress.push(format!("[stdout] {line}"));
                        }
                    }
                }
            }
            CommandEvent::Stderr(bytes) => {
                let s = String::from_utf8_lossy(&bytes);
                stderr_buf.push_str(&s);
            }
            CommandEvent::Error(e) => {
                return Err(format!("sidecar event error: {e} (stderr: {stderr_buf})"));
            }
            CommandEvent::Terminated(payload) => {
                let code = payload.code.unwrap_or(-1);
                if code == 0 {
                    // Terminated without a result line — unusual but treat
                    // as success-with-no-summary so the renderer can fall
                    // through to its own error envelope.
                    return Err(format!(
                        "sidecar exited 0 without a result line (stderr: {})",
                        stderr_buf.trim()
                    ));
                }
                return Err(format!(
                    "sidecar exited {code} (stderr: {})",
                    stderr_buf.trim()
                ));
            }
            _ => continue,
        }
    }

    Err(format!(
        "sidecar stream ended without a result (stderr: {})",
        stderr_buf.trim()
    ))
}
