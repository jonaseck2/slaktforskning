# Changelog

## v0.132.0 — cropped face-tag profile pictures on all avatars

Every `AppAvatar` in the app now shows a person's starred face tag as a cropped square profile picture — no new media blobs, no extra storage. See [plans/archive/2026-04-20-avatar-profile-pic-crop.md](docs/plans/archive/2026-04-20-avatar-profile-pic-crop.md) for full plan.

### What changed
- **Avatars everywhere show the cropped face.** PersonsView list, PersonPanel in the visualization view, GroupDetailView, PlacePersonsSection, RelationshipsList, MediaPanel's linked-persons and face-tag rows, and PersonDetailView's header all now auto-load the cropped profile picture when a person has a face tag on their first media. No face tag → centered square of the full image. No media → sex-colored initials (unchanged).
- **No duplicate files.** Crop is computed at render time from the existing media region via an offscreen `<canvas>`; the output is a 128×128 JPEG data URL cached per person in a Pinia store.
- **Group-photo dedup.** Three people tagged in the same photo share one `readAsDataUrl` call per batch — `ensureBatch` groups by `mediaId` internally.
- **Correct face containment.** Pixel-space crop math (`computeSquareCropRectPx`) picks the square side from `max(region.width × imgW, region.height × imgH)`, so portrait photos with tall face tags keep the whole face, not just the forehead.
- **Live updates on edits.** Profile picture invalidates automatically when the region is starred, reassigned, reordered, unlinked, re-drawn, or moved. Generation counter prevents in-flight async work from writing stale crops after invalidation.

### New API + IPC
- `api/media.ts`: `getPersonProfilePicRef(db, personId)` + batch `getPersonProfilePicRefs(db, ids[])`.
- `window.api.media.profilePicRef` / `profilePicRefs` (read-only).

### New renderer pieces
- `src/renderer/utils/cropImage.ts` — pure pixel-space crop math + canvas helper (10 unit tests covering portrait, landscape, edge-clamping, null-region center crop).
- `src/renderer/stores/profilePic.ts` — Pinia store with per-person cache, generation counter, batch-scoped media dedup.
- `src/renderer/composables/usePersonProfilePic.ts` — reactive wrapper.
- `AppAvatar` accepts a `personId` prop and auto-loads via the composable. Explicit `src` still wins for callers that need a manual override.

### Removed
- `PersonDetailView`'s bespoke `profilePicUrl` + `loadProfilePic` plumbing; the standard `AppAvatar` path now handles it.

## v0.131.0 — keepsake reports redesign

Complete redesign of the Reports view around family-facing keepsake narratives. See [plans/archive/2026-04-19-keepsake-reports-redesign.md](docs/plans/archive/2026-04-19-keepsake-reports-redesign.md) for full plan.

### New reports
- **A Life** (evolves Biography) — life map, visual timeline, family, events, notes, photos, sources appendix.
- **A Marriage** (evolves Family Narrative) — dual life map, shared timeline, couple, children grid, narrative, photos.
- **Place Chronicle** (evolves Place History) — boundary map, persons, events, description, photos, child places.
- **Your Ancestors** (evolves Ancestor Book) — fan chart cover, full-page fan, per-ancestor pages with ahnentafel, surname index.
- **Life on One Page** (new) — single framable sheet with portrait, map, key dates, photo grid, notes snippet.
- **Family in Year X** (new) — snapshot of everyone alive in a target year with family units.
- **Photo Album** (new) — chronological media gallery scoped to person / couple / place / all.

### Removed reports
- **Individual Summary** — redundant with `PersonDetailView`. Use A Life for the keepsake version.
- **Family Group Sheet** — redundant with `RelationshipDetailView`. Use A Marriage.
- **Ancestor Sheet** (tabular) — retired. A new **Pedigree Print** chart takes its place in the framable-prints group.

### Other changes
- New Settings field `researcher_name` powers report attribution ("Compiled by …").
- Reports view split into two tab groups: Keepsake reports + Framable prints.
- New design tokens: `--report-serif-stack`, `--report-prose-leading`, `--report-page-max-width`, `--report-cover-accent-height`.
- New `getAliveInYear(db, year)` API function + IPC channel + types (`AliveInYearPerson`, `AliveInYearFamily`, `AliveInYearResult`).
- New composables: `useLifeMap`, `useMediaChronological`.
- Six new print-safe shared primitives under `src/renderer/components/reports/primitives/`: `ReportCover`, `PersonMiniCard`, `TimelineBar`, `LifeMap`, `PlaceBoundaryMap`, `MediaChronological`.
- Privacy: identifiers unconditionally hidden for living persons; new per-report "Redact living persons" toggle replaces birth year with decade and hides notes/portraits of living persons.
- 14 new component smoke tests + 8 new E2E tests across the seven keepsake reports.
