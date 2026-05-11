# IPC Migration Inventory

Auto-generated from `src/shared/channels/*.ts` at Phase 1 Task 2.
Tracks the migration of every Electron IPC channel to a Tauri `#[tauri::command]`.

**Counts at start of port (commit 3eaf7a58, 2026-05-10):**
- **187** `defineChannel` blocks across 16 domain files (the plan's earlier "~130" estimate was low)
- **164** worker-thread channels (DB-touching, currently dispatched through `db-worker.ts`)
- **4** main-thread channels (OS APIs: 2 gazetteer reads + 2 typed shims in `api-type.ts` / `types.ts`)
- **~19** channels without an explicit `thread:` field — need per-channel inspection during migration; most likely default to worker.

In Tauri the worker-vs-main distinction goes away: rusqlite calls run on tokio's threadpool, every `#[tauri::command]` is async by default. The whole `db-worker.ts` indirection retires.

**Per-domain breakdown:**

| Domain | Channels | Worker | Main | Phase 3 Task |
|---|---:|---:|---:|---|
| database | 4 | 3 | 0 | Task 12 (DB lifecycle + settings) |
| persons | 20 | 19 | 0 | Task 6 (Persons) |
| places | 14 | 13 | 0 | Task 7 (Places + Events + Relationships) |
| events | 8 | 7 | 0 | Task 7 (Places + Events + Relationships) |
| relationships | 12 | 11 | 0 | Task 7 (Places + Events + Relationships) |
| sources | 18 | 17 | 0 | Task 8 (Sources + Citations + Repositories) / Task 11 share duplicates |
| repositories | 9 | 8 | 0 | Task 8 (Sources + Citations + Repositories) / Task 11 share duplicates |
| media | 20 | 19 | 0 | Task 9 (Media + Groups + Research Tasks) |
| groups | 13 | 12 | 0 | Task 9 (Media + Groups + Research Tasks) |
| research-tasks | 12 | 11 | 0 | Task 9 (Media + Groups + Research Tasks) |
| reports | 13 | 12 | 0 | Task 10 (Reports + Charts + Undo) |
| undo | 4 | 3 | 0 | Task 10 (Reports + Charts + Undo) |
| import | 12 | 11 | 0 | Task 11 (Import + Export + Archive) |
| website-export | 2 | 1 | 0 | Task 11 (Import + Export + Archive) |
| duplicates | 12 | 11 | 0 | Task 8 (Sources + Citations + Repositories) / Task 11 share duplicates |
| gazetteers | 8 | 5 | 2 | Task 13 (Gazetteers) |
| **total** | **187** | **173** | **14** | |

## Channel-by-channel checklist

Each row: Channel name | Source file | Migration status. Tick the migration column
as the channel lands as a `#[tauri::command]` in `src-tauri/src/commands/<domain>.rs`.

### database (`src/shared/channels/database.ts`)

- [ ] `db:getSetting`
- [ ] `db:setSetting`
- [ ] `db:deleteSetting`

### persons (`src/shared/channels/persons.ts`)

- [ ] `persons:create`
- [ ] `persons:createWithEvent`
- [ ] `persons:get`
- [ ] `persons:list`
- [ ] `persons:update`
- [ ] `persons:delete`
- [ ] `persons:search`
- [ ] `persons:addName`
- [ ] `persons:getNames`
- [ ] `persons:updateName`
- [ ] `persons:deleteName`
- [ ] `persons:addIdentifier`
- [ ] `persons:getIdentifiers`
- [ ] `persons:deleteIdentifier`
- [ ] `persons:listPage`
- [ ] `persons:refreshQualityIssueCounts`
- [ ] `persons:getQualityIssueCounts`
- [ ] `persons:searchWithDetails`
- [ ] `persons:listUnsourcedPage`

### places (`src/shared/channels/places.ts`)

- [ ] `places:create`
- [ ] `places:get`
- [ ] `places:list`
- [ ] `places:listPage`
- [ ] `places:search`
- [ ] `places:update`
- [ ] `places:delete`
- [ ] `places:findOrCreate`
- [ ] `places:findOrCreateWithChain`
- [ ] `places:getPath`
- [ ] `places:getPersons`
- [ ] `places:listChildren`
- [ ] `places:getAncestors`

### events (`src/shared/channels/events.ts`)

- [ ] `events:create`
- [ ] `events:get`
- [ ] `events:forPerson`
- [ ] `events:forRelationship`
- [ ] `events:update`
- [ ] `events:delete`
- [ ] `events:forPlace`

### relationships (`src/shared/channels/relationships.ts`)

- [ ] `relationships:create`
- [ ] `relationships:get`
- [ ] `relationships:list`
- [ ] `relationships:listPage`
- [ ] `relationships:update`
- [ ] `relationships:delete`
- [ ] `relationships:getForPerson`
- [ ] `relationships:search`
- [ ] `eventParticipants:add`
- [ ] `eventParticipants:getForEvent`
- [ ] `eventParticipants:remove`

### sources (`src/shared/channels/sources.ts`)

- [ ] `sources:create`
- [ ] `sources:get`
- [ ] `sources:list`
- [ ] `sources:listPage`
- [ ] `sources:update`
- [ ] `sources:delete`
- [ ] `sources:search`
- [ ] `citations:create`
- [ ] `citations:get`
- [ ] `citations:forSource`
- [ ] `citations:forEvent`
- [ ] `citations:forPerson`
- [ ] `citations:forRelationship`
- [ ] `citations:forPlace`
- [ ] `citations:forPersonName`
- [ ] `citations:delete`
- [ ] `citations:update`

### repositories (`src/shared/channels/repositories.ts`)

- [ ] `repositories:list`
- [ ] `repositories:get`
- [ ] `repositories:create`
- [ ] `repositories:update`
- [ ] `repositories:delete`
- [ ] `repositories:forSource`
- [ ] `repositories:linkSource`
- [ ] `repositories:unlinkSource`

### media (`src/shared/channels/media.ts`)

- [ ] `media:list`
- [ ] `media:listPage`
- [ ] `media:get`
- [ ] `media:create`
- [ ] `media:delete`
- [ ] `media:update`
- [ ] `media:forEntity`
- [ ] `media:linksForMedia`
- [ ] `media:addLink`
- [ ] `media:removeLink`
- [ ] `media:reorder`
- [ ] `media:profilePicRef`
- [ ] `media:profilePicRefs`
- [ ] `media:getTimeline`
- [ ] `mediaRegions:create`
- [ ] `mediaRegions:getForMedia`
- [ ] `mediaRegions:getForPerson`
- [ ] `mediaRegions:update`
- [ ] `mediaRegions:delete`

### groups (`src/shared/channels/groups.ts`)

- [ ] `groups:list`
- [ ] `groups:get`
- [ ] `groups:create`
- [ ] `groups:update`
- [ ] `groups:delete`
- [ ] `groups:addLink`
- [ ] `groups:removeLink`
- [ ] `groups:removeLinkByEntity`
- [ ] `groups:getLinks`
- [ ] `groups:forPerson`
- [ ] `groups:forPlace`
- [ ] `groups:forMedia`

### research-tasks (`src/shared/channels/research-tasks.ts`)

- [ ] `researchTasks:list`
- [ ] `researchTasks:get`
- [ ] `researchTasks:forPerson`
- [ ] `researchTasks:forPlace`
- [ ] `researchTasks:forMedia`
- [ ] `researchTasks:create`
- [ ] `researchTasks:update`
- [ ] `researchTasks:delete`
- [ ] `researchTasks:addLink`
- [ ] `researchTasks:removeLink`
- [ ] `researchTasks:getLinks`

### reports (`src/shared/channels/reports.ts`)

- [ ] `reports:personSummary`
- [ ] `reports:familyUnit`
- [ ] `reports:ancestorTree`
- [ ] `reports:placeHistory`
- [ ] `reports:researchGaps`
- [ ] `reports:timeline`
- [ ] `reports:aliveInYear`
- [ ] `duplicates:find`
- [ ] `duplicates:findPage`
- [ ] `duplicates:count`
- [ ] `duplicates:merge`
- [ ] `duplicates:ignore`

### undo (`src/shared/channels/undo.ts`)

- [ ] `undo:state`
- [ ] `undo:beginGroup`
- [ ] `undo:endGroup`

### import (`src/shared/channels/import.ts`)

- [ ] `import:holgerRun`
- [ ] `gedcom:import`
- [ ] `import:genneyRun`
- [ ] `import:rootsmagicRun`
- [ ] `import:grampsRun`
- [ ] `import:genneyDiscover`
- [ ] `archive:_importRun`
- [ ] `archive:_exportRun`
- [ ] `gedcom:_exportRun`
- [ ] `csv:_exportRun`
- [ ] `gedcom:preview`

### website-export (`src/shared/channels/website-export.ts`)

- [ ] `website:previewSnapshot`

### duplicates (`src/shared/channels/duplicates.ts`)

- [ ] `duplicates:findPlaces`
- [ ] `duplicates:countPlaces`
- [ ] `duplicates:ignorePlace`
- [ ] `duplicates:mergePlaces`
- [ ] `duplicates:findSources`
- [ ] `duplicates:countSources`
- [ ] `duplicates:ignoreSource`
- [ ] `duplicates:mergeSources`
- [ ] `duplicates:findMedia`
- [ ] `duplicates:countMedia`
- [ ] `duplicates:ignoreMedia`

### gazetteers (`src/shared/channels/gazetteers.ts`)

- [ ] `gazetteers:list`
- [ ] `gazetteers:import`
- [ ] `gazetteers:export`
- [ ] `gazetteers:delete`
- [ ] `gazetteers:getImported`
- [ ] `gazetteers:getSchema`
- [ ] `gazetteers:getBundled`

