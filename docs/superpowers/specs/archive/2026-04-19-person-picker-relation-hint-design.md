# PersonPicker relation + dates hint

## Goal

When the `PersonPicker` autocomplete dropdown shows multiple people with the same name (e.g. "Bengt Persson"), add a grey-italic hint next to each name so the user can tell them apart. The hint is the person's direct relationship to the tree's `default_person_id` plus birth/death years.

## Format

Examples of what the user sees in the dropdown:

```
Per Persson     parent (*1919–†1985)
Per Persson     child (*1962–)
Per Persson     partner
Per Persson     sibling (*1945–†2010)
Per Persson     godparent
Per Persson     (*1895–†1955)
Per Persson
```

- Name: rendered normally via the existing `PersonName` component.
- Hint (everything after the name): grey italic, matching the `.field-hint` / `.running-hint` style already used elsewhere (`color: var(--text-muted)`, `font-style: italic`).
- Hint parts are space-separated: `<role> (<dates>)`.
- Omit `role` if there is no direct relationship to the default person, or if `default_person_id` is unset.
- Omit `(<dates>)` if no birth or death year is known.
- If both are omitted, no hint is rendered at all — just the bare name.

## Role labels

Derived from the `relationships` table. A "direct relationship to default" means there exists a row in `relationships` where one of `person1_id`, `person2_id` is the candidate and the other is `default_person_id`.

| Relationship row | Candidate side | Role label |
|---|---|---|
| `type = 'parent_child'` | `person1_id` (the parent) | `parent` |
| `type = 'parent_child'` | `person2_id` (the child) | `child` |
| `type = 'couple'` | either | `partner` |
| `type = 'sibling'` | either | `sibling` |
| `type = 'godparent'` | either | `godparent` |
| `type = 'other'` | either | (no role shown) |

If a candidate has more than one direct relationship to default (rare — e.g. a sibling who is also a partner in an edge case, or multiple parent_child rows to the same person), pick the first one returned by SQL ordered by `relationships.created_at`. One role is enough for a hint.

### i18n keys

New keys under a fresh `picker.relation` namespace:

| key | sv | en |
|---|---|---|
| `picker.relation.parent` | förälder | parent |
| `picker.relation.child` | barn | child |
| `picker.relation.partner` | partner | partner |
| `picker.relation.sibling` | syskon | sibling |
| `picker.relation.godparent` | fadder | godparent |

## Date format

Extract year only from birth and death events.

- Birth event: the earliest `events` row with `event_type='birth'` linked to the candidate via `event_participants` with `role='primary'`, taking `SUBSTR(date_value, 1, 4)` when `date_value` is `YYYY-MM-DD` or `YYYY`.
- Death event: same rule with `event_type='death'`.

Rendering:

- Both known: `(*1919–†1985)`
- Only birth known: `(*1919–)`
- Only death known: `(–†1985)`
- Neither known: the entire `(<dates>)` segment is omitted.

Unicode characters: `*` (asterisk, U+002A) for birth, `†` (dagger, U+2020) for death, `–` (en dash, U+2013) as separator. These are stable across themes and do not require font-awesome.

## Search behaviour

Autocomplete matches on name only — no fuzzy match on role or dates. The hint is display-only.

## API changes

### `src/api/persons.ts`

Extend `searchPersons` signature and return type:

```ts
export function searchPersons(
  db: Database,
  query: string,
  relateeId?: string | null,
): (Person & {
  given_name: string;
  surname: string;
  preferred_name: string | null;
  nickname: string | null;
  relation_role: 'parent' | 'child' | 'partner' | 'sibling' | 'godparent' | null;
  birth_year: string | null;
  death_year: string | null;
})[]
```

Implementation adds three correlated subselects to the existing SELECT, each returning `NULL` when `relateeId` is null or unmatched:

```sql
SELECT p.*, pn.given_name, pn.surname, pn.preferred_name, pn.nickname,

  -- relation_role
  (SELECT
      CASE
        WHEN r.type = 'parent_child' AND r.person1_id = p.id THEN 'parent'
        WHEN r.type = 'parent_child' AND r.person2_id = p.id THEN 'child'
        WHEN r.type = 'couple'       THEN 'partner'
        WHEN r.type = 'sibling'      THEN 'sibling'
        WHEN r.type = 'godparent'    THEN 'godparent'
        ELSE NULL
      END
    FROM relationships r
    WHERE ? IS NOT NULL
      AND (
        (r.person1_id = p.id AND r.person2_id = ?)
        OR (r.person2_id = p.id AND r.person1_id = ?)
      )
      AND r.type IN ('parent_child','couple','sibling','godparent')
    ORDER BY r.created_at
    LIMIT 1
  ) AS relation_role,

  -- birth_year
  (SELECT SUBSTR(e.date_value, 1, 4)
     FROM events e
     JOIN event_participants ep ON ep.event_id = e.id
     WHERE ep.person_id = p.id
       AND ep.role = 'primary'
       AND e.event_type = 'birth'
       AND e.date_value IS NOT NULL AND e.date_value <> ''
     ORDER BY e.date_value
     LIMIT 1
  ) AS birth_year,

  -- death_year
  (SELECT SUBSTR(e.date_value, 1, 4)
     FROM events e
     JOIN event_participants ep ON ep.event_id = e.id
     WHERE ep.person_id = p.id
       AND ep.role = 'primary'
       AND e.event_type = 'death'
       AND e.date_value IS NOT NULL AND e.date_value <> ''
     ORDER BY e.date_value
     LIMIT 1
  ) AS death_year

FROM persons p
...
```

