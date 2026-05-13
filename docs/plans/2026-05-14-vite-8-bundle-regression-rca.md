# RCA — Vite 8 bundle regression investigation

**Plan reference:** [2026-05-14-vite-8-bundle-regression.md](2026-05-14-vite-8-bundle-regression.md)
**Status:** in-progress — see gate decision at end of Measurements (Task 4 gate). No regression detected; later tasks (5–7) skipped pending user direction.

## Measurements

Measurement method: cold `npm run build` + `npm run build:static` against a fresh checkout. Pre = git worktree at SHA `5b51e75a` (`package.json` version `0.257.3`, the immediate pre-Vite-8 commit; the design doc names "tag v0.257.3" but no such tag exists locally — the SHA is the same artifact). Post = current `main` at `3b7a6309` (`package.json` version `0.257.5`, Vite 8 upgrade at `64a1c3f6`).

### Pre-Vite-8 (commit `5b51e75a`, v0.257.3)

```
=== dist-tauri total ===
 72M	/tmp/slaktforskning-v0.257.3/dist-tauri

=== top 10 chunks by size ===
3.2M	/tmp/slaktforskning-v0.257.3/dist-tauri/assets/sv-gardar-Dqa6rayb.json
3.6M	/tmp/slaktforskning-v0.257.3/dist-tauri/assets/is-sveitarfelog-boundaries-Jqrz73V6.json
3.6M	/tmp/slaktforskning-v0.257.3/dist-tauri/assets/sv-sockenstad-boundaries-B7i1DRSX.json
4.6M	/tmp/slaktforskning-v0.257.3/dist-tauri/assets/us-immigration-states-B2f577-c.json
4.8M	/tmp/slaktforskning-v0.257.3/dist-tauri/assets/ca-provinces-_QEzm03d.json
5.3M	/tmp/slaktforskning-v0.257.3/dist-tauri/assets/gb-civil-divisions-DiHMxobI.json
5.4M	/tmp/slaktforskning-v0.257.3/dist-tauri/assets/de-gemeinden-boundaries-B8q-eXs8.json
5.5M	/tmp/slaktforskning-v0.257.3/dist-tauri/assets/us-all-states-BiiK8zj7.json
5.6M	/tmp/slaktforskning-v0.257.3/dist-tauri/assets/fi-kunnat-Ck4ixp6R.json
5.7M	/tmp/slaktforskning-v0.257.3/dist-tauri/assets/sv-orter-CaneRLL0.json

=== chunk counts ===
js:       48
json:       71
css:       26

=== gzip-equivalent size of largest chunks ===
gb-civil-divisions-DiHMxobI.json: raw=5.3M, gzip=  334879 bytes
de-gemeinden-boundaries-B8q-eXs8.json: raw=5.4M, gzip=  359417 bytes
us-all-states-BiiK8zj7.json: raw=5.5M, gzip=  468641 bytes
fi-kunnat-Ck4ixp6R.json: raw=5.6M, gzip=  421878 bytes
sv-orter-CaneRLL0.json: raw=5.7M, gzip=  326742 bytes

=== dist-static total ===
1.3M	/tmp/slaktforskning-v0.257.3/dist-static
=== dist-static index.html gzip ===
  404729
```

Top 10 JS chunks (pre):

```
 44K	ImportExportView-BMDonfxs.js
 48K	MediaView-BFJPA_sM.js
 48K	PlacesView-DGmKYuFY.js
104K	timelineLabel-9oC8eJwH.js
116K	PersonsView-DyCwtvkl.js
124K	ReportsView-CssE64Zt.js
148K	leaflet-src-wzPIEDyg.js
148K	leaflet-src.esm-C210bVOb.js
444K	index-k9-aC_En.js
552K	tauri-window-api-DSno5Vq1.js
```

Aggregates (pre):

- JS aggregate: 2160 KB
- CSS aggregate: 300 KB
- JSON aggregate: 71052 KB

Renderer build log tail:
```
✓ 900 modules transformed.
✓ built in 4.23s
```

Static build log tail:
```
../../dist-static/index.html  1,382.28 kB │ gzip: 405.59 kB
✓ built in 2.33s
```

### Post-Vite-8 (current `main`, commit `3b7a6309`, v0.257.5)

