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
