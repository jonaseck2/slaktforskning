---
name: slaktforskning-mcp
description: Use when the user asks you to do real genealogy research in the Släktforskning app via the MCP server — adding persons, building family trees, finding duplicates, citing sources, recording events with places, generating narratives. Distinct from `slaktforskning-mcp-dev` (which is about extending the MCP server itself). Triggers on any agent-driven research task involving the slaktforskning or slaktforskning-dev MCP tools.
---

# Släktforskning MCP — Genealogy Research Skill

You are helping a genealogist (or yourself) build out their family tree using the Släktforskning MCP tools. This skill is about *using* the tools well, not about extending them.

## ⚠️ Prime Directive: Never fabricate

The genealogist's database is sacred. Every value you write must come from something the user gave you (a document, a previous session note, an explicit instruction) or be left null/unknown. **You are not allowed to "fill in plausible" data.**

- Don't guess birth dates from age + census year.
- Don't guess parents from common name patterns.
- Don't guess place hierarchy ("'Stockholm' must be in 'Sverige'") — pass what the source says, let the gazetteer resolve at render time.
- Don't guess `sex` from a given name. Default to `'U'` if unknown.
- Don't fabricate citation transcriptions to look thorough.

When in doubt, ask the user, or write a research task (`add_research_task`) describing the gap.

The full rule lives in the project's [CLAUDE.md](../../../CLAUDE.md) Prime Directive section. Past violations corrupted real databases.

## The two MCP servers

Both servers point at the same SQLite database. The user has the running app open against that DB; everything you write is visible to them in seconds.

| Server name in tool calls | Use when |
|---------------------------|----------|
| `mcp__slaktforskning__*` (production, 77 tools) | Genealogy research — persons, places, events, sources, citations, repositories, research tasks, media, groups, GEDCOM/archive import-export. |
| `mcp__slaktforskning-dev__*` (dev, +15 tools) | Same as prod *plus* UI automation (`ui_screenshot`, `ui_navigate`, `ui_click`, `ui_get_dom`, `ui_reload`), chart inspection (`chart_focus_person`, `chart_screenshot_person`), DB stats (`db_stats`, `app_status`), seed (`seed_family`). Use the dev server when you also need to verify visually that what you wrote renders right. |

`get_current_database` tells you which file the MCP is pointed at. `switch_database` moves it. After a long break or a fresh session, **call `app_status` and `db_stats` first** so you know what you're working with.

## Pre-flight, before any research session

Run these in parallel before the user's first request:

```
app_status         — confirm app is running, get the DB path
db_stats           — current entity counts (so you know if it's empty)
get_current_database — confirm DB path
```

If you don't get a response from `app_status`, the app isn't running and your changes won't be visible. Tell the user. Don't proceed silently.

## Tool surface, grouped by workflow

You don't need to memorise all 77 tools. Pick the right one per workflow.

### "Add a person"
- `create_person({ given_name, surname, sex, birth_date, birth_date_type, birth_place, source_title, source_page, notes })` — single-call workflow that creates the person, attaches a birth event, resolves the place, and creates a citation in one transaction. Prefer this over `record_event(birth)` after the fact.
- `add_child({ parent_id, other_parent_id, given_name, surname, ... })` — creates the child plus parent_child relationships in one step. The default subtype is unspecified (effectively biological).
- `add_relationship({ person1_id, person2_id, type: 'parent_child', subtype: 'adopted' })` — explicit adoption. Add this *in addition to* the bio-parent's `add_child` if both parents matter.

### "Add a marriage"
- `add_relationship({ type: 'couple', subtype: 'marriage', event_type: 'marriage', event_date, event_date_type, event_place })` — relationship + marriage event in one call. The event is attached to the relationship, not to either spouse, so it shows up correctly in both panels.

### "Record an event"
- `record_event({ event_type, person_id, date_type, date_value, date_value_end, date_original, place, place_chain, source_title, source_page, confidence, notes, value, cause })`. The big one.
  - For one participant: `person_id`. For multiple: `person_ids: [{id, role}]`.
  - For a "fact" event (occupation, residence, religion, education, title, description), put the fact value (e.g. "Carpenter") in `value` — that maps to GEDCOM-X Fact.value.
  - **Don't pass both `place` and `place_chain`.** Pick one.

