# Plan: Place Address Fields

## Background

The current `places` table models geographic entities hierarchically (farm → parish → härad → county → country). It has `name`, `latitude`, `longitude`, `date_from`/`date_to`, `parent_place_id`, and `notes`. It has no structured address fields.

For residence and other life-events, researchers often record a specific street address — particularly for 19th–20th century urban records, modern addresses for living relatives, or emigration destinations. Without structured address fields, the full address goes into `name` (e.g. "Tvärgatan 5, Växjö"), losing the ability to search by street or postal code, disambiguate places, or roundtrip cleanly through GEDCOM.

---

## GEDCOM-X Alignment

GEDCOM-X defines an `Address` type on `PlaceDescription`:

| GEDCOM-X field | Our column | Notes |
|---|---|---|
| `Address.street` | `street` | Street name + number, e.g. "Tvärgatan 5" |
| `Address.postalCode` | `postal_code` | e.g. "35243" |
| `Address.city` | `city` | Explicit city, may differ from `name` when `name` is a street |
| `Address.country` | `country` | Country name or ISO code, e.g. "Sverige" or "SE" |
| `Address.stateOrProvince` | — | Covered by place hierarchy (`parent_place_id`) |
| `Address.nonAdminArea` | — | Covered by `name` + `place_type` |
| `Address.value` | — | Not stored; reconstructed from fields on export |

GEDCOM-X `Address.stateOrProvince` and `Address.nonAdminArea` are redundant with this app's hierarchical model and are intentionally omitted.

## GEDCOM 5.5.1 Mapping

GEDCOM 5.5.1 has no `ADDR` on `PLAC` tags directly. The `ADDR` structure appears on the containing event (e.g. `RESI`):

```
1 RESI
  2 PLAC Tvärgatan 5, Växjö, Kronobergs län, Sverige
  2 ADDR Tvärgatan 5
    3 ADR1 Tvärgatan 5
    3 CITY Växjö
    3 POST 35243
    3 CTRY Sverige
```

**On import:** When a RESI (or other event) has both `PLAC` and `ADDR`, populate the address columns on the corresponding place record from `ADR1` → `street`, `CITY` → `city`, `POST` → `postal_code`, `CTRY` → `country`.

**On export:** If a place has `street` set, emit `ADDR`/`ADR1`/`CITY`/`POST`/`CTRY` below the event's `PLAC` tag.

---

## Schema Changes

Four new nullable TEXT columns on `places`:

| Column | Type | Example |
|---|---|---|
| `street` | TEXT | "Tvärgatan 5" |
| `postal_code` | TEXT | "35243" |
| `city` | TEXT | "Växjö" |
| `country` | TEXT | "Sverige" |

All nullable — existing places are unaffected. Added via idempotent migration guards in `initializeSchema()`, following the same pattern as the v0.4.0 places migration: check `PRAGMA table_info(places)`, then `ALTER TABLE places ADD COLUMN <col> TEXT` for each missing column.

---

## Type Changes (`src/api/types.ts`)

Add four optional fields to the `Place` interface:

```typescript
street?: string | null;
postal_code?: string | null;
city?: string | null;
country?: string | null;
```

---

## API Changes (`src/api/places.ts`)

### `createPlace`
Accept and persist the four new fields in the data parameter. Pass `null` if not provided. Add them to the `INSERT` statement and parameter array.

### `updatePlace`
Accept the four new fields in the `Partial<>` data argument. Add to the `UPDATE SET` clause, falling back to `existing.<field>` if `data.<field>` is undefined (same pattern used for all other nullable fields).

### `searchPlaces`
No change — search is on `normalized_name` which comes from `name`.

### `findOrCreatePlace`
No change — it only matches on `normalized_name` and creates with the `name` field. Address fields are populated separately via `updatePlace`.

---

## IPC Changes

None needed. The existing `places:create` and `places:update` channels forward their data argument directly to the API function. Verify `ipc.ts` does not destructure and rebuild the object in a way that would drop unknown keys.

---

## Preload

No changes. `window.api.places.create(data)` and `window.api.places.update(id, data)` already forward the full data object.

---

## MCP (`src/mcp/createServer.ts`)

Update the `inputSchema` for `add_place` and `update_place` to include the four new optional string fields:
- `street` — "Street name and number"
- `postal_code` — "Postal code"
- `city` — "City name"
- `country` — "Country name or ISO code"

---

## Vue UI (`src/renderer/views/PlaceDetailView.vue`)

Add an "Adress" section below "Place Details", with four inline-edit fields in the 2-column grid:

```
[ Street (Gata)             ] [ Postal code (Postnummer) ]
[ City (Stad)               ] [ Country (Land)           ]
```

All four fields use the existing `@blur="save({ ... })"` pattern. Add `editStreet`, `editPostalCode`, `editCity`, `editCountry` refs. Populate on `load()`. Save on blur.

### PlacePicker dropdown improvement
When a place has `city` or `postal_code` set, show them as a muted subtitle line in the dropdown for disambiguation:

```
Tvärgatan 5
  35243 Växjö             ← small muted text
```

This helps users pick the right place when two places have similar names.

---

## Implementation Steps

- [ ] **1. Schema** — add `street`, `postal_code`, `city`, `country` columns to `places` DDL in `schema.ts`; add idempotent migration block
- [ ] **2. Types** — add four optional fields to `Place` in `src/api/types.ts`
- [ ] **3. API** — update `createPlace` + `updatePlace` in `src/api/places.ts` to accept and persist new fields
- [ ] **4. MCP** — add four optional fields to `add_place` + `update_place` input schemas in `createServer.ts`
- [ ] **5. PlaceDetailView** — add "Adress" section with four `@blur`-saving inputs in the 2-column grid
- [ ] **6. PlacePicker** — show `postal_code`/`city` as a muted subtitle line in the dropdown when present
- [ ] **7. i18n** — add sv/en strings for "Adress", "Gata", "Postnummer", "Stad", "Land"
- [ ] **8. Unit tests** — in `tests/unit/places.test.ts`: create place with address fields; update address fields; verify roundtrip; `searchPlaces` still finds by name
- [ ] **9. MCP tests** — add `add_place` + `update_place` address field coverage in `tests/unit/mcp.test.ts`
- [ ] **10. Docs** — update `DATA_MODEL.md` places section, `CLAUDE.md` domain types, `MCP.md` tool input schemas, `PLAN.md`
- [ ] **11. Skills** — see below

---

## Skills to Update

- **`data-modeling`** — add `street`, `postal_code`, `city`, `country` to the places table reference; add a "Place Address" section explaining the GEDCOM-X `Address` alignment and the GEDCOM 5.5.1 `RESI.ADDR` mapping.
- **`gedcom`** — add ADDR import/export rules: `ADR1` → `street`, `CITY` → `city`, `POST` → `postal_code`, `CTRY` → `country` on the containing place record.

---

## What Is NOT in Scope

- `street2` / `street3` (GEDCOM-X multi-line street) — Swedish addresses do not use them; `notes` covers edge cases
- Address autocomplete / geocoding — out of scope; lat/lon is set manually
- Address history (which address was valid when) — covered by `date_from`/`date_to` on the place itself
- Separate `place_addresses` table — overkill for a 1:1 relationship
