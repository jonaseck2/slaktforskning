# IPC Reference

Complete `window.api` surface and IPC channel mappings. Every method returns a `Promise`.

## window.api Surface

```typescript
window.api.persons.create(data)                   // → Person
window.api.persons.get(id)                        // → Person | null
window.api.persons.list()                         // → (Person & { given_name, surname })[]
window.api.persons.update(id, data)               // → Person | null
window.api.persons.delete(id)                     // → boolean
window.api.persons.search(query)                  // → (Person & { given_name, surname })[]
window.api.persons.addName(personId, data)        // → PersonName
window.api.persons.getNames(personId)             // → PersonName[]
window.api.persons.updateName(id, data)           // → PersonName | null
window.api.persons.deleteName(id)                 // → boolean
window.api.persons.addIdentifier(personId, data)  // → PersonIdentifier
window.api.persons.getIdentifiers(personId)       // → PersonIdentifier[]
window.api.persons.deleteIdentifier(id)           // → boolean
window.api.persons.createWithEvent(data)          // → { person: Person, event: GenealogyEvent | null, citation: Citation | null }

window.api.relationships.create(data)              // → Relationship
window.api.relationships.get(id)                   // → Relationship | null
window.api.relationships.list()                    // → Relationship[]
window.api.relationships.update(id, data)          // → Relationship | null
window.api.relationships.delete(id)                // → boolean
window.api.relationships.getForPerson(personId)    // → Relationship[]
window.api.relationships.search(query)             // → (Relationship & names)[]

window.api.eventParticipants.add(data)             // → EventParticipant
window.api.eventParticipants.getForEvent(eventId)  // → EventParticipant[]
window.api.eventParticipants.remove(id)            // → boolean

window.api.events.create(data)                     // → GenealogyEvent
window.api.events.get(id)                          // → GenealogyEvent | null
window.api.events.forPerson(personId)              // → GenealogyEvent[]  (via event_participants)
window.api.events.forRelationship(relId)           // → GenealogyEvent[]
window.api.events.update(id, data)                 // → GenealogyEvent | null
window.api.events.delete(id)                       // → boolean

window.api.sources.create(data)                    // → Source
window.api.sources.get(id)                         // → Source | null
window.api.sources.list()                          // → Source[]
window.api.sources.update(id, data)                // → Source | null
window.api.sources.delete(id)                      // → boolean

window.api.citations.create(data)                  // → Citation
window.api.citations.get(id)                       // → Citation | null
window.api.citations.forSource(sourceId)           // → Citation[]
window.api.citations.forEvent(eventId)             // → Citation[]
window.api.citations.forPerson(personId)           // → Citation[]
window.api.citations.forRelationship(relId)        // → Citation[]
window.api.citations.forPlace(placeId)             // → Citation[]
window.api.citations.delete(id)                    // → boolean

window.api.places.create(data)                     // → Place
window.api.places.get(id)                          // → Place | null
window.api.places.list()                           // → Place[]
window.api.places.search(query)                    // → Place[]
window.api.places.update(id, data)                 // → Place | null
window.api.places.delete(id)                       // → boolean
window.api.places.findOrCreate(name)               // → Place
window.api.places.getPath(id)                      // → Place[]  (ancestor chain)

window.api.groups.list()                           // → Group[]
window.api.groups.get(id)                          // → Group | null
window.api.groups.create(data)                     // → Group
window.api.groups.update(id, data)                 // → Group | null
window.api.groups.delete(id)                       // → boolean
window.api.groups.addLink(groupId, entityType, entityId)            // → GroupLink
window.api.groups.removeLink(linkId)                                 // → boolean
window.api.groups.removeLinkByEntity(groupId, entityType, entityId)  // → boolean
window.api.groups.getLinks(groupId)                                  // → GroupLink[]
window.api.groups.forPerson(personId)                                // → Group[]
window.api.groups.forPlace(placeId)                                  // → Group[]
window.api.groups.forMedia(mediaId)                                  // → Group[]

window.api.repositories.list()                           // → Repository[]
window.api.repositories.get(id)                          // → Repository | null
window.api.repositories.create(data)                     // → Repository
window.api.repositories.update(id, data)                 // → Repository | null
window.api.repositories.delete(id)                       // → boolean
window.api.repositories.forSource(sourceId)              // → Repository[]
window.api.repositories.linkSource(sourceId, repoId)     // → void
window.api.repositories.unlinkSource(sourceId, repoId)   // → boolean

window.api.researchTasks.list()                              // → ResearchTask[]
window.api.researchTasks.get(id)                             // → ResearchTask | null
window.api.researchTasks.forPerson(personId)                 // → ResearchTask[]
window.api.researchTasks.forPlace(placeId)                   // → ResearchTask[]
window.api.researchTasks.forMedia(mediaId)                   // → ResearchTask[]
window.api.researchTasks.create(data)                        // → ResearchTask
window.api.researchTasks.update(id, data)                    // → ResearchTask | null
window.api.researchTasks.delete(id)                          // → boolean
window.api.researchTasks.addLink(taskId, entityType, entityId) // → TaskLink
window.api.researchTasks.removeLink(linkId)                  // → boolean
window.api.researchTasks.getLinks(taskId)                    // → TaskLink[]

window.api.media.list()                                  // → Media[]
window.api.media.get(id)                                 // → Media | null
window.api.media.create(data)                            // → Media
window.api.media.delete(id)                              // → boolean
window.api.media.forEntity(entityType, entityId)         // → (Media & { link_id, link_type })[]
window.api.media.addLink(data)                           // → MediaLink
window.api.media.removeLink(linkId)                      // → boolean
window.api.media.reorder(linkIds)                        // → void
window.api.media.profilePicRef(personId)                 // → { mediaId, region } | null
window.api.media.profilePicRefs(personIds)               // → Record<personId, { mediaId, region } | null>

window.api.gazetteers.list()                              // → GazetteerInfo[]
window.api.gazetteers.import(json)                        // → { id, name, locale, nodeCount }
window.api.gazetteers.export(id)                          // → string | null
window.api.gazetteers.delete(id)                          // → boolean
window.api.gazetteers.getImported()                       // → Gazetteer[]
window.api.gazetteers.getSchema()                         // → JSON Schema object

window.api.db.getCurrent()                         // → { path: string, name: string }
window.api.db.getRecent()                          // → { path: string, name: string }[]
window.api.db.createNew()                          // → { path, name } | { canceled: true }  (Save dialog)
window.api.db.openExisting()                       // → { path, name } | { canceled: true }  (Open dialog)
window.api.db.switchTo(path)                       // → { path: string, name: string }
window.api.db.onSwitched(cb)                       // → void  (ipcRenderer.on listener)

window.api.gedcom.preview(opts?: { filePath?: string })  // → { canceled, filePath, preview: ImportPreview }
window.api.gedcom.import(opts?)                    // → import result
window.api.gedcom.export(opts?: { version?: '5.5.1' | '7.0' })  // → { exported, filePath, report } | { canceled: true }
```

