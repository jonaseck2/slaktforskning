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
    #[serde(default = "default_dom_mode")]
    mode: String,
    #[serde(default)]
    all: Option<String>,
    #[serde(default)]
    limit: Option<u32>,
}
fn default_dom_mode() -> String { "outerHTML".into() }

#[derive(Deserialize)]
struct QueryStylesBody {
    selector: String,
    #[serde(default)]
    props: Option<Vec<String>>,
    #[serde(default)]
    limit: Option<u32>,
}

async fn handle_navigate(
    axum::extract::State(app): axum::extract::State<AppHandle>,
    Json(body): Json<NavigateBody>,
) -> Json<JsonValue> {
    let path_json = serde_json::to_string(&body.path).unwrap();
    // Await the router promise so back-to-back navigates don't race. Without
    // this, a fast caller can fire two pushes before the first transition
    // resolves and Vue gets stuck on the previous view's component.
    let script = format!("(async () => {{ if (!window.__vue_router) return {{ error: 'no router' }}; await window.__vue_router.push({path_json}).catch(() => null); await new Promise(r => requestAnimationFrame(r)); return {{ ok: true, route: window.__vue_router.currentRoute.value.fullPath }}; }})()");
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
    let all = matches!(q.all.as_deref(), Some("true") | Some("1"));
    let mode = match q.mode.as_str() {
        "innerHTML" | "textContent" | "attributes" | "outerHTML" => q.mode.clone(),
        _ => "outerHTML".into(),
    };
    let limit = q.limit.map(|l| l.clamp(1, 200)).unwrap_or(if all { 50 } else { 1 });

    if q.selector.is_none() {
        // Full document — large; agent should usually scope.
        let script = "document.documentElement.outerHTML";
        match run_in_renderer(&app, script).await {
            Ok(v) => return Json(v),
            Err(e) => return Json(json!({ "error": e })),
        }
    }
    let sel = q.selector.unwrap();
    let sel_json = serde_json::to_string(&sel).unwrap();
    let mode_json = serde_json::to_string(&mode).unwrap();
    let script = format!(
        "(() => {{ const els = [...document.querySelectorAll({sel_json})].slice(0, {limit}); if (els.length === 0) return {{ matches: [], total: 0 }}; const total = document.querySelectorAll({sel_json}).length; const extract = (el) => {{ switch ({mode_json}) {{ case 'innerHTML': return el.innerHTML; case 'textContent': return (el.textContent ?? '').trim(); case 'attributes': {{ const out = {{}}; for (const a of el.attributes) out[a.name] = a.value; return out; }} default: return el.outerHTML; }} }}; return {{ matches: els.map(extract), total }}; }})()"
    );
    match run_in_renderer(&app, &script).await {
        Ok(v) => {
            let matches = v.get("matches").cloned().unwrap_or(json!([]));
            let total = v.get("total").and_then(|t| t.as_u64()).unwrap_or(0);
            let arr = matches.as_array().cloned().unwrap_or_default();
            if arr.is_empty() {
                return Json(json!({ "error": format!("Element not found: {sel}") }));
            }
            if !all {
                return Json(arr.into_iter().next().unwrap_or(JsonValue::Null));
            }
            Json(json!({ "matches": arr.clone(), "total": total, "returned": arr.len() }))
        }
        Err(e) => Json(json!({ "error": e })),
    }
}

