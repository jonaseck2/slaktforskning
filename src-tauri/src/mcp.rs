// MCP sidecar probe + spawn for Tauri.
//
// The MCP server (src/mcp/server.ts) ships as a single ESM bundle
// (`dist-mcp/server.bundle.mjs`, produced by scripts/build-mcp-sidecar.mjs)
// and runs under a shipped Bun binary spawned via tauri-plugin-shell's
// sidecar API.
//
// Wire protocol on stdio is unchanged: standard MCP JSON-RPC 2.0 (one
// JSON object per newline). The Rust side reads/writes those frames
// directly. `kkrpc` is JS-side-only — it provides typesafe RPC inside
// the Bun-side bundle's tool routing layer, not across the
// Rust↔Bun stdio boundary (the kkrpc Rust crate uses its own non-MCP
// JSON envelope and sync std::io spawn, incompatible with Tauri's
// async sidecar API and the MCP wire format).

use serde::Serialize;
use std::path::PathBuf;
use std::time::Duration;
use tauri::AppHandle;
use tauri::Manager;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::time::timeout;

#[derive(Serialize, specta::Type)]
pub struct McpProbe {
    pub spawned: bool,
    pub initialize_response: Option<String>,
    // u64 → TS `number` (elapsed-ms always fits a JS safe int).
    #[specta(type = specta_typescript::Number)]
    pub elapsed_ms: u64,
    pub error: Option<String>,
}

/// Resolve the path to `server.bundle.mjs` — the esbuild ESM output that
/// Bun runs as the MCP server.
///
/// * In packaged builds Tauri ships the bundle as a resource (declared in
///   `tauri.conf.json` under `bundle.resources` as `../dist-mcp/server.bundle.mjs`).
///   Tauri rewrites the leading `..` to a literal `_up_` directory inside
///   the resource root, so the runtime path is
///   `<resource_dir>/_up_/dist-mcp/server.bundle.mjs`. We also try the flat
///   layout in case the path-rewrite assumption changes.
/// * In dev (`tauri dev`) the bundled-resource lookup fails — fall back
///   to `<repo>/dist-mcp/server.bundle.mjs`. The caller passes `repo_root`
///   from the renderer for this purpose.
fn resolve_bundle_path(app: &AppHandle, repo_root: &str) -> Result<PathBuf, String> {
    if let Ok(resource_dir) = app.path().resource_dir() {
        let candidates = [
            resource_dir.join("_up_").join("dist-mcp").join("server.bundle.mjs"),
            resource_dir.join("dist-mcp").join("server.bundle.mjs"),
            resource_dir.join("server.bundle.mjs"),
        ];
        for p in &candidates {
            if p.exists() {
                return Ok(p.clone());
            }
        }
    }
    // Dev fallback.
    let dev_path = PathBuf::from(repo_root).join("dist-mcp").join("server.bundle.mjs");
    if dev_path.exists() {
        return Ok(dev_path);
    }
    Err(format!(
        "server.bundle.mjs not found in resource_dir or {}; run `npm run build:mcp-sidecar`",
        PathBuf::from(repo_root).join("dist-mcp").join("server.bundle.mjs").display()
    ))
}

