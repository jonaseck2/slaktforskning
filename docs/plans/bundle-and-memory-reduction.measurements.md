# Bundle / memory reduction — measurements

Working notes recorded as the plan executes. Compared at Task 14.

## Baseline (commit 096e6fd9, 2026-05-09)

The baseline numbers come from the parent `main` branch as of commit 096e6fd9
(the plan-only commit, no code changes yet). Captured in three categories:

### Installer / packaged size
- macOS .zip (`out/make/zip/darwin/.../*.zip`): _user-pending — capture before reviewing PR_
- Windows .exe: _user-pending_
- Linux .deb: _user-pending_

The plan's automated subagents do not run `npm run make` themselves to avoid
spending 5+ minutes on each pass; the intent is for Task 14 to compare the
final HEAD against `main` once via a single make-and-diff. See Task 14.

### Idle RAM (sum of all Slaktforskning processes' Real Memory)
- _user-pending — requires GUI launch on macOS / Windows / Linux desktop_

### Cold start (median of 3, `[startup]` log)
- _user-pending — requires GUI launch_

Subagent-recorded code metrics (size of binary vs JSON, etc.) are appended in
the relevant Task sections below as we go.

---

## After Task 2 (forge ignore)

Tightened `packagerConfig.ignore` in `forge.config.ts` to drop tests, build
scripts (`scripts/`, `src/gazetteer-build/`), docs, `.claude/`, dev-only config
files, and other non-runtime top-level files from the packaged asar.

### asar contents (top-level dirs after Task 2, macOS arm64 build)

```
/.eslintrc.json
/.gitignore
/.mcp.json
/.superpowers
/.vite
/CODE_OF_CONDUCT.md
/DEVELOPING.md
/LICENSE
/SECURITY.md
/THIRD_PARTY_LICENSES.txt
/forge.env.d.ts
/node_modules
/package.json
/src
```

Confirmed absent (intended exclusions): `/tests`, `/docs`, `/.claude`,
`/.devcontainer`, `/.github`, `/.vscode`, `/scripts`, `/coverage`,
`/dist-static`, `/out`, top-level `playwright.config.ts`,
`vitest.config.mts`, `forge.config.ts`, `tsconfig.json`, `CHANGELOG.md`,
`README.md`, `CLAUDE.md`. `/src/gazetteer-build` also confirmed absent
(other `src/` runtime dirs `api`, `gedcom`, `import`, `main`, `mcp`,
`preload`, `renderer`, `shared`, `static` remain).

### Initial regex-list ignore (rolled back)
The plan's literal regex list left `/src/`, `/node_modules/`, `/.superpowers/`
and other non-runtime paths in the asar. macOS .zip from that pass: 135 MB,
app.asar: 128 MB. Forge's own notice flagged this: "Your packaged app may
be larger than expected if you don't ignore everything other than the
'.vite' folder." The Vite plugin would normally do that auto-ignore for
us — by setting `packagerConfig.ignore` we'd opted out of it.

### Aggressive allowlist (kept)
Switched `ignore` to a function that allows only `/.vite/**` and `/package.json`
inside the asar. Vite already bundles every non-`external` JS dep into
`.vite/build/`, and `extraResource` ships `dist-static/` and the licenses
file outside the asar.

- macOS app.asar (uncompressed inside the bundle): **10 MB** (was 128 MB)
- macOS .app bundle total: **275 MB** (Electron framework dominates after asar shrink)
- macOS .zip (`out/make/zip/darwin/arm64/...`): _capture in Task 14 with one make-and-diff against `main`_
- Windows .exe: _user-pending_
- Linux .deb: _user-pending_

### Smoke check
Launched `out/Släktforskning-darwin-arm64/Släktforskning.app/Contents/MacOS/slaktforskning`
directly. Stayed alive 4+ s, stdout shows clean startup:
```
[UI server] http://127.0.0.1:19241
[startup] app ready in 173 ms
```
No missing-module crash, no native-binding error. Process killed cleanly.

User-pending: open the launched app, exercise a Place picker on "Stockholm",
confirm gazetteer suggestions still appear (still relevant — the binary
boots, but no UI was visually inspected).

---

## After Task 5 (binary codec round-trip)

(populated by the Task 5 subagent — totals from running the codec across all
34 bundled gazetteers)

---

## After Task 7 (binary loader)

(populated by Task 7 subagent — packaged `.vite/build/gazetteers/` total bytes)

---

## After Task 13 (WASM heap smoke)

(populated by Task 13 subagent — pre/post import heap deltas)

---

## Final (Task 14)

(populated by Task 14 — full before/after comparison + decision on follow-up)
