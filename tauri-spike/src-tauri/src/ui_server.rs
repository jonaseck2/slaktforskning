// Dev-only HTTP server that gives the slaktforskning-dev MCP its UI tools.
// Listens on SLAKTFORSKNING_UI_PORT (default 19241) — same port + endpoint
// shapes the Electron build's src/main/ui-server.ts exposes, so the existing
// MCP server in src/mcp/createDevServer.ts works against Tauri unchanged.

use axum::extract::Query;
use axum::routing::{get, post};
use axum::{Json, Router};
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use serde::Deserialize;
use serde_json::{json, Value as JsonValue};
use std::collections::HashMap;
use std::process::Command as StdCommand;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use tokio::sync::oneshot;
use tokio::time::timeout;

const DEFAULT_PORT: u16 = 19241;
const EVAL_TIMEOUT: Duration = Duration::from_secs(8);

type Sender = oneshot::Sender<JsonValue>;
static PENDING: Lazy<Mutex<HashMap<String, Sender>>> = Lazy::new(|| Mutex::new(HashMap::new()));

#[tauri::command]
pub fn ui_eval_response(id: String, value: JsonValue) {
    if let Some(tx) = PENDING.lock().remove(&id) {
        let _ = tx.send(value);
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
        Ok(Err(_)) => {
            PENDING.lock().remove(&id);
            Err("renderer dropped response".into())
        }
        Err(_) => {
            PENDING.lock().remove(&id);
            Err("renderer script timed out".into())
        }
    }
}

#[derive(Deserialize)]
struct NavigateBody { path: String }

#[derive(Deserialize)]
struct ClickBody { selector: String }

#[derive(Deserialize)]
struct FillBody { selector: String, value: String }

#[derive(Deserialize)]
struct ScreenshotBody {
    selector: Option<String>,
    #[serde(default)]
    padding: u32,
}

#[derive(Deserialize)]
struct DomQuery {
    selector: Option<String>,
    #[serde(default = "default_max_chars")]
    max_chars: u32,
}
fn default_max_chars() -> u32 { 50_000 }

async fn handle_navigate(
    axum::extract::State(app): axum::extract::State<AppHandle>,
    Json(body): Json<NavigateBody>,
) -> Json<JsonValue> {
    let path_json = serde_json::to_string(&body.path).unwrap();
    let script = format!("(window.__vue_router && window.__vue_router.push({path_json}), {{ ok: true }})");
    match run_in_renderer(&app, &script).await {
        Ok(v) => Json(v),
        Err(e) => Json(json!({ "error": e })),
    }
}

async fn handle_reload(
    axum::extract::State(app): axum::extract::State<AppHandle>,
) -> Json<JsonValue> {
    if let Some(win) = main_window(&app) {
        let _ = win.eval("window.location.reload()");
    }
    Json(json!({ "ok": true }))
}

async fn handle_click(
    axum::extract::State(app): axum::extract::State<AppHandle>,
    Json(body): Json<ClickBody>,
) -> Json<JsonValue> {
    let sel = serde_json::to_string(&body.selector).unwrap();
    let script = format!(
        "(() => {{ const el = document.querySelector({sel}); if (!el) return {{ error: 'Element not found: ' + {sel} }}; el.dispatchEvent(new MouseEvent('click', {{ bubbles: true, cancelable: true }})); return {{ ok: true }}; }})()"
    );
    match run_in_renderer(&app, &script).await {
        Ok(v) => Json(v),
        Err(e) => Json(json!({ "error": e })),
    }
}

async fn handle_fill(
    axum::extract::State(app): axum::extract::State<AppHandle>,
    Json(body): Json<FillBody>,
) -> Json<JsonValue> {
    let sel = serde_json::to_string(&body.selector).unwrap();
    let val = serde_json::to_string(&body.value).unwrap();
    let script = format!(
        "(() => {{ const el = document.querySelector({sel}); if (!el) return {{ error: 'Element not found: ' + {sel} }}; const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; const setter = Object.getOwnPropertyDescriptor(proto, 'value').set; setter.call(el, {val}); el.dispatchEvent(new Event('input', {{ bubbles: true }})); el.dispatchEvent(new Event('change', {{ bubbles: true }})); return {{ ok: true }}; }})()"
    );
    match run_in_renderer(&app, &script).await {
        Ok(v) => Json(v),
        Err(e) => Json(json!({ "error": e })),
    }
}