### "Add a place hierarchy"
- `add_place({ name, parent_chain, place_type, latitude, longitude, notes })` — `name` is the leaf only. `parent_chain` is the ancestor list root → leaf, **excluding the leaf**. e.g. for "Pau, Pyrénées-Atlantiques, France": `name: "Pau", parent_chain: ["Frankrike", "Pyrénées-Atlantiques"]`.
- `place_type` should be the most specific match: `palace`, `castle`, `church`, `farm`, `village`, `city`, `parish`, `municipality`, `county`, `province`, `admin1`, `country`, `locality`, `härad`, `other`. Use `palace`/`castle`/`church` for individual buildings — they were added 2026-05-09 specifically because royal-residence test data forced everything into `'other'`.

### "Add a source + citation"
- `add_source({ title, author, publication_info, repository, url, source_type, call_number, abstract })` — every field is optional but `title` is the deduplication key (cite tools find/reuse by title).
- `cite({ source_title | source_id, person_id | event_id | place_id | relationship_id, page, transcription, confidence })` — confidence is 0=Unreliable, 1=Questionable, 2=Secondary, 3=Primary.
- **Cite on creation when possible.** `create_person` and `record_event` both accept `source_title` + `source_page` inline. Adding citations after the fact is fine but agents who batch all persons first and citations later usually never get back to the citation step — and the resulting database has 65 UNSOURCED_BIRTH errors the user has to clean up.

### "Find a duplicate / merge"
- `find_duplicates({ limit })` — returns candidate pairs with a score 0-100 and `reasons` array. Score ≥80 = strong, ≥50 = candidate.
- `merge_persons({ target_id, source_id })` — keeps target, deletes source, transfers names/events/relationships/citations/groups/tasks. Post-merge dedupes single-cardinality events (birth, death, etc.) and demotes a duplicate `name_type='birth'` to `aka`.
- **Never merge without asking the user first** unless the score is ≥85 AND the user has explicitly told you to clean up duplicates.

### "What's missing for this person?"
- `get_research_gaps({ person_id })` — returns missing birth/death/parents, unsourced events, events without places. The single best self-check before declaring "I'm done with this person".
- `get_person_summary({ person_id })` — full denormalized view: names, events, relationships, citations, groups, tasks. Use to verify what you just built.
- `get_timeline({ person_id })` — chronological life events including parent deaths, spouse death, children's births during the subject's lifetime. Useful for narrative generation.

### "Show me the result"
- `chart_focus_person({ person_id })` — re-roots the family tree on a person.
- `ui_navigate({ path: '/persons/<id>' })` — opens the person's panel.
- `ui_screenshot({ selector? })` — confirms what the user sees. Use after major changes.
- `chart_screenshot_person({ person_id })` — crops to one box in the chart, useful for spot-checking.

### "Quality check"
- `run_checks({ person_id? })` — runs all chronological/structural/source checks. Without `person_id`, runs across the whole DB. With one, scopes to that person.

## Hard-won pitfalls (real bugs we shipped)

These are the things that look like they should work but don't. Follow these or you'll produce a database the user has to clean up by hand.

### 1. Date types and date values

When a date is a real ISO date, pass `date_type: 'exact'` AND `date_value` in **ISO format** (`YYYY-MM-DD`, `YYYY-MM`, or `YYYY`). The MCP also accepts free-text via `date_original`, but free-text written into `date_value` will break the chronology checks (the parser was hardened 2026-05-09 but the convention still holds).

Right:
```
record_event({
  event_type: 'birth',
  person_id: '...',
  date_type: 'exact',
  date_value: '1763-01-26',          // ISO, structured
  date_original: '26 Jan 1763',      // free-text as authored
  ...
})
```

Wrong (the bug pattern):
```
record_event({
  event_type: 'birth',
  date_value: '26 Jan 1763',         // ← free-text in the structured field
  ...
})
```