## IPC Channel → API Function Mapping

| IPC Channel | API Function |
|-------------|-------------|
| `persons:create` | `persons.createPerson(db, data)` |
| `persons:get` | `persons.getPerson(db, id)` |
| `persons:list` | `persons.listPersons(db)` |
| `persons:update` | `persons.updatePerson(db, id, data)` |
| `persons:delete` | `persons.deletePerson(db, id)` |
| `persons:search` | `persons.searchPersons(db, query)` |
| `persons:addName` | `persons.addPersonName(db, personId, data)` |
| `persons:getNames` | `persons.getPersonNames(db, personId)` |
| `persons:updateName` | `persons.updatePersonName(db, id, data)` |
| `persons:deleteName` | `persons.deletePersonName(db, id)` |
| `persons:addIdentifier` | `persons.addPersonIdentifier(db, personId, data)` |
| `persons:getIdentifiers` | `persons.getPersonIdentifiers(db, personId)` |
| `persons:deleteIdentifier` | `persons.deletePersonIdentifier(db, id)` |
| `persons:createWithEvent` | `persons.createPersonWithEvent(db, data)` → `{ person, event, citation }` — atomic transaction; rolls back on any error |
| `relationships:create` | `relationships.createRelationship(db, data)` |
| `relationships:get` | `relationships.getRelationship(db, id)` |
| `relationships:list` | `relationships.listRelationships(db)` |
| `relationships:update` | `relationships.updateRelationship(db, id, data)` |
| `relationships:delete` | `relationships.deleteRelationship(db, id)` |
| `relationships:getForPerson` | `relationships.getRelationshipsOfPerson(db, personId)` |
| `relationships:search` | `relationships.searchRelationships(db, query)` |
| `eventParticipants:add` | `relationships.addEventParticipant(db, data)` |
| `eventParticipants:getForEvent` | `relationships.getEventParticipants(db, eventId)` |
| `eventParticipants:remove` | `relationships.removeEventParticipant(db, id)` |
| `events:create` | `events.createEvent(db, data)` |
| `events:get` | `events.getEvent(db, id)` |
| `events:forPerson` | `events.getEventsForPerson(db, personId)` |
| `events:forRelationship` | `events.getEventsForRelationship(db, relationshipId)` |
| `events:update` | `events.updateEvent(db, id, data)` |
| `events:delete` | `events.deleteEvent(db, id)` |
| `sources:create` | `sources.createSource(db, data)` |
| `sources:get` | `sources.getSource(db, id)` |
| `sources:list` | `sources.listSources(db)` |
| `sources:update` | `sources.updateSource(db, id, data)` |
| `sources:delete` | `sources.deleteSource(db, id)` |
| `citations:create` | `sources.createCitation(db, data)` |
| `citations:get` | `sources.getCitation(db, id)` |
| `citations:forSource` | `sources.getCitationsForSource(db, sourceId)` |
| `citations:forEvent` | `sources.getCitationsForEvent(db, eventId)` |
| `citations:forPerson` | `sources.getCitationsForPerson(db, personId)` |
| `citations:forRelationship` | `sources.getCitationsForRelationship(db, relationshipId)` |
| `citations:forPlace` | `sources.getCitationsForPlace(db, placeId)` |
| `citations:delete` | `sources.deleteCitation(db, id)` |
| `places:create` | `places.createPlace(db, data)` |
| `places:get` | `places.getPlace(db, id)` |
| `places:list` | `places.listPlaces(db)` |
| `places:search` | `places.searchPlaces(db, query)` |
| `places:update` | `places.updatePlace(db, id, data)` |
| `places:delete` | `places.deletePlace(db, id)` |
| `places:findOrCreate` | `places.findOrCreatePlace(db, name)` |
| `places:getPath` | `places.getPlacePath(db, id)` |
| `groups:list` | `groups.listGroups(db)` |
| `groups:get` | `groups.getGroup(db, id)` |
| `groups:create` | `groups.createGroup(db, data)` |
| `groups:update` | `groups.updateGroup(db, id, data)` |
| `groups:delete` | `groups.deleteGroup(db, id)` |
| `groups:addLink` | `groups.addGroupLink(db, groupId, entityType, entityId)` |
| `groups:removeLink` | `groups.removeGroupLink(db, linkId)` |
| `groups:removeLinkByEntity` | `groups.removeGroupLinkByEntity(db, groupId, entityType, entityId)` |
| `groups:getLinks` | `groups.getGroupLinks(db, groupId)` |
| `groups:forPerson` | `groups.getGroupsForPerson(db, personId)` |
| `groups:forPlace` | `groups.getGroupsForPlace(db, placeId)` |
| `groups:forMedia` | `groups.getGroupsForMedia(db, mediaId)` |
| `repositories:list` | `repositories.listRepositories(db)` |
| `repositories:get` | `repositories.getRepository(db, id)` |
| `repositories:create` | `repositories.createRepository(db, data)` |
| `repositories:update` | `repositories.updateRepository(db, id, data)` |
| `repositories:delete` | `repositories.deleteRepository(db, id)` |
| `repositories:forSource` | `repositories.getRepositoriesForSource(db, sourceId)` |
| `repositories:linkSource` | `repositories.linkSourceRepository(db, sourceId, repoId)` |
| `repositories:unlinkSource` | `repositories.unlinkSourceRepository(db, sourceId, repoId)` |
| `researchTasks:list` | `researchTasks.listResearchTasks(db)` |
| `researchTasks:get` | `researchTasks.getResearchTask(db, id)` |
| `researchTasks:forPerson` | `researchTasks.getResearchTasksForPerson(db, personId)` |
| `researchTasks:forPlace` | `researchTasks.getResearchTasksForPlace(db, placeId)` |
| `researchTasks:forMedia` | `researchTasks.getResearchTasksForMedia(db, mediaId)` |
| `researchTasks:create` | `researchTasks.createResearchTask(db, data)` |
| `researchTasks:update` | `researchTasks.updateResearchTask(db, id, data)` |
| `researchTasks:delete` | `researchTasks.deleteResearchTask(db, id)` |
| `researchTasks:addLink` | `researchTasks.addTaskLink(db, taskId, entityType, entityId)` |
| `researchTasks:removeLink` | `researchTasks.removeTaskLink(db, linkId)` |
| `researchTasks:getLinks` | `researchTasks.getTaskLinks(db, taskId)` |
| `media:list` | `media.listMedia(db)` |
| `media:get` | `media.getMedia(db, id)` |
| `media:create` | `media.createMedia(db, data)` |
| `media:delete` | `media.deleteMedia(db, id)` |
| `media:forEntity` | `media.getMediaForEntity(db, entityType, entityId)` |
| `media:addLink` | `media.addMediaLink(db, data)` |
| `media:removeLink` | `media.removeMediaLink(db, linkId)` |
| `media:reorder` | `media.reorderMediaLinks(db, linkIds)` |
| `media:profilePicRef` | `media.getPersonProfilePicRef(db, personId)` |
| `media:profilePicRefs` | `media.getPersonProfilePicRefs(db, personIds)` |
| `gazetteers:list` | `gazetteers.listGazetteers(db)` |
| `gazetteers:import` | `gazetteers.importGazetteer(db, json)` |
| `gazetteers:export` | `gazetteers.exportGazetteer(db, id)` |
| `gazetteers:delete` | `gazetteers.deleteGazetteer(db, id)` |
| `gazetteers:getImported` | `gazetteers.getImportedGazetteers(db)` |
| `gazetteers:getSchema` | `gazetteers.getGazetteerSchema()` |
| `db:getCurrent` | `getCurrentDatabasePath()` → `{ path, name }` |
| `db:getRecent` | `loadSettings().recentDatabases` → `{ path, name }[]` |
| `db:createNew` | `dialog.showSaveDialog` → `switchDatabase(path)` → broadcast `db:switched` |
| `db:openExisting` | `dialog.showOpenDialog` → `switchDatabase(path)` → broadcast `db:switched` |
| `db:switchTo` | `switchDatabase(path)` → broadcast `db:switched` |
| `gedcom:preview` | Parse GEDCOM file → `previewGedcomImport(tree)` → `{ canceled, filePath, preview }` |
| `gedcom:import` | `importGedcom(db, opts)` |
| `gedcom:export` | `exportGedcom(db, version)` → Save dialog → `{ exported, filePath, report }` |