The `relateeId` appears three times in the bind params for the `relation_role` subselect; when it is null the `? IS NOT NULL` guard short-circuits the whole subselect to NULL.

### IPC

No new channel. The existing `persons:search` handler in `src/main/ipc.ts` gets an extra optional parameter and forwards it to `searchPersons`.

### `window.api.persons.search`

Signature becomes `search(query: string, relateeId?: string | null)`. Backward-compatible — existing callers omitting the arg continue to get `relation_role = null` in their results (harmless, picker is the only consumer that reads it).

## Renderer changes

### Fetch `default_person_id`

Already fetched in `App.vue` for startup navigation. Store it in a Pinia store or a simple shared composable so `PersonPicker` can read it without a round-trip per instance.

Pick the lightest option: a new `src/renderer/composables/useDefaultPerson.ts` that caches a singleton promise:

```ts
let cached: Promise<string | null> | null = null;
export function useDefaultPersonId(): Promise<string | null> {
  if (!cached) {
    cached = (window.api.db.getSetting('default_person_id') as Promise<string | null>)
      .then(v => v ?? null);
  }
  return cached;
}
export function resetDefaultPersonId() { cached = null; }
```

`PersonPicker` awaits this once on mount and re-uses the value for every search. `resetDefaultPersonId()` is called from the database switch / settings-save paths (existing code in `SettingsView.vue` / `DatabaseView.vue` — add one call there).

### `PersonPicker.vue`

1. Store `defaultPersonId` via `useDefaultPersonId()` on mount.
2. Pass it as second arg to `window.api.persons.search`.
3. Extend `PersonResult` interface:
   ```ts
   interface PersonResult {
     id: string;
     given_name: string;
     surname: string;
     preferred_name: string | null;
     nickname: string | null;
     sex: string;
     relation_role: 'parent' | 'child' | 'partner' | 'sibling' | 'godparent' | null;
     birth_year: string | null;
     death_year: string | null;
   }
   ```
4. Helper computed in the template (or a small local function):
   ```ts
   function formatHint(p: PersonResult): string {
     const parts: string[] = [];
     if (p.relation_role) parts.push(t(`picker.relation.${p.relation_role}`));
     const dateStr = formatDateRange(p.birth_year, p.death_year);
     if (dateStr) parts.push(dateStr);
     return parts.join(' ');
   }
   function formatDateRange(b: string | null, d: string | null): string {
     if (!b && !d) return '';
     const left = b ? `*${b}` : '';
     const right = d ? `†${d}` : '';
     return `(${left}–${right})`;
   }
   ```
5. Template change in the `<li>`:
   ```vue
   <span class="picker-name">
     <PersonName :given-name="person.given_name" :surname="person.surname" :preferred-name="person.preferred_name" :nickname="person.nickname" />
   </span>
   <span v-if="formatHint(person)" class="picker-hint">{{ formatHint(person) }}</span>
   <span class="picker-sex">{{ person.sex }}</span>
   ```
6. CSS:
   ```css
   .picker-hint {
     font-size: var(--font-sm);
     color: var(--text-muted);
     font-style: italic;
     margin-left: 8px;
     flex: 1;
     min-width: 0;
     overflow: hidden;
     text-overflow: ellipsis;
     white-space: nowrap;
   }
   ```
   The hint sits between name and sex badge, takes the middle flex slot, and ellipsis-truncates if a long name + long hint would overflow.

### Screen-reader narration

The existing `v-narrate` on the `<li>` only says the name. Add role and dates to it so screen-reader users hear the same disambiguation:

```vue
v-narrate="narratePerson(person)"
```

```ts
function narratePerson(p: PersonResult): string {
  const name = [p.given_name, p.surname].filter(Boolean).join(' ');
  const hint = formatHint(p);
  return hint ? `${name}, ${hint}` : name;
}
```

## Out of scope

- No kinship computation beyond 1 hop (no "grandparent", "cousin", etc.). "No direct relationship" → no role label.
- No indication of multiple simultaneous relationships — first one wins.
- No relationship-aware ranking of results (still sorted by name-match relevance).
- No changes to `MediaPanel`, `PersonMediaSection`, face-tag logic, or any consumer component. This is a pure PersonPicker enhancement — all existing callers benefit automatically.

## Testing

Unit tests in `tests/unit/persons-search.test.ts` (new file):

- `searchPersons(db, 'Per', null)` returns `relation_role: null` for every result.
- `searchPersons(db, 'Per', relateeId)` where candidate is relatee's parent → `relation_role: 'parent'`.
- Candidate is relatee's child → `'child'`.
- Candidate in `couple` with relatee → `'partner'` regardless of person1/person2 order.
- Candidate has birth event `date_value='1919-05-12'` → `birth_year: '1919'`.
- Candidate has no death event → `death_year: null`.
- Candidate has no events at all → both year fields null.
- `relateeId` with no relationship to candidate → `relation_role: null`, dates still populated.

Manual UI test:
- Tag a face on a photo where the caption has an ambiguous name.
- Confirm the dropdown shows `<name> <role> (<dates>)` for tagged persons.
- Confirm screen-reader narration includes the hint.
- Switch locale SV ↔ EN and verify role labels translate.

## Version

Minor bump on completion: `v0.120.0` → `v0.121.0` (feature).