When the date is fuzzy, pass `date_type: 'about' | 'before' | 'after' | 'between' | 'calculated' | 'unknown'` and let `date_value` be approximate. For ranges (`'between'`), pass both `date_value` (start) and `date_value_end` (end).

When you don't know: omit `date_type` entirely, put what you have in `date_original`, leave `date_value` null.

### 2. Place names — single component, never comma-strings

`add_place` and `record_event(place: ...)` reject names that contain commas. "Stockholm, Sverige" is not a place name; it's a comma-separated path. Use `place_chain` instead:

Right:
```
record_event({
  event_type: 'death',
  place_chain: ['Sverige', 'Stockholms län', 'Stockholm', 'Stockholms slott'],
  ...
})
```

Wrong:
```
record_event({
  place: 'Stockholms slott, Stockholm, Sweden',   // ← rejected, becomes a string
  ...
})
```

When you only have one component (e.g. "Pau"), use `place: 'Pau'`.

### 3. `place_chain` excludes the leaf when calling `add_place`, INCLUDES the leaf when calling `record_event`

This is genuinely confusing. Two tools, two conventions:

- `add_place`: `name` is the leaf, `parent_chain` is the ancestors **excluding the leaf**. So for "Pau" in France: `name: "Pau", parent_chain: ["Frankrike", "Pyrénées-Atlantiques"]`.
- `record_event`: `place_chain` is the full path **including the leaf**. So for "Pau" in France: `place_chain: ["Frankrike", "Pyrénées-Atlantiques", "Pau"]`.

Read the tool description before each call.

### 4. Adoption is a *second* parent_child relationship

`add_child` creates a default-biological parent_child relationship. To express "adopted by", add a *second* relationship explicitly:

```
add_child({ parent_id: bio_mother_id, given_name: 'Marius', surname: 'Borg' })
add_relationship({
  person1_id: adoptive_father_id,
  person2_id: marius_id,
  type: 'parent_child',
  subtype: 'adopted',
  notes: 'Adopted by ... after the marriage'
})
```

The first relationship has `subtype: null` (or you can update it to `'biological'` after via `update_relationship`). The second has `subtype: 'adopted'`. The PersonPanel shows the adoptive relationship explicitly with the "Adoptivförälder" label.

Same shape works for `'foster'` or `'step'`. Note: as of 2026-05 the chart no longer renders subtype-specific dashed lines — every parent_child edge is solid in the chart, but the database still records the subtype and the panel still distinguishes them.

### 5. Citation on creation > citation later

`create_person`, `add_child`, `record_event` all accept `source_title` + `source_page` inline and create the citation atomically. Use them. Don't promise yourself you'll add citations later — you won't, and the user will end up with 50+ UNSOURCED_BIRTH errors.

When you genuinely have no source, write `notes` describing what you know and where you got it. Free text is better than silence.

### 6. Identifiers — agents *can* add them, the panel *now* shows them

`add_person_identifier({ person_id, identifier_type, identifier_value })` works for `familysearch | ancestry | riksarkivet | personnummer | refn | rin | other`. Use this whenever the user gives you an external reference — it's the canonical way to make this database round-trip with FamilySearch / Ancestry / Riksarkivet later. The PersonPanel "Identifierare" section (added 2026-05-09) renders them.

### 7. After a batch of writes, verify

Don't just trust that what you sent landed. After a session of writes:

```
1. db_stats                     — confirm counts went up
2. get_person_summary({id})     — for one person you just touched, read it back
3. get_research_gaps({id})      — what does the system think is missing?
4. ui_navigate(/persons/{id})   — visual confirmation
5. ui_screenshot()              — same
```

If you can't reach the running app (`app_status` returns nothing), **stop and tell the user**. Don't keep writing into the void.

### 8. `find_duplicates` runs DB-wide, not on what-you-just-added

The score 0–100 is a heuristic. Score ≥80 with multiple `reasons` (`same_surname`, `given_name_prefix`, `same_birth_date`) is a strong signal but not proof. Always show the user the candidate pair before merging.

### 9. The user can `Cmd+R` reload — sometimes you need to ask them to

