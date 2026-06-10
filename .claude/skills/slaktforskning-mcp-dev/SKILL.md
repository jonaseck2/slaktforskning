---
name: slaktforskning-mcp-dev
description: Extend the Släktforskning MCP server — add new tools to createProdServer.ts / createDevServer.ts, wire window.api bindings in tauri-window-api.ts + static-api stubs, test via tests/unit/mcp.test.ts, debug agent-facing IPC. Also covers the dev MCP HTTP bridge (src-tauri/src/ui_server.rs) used by ui_screenshot / ui_click / ui_eval / chart_*. Use when modifying anything in src/mcp/, src/renderer/tauri-window-api.ts, or src-tauri/src/ui_server.rs. Distinct from `slaktforskning-mcp` (which is for an agent *using* the MCP tools to do genealogy work for the user).
---

# Släktforskning MCP — Server-Dev Skill

## ⚠️ Prime Directive: Pass-Through, Never Synthesize

MCP tools are an interface for *the agent's* authored input. They are not a place to "be helpful" by filling in fields the agent didn't supply. Every persistent value an MCP tool writes must come from an explicit argument the agent provided.

**Forbidden patterns:**
- `date_type: args.date_type ?? (args.date_value ? 'exact' : 'unknown')` — this is the canonical violation. The agent passed `date_value` but didn't say what type. Inferring `'exact'` is fabricating data. Pass through `args.date_type` and let the api/schema default to `'unknown'`. Only populate `date_value` when the agent also confirmed `date_type` — otherwise store the input as `date_original` only.
- Auto-resolving a place name to coordinates and writing them to `places.latitude/longitude` — that's a gazetteer-resolved value, never persisted (see gazetteers skill).
- Defaulting `sex` to `'U'` is OK — that's the schema's "I don't know" sentinel, not an inference. Defaulting `sex` to `'M'` based on the given name would be a violation.

**Allowed:**
- Pass agent-supplied fields straight through to the api/ function. Let the api/schema layer default missing optional fields to a sentinel value (`'unknown'`, NULL).
- Argument validation (rejecting clearly invalid input).
- Document the contract in the tool's `describe()` so agents know when to supply structured fields vs free-form fallbacks.

Treat MCP tool arguments as a write API, not a guessing game.

## Prod vs Dev Server

The MCP server has two entry points:

| Server | Entry point | Tools |
|--------|-------------|-------|
| Production | `src/mcp/server.ts` | 77 workflow tools — full CRUD parity with the desktop app for genealogy research |
| Development | `src/mcp/devServer.ts` | All prod tools + 15 dev-only tools |

Use the **dev server** for all agent-driven development, UI testing, and chart debugging. Use the **prod server** for research sessions and narrative generation.

### How the production sidecar ships

In the bundled Tauri app, the prod server is NOT run via `npx tsx`. The build pipeline is:

1. `npm run build:mcp-sidecar` — esbuild bundles `src/mcp/server.ts` → `dist-mcp/server.bundle.mjs` (ESM, single file). One tool, no pkg / no Node packing.
2. `scripts/fetch-bun-binaries.mjs` — downloads per-platform Bun binaries (SHA-pinned via `src-tauri/binaries/bun-binaries.lock`) into `src-tauri/binaries/bun-<triple>`. CI runs this before `tauri build`.
3. `tauri build` — Tauri's bundler picks up the Bun binary via `tauri.conf.json` `bundle.externalBin` and ships `server.bundle.mjs` via `bundle.resources`.
4. `src-tauri/src/mcp.rs` spawns `bun server.bundle.mjs` via `tauri-plugin-shell` at runtime. Sidecar args are constrained to `["server.bundle.mjs"]` in `src-tauri/capabilities/default.json`.

