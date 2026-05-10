// MCP sidecar smoke test for Tauri.
//
// In a real port the MCP server (src/mcp/server.ts) would either:
//   (a) ship as an external binary configured via tauri.conf.json's
//       bundle.externalBin and spawned via tauri-plugin-shell, OR
//   (b) be hosted in-process via a Rust MCP server binding to the same
//       rusqlite handle used by the rest of the app.
//
// For the spike we exercise (a)'s spawn pattern: launch the existing
// `npx tsx src/mcp/server.ts` as a child process with the slaktforskning
// repo's env, send an MCP `initialize` request on stdin, read one line
// of JSON from stdout, kill, return.
//
// Result: confirms Tauri can host an MCP stdio sidecar with the same
// architecture the Electron app uses today.

use serde::Serialize;
use std::process::Stdio;
use std::time::Duration;
use tauri::AppHandle;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::time::timeout;

#[derive(Serialize)]
pub struct McpProbe {
    pub spawned: bool,
    pub initialize_response: Option<String>,
    pub elapsed_ms: u64,
    pub error: Option<String>,
}

pub async fn probe_mcp_sidecar(repo_root: &str, db_path: &str) -> McpProbe {
    let start = std::time::Instant::now();
    let server_ts = format!("{}/src/mcp/server.ts", repo_root);

    // Spawn `npx tsx <server.ts>` with stdio piped.
    let child = Command::new("npx")
        .args(["tsx", &server_ts])
        .env("SLAKTFORSKNING_DB_PATH", db_path)
        .current_dir(repo_root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn();

    let mut child = match child {
        Ok(c) => c,
        Err(e) => return McpProbe {
            spawned: false,
            initialize_response: None,
            elapsed_ms: start.elapsed().as_millis() as u64,
            error: Some(format!("spawn failed: {e}")),
        },
    };

    let mut stdin = child.stdin.take().expect("stdin was piped");
    let stdout = child.stdout.take().expect("stdout was piped");
    let mut reader = BufReader::new(stdout).lines();

    // MCP initialize request — minimal valid shape.
    let init_msg = r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"tauri-spike-probe","version":"0.1"}}}"#;
    if let Err(e) = stdin.write_all(format!("{init_msg}\n").as_bytes()).await {
        let _ = child.kill().await;
        return McpProbe {
            spawned: true,
            initialize_response: None,
            elapsed_ms: start.elapsed().as_millis() as u64,
            error: Some(format!("write initialize: {e}")),
        };
    }
    if let Err(e) = stdin.flush().await {
        let _ = child.kill().await;
        return McpProbe {
            spawned: true,
            initialize_response: None,
            elapsed_ms: start.elapsed().as_millis() as u64,
            error: Some(format!("flush initialize: {e}")),
        };
    }

    // Read first JSON response line (with 15 s timeout — npx tsx cold-start
    // can be slow on first invocation).
    let response = match timeout(Duration::from_secs(15), reader.next_line()).await {
        Ok(Ok(Some(line))) => Some(line),
        Ok(Ok(None)) => None,
        Ok(Err(e)) => {
            let _ = child.kill().await;
            return McpProbe {
                spawned: true,
                initialize_response: None,
                elapsed_ms: start.elapsed().as_millis() as u64,
                error: Some(format!("read line: {e}")),
            };
        }
        Err(_) => {
            let _ = child.kill().await;
            return McpProbe {
                spawned: true,
                initialize_response: None,
                elapsed_ms: start.elapsed().as_millis() as u64,
                error: Some("timeout waiting for MCP initialize response (15 s)".into()),
            };
        }
    };

    let _ = child.kill().await;
    McpProbe {
        spawned: true,
        initialize_response: response,
        elapsed_ms: start.elapsed().as_millis() as u64,
        error: None,
    }
}

/// Spawn the bundled MCP server sidecar (built by
/// `scripts/build-mcp-sidecar.mjs` and shipped via tauri.conf.json
/// `bundle.externalBin`). Tauri's shell plugin resolves the per-target
/// binary name (e.g. `mcp-server-aarch64-apple-darwin`) automatically based
/// on the host triple — `sidecar("mcp-server")` is the configured base name.
///
/// The caller is responsible for retaining the returned `CommandChild`
/// (typically inside an app-managed state) so the child isn't dropped
/// (which would terminate the MCP). `db_path` is forwarded via
/// SLAKTFORSKNING_DB so the sidecar opens the same database the running
/// app has open.
///
/// In dev (`tauri dev`) the sidecar binaries don't exist — Tauri's
/// externalBin resolver returns an error, and callers should fall back to
/// the existing `npx tsx` launcher (scripts/mcp-tauri.mjs).
///
/// Currently unused at runtime — the Rust-side wiring that calls this on
/// app startup lands in a follow-up step once the rest of the MCP-via-app
/// architecture is in place (audit §6 #17). Kept here so the sidecar build
/// pipeline (scripts/build-mcp-sidecar.mjs) has a Rust caller to verify
/// against, and so cargo check on this branch validates the
/// tauri-plugin-shell sidecar API surface.
#[allow(dead_code)]
pub fn spawn_bundled_mcp(app: &AppHandle, db_path: &str) -> Result<CommandChild, String> {
    let sidecar = app
        .shell()
        .sidecar("mcp-server")
        .map_err(|e| format!("locate mcp-server sidecar: {e}"))?
        .env("SLAKTFORSKNING_DB", db_path);
    let (_rx, child) = sidecar
        .spawn()
        .map_err(|e| format!("spawn mcp-server sidecar: {e}"))?;
    Ok(child)
}
