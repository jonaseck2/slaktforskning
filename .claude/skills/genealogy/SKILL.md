---
name: genealogy
description: Use when actually doing genealogy research with the Släktforskning MCP — building real family trees end-to-end, exporting/round-tripping, attaching media + face tags, importing custom gazetteers for places not in the bundled set. Pairs with `slaktforskning-mcp` (which lists the tools) and `slaktforskning-mcp-dev` (which is about extending the tools). Triggers on real research workflows, "research X family", "test the app end-to-end", "set up a Bernadotte-style demo".
---

# Genealogy Research Workflow Skill

Sister skill to `slaktforskning-mcp`. That one tells you *which tools exist*. This one tells you *the order to use them in*, *the gotchas that bite mid-session*, and *the verification steps that catch silent data loss*.

Distilled from a full Bernadotte royal-family test run on the Tauri build (May 2026). Every gotcha in §"Friction log" is a real bug encountered, not theoretical.

## Pre-flight

Always do these in this order. Skipping any of them costs an hour later.

1. **`get_current_database`** — confirm which `.db` you're writing to. Do this even if you "know" it. The MCP server caches the path at process start; if the user opened a different DB in the running app since the MCP started, you'll write to the wrong file. (Friction §1.)
2. **Compare with the running app**: `curl -s http://127.0.0.1:19241/db_path` should return the same path. If they differ, **STOP** and switch the MCP via `switch_database` to match the app's path, OR ask the user which one is the test DB. Never assume; never proceed with both diverged.
3. **`db_stats`** — see what's already there. If it's the user's real DB (10k+ persons), don't run any of the test workflows below — they pollute. Bail and ask for a fresh `.db`.
4. **`list_repositories`, `list_groups`** — see what containers exist; reuse before creating duplicates.

## Building a tree from scratch — the order that works

The order matters because some entities reference others. Doing it backwards forces backfills.

```
1. switch_database to a fresh path (".../bernadotte.db" or whatever)
2. add_repository — at least one (sources need a home)
3. add_source — Wikipedia URLs are fine for tests; real sources for real research
4. create_person on the root individual (focus person)
5. record_event for that person's birth/death (with citation= the source from step 3)
6. add_relationship + add_child to grow downward
7. attach_media on each person (portraits) and place (locations)
   — for portraits, use real Wikipedia thumbs (see §"Photos that don't 404" below)
8. tag_person_in_media for face regions
9. add_person_identifier (personnummer, FamilySearch, ancestry)
10. add_group + add_group_link to bucket the tree (e.g. "House of Bernadotte")
11. add_research_task to mark known gaps (don't fabricate them away)
```

Skip steps that don't apply. Don't skip step 1.

## Custom gazetteer for a place not in the bundled set

The bundled gazetteers cover socknar, församlingar, orter, gårdar, kyrkor, etc. for Sweden plus Wikidata global admin. They do **not** cover named royal palaces, specific buildings, named landmarks, or microlocations. If the user types "Haga Slott, Solna", the resolver returns nothing — needs a custom gazetteer.

### Authoring contract (it WILL fail validation if you skip a field)

Every node — including the World root — needs `name`, `type`, `lat`, `lon`. The validator (`src/api/gazetteers.ts:validateNode`) hard-throws on any missing one with a confusing error. **For a top-level "World" root, use `lat: 0, lon: 0`** — it's never used because the resolver never anchors at root, but the field must exist.

The top level needs `kind: "point"`. Without it the renderer accepts the import (no error) but resolution behaves unexpectedly. (Friction §2.)

The root must be `name: "World"` or `name: "World (Historical)"`. Self-rooted ("Sverige") gazetteers are rejected by design — they wouldn't structurally merge with the canonical hierarchy. (`gazetteers.ts:91-104`.)

Skeleton:

```json
{
  "id": "se-royal-residences",
  "name": "Swedish Royal Residences",
  "locale": "sv",
  "kind": "point",
  "description": "Custom gazetteer for ...",
  "source": { "name": "...", "url": "...", "license": "CC0", "fetched": "2026-05-11" },
  "root": {
    "name": "World", "type": "root", "lat": 0, "lon": 0,
    "children": [
      { "name": "Sverige", "type": "country", "lat": 60.13, "lon": 18.64,
        "children": [
          { "name": "Stockholms län", "type": "admin1", "lat": 59.33, "lon": 18.07,
            "children": [
              { "name": "Solna", "type": "municipality", "lat": 59.36, "lon": 18.0,
                "children": [
                  { "name": "Haga Slott", "type": "palace", "lat": 59.3625, "lon": 18.042,
                    "aliases": ["Haga slott", "Haga Palace"] }
                ]}
            ]}
        ]}
    ]
  }
}
```