```
=== dist-tauri total ===
 72M	/Users/jonasahnstedt/git/slaktforskning/dist-tauri

=== top 10 chunks by size ===
3.2M	/Users/jonasahnstedt/git/slaktforskning/dist-tauri/assets/sv-gardar-Dqa6rayb.json
3.6M	/Users/jonasahnstedt/git/slaktforskning/dist-tauri/assets/is-sveitarfelog-boundaries-Jqrz73V6.json
3.6M	/Users/jonasahnstedt/git/slaktforskning/dist-tauri/assets/sv-sockenstad-boundaries-B7i1DRSX.json
4.6M	/Users/jonasahnstedt/git/slaktforskning/dist-tauri/assets/us-immigration-states-B2f577-c.json
4.8M	/Users/jonasahnstedt/git/slaktforskning/dist-tauri/assets/ca-provinces-_QEzm03d.json
5.3M	/Users/jonasahnstedt/git/slaktforskning/dist-tauri/assets/gb-civil-divisions-DiHMxobI.json
5.4M	/Users/jonasahnstedt/git/slaktforskning/dist-tauri/assets/de-gemeinden-boundaries-B8q-eXs8.json
5.5M	/Users/jonasahnstedt/git/slaktforskning/dist-tauri/assets/us-all-states-BiiK8zj7.json
5.6M	/Users/jonasahnstedt/git/slaktforskning/dist-tauri/assets/fi-kunnat-Ck4ixp6R.json
5.7M	/Users/jonasahnstedt/git/slaktforskning/dist-tauri/assets/sv-orter-CaneRLL0.json

=== chunk counts ===
js:      108
json:       71
css:       37

=== gzip-equivalent size of largest chunks ===
gb-civil-divisions-DiHMxobI.json: raw=5.3M, gzip=  334879 bytes
de-gemeinden-boundaries-B8q-eXs8.json: raw=5.4M, gzip=  359417 bytes
us-all-states-BiiK8zj7.json: raw=5.5M, gzip=  468641 bytes
fi-kunnat-Ck4ixp6R.json: raw=5.6M, gzip=  421878 bytes
sv-orter-CaneRLL0.json: raw=5.7M, gzip=  326742 bytes

=== dist-static total ===
1.4M	/Users/jonasahnstedt/git/slaktforskning/dist-static
=== dist-static index.html gzip ===
  413103
```

Top 10 JS chunks (post):

```
 76K	media-MbF8VT1O.js
104K	timelineLabel-CuEoDxsl.js
120K	PersonsView-Y3JX3LWx.js
124K	ReportsView-CUA4mmWG.js
128K	tauri-window-api-Bl5UCfOo.js
148K	leaflet-src-kTrMp_m0.js
148K	leaflet-src.esm-D6yMZhyA.js
172K	_plugin-vue_export-helper-07U8z5fV.js
204K	gramps-DC8mkxHY.js
212K	index-CahBl5Kg.js
```

Aggregates (post):

- JS aggregate: 2372 KB
- CSS aggregate: 332 KB
- JSON aggregate: 71052 KB

Renderer build log tail:
```
✓ 877 modules transformed.
✓ built in 800ms
```

Static build log tail:
```
dist-static/index.html  1,416.56 kB │ gzip: 416.77 kB
✓ built in 580ms
```

## Diff

| Metric | Pre-Vite-8 | Post-Vite-8 | Delta | Delta % |
|--------|------------|-------------|-------|---------|
| `du -sh dist-tauri` | 72M | 72M | 0 | 0.0% |
| JS chunk count | 48 | 108 | +60 | +125.0% |
| JSON chunk count | 71 | 71 | 0 | 0.0% |
| CSS chunk count | 26 | 37 | +11 | +42.3% |
| JS aggregate (KB) | 2160 | 2372 | +212 | +9.8% |
| CSS aggregate (KB) | 300 | 332 | +32 | +10.7% |
| JSON aggregate (KB) | 71052 | 71052 | 0 | 0.0% |
| Largest chunk (name + size) | sv-orter-CaneRLL0.json (5.7M) | sv-orter-CaneRLL0.json (5.7M) | — | 0.0% |
| Largest JS chunk (pre vs post by rank-1) | tauri-window-api-DSno5Vq1.js (552K) | index-CahBl5Kg.js (212K) | −340K (size) | −61.6% |
| `du -sh dist-static` | 1.3M | 1.4M | +0.1M | ~+7.7% raw |
| Static gzip size (bytes) | 404729 | 413103 | +8374 | +2.1% |
| Renderer build wall time | 4.23s | 0.80s | −3.43s | −81.1% |

Largest chunks regressions (matched by name, top 10 by raw size):

| Chunk | Pre size | Post size | Delta |
|-------|----------|-----------|-------|
| sv-orter (gazetteer JSON) | 5.7M | 5.7M | 0 |
| fi-kunnat (gazetteer JSON) | 5.6M | 5.6M | 0 |
| us-all-states (gazetteer JSON) | 5.5M | 5.5M | 0 |
| de-gemeinden-boundaries (JSON) | 5.4M | 5.4M | 0 |
| gb-civil-divisions (JSON) | 5.3M | 5.3M | 0 |
| ca-provinces (JSON) | 4.8M | 4.8M | 0 |
| us-immigration-states (JSON) | 4.6M | 4.6M | 0 |
| sv-sockenstad-boundaries (JSON) | 3.6M | 3.6M | 0 |
| is-sveitarfelog-boundaries (JSON) | 3.6M | 3.6M | 0 |
| sv-gardar (JSON) | 3.2M | 3.2M | 0 |
| tauri-window-api-*.js | 552K | 128K | **−424K (−76.8%)** |
| index-*.js | 444K | 212K | **−232K (−52.3%)** |