async fn handle_dom(
    axum::extract::State(app): axum::extract::State<AppHandle>,
    Query(q): Query<DomQuery>,
) -> Json<JsonValue> {
    let sel = q.selector.unwrap_or_else(|| "body".into());
    let sel_json = serde_json::to_string(&sel).unwrap();
    let max = q.max_chars;
    let script = format!(
        "(() => {{ const el = document.querySelector({sel_json}); if (!el) return {{ error: 'Element not found: ' + {sel_json} }}; const html = el.outerHTML.replace(/<style[^>]*>[\\s\\S]*?<\\/style>/g, ''); return {{ html: html.length > {max} ? html.slice(0, {max}) + '... [truncated]' : html, length: html.length }}; }})()"
    );
    match run_in_renderer(&app, &script).await {
        Ok(v) => Json(v),
        Err(e) => Json(json!({ "error": e })),
    }
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

    let (rect_x, rect_y, rect_w, rect_h) = if let Some(sel) = body.selector {
        let sel_json = serde_json::to_string(&sel).unwrap();
        let pad = body.padding;
        let script = format!(
            "(() => {{ const el = document.querySelector({sel_json}); if (!el) return {{ error: 'Element not found: ' + {sel_json} }}; el.scrollIntoView({{ block: 'nearest', inline: 'nearest' }}); const r = el.getBoundingClientRect(); return {{ x: Math.max(0, Math.floor(r.left - {pad})), y: Math.max(0, Math.floor(r.top - {pad})), width: Math.min(window.innerWidth, Math.ceil(r.width + {pad} * 2)), height: Math.min(window.innerHeight, Math.ceil(r.height + {pad} * 2)) }}; }})()"
        );
        match run_in_renderer(&app, &script).await {
            Ok(v) => {
                if let Some(err) = v.get("error") {
                    return Json(json!({ "error": err }));
                }
                let x = v.get("x").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let y = v.get("y").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let w = v.get("width").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                let h = v.get("height").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                // screencapture -R uses points (logical), Tauri's
                // PhysicalPosition is in pixels — convert to points.
                let abs_x = ((inner_pos.x as f64) / scale) as i32 + x;
                let abs_y = ((inner_pos.y as f64) / scale) as i32 + y;
                (abs_x, abs_y, w, h)
            }
            Err(e) => return Json(json!({ "error": e })),
        }
    } else {
        let pos = win.outer_position().unwrap_or_default();
        let size = win.outer_size().unwrap_or_default();
        let to_pt = |px: i32| ((px as f64) / scale) as i32;
        (to_pt(pos.x), to_pt(pos.y), to_pt(size.width as i32), to_pt(size.height as i32))
    };

    let tmp = std::env::temp_dir().join(format!("tauri-shot-{}.png", uuid::Uuid::new_v4()));
    let region = format!("{},{},{},{}", rect_x, rect_y, rect_w, rect_h);
    let out = StdCommand::new("screencapture")
        .args(["-x", "-R", &region, tmp.to_str().unwrap_or_default()])
        .output();
    match out {
        Ok(o) if o.status.success() => {
            match std::fs::read(&tmp) {
                Ok(bytes) => {
                    let _ = std::fs::remove_file(&tmp);
                    use base64::Engine;
                    let data = base64::engine::general_purpose::STANDARD.encode(&bytes);
                    Json(json!({ "data": data, "mimeType": "image/png" }))
                }
                Err(e) => Json(json!({ "error": format!("read png: {e}") })),
            }
        }
        Ok(o) => Json(json!({ "error": format!("screencapture exit {:?}: {} (region={})", o.status.code(), String::from_utf8_lossy(&o.stderr), region) })),
        Err(e) => Json(json!({ "error": format!("spawn screencapture: {e}") })),
    }
}

async fn handle_health() -> Json<JsonValue> {
    Json(json!({ "ok": true, "server": "tauri-ui-server" }))
}

pub fn spawn(app: AppHandle) {
    let port: u16 = std::env::var("SLAKTFORSKNING_UI_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(DEFAULT_PORT);

    tauri::async_runtime::spawn(async move {
        let router = Router::new()
            .route("/", get(handle_health))
            .route("/screenshot", post(handle_screenshot))
            .route("/navigate", post(handle_navigate))
            .route("/reload", post(handle_reload))
            .route("/click", post(handle_click))
            .route("/fill", post(handle_fill))
            .route("/dom", get(handle_dom))
            .with_state(app.clone());

        let addr = format!("127.0.0.1:{port}");
        match tokio::net::TcpListener::bind(&addr).await {
            Ok(listener) => {
                eprintln!("[ui-server] listening on http://{addr}");
                let _ = app.emit("ui-server-ready", port);
                if let Err(e) = axum::serve(listener, router).await {
                    eprintln!("[ui-server] axum error: {e}");
                }
            }
            Err(e) => eprintln!("[ui-server] bind failed on {addr}: {e}"),
        }
    });
}
