---
name: gedcom-fidelity-registry
description: Declare round-trip GEDCOM fidelity for new schema columns. Use when modifying src/api/schema.ts (adding/removing/renaming columns), changing src/gedcom/exporter.ts or src/import/gedcom/, or when CI fails with "GEDCOM fidelity registry missing N entries". Covers the four registry status kinds (lossless, lossless-via, lossy, excluded), how to write each, and what the per-field round-trip tests assert.
---

# GEDCOM Fidelity Registry

Mechanical enforcement of the second Prime Directive in CLAUDE.md: **every authored field in the database must survive a GEDCOM 5.5.1 *or* 7.0 round-trip — or be explicitly, justifiably excluded**.

## When to invoke

- Adding a column to any `CREATE TABLE` in [src/api/schema.ts](src/api/schema.ts)
- Adding a migration (`ALTER TABLE … ADD COLUMN`)
- Renaming a column
- Modifying [src/gedcom/exporter.ts](src/gedcom/exporter.ts) or anything in [src/import/gedcom/](src/import/gedcom/)
- CI fail message starting with `GEDCOM fidelity registry missing N entries`
- A user asking "how do I add a field" — adding a column without a registry entry breaks CI

## The mechanical contract

[src/api/gedcom_fidelity_registry.ts](src/api/gedcom_fidelity_registry.ts) maps every `(table, column)` pair to a `FieldFidelity` declaring its round-trip status under GEDCOM 5.5.1 *and* 7.0:

```typescript
export const GEDCOM_FIDELITY: Record<string, FieldFidelity> = {
  'persons.sex': {
    v551: { kind: 'lossless' },
    v70:  { kind: 'lossless' },
    ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
  },
  // ...
};
```

Two CI tests enforce it:

| Test | Asserts |
|---|---|
| [tests/unit/gedcom-fidelity-registry-coverage.test.ts](tests/unit/gedcom-fidelity-registry-coverage.test.ts) | Every column in every non-exempt table has a registry entry, and every registry entry points at a real column. **Adding a column without a registry entry breaks CI.** |
| [tests/unit/gedcom-fidelity-per-field.test.ts](tests/unit/gedcom-fidelity-per-field.test.ts) | For each non-excluded entry: seed the column → export to GEDCOM → re-import → assert column equals the registry-declared expectation. |

`EXEMPT_TABLES` in `tests/helpers/gedcom_fidelity.ts` is render-only / cache-only tables (`gazetteers`, `db_settings`, `ignored_duplicates`). Don't add to it without a CLAUDE.md-cited justification.

### The registry is the export half only

The registry is keyed on `(table, column)` — it answers "does what the DB holds survive
DB → GEDCOM → DB". It cannot answer "did what the file held reach the DB at all", because
a tag that no phase reads produces no column to key on.

That is clause 1's job, and it has its own test: the importer accounts for every node in
the parsed tree, read or reported. A tag can pass the registry perfectly and still be
silently lost on import — that is exactly what happened with ArkivDigital's `_AID` and
`_ADPL` on 2026-08-23. **When adding format support, satisfy both halves.** Registry green
is not evidence the import is complete.

## The four status kinds

### `{ kind: 'lossless' }`

Column survives unchanged. Use this when both the exporter writes the value to GEDCOM *and* the importer parses it back into the same column.

```typescript
'persons.sex': { v551: { kind: 'lossless' }, v70: { kind: 'lossless' }, ownedBy: { ... } }
```

### `{ kind: 'lossless-via', mechanism: '...' }`

Survives via an indirect mechanism — XREF identity, derived re-link on import, decomposition + reassembly. Spell out the mechanism in one sentence so a future reviewer can verify.

```typescript
'event_participants.event_id': {
  v551: { kind: 'lossless-via', mechanism: 'INDI/FAM XREF cross-references' },
  v70:  { kind: 'lossless-via', mechanism: 'INDI/FAM XREF cross-references' },
}
```

### `{ kind: 'lossy', reason: '...', expectedAfterRoundTrip: (seeded, ctx?) => ... }`

Column does not survive verbatim. **You must declare what value WILL exist after round-trip** — the per-field test seeds your input, runs the round-trip, and asserts equality against `expectedAfterRoundTrip(seeded, { row })`. Returning the seeded value unchanged means "lossless in practice"; switch to `lossless` instead.

```typescript
'events.value': {
  v551: {
    kind: 'lossy',
    reason: 'GEDCOM 5.5.1 cannot carry both line value and a NOTE on the same fact for some types',
    expectedAfterRoundTrip: (seeded, ctx) =>
      ctx?.row.event_type === 'occupation' ? seeded : null,
  },
  v70: { kind: 'lossless' },
}
```