[kkrpc](https://github.com/kunkunsh/kkrpc) is the JS-side typesafe RPC layer between renderer ↔ Bun child; there is no Rust-side kkrpc crate (kkrpc's protocol is incompatible with the MCP stdio framing the Rust side uses). The Rust spawn is plain `tauri-plugin-shell`.

For local development, `npx tsx src/mcp/server.ts` still works as the Node-host path — that's what `.claude/settings.local.json` typically uses.

## Three Modes of Use

### Mode 1: Agent-Driven Development

Seed test data and verify new UI features without touching the app manually. **Use the dev server** (`src/mcp/devServer.ts`):

```
1. seed_family({ children: 2 })  — realistic test data in one call
   — or — create_person / record_event / ...
2. ui_navigate("/your-new-route") — go to the view
3. ui_screenshot()                — visual confirmation it renders
4. ui_get_dom()                   — assert specific elements exist in the DOM
5. ui_click("button.add")         — exercise primary interactions
```

**The MCP server shares the same SQLite database as the running app.** Data seeded via MCP tools is immediately visible in the app — no restart needed.

#### Chart debugging with the dev server

When working on chart layout bugs, use the chart inspection tools:

```
1. chart_list_persons()                    — see all boxes with x/y positions
2. chart_select_person({ id: "..." })      — select a person (shows outlines)
3. chart_get_layout()                      — full layout: boxes, lines, placeholders
4. chart_screenshot_person({ id: "..." })  — screenshot cropped to one box
5. ui_screenshot()                         — full chart screenshot for context
```

This lets you verify connector positions, outline placement, and spacing without reading raw layout data from source files.

#### ARIA-first navigation (preferred over `ui_click` / `ui_fill`)

The seven `ui_aria_*` tools mirror what a screen-reader user experiences. **Prefer them over the CSS-selector tools (`ui_click`, `ui_fill`, `ui_get_dom`) whenever the goal is "act on something the user can see / hear"** — the accessible-name surface survives CSS-class renames, layout refactors, and Vue template restructures, while CSS selectors break on the first redesign.

| When you want to… | Use |
|---|---|
| Orient in an unfamiliar view (what regions exist?) | `ui_aria_landmarks()` |
| Read the page outline | `ui_aria_headings()` (optionally scoped by `region`) |
| Trace what Tab navigation feels like | `ui_aria_tab_order({ region?: '…' })` |
| List clickables/inputs by name + role + state | `ui_aria_list({ role?: '…', region?: '…' })` |
| "Read" the prose of a section (TTS-style) | `ui_aria_read({ region?: '…' })` |
| Click or fill by name | `ui_aria_invoke({ name: '…', role?: '…', region?: '…', value?: '…' })` |
| Find every a11y gap in the current view | `ui_aria_audit({ region?: '…' })` |

**Accessible-name resolution (7-step priority — first match wins):**

1. `v-narrate` text on the element (the screen-reader mode's curated name — `window.__narrationMap.get(el)`).
2. `aria-label` attribute.
3. `aria-labelledby` referent's `textContent`.
4. `<label for="id">` association.
5. Element's own visible `textContent` (trimmed; `aria-hidden` children excluded).
6. `placeholder` (form controls only — and `ui_aria_audit` reports this as `input_without_label` because placeholder ≠ label).
7. `title`.

If none produce a non-empty string, the element is omitted from `ui_aria_list` — and reported as `unnamed_interactable` by `ui_aria_audit`.

**Ambiguity is a signal, not an error to dismiss.** `ui_aria_invoke({ name: 'Spara' })` throws when two elements share that name and lists every candidate with its role + region in the error message — silent first-match is the bug class CSS selectors keep producing. Disambiguate via the `role` / `region` arguments.

**Region resolution is conservative.** Only landmarks with an *explicit* accessible name (`aria-label`, `aria-labelledby`, or `v-narrate`) count as named regions. Bare `<main>` / `<header>` / `<aside>` without `aria-label` resolve to `region: null` — they show up in `ui_aria_landmarks` with `has_name: false` and `ui_aria_audit` reports them as `unnamed_landmark`.

**When `ui_aria_*` can't find what you want, that's data.** It usually means the app has a real a11y gap. Run `ui_aria_audit()` and quote the `hint` in the follow-up.

**When the CSS-selector tools are still right:** `ui_query_styles` (computed styles, layout debugging), `ui_get_dom` with `mode: 'attributes'` (state probes the ARIA surface doesn't cover yet), and `ui_screenshot` (visual diffs). The two categories complement each other; ARIA covers user-facing affordances, CSS selectors cover implementation details.

### Mode 2: Acceptance Testing After Feature Implementation

After implementing a UI feature (e.g. ResearchTasksView), before committing:

1. Ensure the app is running (`npm start` or check with `app_status`)
2. Seed data via MCP: `seed_person`, `seed_family`, or direct workflow tools
3. `ui_navigate("/research-tasks")` → verify the view loads
4. `ui_get_dom()` → assert tasks appear in the table
5. `ui_click()` → test status change, filter, add/delete interactions

This is faster than writing a full Playwright E2E test and covers the full IPC → Vue rendering stack that unit tests don't reach.

### Mode 3: Active Research Session

During genealogy research, use the **prod server** (`src/mcp/server.ts`):

- `search_persons("Nilsson")` → find candidates
- `get_person_summary(id)` → everything about a person in one call
- `record_event(...)` → record a newly found birth record with place + citation
- `get_research_gaps(id)` → check what's missing
- `get_current_database` → confirm which DB is active before making changes

### Data integrity rule: search before create

**Always call `search_persons` (or the relevant search tool) before `create_person`.** Never blindly create a record that may already exist. This applies to all entity types — persons, places, sources, groups. Duplicates are expensive to clean up and confuse users.

### Media file_ref rule — NEVER pass a URL or absolute path

`media.file_ref` is resolved at render time by joining it to the directory containing the active database (e.g. `~/db/family.db` → `~/db/` + `file_ref`). The renderer treats `file_ref` as a path. So:

- ✅ `file_ref: "claude-media/photo.jpg"` (relative to db directory, file lives at `~/db/claude-media/photo.jpg`)
- ❌ `file_ref: "https://i.ytimg.com/vi/X/maxresdefault.jpg"` — fails to load. The renderer doesn't fetch URLs.
- ❌ `file_ref: "/Users/.../photo.jpg"` — absolute paths must be consolidated into `<dbname>-media/` first (see `.claude/rules/media.md`).

**If you have a URL pointing at an image you want to attach:**
1. `curl -o /path/to/<dbname>-media/<filename>.jpg "<url>"` (use `getMediaDir(dbPath)` to compute the folder; create it with `mkdir -p` if missing).
2. `attach_media({ file_ref: "<dbname>-media/<filename>.jpg", format: "jpg", ... })`.

**If a URL belongs as a citation, not as a media file:** put it in a `source.url` and `cite()` the person/event — that's what sources are for. The LinkedIn/Facebook profile URL of a living person is almost always a citation, not media.

**To repair a broken `file_ref` after the fact:** use `update_media({ id, file_ref: "..." })`. To drop a media row entirely (e.g. an attached URL that should have been a source): `delete_media({ id })`.

### Headless / pipeline mode

If you are running as a headless agent (Kubernetes pod, CI, no window server, no `.mcp.json`):

- **Skip all `ui_*` tools** — they require the Tauri app to be running with a display. Calling them will fail or hang.
- **Data tools work fine** — run the prod server standalone (`npx tsx src/mcp/server.ts`) with `SLAKTFORSKNING_DB=/path/to/db.db` and call data tools directly via stdin/stdout JSON-RPC.
- **Use E2E tests for UI verification** — `npm run test:e2e` (Tier 1) / `npm run test:e2e:full` (Tier 2) runs headless against the packaged Tauri binary and covers the full IPC → Vue rendering stack. Prefer this over `ui_screenshot` for pipeline verification.

### Session Start Checklist

At the start of any session where UI work or research will happen:
1. Call `get_current_database` — confirm which DB is active
2. If the app is not running, UI tools (`ui_screenshot`, `ui_navigate`, etc.) will return errors — data tools still work
3. Data tools operate directly on SQLite via the MCP sidecar; they do not require the Tauri app to be running

---

## Running the MCP Server

### Production server (for research sessions)
```bash
npx tsx src/mcp/server.ts
```
Uses the default DB path (`~/Library/Application Support/slaktforskning/slaktforskning.db` on macOS).

### Development server (for agent-driven development)
```bash
npx tsx src/mcp/devServer.ts
```
Includes all prod tools plus UI automation, chart inspection, seed, and inspect tools.

### With a test database
```bash
SLAKTFORSKNING_DB=/tmp/test.db npx tsx src/mcp/devServer.ts
```

### Via Claude Code
The MCP server is configured in `.claude/settings.local.json` as `slaktforskning`. Configure it to use the dev server for development work:
```json
{
  "mcpServers": {
    "slaktforskning": {
      "command": "npx",
      "args": ["tsx", "src/mcp/devServer.ts"]
    }
  }
}
```

## Testing MCP Tools

### Quick test — send an initialize request
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | SLAKTFORSKNING_DB=/tmp/mcp-test.db npx tsx src/mcp/server.ts
```
Should output JSON containing `"serverInfo"` and `"slaktforskning"`.

### E2E test
```bash
npx playwright test tests/e2e/app.test.ts
```
The second test (`MCP server starts and responds`) verifies the server boots and responds to `initialize`.

### Via Claude Code MCP tools
Use ToolSearch to find and call the `slaktforskning` MCP tools directly:
- `mcp__slaktforskning__create_person`
- `mcp__slaktforskning__list_persons`
- `mcp__slaktforskning__search_persons`
- etc.

### When does my edit need a restart? — the reload matrix

Several long-running processes share the codebase: the **Tauri Rust host** (compiled binary), the **renderer (Vue)** running inside the system webview, and the **MCP server** (separate `npx tsx` process for dev, or `bun server.bundle.mjs` child of the Rust host in the bundled build). Each caches different parts of the source. An edit that lands in one process is invisible to another until the right thing reloads.

| You edited | Reload needed | Why |
|---|---|---|
| `src/renderer/**` (Vue, CSS, composables, stores) | Renderer reload — `ui_reload` MCP tool, or Cmd+R, or just save under HMR | Vite HMR updates the renderer; nothing else is involved. |
| `src/renderer/tauri-window-api.ts` / `src/renderer/db-shim.ts` / `src/renderer/main.ts` | **Full app restart** if running `npm start`; HMR usually picks up tauri-window-api.ts but always restart if behavior looks stale | The bridge mounts at boot. |
| `src/api/**` (any) | Restart app **and** restart MCP server | The renderer-side api/ layer loads at app boot. The MCP server is a separate Node process that loads its own copy of the same files at boot. Both need to restart. |
| `src/api/checks/**` | Same as above — restart app + MCP server | These run inside the renderer (called from `checks:runAll`). |
| `src-tauri/src/**` | Restart `npm start` — Rust recompiles automatically (~3 s incremental) | The Rust host is a compiled binary; tauri-cli watches and recompiles. |
| `src/shared/**` | Restart app **and** restart MCP server | Both processes import the shared helpers at boot. |
| `src/mcp/createProdServer.ts`, `src/mcp/createDevServer.ts`, `src/mcp/server.ts`, `src/mcp/devServer.ts` | Restart MCP server only | The MCP server is its own `npx tsx` process; restarting the Tauri app doesn't touch it. |
| `src/mcp/tools/**` | Restart MCP server only | Same. |
| `.claude/skills/**`, `.claude/rules/**` | Nothing — picked up automatically at next prompt | Read by Claude Code on each turn. |

**Restarting the MCP server** — use Claude Code's `/mcp` slash command and explicitly restart the slaktforskning server (or quit + reopen the Claude Code window). **Reconnecting from Claude Code does not always respawn the underlying `npx tsx` process** — sometimes only the transport reconnects. Symptoms of a transport-only reconnect:

- A newly added tool isn't visible via `ToolSearch`.
- `update_event` / `record_event` reject `date_value_end` ("Input validation error: Unrecognized key").
- `mcp__slaktforskning__update_person_name` returns "No matching deferred tools found".

After a real MCP restart:

1. **The MCP server's "current database" resets to the default app data DB.** Always call `switch_database` again before continuing work.
2. Verify the new tool appears via `ToolSearch` before calling it — if it's still missing, the restart didn't take.

**Restarting the Tauri app** — ask the user. Claude Code can't restart their app without their consent (it would close their unsaved work).

### When the dev MCP looks dead, ask — don't curl

If `ui_screenshot` / `ui_get_dom` / `ui_click` / any `ui_aria_*` tool starts returning `{"error":"Not found"}` for every selector, or hangs, or returns suspiciously empty results across multiple unrelated calls, **stop and ask the user to start/restart the MCP**. Do not fall back to `curl http://127.0.0.1:19241/...` as a workaround.

**Why this is a rule:** the MCP is the supported and ergonomic interface — it speaks structured tool I/O, the user can see what's being inspected in their tool log, and the workflow stays consistent. Falling back to curl bypasses that, scatters one-off shell scripts through the session, and makes the conversation harder for the user to follow. The user has flagged this directly.

**How to apply:** first `"Not found"` or empty response → confirm the MCP looks dead with one more attempt against a different known-good target → then say to the user something like *"the slaktforskning-dev MCP looks disconnected — can you restart it?"* and wait. Don't curl, don't try to debug the MCP server itself, don't probe `/db_path` "just to see if it's up."

### Verifying interactive UI fixes via MCP

The MCP UI bridge can `ui_screenshot`, `ui_navigate`, `ui_click`, `ui_fill`, `ui_get_dom`, `ui_query_styles`, `ui_reload`. It **cannot synthesize a drag** — there's no `mousedown + mousemove + mouseup` sequence. Don't claim "verified live" for any feature whose acceptance test is a drag (resizable columns, panel resize, chart pan/zoom). Instead:

1. Verify the structural state via `ui_query_styles` (handles present at the right rect, computed `cursor: col-resize`, `pointerEvents: auto`).
2. Mutate the underlying state via the same path the drag would (set localStorage, write the persisted width directly).
3. Reload and confirm the new state renders correctly.
4. Tell the user "I verified the wiring; please drag once to confirm the interaction works in your hands."

The 2026-05-09 resizable-columns rollout took two iterations because I claimed live-verification on iteration 1 without realising the structural state was correct but the runtime drag was being squashed by `width: 100%`.

## Adding a New MCP Tool

**Production tools** live in `src/mcp/createProdServer.ts`. **Dev-only tools** live in `src/mcp/createDevServer.ts` (which imports and extends prod). Use `registerTool()`, not the deprecated `tool()` overload:

```typescript
// src/mcp/createProdServer.ts — inside createMcpServer(db)
server.registerTool('tool_name', {
  description: 'Human-readable description',
  inputSchema: {
    param_name: z.string().describe('What this param does'),
    optional_param: z.string().optional().describe('Optional field'),
  },
}, async ({ param_name, optional_param }) => {
  // Call the api/ function — NEVER put business logic here
  const result = apiModule.someFunction(db, { param_name, optional_param });
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
});
```

### Rules:
1. **The MCP tool is a thin wrapper** — all logic lives in `src/api/`. The tool just calls the api function and returns JSON.
2. **Use `registerTool()`** not `tool()` — the 4-arg `tool()` overload is deprecated.
3. **Add `.describe()` to every parameter** — agents read these to understand what to pass.
4. **Return JSON in `content[0].text`** — always `JSON.stringify(result, null, 2)`.
5. **Handle not-found cases** — return a human-readable message like `'Person not found'`.

### End-to-end checklist for a new tool:
1. Implement the function in `src/api/*.ts`
2. Write unit tests in `tests/unit/`
3. Add the MCP tool in `src/mcp/createProdServer.ts` (or `createDevServer.ts` for dev-only tools)
4. If the renderer should reach the same function, bind it in `mountWindowApi()` in `src/renderer/tauri-window-api.ts` — `mutating()` for writes (fires `data:changed`), `readOnly()` for reads. (The Electron-era `src/shared/channels/` registry is gone; bindings are explicit.)
5. Add a stub in `src/static/static-api.ts` so the website-export build still type-checks (`static-api-coverage.test.ts` enforces this).
6. Test: `npm test && npm run test:e2e`

## Common pitfalls (real bugs we shipped)

### 1. Pass-through dropped in a branching code path

The Prime Directive ("never synthesize") catches the inference case, but it does not catch the silent-drop case where a tool accepts a field, the agent supplies it, and one branch of the wrapper just doesn't pass it on.

Concrete bug from the 2026-05-09 Bernadotte test session: `add_place` accepted `place_type` / `latitude` / `longitude` / `notes` etc. The no-`parent_chain` branch destructured `...rest` and forwarded them to `createPlace`. The `parent_chain` branch only forwarded `name`. Result: every chained-place call silently lost four authored fields. The MCP tool reported success and returned a row with all four fields null.

The fix shape is to extend the api function with a `leafProps` parameter and forward `rest` through:

```typescript
// MCP tool
}, async (args) => {
  const { parent_chain, name, ...leafProps } = args;
  if (parent_chain && parent_chain.length > 0) {
    return placeApi.findOrCreatePlaceWithChain(getDb(), name,
      parent_chain.map((n) => ({ name: n })),
      leafProps,                                     // ← was missing
    );
  }
  return placeApi.createPlace(getDb(), { name, ...leafProps });
});
```

**Rule:** if a tool's `inputSchema` declares a field, every branch in the handler must pass it on (or document why not in a code comment). When you write a tool that has multiple call paths, write a unit test that asserts every declared field round-trips through every path.

### 2. `mutating: true` is what makes the renderer notice

A channel marked `mutating: true` causes `tauri-window-api.ts`'s auto-walk to call `fireDataChanged()` after the handler resolves. That's what `useEntityData` / `usePagedList` listen for to refresh. `fireDataChanged()` both emits a Tauri event (so all open windows react) and calls every locally-registered `dataChangedListeners` callback — so MCP-side mutations refresh list views the same way renderer-initiated ones do.

**A new mutating channel that forgets the flag will:**
- Save to the DB correctly,
- Return the right value,
- And leave every list view stale until the user hard-reloads.

This is the single most expensive failure mode in MCP-driven testing — the agent thinks the seed step "didn't work" because the panel still says (0). The data is in the DB; the renderer just never heard. Always set `mutating: true` on any registry channel that performs a write, and verify by clicking through the list view after the call (or by running `tests/unit/data-changed-broadcast.test.ts`).

### 3. UI sections that compute their count via `defineExpose({ count })` need `v-show`, not `v-if`

When a panel section component is the source of truth for its count badge (parent reads `sectionRef.value?.count ?? 0`), `v-if`-collapsing the section unmounts the child and the count falls back to 0 — making the panel header lie. Surfaced for `Uppgifter` and `Kvalitet` on PersonPanel / PlacePanel / MediaPanel during the Bernadotte test.

The fix: switch to `v-show` so the child stays mounted while the body is hidden via `display: none`. The child's `useEntityData` caches its first fetch, so the per-mount cost is one IPC. The right long-term fix is for the parent to fetch a lightweight COUNT for these sections too (matching how `events`, `media`, `relationships`, `groups` work), but `v-show` is the single-line patch.

## Current MCP Tools

See `docs/MCP.md` for the full tool reference grouped by domain. Source files are always authoritative:
- Production tools: `src/mcp/createProdServer.ts`
- Dev-only tools: `src/mcp/createDevServer.ts`
- Entry points: `src/mcp/server.ts` (prod), `src/mcp/devServer.ts` (dev)

## MCP Server Config

In `.claude/settings.local.json` — use the dev server for development work:
```json
{
  "mcpServers": {
    "slaktforskning": {
      "command": "npx",
      "args": ["tsx", "src/mcp/devServer.ts"]
    }
  }
}
```

---

## The dev MCP HTTP bridge

The dev MCP tools (`ui_screenshot`, `ui_click`, `ui_navigate`, `ui_get_dom`, `ui_query_styles`, `ui_eval`, `ui_console`, `chart_*`) all run in the **MCP server process**, which is a separate Node.js process from the running app. They reach the running app via a small HTTP control plane on **port 19241** (configurable via `SLAKTFORSKNING_UI_PORT`).

The bridge is `src-tauri/src/ui_server.rs` (~196 lines, axum + tokio) and exposes exactly four endpoints: `/`, `/db_path`, `/eval`, `/screenshot`. The dev MCP owns the tool inventory; Rust only exposes the primitives that can't be done from JS (native window screenshot, db-path probe, run-script-in-renderer). Every high-level dev tool (`ui_click`, `ui_navigate`, `ui_aria_*`, `chart_*`, …) is implemented as a JavaScript expression posted to `/eval`.

The prod MCP doesn't touch the bridge at all — it talks to the same SQLite file the app uses, opened via its own connection (rusqlite when bundled, `node-sqlite3` family when run via `tsx`).

### How a dev MCP tool actually works (the script-injection pattern)

Every dev tool in `src/mcp/tools/dev/*.ts` follows the same shape:

1. Build a JavaScript expression as a string (the script that should run inside the renderer's window).
2. POST it to `<uiBase>/eval` via the shared `runScript(uiBase, script)` helper in `src/mcp/tools/dev/util.ts`.
3. Return the resulting JSON to the agent.

```typescript
// src/mcp/tools/dev/ui.ts (sketch)
server.registerTool('ui_click', { ... }, async ({ selector }) => {
  const script = `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return { ok: false, error: 'no element' };
    el.click();
    return { ok: true };
  })()`;
  const result = await runScript(uiBase, script);
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
});
```

This means **adding a new dev MCP tool almost never needs Rust changes**. Build the script, POST to the renderer-script endpoint, return the result. Add it to `src/mcp/tools/dev/ui.ts` (or a new file under `src/mcp/tools/dev/` for a new tool category) and that's it.

You only need to touch Rust (`src-tauri/src/ui_server.rs` + `src-tauri/src/lib.rs`) if you need a Tauri-native capability the renderer can't reach — native window screenshot (already done via the `xcap` crate behind `/screenshot`), file-system probes that bypass the polyfill layer, multi-window orchestration. If a tool can be expressed as a renderer-side script, build it that way.

### Startup probe: how the dev MCP finds the running app's DB

`scripts/mcp-tauri.mjs` (registered in `.mcp.json`) is the launcher used in the Tauri build. On startup it `GET`s `http://127.0.0.1:19241/db_path` to ask the running app which DB is open, then sets `SLAKTFORSKNING_DB` accordingly before launching `npx tsx src/mcp/devServer.ts`. Falls back to the Tauri default DB path if no app is running.

**Caveat:** the MCP server's idea of "current DB" is set at startup and doesn't follow live `db:switchTo` calls in the running app. If the user switches DB while the MCP is up, restart the MCP (or implement audit item #1 from `docs/plans/2026-05-10-tauri-full-port-notes.md`).

### Console capture

The renderer's `main.ts` wraps `console.{log,warn,error,info}` + `window.error` + `unhandledrejection` into a 500-entry ring buffer. The dev MCP's `ui_console` tool reads `__taurisConsole.drain()` via the script-injection endpoint — no separate Rust endpoint needed.
