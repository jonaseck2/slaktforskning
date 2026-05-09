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

### Installer / packaged size after Task 2
- macOS .zip (`out/make/zip/darwin/arm64/Släktforskning-darwin-arm64-0.234.0.zip`): **135 MB**
- macOS app.asar (uncompressed inside the bundle): **128 MB**
- Windows .exe: _user-pending — no Windows toolchain on this macOS host_
- Linux .deb: _user-pending — no Linux toolchain on this macOS host_

Baseline numbers for comparison are user-pending (the parent commit was the
plan-only commit; the Task 1 baseline make run was deferred to the user per
the measurements scaffold). User should run `npm run make` against the
parent `main` SHA `096e6fd9` and the resulting commit on this branch to get
the Δ — both numbers should drop together because the `ignore` array kicks
in only when `forge.config.ts` is present in this shape.

### Smoke check (Place picker resolves "Stockholm")
- _user-pending — could not run a UI smoke check against the packaged binary
  from this subagent session. The `npm run package` build succeeded and the
  asar contents look correct; user is asked to launch
  `out/Släktforskning-darwin-arm64/Släktforskning.app` and confirm the Place
  picker still shows gazetteer suggestions for "Stockholm" before merge._

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
