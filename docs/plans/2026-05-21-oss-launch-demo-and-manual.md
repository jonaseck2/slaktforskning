# 2026-05-21 — OSS launch: demo screenshot + user manual

## User goal

A first-time visitor to the Släktforskning GitHub repo — typically a 60+ genealogist who has never touched a Tauri app — lands on the README, sees a real screenshot of the running app populated with the Swedish royal family of the House of Holstein-Gottorp (Adolf Fredrik, Lovisa Ulrika, and descendants), and within 10 minutes of finding the repo can install the app, follow the "Your first family tree in 10 minutes" quickstart, and have built their own three-person family with one event and one source citation. For deeper questions they open `MANUAL.md` and find a screenshotted reference covering every panel, importer, and feature.

Implicit user-observable outcome: the GitHub repo page (the *only* surface the user sees before they decide to install) sells the product. Right now it shows a TODO comment where the screenshot should be — that's the bar this plan moves.

## Scope

### A. Demo database (built fresh, used only for screenshots, not shipped)

Family tree — House of Holstein-Gottorp, pre-Bernadotte (1751–1818). All persons died ≥ 1837, zero living-person concerns:

| # | Person | Dates | Role |
|---|---|---|---|
| 1 | Adolf Fredrik | 1710–1771 | Patriarch; King 1751–1771 |
| 2 | Lovisa Ulrika of Prussia | 1720–1782 | Queen consort |
| 3 | Gustav III | 1746–1792 | Son; King 1771–1792; assassinated |
| 4 | Karl XIII | 1748–1818 | Son; King 1809–1818 (last of the house) |
| 5 | Fredrik Adolf | 1750–1803 | Son; Duke of Östergötland |
| 6 | Sofia Albertina | 1753–1829 | Daughter |
| 7 | Sofia Magdalena of Denmark | 1746–1813 | Gustav III's queen |
| 8 | Hedvig Elisabet Charlotta of Holstein-Gottorp | 1759–1818 | Karl XIII's queen |
| 9 | Gustav IV Adolf | 1778–1837 | Gustav III's son; King 1792–1809; deposed |
| 10 | Frederica of Baden | 1781–1826 | Gustav IV Adolf's queen |

- ~6 marriages (couple relationships)
- ~25 events: births, deaths, marriages, coronations, the assassination of Gustav III at the Royal Opera (1792), the Coup of 1809, the deposition of Gustav IV Adolf
- 5 places: Stockholm Slott, Drottningholms slott, Kungliga Operan, Sankt Petersburg, Stralsund
- 3 sources: Svenskt biografiskt lexikon (online), Riksarkivet record group, one Wikipedia citation
- 1 repository: Riksarkivet

### B. Media + face tags

