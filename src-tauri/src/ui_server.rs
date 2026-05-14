// Minimal HTTP bridge between the slaktforskning-dev MCP and the Tauri
// renderer. The MCP owns the inventory of "tools" (in src/mcp/tools/dev/);
// each tool builds a JS string and ships it through this bridge's
// irreducible surface:
//
//   POST /eval        — run a JS expression in the renderer, return its value
//   POST /screenshot  — native window capture (Rust-side; renderer can't
//                       capture itself reliably, and ScreenCaptureKit needs
//                       the bundled .app's signed identity)
//   GET  /db_path     — current rusqlite-open DB path; used by the
//                       scripts/mcp-tauri.mjs launcher BEFORE the MCP starts
//                       to align SLAKTFORSKNING_DB
//   GET  /            — health probe
//
// Anything else the dev MCP needs grows in src/mcp/tools/dev/ — not here.

use axum::routing::{get, post};
use axum::{Json, Router};
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use serde::Deserialize;
use serde_json::{json, Value as JsonValue};
use std::collections::HashMap;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use tokio::sync::oneshot;
use tokio::time::timeout;

const DEFAULT_PORT: u16 = 19241;
const EVAL_TIMEOUT: Duration = Duration::from_secs(15);

type Sender = oneshot::Sender<JsonValue>;
static PENDING: Lazy<Mutex<HashMap<String, Sender>>> = Lazy::new(|| Mutex::new(HashMap::new()));

#[specta::specta]
#[tauri::command]
pub fn ui_eval_response(id: String, value: crate::wire::JsonValueWire) {
    if let Some(tx) = PENDING.lock().remove(&id) {
        let _ = tx.send(value.0);
    }
}

fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

