# Persons List: Query Optimization + Load-More Pagination

## Goal

Replace the N+1 query pattern in PersonsView (22k IPC calls for a 22k-person database) with a single JOIN query and load-more pagination, making the list view usable at any dataset size.

## Architecture

New API function returns persons with birth/death data in one SQL query using LEFT JOIN subqueries. PersonsView loads 100 persons at a time via a "Load more" button. No extra dependencies.

## New API Functions (`src/api/persons.ts`)

### `PersonListItem` type

```typescript
type PersonListItem = {
  id: string;
  sex: 'M' | 'F' | 'U';
  given_name: string;
  surname: string;
  birth_date: string | null;   // date_original from primary birth event
  birth_place: string | null;  // place name joined from birth event's place_id
  death_date: string | null;
  death_place: string | null;
}
```

### `listPersonsPage(db, limit, offset) → PersonListItem[]`

Single SQL query: persons LEFT JOIN person_names (preferred or lowest sort_order) LEFT JOIN birth event subquery (via event_participants WHERE event_type = 'birth') LEFT JOIN places for birth place LEFT JOIN death event subquery LEFT JOIN places for death place. Sorted by surname, given_name. Accepts LIMIT/OFFSET for pagination.

### `countPersons(db) → number`

`SELECT COUNT(*) FROM persons` — used for the "Showing X of Y" label.

### `searchPersonsWithDetails(db, query) → PersonListItem[]`

Same JOIN query as `listPersonsPage` but filtered by name match (LIKE on given_name or surname). No pagination — search results are always small. Replaces the existing `searchPersons` call in PersonsView only; `persons:search` IPC channel is kept for PersonPicker and other consumers.

## IPC Channels (`src/main/ipc.ts` + `src/preload/index.ts`)

| Channel | Input | Output |
|---------|-------|--------|
| `persons:listPage` | `{ limit: number, offset: number }` | `{ persons: PersonListItem[], total: number }` |
| `persons:searchWithDetails` | `{ query: string }` | `PersonListItem[]` |

`persons:listPage` calls both `listPersonsPage` and `countPersons` internally and returns them together, so PersonsView only needs one IPC call on mount.

Existing `persons:list` and `persons:search` channels are kept unchanged.

## PersonsView Changes

- On mount: call `persons:listPage({ limit: 100, offset: 0 })` and `persons:countPersons` in parallel
- State: `persons: PersonListItem[]`, `total: number`, `offset: number`, `loading: boolean`
- "Load more" button shown when `persons.length < total`; clicking appends next 100
- Shows "Showing X of Y persons" label
- **Columns**: Name, Sex, Birth date, Birth place, Death date, Death place
- **Remove**: Living column (implied by presence/absence of death date)
- Search: uses `persons:searchWithDetails`; clearing search resets to paginated list (offset 0, scroll top)

## Tests (`tests/unit/persons.test.ts`)

- `listPersonsPage` returns correct PersonListItem shape with birth/death data joined
- `listPersonsPage` respects LIMIT/OFFSET (second page returns correct persons)
- `listPersonsPage` handles person with no birth or death events (nulls)
- `countPersons` returns correct total
- `searchPersonsWithDetails` returns matching persons with joined birth/death data

## What Is Not Changing

- `listPersons`, `searchPersons` — kept for PersonPicker, RelationshipsView, and other consumers
- All other views — unchanged by this spec
- The `living` field on the `Person` domain type — kept in the DB and API, just not shown in PersonsView