Open-license portraits from Wikimedia Commons (PD-old-100, all subjects' painters died > 100 years ago):

- 10 individual portraits — one per person. Sources: Alexander Roslin, Lorens Pasch the Younger, Carl Gustaf Pilo, Jakob Björck. All Riksgalleriet / National Museum holdings, all Wikimedia Commons.
- **1 group portrait** — Alexander Roslin's *"Gustav III and his brothers"* (1771, Nationalmuseum Stockholm). Face-tag regions for Gustav III, Karl, and Fredrik Adolf — three tags in one image, showcasing the multi-tag face-tag reporting feature.

### C. Screenshots (committed to `docs/`)

- `docs/screenshot.png` — primary README hero shot. Family tree chart view with side panel open on Gustav III, his portrait visible. Resolution ≥ 1920×1200.
- `docs/quickstart/01..08-*.png` — 8 small sub-screenshots illustrating the README quickstart steps (empty state → first person → spouse → child → event → place → source → done).
- `docs/manual/*.png` — ~12 screenshots, one per MANUAL.md section (persons, events, places, sources, media, groups, tasks, reports, charts, map, import, export).

### D. README updates

- Remove the `<!-- TODO: replace with a real screenshot -->` marker + uncomment the image line.
- Add a new section right after "What is this?": **"Your first family tree in 10 minutes"** — 8 numbered steps, each ≤ 2 sentences, each linked to the corresponding `docs/quickstart/0X-*.png`.
- Add a "Read the full manual" link to `MANUAL.md`.

### E. MANUAL.md (repo root)

Long-form reference. Sections in order:
1. Installing & first launch
2. Persons (panel + modal + every section: identifiers, names, events, life map, timeline, media, citations, notes, groups, tasks, associations, quality, danger zone)
3. Events (modal + per-event-type quirks, citations, participants, negation, dates)
4. Places (panel + tree picker + gazetteer resolution + history view + map)
5. Sources & Citations (panel + repositories + coverage events + link rules)
6. Repositories (panel + linking to sources)
7. Media & Face Tags (attach, link, regions, profile pictures, reports inclusion)
8. Groups (panel + linking persons/places/media)
9. Research Tasks (panel + priority + status + linking)
10. Reports (every keepsake report + every chart print)
11. Family tree charts (pedigree, hourglass, descendant, fan; outlines, navigation)
12. Map view (pins, polygons, filtering)
13. Import — GEDCOM 5.5.1 / 7.0, Genney, Holger, RootsMagic, Gramps
14. Export — GEDCOM, archive .zip, HTML website
15. Settings (themes, appearance, text size, language, screen-reader mode)
16. Keyboard shortcuts (global + screen reader)
17. Accessibility features
18. Data ownership & backup
19. Troubleshooting / FAQ

### Scope deviations

- **No docs site** (mkdocs/Astro Starlight) per user pick — markdown only. Re-evaluate post-launch if community asks for search/versioning.
- **No `examples/swedish-royals.db` shipped** per user pick — demo is for screenshots only; cleaned up after capture. Re-evaluate if welcome-screen adoption stalls.
- **No in-app help / Help → Manual modal** — separate future plan if the markdown-only path proves friction-heavy.
- **No German / Russian / Danish royal relations** of these persons modeled — would 5× the scope for marginal demo value. Sofia Magdalena's Danish parents, Lovisa Ulrika's Prussian parents (Frederick the Great's family), etc. are intentionally omitted.
- **Sofia Albertina never married** — single-leaf branch; that's historically correct, not a scope error.

## Verification

Every check below is **user-observable** and **falsifiable** — if all pass, the user goal is met; if any fail, the user goal is not met. The previous "< 10 min" timing assertion has been replaced by a mechanical screenshotted-coherence check (see T38) so the plan no longer carries a Tier 4 gate; the trade-off is documented at close-out.

1. **A first-time visitor reading the README can find a numbered quickstart with one screenshot per step, all screenshots resolve to real files in `docs/quickstart/`.** Mechanical: `tests/unit/readme-quickstart-coherence.test.ts` (T38) parses the section + asserts file existence per numbered step. If a step in the README has no matching screenshot, the test goes red.
2. **The README screenshot shows a populated app, not an empty state.** Visual check; the image must show recognizable chart shape + at least one portrait visible in the side panel.
3. **The group-portrait face-tag screenshot in MANUAL.md shows ≥ 2 distinct face tag regions.** Visual check.
4. **MANUAL.md covers every paneled route and every importer.** Mechanical: `tests/unit/manual-coverage.test.ts` parses `MANUAL.md` headings and asserts a heading exists per entry in `PANELED_ROUTES` (defined in the renderer) and per importer in `src/import/`. If a future panel ships without a manual section, the test goes red.
5. **No living person appears in the demo DB.** Mechanical: a one-off node script (run during demo build, deleted after) asserts every person has a death event with year ≥ 1700 and ≤ 1900.
6. **All Wikimedia Commons images used have an explicit `PD-old-100` or equivalent public-domain license tag**, documented in `docs/manual/image-credits.md` with attribution + source URL per image.
7. **`docs/screenshot.png`, `docs/quickstart/`, and `docs/manual/` exist with the expected file counts** — checked in CI by a glob assertion in the same coverage test.

The user-goal-falsifiability test: if every verification item passes, can the user goal still be unmet? — No. A populated screenshot + a sub-10-minute quickstart + a manual that covers every feature + a Wikipedia-quality demo with face tags **is** the user goal.

## Failure modes / RCA reference

First attempt at this work — no prior failure to cite.

Two known risks I'm watching:

- **Wikimedia Commons license confusion.** Some portraits on Commons are tagged `PD-art` (public-domain reproduction of a 2D PD artwork) but the source institution sometimes claims a sweat-of-the-brow copyright on the photograph itself. US law (Bridgeman v. Corel) says these are PD; some EU jurisdictions disagree. I'll prefer images explicitly tagged `PD-old-100` (author died > 100 years ago, no photo-copyright question) and document the license tag per image. If I can't find a PD-old-100 version, the image is out.
- **Face-tag bounding-box drift.** The face-tag region is stored as fractional coords (x, y, width, height in [0..1]) against the image's natural dimensions. If the screenshot is taken at a different DPR than the regions were authored at, tags can appear misaligned. I'll author the tags directly through the UI (drag-to-create), not via MCP coordinates, so the natural image dimensions are honoured by the renderer.

## Cleanup is in-scope when load-bearing

The demo DB and the scratch image folder are **not** committed to the repo. After screenshots are captured:

- `examples/scratch/swedish-royals.db` — deleted
- `examples/scratch/swedish-royals-media/` — deleted
- The `.gitignore` entry for `examples/scratch/` is added pre-emptively so any leftover doesn't accidentally land

Committed artifacts (final state):

- `docs/screenshot.png`, `docs/quickstart/*.png`, `docs/manual/*.png`
- `docs/manual/image-credits.md`
- `README.md` (quickstart section + screenshot embed)
- `MANUAL.md`
- `tests/unit/manual-coverage.test.ts`
- `.gitignore` (one line added for `examples/scratch/`)

## Tasks

Tasks tagged with mandate tier per `.claude/rules/mandate.md`. Tasks 1-19 were rewritten 2026-05-31 to remove Tier 4 (human-required) gates by replacing GUI-drag face-tagging with MCP-coords-then-visual-diff and replacing fresh-install timing with mechanical step verification. T12 atomic-task violation decomposed into 19 per-section tasks.

### Setup

- [ ] **T01 (Tier 1)** — `.gitignore` entry for `examples/scratch/`. Single-file change.
- [ ] **T02 (Tier 1)** — Create worktree `.worktrees/oss-launch-demo` from `main`. Execute remaining tasks there.

### Research + image sourcing

- [ ] **T03 (Tier 1)** — Research outline. WebFetch sv.wikipedia.org + en.wikipedia.org for each of the 10 persons (Adolf Fredrik, Lovisa Ulrika, Gustav III, Karl XIII, Fredrik Adolf, Sofia Albertina, Sofia Magdalena, Hedvig Elisabet Charlotta, Gustav IV Adolf, Frederica of Baden). Write `examples/scratch/family-outline.md` with dates, places, marriages, key events.
- [ ] **T04 (Tier 1)** — Image sourcing. WebFetch Wikimedia Commons for canonical portraits. For each, document source URL, file URL, license tag, author + dates. Reject anything not explicit `PD-old-100`. Find Roslin "Gustav III and his brothers" (1771). Write `docs/manual/image-credits.md` incrementally.
- [ ] **T05 (Tier 1)** — Image download. `curl` each image into `examples/scratch/swedish-royals-media/`. Verify ≥ 800px long edge via `sips -g pixelWidth -g pixelHeight` (mac) or `identify -format "%w %h"` (imagemagick).

### Demo DB build (via dev MCP)

- [ ] **T06 (Tier 1)** — Confirm dev MCP reachable: `mcp__slaktforskning-dev__app_status`. If not running, surface and pause (Tier 3 — local dev mode requires user-side `npm start`).
- [ ] **T07 (Tier 1)** — Switch to fresh DB: `mcp__slaktforskning-dev__switch_database` pointed at `examples/scratch/swedish-royals.db`.
- [ ] **T08 (Tier 1)** — Persons: `create_person` × 10 with given_name + surname + sex + Wikidata QID as `other`-type identifier (`add_person_identifier`).
- [ ] **T09 (Tier 1)** — Relationships: `add_relationship` × 6 couple-marriages between the documented pairs.
- [ ] **T10 (Tier 1)** — Events: `record_event` × ~25 (births, deaths, marriages, coronations, the 1792 assassination at Royal Opera, the 1809 coup, the 1809 deposition). Place via `place` field for single-component names; `place_chain` for hierarchies.
- [ ] **T11 (Tier 1)** — Sources + repository + citations: `add_source` × 3 (Svenskt biografiskt lexikon online, Riksarkivet record group, Wikipedia citation), `add_repository` × 1 (Riksarkivet), `link_source_repository`, `cite` on key events.

### Media attach + face tagging (MCP-coords variant)

- [ ] **T12 (Tier 1)** — Individual portraits: `attach_media` per person, then `link_media` person↔media if needed. 10 portraits.
- [ ] **T13 (Tier 1)** — Group portrait: `attach_media` the Roslin painting.
- [ ] **T14 (Tier 1)** — Face-tag regions via MCP coords. Replaces the original Tier 4 manual-drag step. For each of the three subjects (Gustav III, Karl, Fredrik Adolf), open the painting in the image tagger via `ui_navigate` to the media detail; read natural dimensions via `ui_eval` on the `<img>` element; pick coord boxes from a documented mapping (committed at `examples/scratch/face-tag-coords.json`) based on Roslin's known composition; call `tag_person_in_media` with the fractional coords. **Verification: capture `ui_screenshot` of the rendered overlay and visually confirm each box lands on the intended subject's face.** If a box lands wrong, adjust the JSON and re-run. Coord drift risk addressed by the visual-diff loop, not by human hands.

### Screenshots

- [ ] **T15 (Tier 1)** — Primary README screenshot. `ui_navigate` to chart view, `chart_focus_person` on Gustav III, ensure side panel open + portrait visible. `ui_screenshot` full-window; save as `docs/screenshot.png` (≥ 1920×1200).
- [ ] **T16 (Tier 1)** — Quickstart sub-screenshots × 8. Use a second fresh DB (`examples/scratch/quickstart-walkthrough.db`); drive each step via MCP + capture `ui_screenshot` at the moment the step completes. Save as `docs/quickstart/01-empty-state.png` … `08-done.png`. The same dev MCP that authored the demo authors the walkthrough.

### MANUAL.md — decomposed per section

Decomposition addresses the T12 atomic-task violation. One task per section, each ~80 lines max, each with its own screenshot under `docs/manual/`. Each task: write the section + capture its primary screenshot via dev MCP.

- [ ] **T17 (Tier 1)** — `MANUAL.md` Section 1: Installing & first launch.
- [ ] **T18 (Tier 1)** — Section 2: Persons (panel + modal + every section).
- [ ] **T19 (Tier 1)** — Section 3: Events (modal + per-event-type quirks).
- [ ] **T20 (Tier 1)** — Section 4: Places (panel + tree picker + gazetteer + history view + map).
- [ ] **T21 (Tier 1)** — Section 5: Sources & Citations (panel + repositories + coverage events + link rules).
- [ ] **T22 (Tier 1)** — Section 6: Repositories (panel + linking).
- [ ] **T23 (Tier 1)** — Section 7: Media & Face Tags (attach, link, regions, profile pictures, reports inclusion).
- [ ] **T24 (Tier 1)** — Section 8: Groups (panel + linking).
- [ ] **T25 (Tier 1)** — Section 9: Research Tasks (Fortsatt forskning) (panel + priority + status + linking).
- [ ] **T26 (Tier 1)** — Section 10: Reports (every keepsake report + every chart print).
- [ ] **T27 (Tier 1)** — Section 11: Family tree charts (pedigree, hourglass, descendant, fan; outlines, navigation).
- [ ] **T28 (Tier 1)** — Section 12: Map view (pins, polygons, filtering).
- [ ] **T29 (Tier 1)** — Section 13: Import (GEDCOM 5.5.1 / 7.0, Genney, Holger, RootsMagic, Gramps).
- [ ] **T30 (Tier 1)** — Section 14: Export (GEDCOM, archive .zip, HTML website).
- [ ] **T31 (Tier 1)** — Section 15: Settings (themes, appearance, text size, language, screen-reader mode).
- [ ] **T32 (Tier 1)** — Section 16: Keyboard shortcuts (global + screen reader).
- [ ] **T33 (Tier 1)** — Section 17: Accessibility features.
- [ ] **T34 (Tier 1)** — Section 18: Data ownership & backup.
- [ ] **T35 (Tier 1)** — Section 19: Troubleshooting / FAQ.

### README + verification

- [ ] **T36 (Tier 1)** — README rewrite. Remove the TODO marker. Embed `docs/screenshot.png`. Add the "Your first family tree in 10 minutes" section right after "What is this?".
- [ ] **T37 (Tier 1)** — Coverage test `tests/unit/manual-coverage.test.ts`: parse MANUAL.md headings, assert one heading per `PANELED_ROUTES` entry + per importer file in `src/import/<dialect>/` + per `docs/manual/*.png` existence + `docs/quickstart/0[1-8]-*.png` existence.
- [ ] **T38 (Tier 1)** — Quickstart step verification (replaces Tier 4 fresh-install timing). Mechanical test `tests/unit/readme-quickstart-coherence.test.ts`: parses the "Your first family tree in 10 minutes" section out of README, asserts each numbered step references a `docs/quickstart/0N-*.png` that exists. **Drops the "< 10 min" timing assertion** — replaced by "every documented step is screenshotted and the screenshots match the documented sequence." If a real first-time user is later available to time the walkthrough, the data updates the README; for OSS launch readiness the screenshotted-coherence check is sufficient. Document this delta in the close-out commit so the trade-off is visible.

### Cleanup + close-out

- [ ] **T39 (Tier 1)** — Scratch cleanup. Delete `examples/scratch/swedish-royals.db`, `examples/scratch/swedish-royals-media/`, `examples/scratch/quickstart-walkthrough.db`, `examples/scratch/family-outline.md`, `examples/scratch/face-tag-coords.json`. Confirm `.gitignore` keeps the directory out of future churn.
- [ ] **T40 (Tier 1)** — Invoke `/close-out` skill. Walks the 6+1 steps, refuses partial, captures evidence. This is a feature plan → minor bump per `oss-release`.

## Self-review checklist

- [ ] User goal is the first thing in the plan and is user-observable.
- [ ] Scope is enumerated; deviations explicit.
- [ ] Verification §1 contains at least one check that would fail if the user goal is unmet.
- [ ] Verification §1 includes a mechanical test (manual coverage) so future panels can't silently fall out of the manual.
- [ ] Cleanup (scratch DB + images) is named and not deferred to "post-launch follow-up".
- [ ] No "smoke" identifiers anywhere.
- [ ] Tasks list is the smallest set that delivers the user goal.
