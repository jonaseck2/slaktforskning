# Design spec: Per-row registration history (created / updated visibility)

**Date:** 2026-05-05
**Status:** Design — needs user decision before implementation
**Source:** Beta tester report 65 (v0.215.2)

## User goal

See, for any person (and ideally any entity), when the row was created and when it was last changed. The user's primary use is the created-at timestamp — Holger surfaces it and the user has found it useful for orientation. Last-modified is less useful but cheap to surface alongside.

The user proposed a deeper change-log option (per-action diff log, suitable for multi-user collaboration). They flagged that themselves as possibly overengineered.

The user's words (translated, condensed): *"I find no info about when a person was registered. … In Holger, the date when the post was created and last changed are shown. The latter I rarely use. But one could imagine a full change log. Or is that overworked? If multiple people work against the database it could have great value … decide together with Linda what level this should have. I tend to overdo things."*

## The decision

Three levels of ambition. Pick the lowest that satisfies the user goal; treat the next two as separate plans.

### Level 1 — show what we already store (recommended for now)

The schema already has `created_at` and `updated_at` on every entity (per `.claude/rules/api.md`). Nothing to add at the data layer. Just expose them.

**Where to surface:**
- **PersonPanel** — small footer row at the bottom of the panel: `Registrerad 2024-03-15 · Senast ändrad 2025-08-22` (locale-formatted dates, hover for full timestamp via `title`).
- **Every other EntityPanel** — same treatment, same location.
- **PersonsListTab** — optional sortable column "Registrerad" (off by default, user can enable in a settings toggle if we want, or simply add it). For consistency with the user's id plan (report 63), this column would let them walk persons in registration order even without a `display_id`.

**Estimated effort:** small (~1 day). One CSS pattern + one date-format helper + i18n keys, applied to every panel.

### Level 2 — full change log (the user's "could imagine" tier)

A new `audit_log` table:

```sql
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  user_name TEXT,                    -- from db_settings researcher_name
  entity_type TEXT NOT NULL,         -- 'person' | 'place' | ...
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,              -- 'create' | 'update' | 'delete' | 'merge'
  field_name TEXT,                   -- which field for updates
  old_value TEXT,                    -- JSON or string
  new_value TEXT,                    -- JSON or string
  occurred_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  notes TEXT
);
```

Every CRUD function in `src/api/` writes one row per mutation. Indexed on `(entity_type, entity_id, occurred_at)` for per-entity timelines.

**Visibility:**
- **EntityPanel** — collapsible "Historik" section showing this entity's audit rows newest-first.
- **Settings → History** — global view with filter (user, entity type, date range).

**Cost:**
- Every mutation gets an extra `INSERT` (cheap inside the existing transaction).
- Storage grows ~linearly with edits. Manageable; offer a "trim to last N months" admin action eventually.
- Round-trip directive: `audit_log` is `excluded:internal-audit` in `gedcom_fidelity_registry.ts` — it's app-internal metadata, not authored data about the family.

**Estimated effort:** medium (~3–5 days). Touch every CRUD function. Risky surface area; needs careful test coverage.

### Level 3 — full mechanical reproducibility (user's "overambitious")

Audit log so complete that it can replay every action to reconstruct DB state. Effectively event sourcing on top of CRUD. **Out of scope for this plan family.** Reasonable systems don't ship this without first hitting Level 2's limits.

## Recommended sequence

1. **Ship Level 1 now** as a small plan. The user said they'd be "satisfied to see registration date" — Level 1 satisfies the stated goal.
2. **Decide on Level 2** after Level 1 ships, based on whether the user actually needs more. Multi-user is hypothetical today (single-machine SQLite, no sync). Don't pay Level 2's cost without a confirmed user.
3. **Defer Level 3** indefinitely.

## Open questions for the user

- Confirm Level 1 is enough for now? (Default: yes.)
- For Level 1, surface in PersonPanel only, or every panel? (Default: every panel — pattern migrations are all-or-nothing per renderer rules.)
- For Level 1, also add a "Registrerad" sortable column in PersonsListTab? (Default: yes, minor effort, satisfies the "walk the database in creation order" use case from report 63.)

The Level 1 implementation plan ships as `2026-05-05-registration-history.md` once the user confirms scope.