If the loss depends on other columns on the same row (event_type, date_type, etc.), use `ctx.row` to read them. The expectation is a pure function — no DB calls, no async.

### `{ kind: 'excluded', reason: '...' }`

Out of scope on purpose. Three legitimate categories:
- **Audit metadata** — `created_at`, `updated_at`, UUID PKs (re-issued on import). The shorthand constants `AUDIT_TS_EXCLUDED`, `UUID_PK_VIA_XREF`, `UUID_FK_VIA_XREF` cover most of these.
- **Render-only / cache** — values computed at read time, never persisted as authored truth. (Most of these are in `EXEMPT_TABLES` instead.)
- **Genuinely unrepresentable in the GEDCOM version** — must cite the spec section it tried to map to.

What `excluded` does **NOT** mean (per CLAUDE.md):
- "It would be hard to round-trip." Hard ≠ excluded. Use `lossy` if the loss is recorded.
- "We don't use this field much." Authored data is authored data.
- "GEDCOM 5.5.1 can't carry it but 7.0 can." That's `lossy:5.5.1-spec-limit` for v551 and `lossless` for v70.

## Workflow when adding a column

1. Update `CREATE TABLE` in [src/api/schema.ts](src/api/schema.ts).
2. Add a migration block at the end of `initializeSchema`:
   ```typescript
   const tableCols = queryAll<{ name: string }>(db, 'PRAGMA table_info(<table>)').map(c => c.name);
   if (!tableCols.includes('<col>')) {
     runSql(db, 'ALTER TABLE <table> ADD COLUMN <col> <type>');
   }
   ```
3. Update the schema-fingerprint snapshot in [tests/unit/schema-migrations.test.ts](tests/unit/schema-migrations.test.ts) `EXPECTED_COLUMNS`.
4. **Add the registry entry** before running tests:
   ```typescript
   '<table>.<col>': {
     v551: { ... },
     v70:  { ... },
     ownedBy: { exporter: EXPORTER, importer: IMPORTER_PHASES },
   },
   ```
5. If the entry is `lossless` or `lossless-via`, update [src/gedcom/exporter.ts](src/gedcom/exporter.ts) and the importer in [src/import/gedcom/](src/import/gedcom/) so the value actually survives. The per-field test will fail otherwise.
6. Run the registry tests:
   ```bash
   npx vitest run tests/unit/gedcom-fidelity-registry-coverage.test.ts \
                  tests/unit/gedcom-fidelity-per-field.test.ts \
                  tests/unit/gedcom-fidelity-golden.test.ts
   ```

## Anti-patterns

- **Marking everything `excluded` to silence CI.** Defeats the safety net. The reviewer should question any new `excluded` entry that isn't audit metadata or genuinely unrepresentable.
- **Same kind for v551 and v70 by reflex.** Most authored fields differ — 5.5.1's tag set is narrower. Think through each version separately.
- **`expectedAfterRoundTrip: () => seeded`.** Means lossless — switch the kind. The per-field test will pass either way; future readers won't.
- **Treating registry-green as import-complete.** The registry starts at the column. A
  field the importer never reads has no column and no entry, so CI stays green while the
  data is gone. Check the accounting test too.
- **Forgetting `ownedBy`.** When the per-field test fails, the failure points at the registry entry — `ownedBy` is what tells you which exporter/importer file is responsible.

## Past failures this rule was written against

The registry exists because, before it shipped, schema columns landed without round-trip consideration: `cause` was stored but never exported (silent loss on every export), `place_address` was exported but the importer dropped it on parse (round-trip wiped it). Both shipped, both passed lint and tests, both were caught by users noticing data missing after exporting and re-importing their database. The registry + coverage test mechanically prevent that class of bug — but only if you treat each new column's status as a real decision, not a box to tick.

## Reference

- [src/api/gedcom_fidelity_registry.ts](src/api/gedcom_fidelity_registry.ts) — the registry itself + the four `FidelityStatus` kinds + shorthand constants
- [tests/unit/gedcom-fidelity-registry-coverage.test.ts](tests/unit/gedcom-fidelity-registry-coverage.test.ts) — the column-coverage test
- [tests/unit/gedcom-fidelity-per-field.test.ts](tests/unit/gedcom-fidelity-per-field.test.ts) — per-field round-trip
- [tests/unit/gedcom-fidelity-golden.test.ts](tests/unit/gedcom-fidelity-golden.test.ts) — multi-table golden DB round-trip
- [docs/plans/archive/2026-05-02-gedcom-roundtrip-fidelity-design.md](docs/plans/archive/2026-05-02-gedcom-roundtrip-fidelity-design.md) — original design rationale
- CLAUDE.md "Prime Directive (cont.): Round-Trip Fidelity"
