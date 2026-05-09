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

Round-tripped every JSON in `src/api/place-gazetteers/data/` through
`encodeGazetteer → decodeGazetteer`. All 35 files round-trip cleanly (id and
name match; tests in `tests/unit/gazetteer-binary-codec.test.ts` pass). Sizes
below for the 10 largest sources (sorted by raw JSON size); totals across all
35 files at the bottom.

| File                                         | JSON | BIN  | JSON.gz |
|----------------------------------------------|-----:|-----:|--------:|
| sv-orter.json                                | 5789K | 568K |    319K |
| fi-kunnat.json                               | 5779K | 554K |    409K |
| us-all-states.json                           | 5636K | 520K |    454K |
| de-gemeinden-boundaries.json                 | 5538K | 344K |    350K |
| gb-civil-divisions.json                      | 5461K | 337K |    326K |
| ca-provinces.json                            | 4913K | 528K |    385K |
| us-immigration-states.json                   | 4713K | 478K |    362K |
| is-sveitarfelog-boundaries.json              | 3729K | 1588K|    783K |
| sv-sockenstad-boundaries.json                | 3649K | 1419K|    979K |
| sv-gardar.json                               | 3225K | 322K |    174K |

### Totals (all 35 files)
- **Raw JSON:** 64.49 MB
- **JSON.gz** (current shipping format via `vite-plugin-compression` in
  `.vite/build/gazetteers/*.json.gz`): **7.30 MB**
- **Binary (.glb) raw:** 11.88 MB
- **Binary (.glb) gzipped:** **5.58 MB** ← shipped at this size if Task 6
  re-runs `vite-plugin-compression` over the binary output
- Binary brotli (reference): 4.65 MB

### Verdict — does the binary beat the current format?

Yes, on disk: gzipped binary is **5.58 MB vs 7.30 MB gzipped JSON**, a 1.7 MB
(23.5%) reduction in shipped bytes. The savings come from string interning
(every repeated "admin1" / country name / etc. costs 1 byte in the body), int32
delta-encoded geometry, and not paying for JSON's `{`, `"`, `:`, `,`, key names
on every node. Brotli could push it further (4.65 MB) but isn't trivial to wire
into the existing renderer fetch path; deferred to Task 6/7 if needed.

Two exceptions worth noting where the binary form is *no smaller* than raw JSON
(meaning string interning didn't help because the file is mostly unique-string
arrays of translation entries, not a hierarchical place tree):
- `lang-world-historical.json`: 1976K → 1976K
- `lang-sv-wikidata.json`: 36K → 36K

These still gzip well, so the shipped bytes are unaffected. Future optimisation:
encode the `translations` map structurally (vu32 counts + interned keys/values)
instead of via the JSON-blob fallback. Out of scope for this task.

---

## After Task 7 (binary loader)

Replaced `compress-bundled-gazetteers` (gzip-of-JSON) with
`emit-bundled-gazetteers-binary` in `vite.main.config.ts`: each `<id>.json` in
`src/api/place-gazetteers/data/` is parsed, packed via `encodeGazetteer`, and
gzipped at level 9 to `.vite/build/gazetteers/<id>.glb.gz`. The runtime loader
in `src/api/place-gazetteers/bundled.ts` now prefers `.glb.gz`, falls back to
the previous `.json.gz` (transitional, in case a partially-rebuilt
`.vite/build/` lacks the new files), and finally to raw `data/<id>.json`
(vitest / dev / direct-source consumers).

### Packaged `.vite/build/gazetteers/` totals (after `npm run package`)

- Files emitted: **36 `.glb.gz`** (one per `data/*.json`), **0 `.json.gz`**
- Total bytes: **5,780 KB ≈ 5.64 MB** (du -kc)
- Previous shipping format (gzipped JSON): 7.30 MB
- **Net saving: ~1.66 MB / ~22.7%** of bundled gazetteer payload

### Smoke check — packaged binary

Launched
`out/Släktforskning-darwin-arm64/Släktforskning.app/Contents/MacOS/slaktforskning`
directly. Stayed alive 5+ s, stdout shows clean startup:

```
[UI server] http://127.0.0.1:19241
[startup] app ready in 207 ms
```

A temporary `[gazetteer] loaded <id> via .glb.gz` log was added to the binGzPath
branch and confirmed all 36 unique gazetteers loaded via the binary path (×2
for main + worker thread, 72 total log lines, all distinct IDs). Log was
removed before commit.

### Test / lint status

- `npm test`: **3557 passed**, 104 skipped, **3 failed** — all 3 failures are
  in `tests/components/PersonsView.test.ts` (route-fallback tests for
  `default_person_id`); confirmed pre-existing on the worktree's baseline
  HEAD by re-running with my changes stashed (same 3 failures). Unrelated to
  gazetteer loading.
- `npm run lint`: **0 errors**, 23 pre-existing warnings.

### TODO for Task 14 wrap-up

`.claude/rules/build.md` still describes the gzip-of-JSON plugin and the
`*.json.gz` shipping path. Update at plan close-out so the rule reflects
`emit-bundled-gazetteers-binary` and `*.glb.gz`.

---

## After Task 13 (WASM heap smoke)

(populated by Task 13 subagent — pre/post import heap deltas)

---

## Final (Task 14)

(populated by Task 14 — full before/after comparison + decision on follow-up)
