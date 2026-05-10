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