/// Spawn the Bun sidecar (running the bundled MCP server) and send an MCP
/// `initialize` request. Returns the first line of stdout the server
/// emits, or a structured error if anything in the handshake fails.
///
/// This is the runtime entry point used by `probe_mcp_sidecar` (the
/// renderer-facing tauri::command) and is the canonical way to bring up
/// the MCP server in-process. Production code paths that want a
/// long-lived MCP child should call `spawn_bundled_mcp` instead — same
/// spawn pattern, but it returns the `CommandChild` for the caller to
/// retain rather than killing it after the initialize handshake.
pub async fn probe_mcp_sidecar(app: &AppHandle, repo_root: &str, db_path: &str) -> McpProbe {
    let start = std::time::Instant::now();

    let bundle_path = match resolve_bundle_path(app, repo_root) {
        Ok(p) => p,
        Err(e) => return McpProbe {
            spawned: false,
            initialize_response: None,
            elapsed_ms: start.elapsed().as_millis() as u64,
            error: Some(format!("resolve bundle: {e}")),
        },
    };

    let sidecar = match app.shell().sidecar("bun") {
        Ok(c) => c,
        Err(e) => return McpProbe {
            spawned: false,
            initialize_response: None,
            elapsed_ms: start.elapsed().as_millis() as u64,
            error: Some(format!("locate bun sidecar: {e}")),
        },
    };

    let sidecar = sidecar
        .args([bundle_path.to_string_lossy().to_string()])
        .env("SLAKTFORSKNING_DB_PATH", db_path)
        .env("SLAKTFORSKNING_REPO_ROOT", repo_root);

    let (mut rx, mut child) = match sidecar.spawn() {
        Ok(pair) => pair,
        Err(e) => return McpProbe {
            spawned: false,
            initialize_response: None,
            elapsed_ms: start.elapsed().as_millis() as u64,
            error: Some(format!("spawn bun sidecar: {e}")),
        },
    };

    // MCP initialize request — minimal valid shape.
    let init_msg = r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"slaktforskning-probe","version":"0.1"}}}"#;
    if let Err(e) = child.write(format!("{init_msg}\n").as_bytes()) {
        let _ = child.kill();
        return McpProbe {
            spawned: true,
            initialize_response: None,
            elapsed_ms: start.elapsed().as_millis() as u64,
            error: Some(format!("write initialize: {e}")),
        };
    }

    // Read first JSON response line. 15 s is generous — Bun starts in
    // <100 ms typically; the legacy `npx tsx` cold start was the slow path.
    let response = match timeout(Duration::from_secs(15), async {
        while let Some(ev) = rx.recv().await {
            match ev {
                CommandEvent::Stdout(bytes) => {
                    if let Ok(s) = String::from_utf8(bytes) {
                        // tauri-plugin-shell already splits on \n / \r;
                        // each event is one line.
                        if !s.trim().is_empty() {
                            return Ok::<Option<String>, String>(Some(s));
                        }
                    }
                }
                CommandEvent::Stderr(_) => continue,
                CommandEvent::Error(e) => return Err(format!("event error: {e}")),
                CommandEvent::Terminated(p) => return Err(format!(
                    "bun sidecar terminated before responding (code={:?}, signal={:?})",
                    p.code, p.signal
                )),
                _ => continue,
            }
        }
        Ok(None)
    })
    .await
    {
        Ok(Ok(line)) => line,
        Ok(Err(e)) => {
            let _ = child.kill();
            return McpProbe {
                spawned: true,
                initialize_response: None,
                elapsed_ms: start.elapsed().as_millis() as u64,
                error: Some(e),
            };
        }
        Err(_) => {
            let _ = child.kill();
            return McpProbe {
                spawned: true,
                initialize_response: None,
                elapsed_ms: start.elapsed().as_millis() as u64,
                error: Some("timeout waiting for MCP initialize response (15 s)".into()),
            };
        }
    };

    let _ = child.kill();
    McpProbe {
        spawned: true,
        initialize_response: response,
        elapsed_ms: start.elapsed().as_millis() as u64,
        error: None,
    }
}

/// Spawn the bundled MCP server as a long-lived sidecar. The caller is
/// responsible for retaining the returned `CommandChild` (typically inside
/// an app-managed state) so the child isn't dropped (which would terminate
/// the MCP). `db_path` is forwarded via `SLAKTFORSKNING_DB_PATH` so the
/// sidecar opens the same database the running app has open.
///
/// In dev (`tauri dev`) the Bun sidecar binary doesn't exist — Tauri's
/// sidecar resolver returns an error, and callers should fall back to the
/// existing `npx tsx` launcher (scripts/mcp-tauri.mjs).
///
/// Currently unused at runtime — the Rust-side wiring that calls this on
/// app startup lands in a follow-up step once the rest of the MCP-via-app
/// architecture is in place. Kept here so the sidecar build pipeline has a
/// Rust caller to verify against, and so `cargo check` validates the
/// tauri-plugin-shell sidecar API surface.
#[allow(dead_code)]
pub fn spawn_bundled_mcp(app: &AppHandle, repo_root: &str, db_path: &str) -> Result<CommandChild, String> {
    let bundle_path = resolve_bundle_path(app, repo_root)?;
    let sidecar = app
        .shell()
        .sidecar("bun")
        .map_err(|e| format!("locate bun sidecar: {e}"))?
        .args([bundle_path.to_string_lossy().to_string()])
        .env("SLAKTFORSKNING_DB_PATH", db_path)
        .env("SLAKTFORSKNING_REPO_ROOT", repo_root);
    let (_rx, child) = sidecar
        .spawn()
        .map_err(|e| format!("spawn bun sidecar: {e}"))?;
    Ok(child)
}