async fn handle_query_styles(
    axum::extract::State(app): axum::extract::State<AppHandle>,
    Json(body): Json<QueryStylesBody>,
) -> Json<JsonValue> {
    let sel_json = serde_json::to_string(&body.selector).unwrap();
    let props_json = match &body.props {
        Some(p) => serde_json::to_string(p).unwrap(),
        None => "null".into(),
    };
    let limit = body.limit.map(|l| l.clamp(1, 20)).unwrap_or(5);
    let script = format!(
        "(() => {{ const DEFAULT_PROPS = ['display','position','overflow','overflowX','overflowY','height','minHeight','maxHeight','width','minWidth','maxWidth','flex','flexDirection','alignItems','justifyContent','gap','padding','margin','borderRadius','boxSizing','zIndex','top','right','bottom','left','transform','visibility','opacity']; const propList = {props_json} || DEFAULT_PROPS; const els = [...document.querySelectorAll({sel_json})].slice(0, {limit}); if (els.length === 0) return {{ matches: [], total: 0 }}; const total = document.querySelectorAll({sel_json}).length; return {{ total, matches: els.map((el, i) => {{ const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); const computed = {{}}; for (const p of propList) computed[p] = cs[p]; return {{ index: i, tag: el.tagName.toLowerCase(), classes: [...el.classList], id: el.id || null, rect: {{ x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, left: r.left, bottom: r.bottom, right: r.right }}, scroll: {{ scrollHeight: el.scrollHeight, scrollWidth: el.scrollWidth, scrollTop: el.scrollTop, scrollLeft: el.scrollLeft, clientHeight: el.clientHeight, clientWidth: el.clientWidth }}, computed, }}; }}), }}; }})()"
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

    // Element-cropped rect in physical pixels, or None for whole window.
    let rect_px: Option<(u32, u32, u32, u32)> = if let Some(sel) = body.selector {
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
                // inner_pos is physical pixels; CSS rect is points → multiply.
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

    // Capture the Tauri *window* (not the whole monitor) so screenshots
    // come through even when our window is behind another app. Match by PID
    // because window titles change with the loaded route.
    let our_pid = std::process::id();
    let windows = match xcap::Window::all() {
        Ok(w) => w,
        Err(e) => return Json(json!({ "error": format!("xcap::Window::all: {e}") })),
    };
    let our_win = windows.into_iter().find(|w| {
        w.pid().map(|p| p == our_pid).unwrap_or(false)
            && !w.is_minimized().unwrap_or(false)
    });
    let target = match our_win {
        Some(w) => w,
        None => return Json(json!({ "error": "could not locate own Tauri window in xcap list (process may not have a registered window yet)" })),
    };
    let img = match target.capture_image() {
        Ok(i) => i,
        Err(e) => return Json(json!({ "error": format!("capture_image: {e}") })),
    };

    // The xcap window image already contains the chrome + content. For
    // element-cropped captures we still want renderer-relative coords; the
    // window's CSS-pixel content area starts at its origin in this bitmap
    // (Tauri webviews fill the whole window — there's no native title bar
    // padding inside the bitmap). Convert physical-pixel rect → in-image rect.
    let cropped: image::RgbaImage = match rect_px {
        Some((x, y, w, h)) => {
            // x/y are absolute screen pixels (inner_pos + element rect); xcap
            // returns the window image starting at the window's screen origin.
            // Subtract the window's screen position to get in-image coords.
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

async fn handle_health() -> Json<JsonValue> {
    Json(json!({ "ok": true, "server": "tauri-ui-server" }))
}

#[derive(Deserialize)]
struct EvalBody { script: String }

/// /eval — debug-only escape hatch for the dev MCP. Runs an arbitrary script
/// in the renderer and returns its value. Lets the agent inspect runtime
/// state, call window.api.* directly, etc. without round-tripping through
/// hardcoded endpoints.
async fn handle_eval(
    axum::extract::State(app): axum::extract::State<AppHandle>,
    Json(body): Json<EvalBody>,
) -> Json<JsonValue> {
    match run_in_renderer(&app, &body.script).await {
        Ok(v) => Json(v),
        Err(e) => Json(json!({ "error": e })),
    }
}

/// /status — what the slaktforskning-dev MCP's `app_status` tool calls.
/// Returns the current Vue route + window dimensions + DB path.
async fn handle_status(
    axum::extract::State(app): axum::extract::State<AppHandle>,
) -> Json<JsonValue> {
    let db_path = crate::db::current_path();
    let script = "({ route: window.__vue_router ? window.__vue_router.currentRoute.value.fullPath : null, windowWidth: window.innerWidth, windowHeight: window.innerHeight })";
    match run_in_renderer(&app, script).await {
        Ok(mut v) => {
            if let Some(obj) = v.as_object_mut() {
                obj.insert("dbPath".into(), json!(db_path));
            }
            Json(v)
        }
        Err(e) => Json(json!({ "error": e })),
    }
}

/// /db_path — the active DB path. Useful for an MCP wrapper to align its
/// own connection with whatever the running app currently has open.
async fn handle_db_path() -> Json<JsonValue> {
    Json(json!({ "path": crate::db::current_path() }))
}

pub fn spawn(app: AppHandle) {
    let port: u16 = std::env::var("SLAKTFORSKNING_UI_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(DEFAULT_PORT);

    tauri::async_runtime::spawn(async move {
        let router = Router::new()
            .route("/", get(handle_health))
            .route("/status", get(handle_status))
            .route("/db_path", get(handle_db_path))
            .route("/eval", post(handle_eval))
            .route("/screenshot", post(handle_screenshot))
            .route("/navigate", post(handle_navigate))
            .route("/reload", post(handle_reload))
            .route("/click", post(handle_click))
            .route("/fill", post(handle_fill))
            .route("/dom", get(handle_dom))
            .route("/query_styles", post(handle_query_styles))
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