### Importing it

There's no MCP tool for `import_gazetteer` (yet). Either:
- **Renderer route**: `window.api.gazetteers.import(jsonString)` via the `/eval` bridge. Pass the string directly (NOT `{jsonText: ...}` — that's a different polyfill spec). Confirm with `gazetteers.list().filter(g => !g.bundled)`.
- **UI route**: Settings → Gazetteers → Import (manually pick the file).

After import, **enable it explicitly**. Imported gazetteers are NOT auto-added to `gazetteer_config.enabledGazetteers`. The default-fallback in `usePlaceResolver.ts:43` only enables bundled. Concretely:

```js
const bundled = await window.api.gazetteers.getBundled();
const ids = bundled.map(g => g.id);
ids.push('your-custom-id');
await window.api.db.setSetting('gazetteer_config', JSON.stringify({ enabledGazetteers: ids }));
```

**Don't** read the existing `gazetteer_config` and append — if it's null on first load, you'll write `{ enabledGazetteers: ['your-custom-id'] }` and silently disable every bundled gazetteer. (Friction §3 — happened during the Bernadotte test, took two passes to notice.)

## Photos that don't 404

Wikimedia Commons file URLs (e.g. `https://upload.wikimedia.org/.../thumb/.../800px-File.jpg`) **return Wikimedia error HTML** when you guess the path — they're case-sensitive, percent-encoded, and the thumbnail-sharding rules don't match what you'd write by hand.

The reliable shape: query the Wikipedia API with `pageimages` to resolve the canonical thumbnail URL:

```bash
curl -s "https://en.wikipedia.org/w/api.php?action=query&titles=Carl%20XVI%20Gustaf&prop=pageimages&pithumbsize=800&format=json"
# → response.query.pages[*].thumbnail.source is a known-good URL
```

Even with this approach, Wikipedia sometimes returns a different file than expected (article's lead image isn't always whose article you queried — e.g. querying Silvia returned a non-portrait). Verify each downloaded file before linking. (Friction §4.)

## Round-trip verification

The Prime Directive (CLAUDE.md) requires every authored field to survive GEDCOM round-trip. The skill of *running* the round-trip:

```
1. export_archive(output_path: "/tmp/foo-export.zip", gedcom_version: "7.0")
   → Returns { mediaCount, missingMedia, gedcomReport: { excluded[] } }
   → Read `excluded[]` carefully. "Research Tasks" excluded is expected (no GEDCOM equivalent).
2. unzip the archive, find family_tree.ged, sanity-check the head
3. switch_database to a fresh roundtrip path
4. import_file(file_path: "/tmp/family_tree.ged", format: "gedcom")
5. db_stats — compare to the original. Note any DROPS.
6. switch_database back to the original
```

Common round-trip gaps **that are real bugs, not exclusions**:
- **Place-attached media disappears.** GEDCOM 5.5.1/7.0 `OBJE` lives on INDI, FAM, SOUR — *not* on the place node. So `attach_media` to a place exports as nothing, re-imports as nothing. The orphan-media check (`run_checks` → `ORPHANED_MEDIA`) catches it post-export, but better to know the limit upfront. Use entity-typed `link_media` to attach to multiple persons + the place; the person link round-trips, the place link is supplementary metadata. (Friction §5.)
- **Relationships count balloons after import.** If you started with 12 (couples + parent_child) and re-import shows 32, the GEDCOM importer materialized a relationship row per FAM child link instead of reusing the couple row. Not a data-loss issue (every child still has parents), but a normalization difference worth knowing.
- **Research tasks always excluded** in GEDCOM 5.5.1/7.0 — use `export_archive` and re-import via the archive importer (not GEDCOM-only), or document tasks separately.

## Verifying the UI is live (reactivity)

After MCP mutations, the running app should reflect the changes within ~200ms (debounced `data:changed` event). To check:

1. **Bridge probe** (always works): `curl http://127.0.0.1:19241/db_path` confirms which DB the renderer sees. If it differs from the MCP, your MCP writes are invisible to the UI.
2. **Screenshot via bridge** (works even when dev MCP UI tools error): `POST http://127.0.0.1:19241/screenshot` with `{}` returns `{ data: <base64 PNG> }`. Decode and inspect.
3. **Dev MCP `ui_screenshot` / `ui_navigate`**: ON THE TAURI BUILD these can return `Unexpected end of JSON input` after a `switch_database` — the dev MCP and the running app disagree about the active DB. Workaround: use the bridge endpoints directly; or fix the MCP-side path drift first.

## Friction log — actual bugs found, May 2026

Each one cost time during the Bernadotte test; future-you should pay them no time.

### §1. Renderer + MCP can be on different DBs

**Symptom**: You import a gazetteer via the renderer's `/eval` bridge, then ask the MCP to resolve a place — "no match". Reason: MCP is pointed at one DB, renderer at another.

**Why it happens on the Tauri build specifically**: the dev MCP (`scripts/mcp-tauri.mjs`) fetches the active path *once at MCP startup*. If the user (or a test) switches DB after that, MCP keeps writing to the old file. The Electron build had the same shape but the running app's UI reload is what kept the two in sync; Tauri's reload doesn't re-fetch the MCP-side path.

**Mitigation**: always start a session with both `get_current_database` (MCP) and `curl /db_path` (renderer) before doing any work.

### §2. Custom gazetteer JSON: every node needs lat+lon, top needs kind

The validator (`src/api/gazetteers.ts:validateNode`) requires `name`, `type`, `lat`, `lon` on **every** node, including the abstract World root. Missing fields throw cryptic errors deep in the call stack (the trace points at line 87 — the `kind` validator throw — which has nothing to do with the actual missing-`lat` failure further down).

The top level needs `kind: "point"` (or `"boundary"` for polygons). Optional in the validator, but the resolver and UI behave inconsistently without it.

### §3. Imported gazetteers are NOT auto-enabled

`gazetteer_config.enabledGazetteers` is a hard whitelist. After `gazetteers.import`, append your new ID to that list (not "starting from null + your ID" — that wipes the bundled defaults).

Recovery if you wipe the bundled defaults:
```js
const bundled = await window.api.gazetteers.getBundled();
await window.api.db.setSetting('gazetteer_config', JSON.stringify({
  enabledGazetteers: bundled.map(g => g.id)
}));
```

### §4. Wikimedia/Wikipedia photo URLs

Don't construct them by hand. Query `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&pithumbsize=800` and use the returned `thumbnail.source`. Even then, verify the file matches what you expected — sometimes Wikipedia hands back a different file than the article subject.

### §5. Place-attached media doesn't survive GEDCOM round-trip

GEDCOM `OBJE` is per-individual / per-family / per-source. There's no place-level OBJE. If you `link_media` from a media item to a place, the link is dropped on export. Workaround: also link the same media to a person who's connected to that place (e.g. someone born or buried there). The person-OBJE link round-trips.

This is documented in `src/api/gedcom_fidelity_registry.ts` as `lossy:no-place-OBJE-in-GEDCOM`. The orphan-media quality check (`run_checks` → `ORPHANED_MEDIA`) catches the leftover after re-import.

### §6. Tauri build: `db.switchTo` doesn't survive the auto-reload

**Bug** (real, in the spike code as of May 2026): `window.api.db.switchTo(path)` opens the new DB on the Rust side and triggers `App.vue`'s `onSwitched` → `window.location.reload()`. The reload re-runs `main.ts` which calls `default_db_path` — always returns `family.db` — and overwrites the just-switched path.

**Fix that landed during this session** (`src/renderer/main.ts:65-72`): boot now calls `db_current_path` first and only falls back to `default_db_path` if nothing is open. After a fresh build, the switch sticks across reload. Older builds need a Tauri process restart for the fix to apply.

**Mitigation while live**: do the switch and the screenshot in quick succession via the bridge, before the reload swallows it. Or use the MCP `switch_database` (separate process — not affected).

### §7. Dev MCP UI tools (`ui_navigate`, `ui_reload`, `ui_screenshot`) error out

**Symptom**: `Unexpected end of JSON input`. Always returns the same error after a DB switch.

**Workaround**: use the bridge endpoints directly:
```bash
curl -s -X POST http://127.0.0.1:19241/screenshot -H 'content-type: application/json' -d '{}'
```

Returns `{data: <base64-png>}`. Decode → file → inspect.

(Investigate root cause separately; for live demos use the bridge.)

### §8. Suspicious `birth_year` truncation in `search_persons` results

**Cosmetic**: search returns a `birth_year` field that looks like "30 A" — it's actually the first few characters of `date_original` ("30 April 1946"). Don't read it as a year; for ages, fetch `get_person_summary` or `get_timeline`.

## Verification a session actually worked

End every session with these:

```
1. db_stats — counts match expectations
2. find_duplicates(entity: "person") — should be []
3. run_checks — read every NOTICE/WARNING. Each is either real (fix) or expected (note in research_task)
4. export_archive to a .zip backup
5. (optional) GEDCOM round-trip into a fresh DB → db_stats → diff
```

If any of those skip, you don't know whether what you did stuck.
