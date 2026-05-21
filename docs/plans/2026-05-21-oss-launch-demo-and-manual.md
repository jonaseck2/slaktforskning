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

Every check below is **user-observable** and **falsifiable** — if all pass, the user goal is met; if any fail, the user goal is not met.

1. **A first-time visitor with no prior context can run through the README quickstart end-to-end and have a 3-person family with one event and one source in under 10 minutes.** I'll run the quickstart myself against a fresh DB, timing each step. If any step takes > 1 min in real time, fix the doc or fix the UI. Evidence: paste the timed walkthrough into the close-out commit.
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

- [ ] **T01** — Write this plan, commit it (`docs(plan): OSS launch demo and manual`). Add `.gitignore` entry for `examples/scratch/`.
- [ ] **T02** — Create worktree `.worktrees/oss-launch-demo` from `main`. Execute remaining tasks there.
- [ ] **T03** — Research outline. WebFetch the Wikipedia articles for each of the 10 persons. Build a written facts file at `examples/scratch/family-outline.md` (in the worktree, not committed) — dates, places, marriages, key events confirmed against sources. Treat sv.wikipedia.org as primary, en.wikipedia.org as cross-check.
- [ ] **T04** — Image sourcing. For each person, identify the canonical Wikimedia Commons portrait. Document the full source URL, the file URL, the license tag, and the author + dates. Find the Roslin group portrait. Write `docs/manual/image-credits.md` as you go.
- [ ] **T05** — Image download. `curl` each image into `examples/scratch/swedish-royals-media/`. Verify the file is ≥ 800px on the long edge (smaller is fine but won't look great in the chart).
- [ ] **T06** — Demo DB build via MCP. Start the app (if not running). Switch to a fresh DB at `examples/scratch/swedish-royals.db`. Create persons (10), names, identifiers (Wikidata QIDs as `other`-type identifiers), then marriages (6 couple relationships), then events with places (~25 events), then sources (3) + repository (1) + citations on key events.
- [ ] **T07** — Media attach + face tagging via MCP. Attach individual portraits to each person (`media:attach` then `link_media` if needed). Attach the group portrait. Then **manually** in the UI: open the group portrait in the image tagger, drag-create three face-tag regions (Gustav III, Karl, Fredrik Adolf). MCP-side `tag_person_in_media` only used to *verify* the regions exist; the drag is human-authored to avoid coord-drift.
- [ ] **T08** — Primary screenshot for README. Navigate to the persons → chart view, select Gustav III, ensure his portrait is visible in the side panel and the family tree shows ≥ 2 generations on screen. `ui_screenshot` at full window. Save as `docs/screenshot.png`.
- [ ] **T09** — Quickstart sub-screenshots (8 small ones, ≈ 1000×700 each). Build via a separate fresh DB walkthrough — recording each step at the moment it happens. Save as `docs/quickstart/01-empty-state.png` … `08-done.png`.
- [ ] **T10** — Manual section screenshots (~12). Walk through each panel/feature on the populated swedish-royals DB. Save under `docs/manual/`.
- [ ] **T11** — README rewrite. Remove the TODO marker. Embed `docs/screenshot.png`. Add the "Your first family tree in 10 minutes" section right after "What is this?".
- [ ] **T12** — Write `MANUAL.md` with TOC + every section listed above + inline screenshots from `docs/manual/`. Cap individual section length at ~80 lines; longer sections become anchor-linked subpages.
- [ ] **T13** — Coverage test `tests/unit/manual-coverage.test.ts`: parse `MANUAL.md` headings, assert one heading per `PANELED_ROUTES` entry + per importer file in `src/import/<dialect>/`. Run via `npm test`.
- [ ] **T14** — Walkthrough timing. Fresh-install the bundled binary on a Mac, follow README quickstart end-to-end, capture timestamps. Iterate on doc/UI until total ≤ 10 min.
- [ ] **T15** — Scratch cleanup. Delete `examples/scratch/swedish-royals.db` and `examples/scratch/swedish-royals-media/`. Confirm `.gitignore` keeps them out of any future churn.
- [ ] **T16** — Close-out: lint + `npm test` + `npm run build` + the Tier-1 e2e suite all green; evidence pasted into close-out commit per CLAUDE.md verification rule. Version bump (this is a docs + demo-data plan, so a minor bump is appropriate — adds the user-observable manual). Archive plan to `docs/plans/archive/`. Update `docs/PLAN.md` + `docs/plans/archive/PLAN.md`. Final commit + push to `origin/main`.

## Self-review checklist

- [ ] User goal is the first thing in the plan and is user-observable.
- [ ] Scope is enumerated; deviations explicit.
- [ ] Verification §1 contains at least one check that would fail if the user goal is unmet.
- [ ] Verification §1 includes a mechanical test (manual coverage) so future panels can't silently fall out of the manual.
- [ ] Cleanup (scratch DB + images) is named and not deferred to "post-launch follow-up".
- [ ] No "smoke" identifiers anywhere.
- [ ] Tasks list is the smallest set that delivers the user goal.