async fn run_in_renderer(app: &AppHandle, script: &str) -> Result<JsonValue, String> {
    let win = main_window(app).ok_or_else(|| "no main window".to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let (tx, rx) = oneshot::channel();
    PENDING.lock().insert(id.clone(), tx);

    let id_json = serde_json::to_string(&id).unwrap();
    let wrapped = format!(
        "(async () => {{ try {{ const __r = await ({script}); window.__taurisUiCallback({id_json}, __r ?? null); }} catch (e) {{ window.__taurisUiCallback({id_json}, {{ __error: String(e && (e.stack || e.message) || e) }}); }} }})();"
    );

    win.eval(&wrapped).map_err(|e| format!("send-to-renderer: {e}"))?;

    match timeout(EVAL_TIMEOUT, rx).await {
        Ok(Ok(value)) => Ok(value),
        Ok(Err(_)) => { PENDING.lock().remove(&id); Err("renderer dropped response".into()) }
        Err(_) => { PENDING.lock().remove(&id); Err("renderer script timed out".into()) }
    }
}

#[derive(Deserialize)]
struct EvalBody { script: String }

async fn handle_eval(
    axum::extract::State(app): axum::extract::State<AppHandle>,
    Json(body): Json<EvalBody>,
) -> Json<JsonValue> {
    match run_in_renderer(&app, &body.script).await {
        Ok(v) => Json(v),
        Err(e) => Json(json!({ "error": e })),
    }
}

async fn handle_db_path() -> Json<JsonValue> {
    Json(json!({ "path": crate::db::current_path() }))
}

async fn handle_health() -> Json<JsonValue> {
    Json(json!({ "ok": true, "server": "tauri-ui-bridge" }))
}

#[derive(Deserialize)]
struct ScreenshotBody {
    selector: Option<String>,
    #[serde(default)]
    padding: u32,
}

async fn handle_screenshot(
    axum::extract::State(app): axum::extract::State<AppHandle>,
    Json(body): Json<ScreenshotBody>,
) -> Json<JsonValue> {
    let win = match main_window(&app) {
        Some(w) => w,
        None => return Json(json!({ "error": "no main window" })),
    };
    let scale = win.scale_factor().unwrap_or(1.0);
    let inner_pos = win.inner_position().unwrap_or_default();

    let rect_px: Option<(u32, u32, u32, u32)> = if let Some(sel) = body.selector {
        let sel_json = serde_json::to_string(&sel).unwrap();
        let pad = body.padding;
        let script = format!(
            "(() => {{ const el = document.querySelector({sel_json}); if (!el) return {{ error: 'Element not found: ' + {sel_json} }}; el.scrollIntoView({{ block: 'nearest', inline: 'nearest' }}); const r = el.getBoundingClientRect(); return {{ x: Math.max(0, Math.floor(r.left - {pad})), y: Math.max(0, Math.floor(r.top - {pad})), width: Math.min(window.innerWidth, Math.ceil(r.width + {pad} * 2)), height: Math.min(window.innerHeight, Math.ceil(r.height + {pad} * 2)) }}; }})()"
        );
        match run_in_renderer(&app, &script).await {
            Ok(v) => {
                if let Some(err) = v.get("error") { return Json(json!({ "error": err })); }
                let x = v.get("x").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let y = v.get("y").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let w = v.get("width").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let h = v.get("height").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let abs_x = inner_pos.x + (x as f64 * scale) as i32;
                let abs_y = inner_pos.y + (y as f64 * scale) as i32;
                let abs_w = (w as f64 * scale) as i32;
                let abs_h = (h as f64 * scale) as i32;
                Some((abs_x.max(0) as u32, abs_y.max(0) as u32, abs_w.max(1) as u32, abs_h.max(1) as u32))
            }
            Err(e) => return Json(json!({ "error": e })),
        }
    } else {
        None
    };

    let our_pid = std::process::id();
    let windows = match xcap::Window::all() {
        Ok(w) => w,
        Err(e) => return Json(json!({ "error": format!("xcap::Window::all: {e}") })),
    };
    let target = match windows.into_iter().find(|w| {
        w.pid().map(|p| p == our_pid).unwrap_or(false) && !w.is_minimized().unwrap_or(false)
    }) {
        Some(w) => w,
        None => return Json(json!({ "error": "could not locate own Tauri window" })),
    };
    let img = match target.capture_image() {
        Ok(i) => i,
        Err(e) => return Json(json!({ "error": format!("capture_image: {e}") })),
    };

    let cropped: image::RgbaImage = match rect_px {
        Some((x, y, w, h)) => {
            let win_x = target.x().unwrap_or(0).max(0) as u32 * (scale.round() as u32);
            let win_y = target.y().unwrap_or(0).max(0) as u32 * (scale.round() as u32);
            let max_w = img.width();
            let max_h = img.height();
            let cx = x.saturating_sub(win_x).min(max_w.saturating_sub(1));
            let cy = y.saturating_sub(win_y).min(max_h.saturating_sub(1));
            let cw = w.min(max_w - cx);
            let ch = h.min(max_h - cy);
            image::imageops::crop_imm(&img, cx, cy, cw, ch).to_image()
        }
        None => img,
    };

    let mut buf = std::io::Cursor::new(Vec::new());
    if let Err(e) = cropped.write_to(&mut buf, image::ImageFormat::Png) {
        return Json(json!({ "error": format!("png encode: {e}") }));
    }
    use base64::Engine;
    let data = base64::engine::general_purpose::STANDARD.encode(buf.into_inner());
    Json(json!({ "data": data, "mimeType": "image/png" }))
}

pub fn spawn(app: AppHandle) {
    let port: u16 = std::env::var("SLAKTFORSKNING_UI_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(DEFAULT_PORT);

    tauri::async_runtime::spawn(async move {
        let router = Router::new()
            .route("/", get(handle_health))
            .route("/db_path", get(handle_db_path))
            .route("/eval", post(handle_eval))
            .route("/screenshot", post(handle_screenshot))
            .with_state(app.clone());

        let addr = format!("127.0.0.1:{port}");
        match tokio::net::TcpListener::bind(&addr).await {
            Ok(listener) => {
                eprintln!("[ui-bridge] listening on http://{addr}");
                let _ = app.emit("ui-bridge-ready", port);
                if let Err(e) = axum::serve(listener, router).await {
                    eprintln!("[ui-bridge] axum error: {e}");
                }
            }
            Err(e) => eprintln!("[ui-bridge] bind failed on {addr}: {e}"),
        }
    });
}