MCP-side mutations push refresh signals to the renderer automatically (the `data:changed` broadcast fix landed 2026-05-09). But the preload only loads at app start. If the user just upgraded mid-session, ask them to fully restart the app, not just reload the renderer.

`ui_reload` (dev MCP) hard-reloads the renderer and is the agent's reset button when the panel won't refresh.

## Workflow templates

Pick the closest pattern. None are mandatory; deviate when the user's situation deviates.

### Template A — "Build out a person from a known fact set"

The user gives you a name + a few dates. Walk them up the tree.

```
1. create_person({given, surname, sex, birth_date, birth_date_type:'exact',
                  birth_place, source_title, source_page})
2. record_event({event_type:'death', person_id, date_value, date_type:'exact',
                 place, source_title, source_page})
3. (optional) record_event({event_type:'burial', ...})
4. add_child({parent_id: this_person, given_name, surname, ...})  // for each child
5. For each parent the user knows:
     create_person(...)   // the parent
     add_relationship({type:'parent_child', person1_id: parent, person2_id: this_person})
6. get_research_gaps({person_id: this_person})  // self-check
7. ui_navigate(/persons/{this_person.id})       // show the user
   ui_screenshot()
```

### Template B — "Import a GEDCOM and triage"

```
1. import_file({path}) or import_archive({path})
   → returns ImportReport with warnings, unmappedData, counts
2. db_stats — confirm rows arrived
3. find_duplicates({limit: 50})
   → present candidate pairs to the user; merge only with their nod
4. run_checks() — get the quality issue list
5. Triage with the user: which categories matter? open research_tasks for
   the rest.
```

### Template C — "Find the common ancestor of A and B"

```
1. get_ancestor_tree({person_id: A, generations: 8})
2. get_ancestor_tree({person_id: B, generations: 8})
3. Walk the two sets, find the youngest shared person.
4. chart_focus_person({person_id: shared}) so the user sees the join.
5. Write the finding into a research_task linked to both A and B for
   posterity.
```

### Template D — "Cite a source across many events"

```
1. add_source({title, author, publication_info, repository, source_type, url})
2. For each event the source confirms:
     cite({source_id, event_id, page, transcription, confidence})
3. (optional) link_source_repository({source_id, repository_id})
```

### Template E — "Generate a narrative for person X"

```
1. get_person_summary({id: X})    — names, events, relationships, citations
2. get_timeline({id: X})          — chronological life with relatives' deaths/marriages woven in
3. get_research_gaps({id: X})     — flag what you don't know up front in the narrative
4. chart_screenshot_person({id: X}) — visual companion
5. Write narrative honouring (1) what's authored, (2) what's missing,
   (3) what citations support which claim. Never fabricate connective
   tissue.
```

## Closing checklist

Before you tell the user "I'm done":

- [ ] `db_stats` numbers match what you intended.
- [ ] `find_duplicates({limit: 5})` doesn't show new high-score pairs.
- [ ] `run_checks` results don't contain new errors caused by your writes (warnings/notices about missing sources etc. are expected if the user said citations were out of scope).
- [ ] You've shown the user a screenshot or a chart of the result, not just a tool-output dump.
- [ ] Any data you couldn't fill in is captured as a `research_task` rather than left implicit.

## Why this skill is separate from `slaktforskning-mcp-dev`

`slaktforskning-mcp-dev` is for the engineer who writes the MCP server. This skill is for the agent who *uses* it on real data. The two skill-sets share the underlying Prime Directive but the failure modes differ:

| `slaktforskning-mcp-dev` cares about | This skill cares about |
|---|---|
| Tool surface design, schema parity | Picking the right tool per workflow |
| Pass-through (no synthesizing defaults) on the *tool* side | Pass-through (no fabricating data) on the *caller* side |
| Adding new tools, broadcast wiring | Date format conventions, place_chain semantics |
| Test coverage, registry channels | `get_research_gaps` / `run_checks` self-checks |
| Renderer cache refresh | Citation hygiene, post-batch verification |

If you're extending the MCP server, read `slaktforskning-mcp-dev`. If you're using it to help a genealogist, you're in the right skill.