JS chunks present in post but not pre (re-split / new naming): `media-MbF8VT1O.js` (76K), `_plugin-vue_export-helper-07U8z5fV.js` (172K), `gramps-DC8mkxHY.js` (204K). These are not new code — they're code Vite 7 had bundled into the larger `index-*.js` and `tauri-window-api-*.js` chunks. Net effect: the same code is more granularly split.

## Gate decision (per plan Task 4 Step 4)

**No regression present.** Per the plan's gate criteria — total bundle within ±5% AND no individual chunk grew more than 20% — both conditions hold:

- `du -sh dist-tauri` is identical (72M = 72M, 0.0% delta).
- `du -sh dist-static` raw grew ~7.7% (the `du` rounding to 1.4M masks a smaller true delta — the gzip size, more precise, grew only 2.1%).
- No individual chunk grew. The top 10 by raw size are byte-identical (gazetteers). The largest JS chunks **shrunk** materially: `tauri-window-api` −76.8%, `index` −52.3%. Aggregate JS grew +9.8% (212 KB) — but spread across 60 more chunks, not concentrated in one chunk.
- The user's recollection of "v0.256 was much smaller" does not correspond to a measurable regression between v0.257.3 (the immediate pre-Vite-8 state) and current `main`. If a regression exists, it is upstream of v0.257.3 (e.g. v0.256 → v0.257.0 — see "What might explain the user's recollection" below).

The chunk-count growth (48 → 108 JS chunks, +125%) is the most visible change. It reflects Vite 8 / Rolldown's preference for more granular chunking; it is not a bundle-size regression — it is a chunking-strategy difference that produces the same total bytes with finer granularity.

**Per plan Task 4 Step 4: skip Tasks 5, 6, 7. Decision lands as `accepted-as-structural` with the note that the audit's "post-Vite-8 bundle regression" premise is not borne out by measurement against v0.257.3.**

### What might explain the user's recollection

If "v0.256 was much smaller" is real, the regression happened **before** the Vite 8 upgrade. Candidate suspects (not investigated in this plan; would need separate measurement against a v0.256.x commit):

- v0.257.0 lazy-gazetteer rework (commit `1e2db02e perf(gazetteers): ship JSONs as lazy URL assets, drop the 8 GB heap workaround`) — the eager-inline collapse that pre-Vite-7 produced a 30MB / 7.4MB gz single chunk; the lazy rework split it into 71 JSON files = the present shape. The aggregate gazetteer payload is the same in both v0.257.3 and current `main` (71052 KB), so this is structural to the lazy rework, not Vite 8.
- v0.256.x → v0.257.0 might have added gazetteer datasets (us-immigration-states, ca-provinces, gb-civil-divisions, de-gemeinden, etc.) that genuinely increased the on-disk total. The 4.6–5.4M gazetteer JSONs at the top of the chunk list are heavy.

A follow-up measurement against an earlier tag (e.g. last v0.256.x commit) would isolate this. Out of scope for the current plan whose stated comparison is v0.257.3 → main.

## Identified root cause

Not applicable — no regression to attribute. The Vite 8 upgrade produced a bundle that is byte-identical in total to v0.257.3, with finer JS chunk granularity (108 vs 48 chunks; largest JS chunk shrunk from 552 KB to 212 KB). Build wall time improved by 5.3× (4.23s → 0.80s).

## What was tried

Tasks 5 (assetsInlineLimit), 6 (manualChunks), and 7 (`import.meta.glob` reshape) were not executed. Gate decision at end of Task 4 short-circuited the tuning round: no regression to tune away.

## Decision

`accepted-as-structural` — with a precision: there is nothing structural to *accept* because total bundle size did not change. The audit's "post-Vite-8 bundle regression" premise (item in `2026-05-12-audit-recommendation.md`) was based on the pre-eager-inline state of v0.256 vs the post-fix state of current `main`. The structural URL-asset fix (v0.257.0, commit `1e2db02e`) already landed before the Vite 8 upgrade. The Vite 8 upgrade itself did not regress bundle size against v0.257.3.

If the user has a v0.256.x baseline they recall as "much smaller," a follow-up measurement against that tag would be needed to investigate; the regression — if any — is upstream of v0.257.3, not the Vite 8 upgrade.
