# Design spec — Incomplete & edge-case date handling (Bengt rapport 107 / 108 / 109)

Status: **design** (not yet an implementation plan). Source: beta-tester Bengt Sareld,
rapport 107 (2026-06-07), 108 (2026-06-08), 109 (2026-06-09). Triaged via
`evaluate-ux-report` 2026-06-18.

## 1. User goal

A researcher can record a date at whatever precision they actually know — only a year,
or year + month, or a full date — and across **any year GEDCOM can express** (including
years before 1000 AD and BCE dates), and:

- the date sorts correctly on the Timeline relative to other events, even when precision
  differs within the same year;
- a year-only **death** falls after that year's dated events, and a **burial/cremation**
  always follows the death — matching how a reader expects a life to read top-to-bottom;
- entering an impossible **future** year shows a gentle warning but never blocks saving.

Nothing the user authors is altered or discarded; nothing is inferred and written back.

## 2. What is already solved (do NOT rebuild)

Bengt's rapport 107 is written as a *storage-format spec* (fixed-width `ååååmmdd`, leading
blanks for years 100–999, amended to leading **zero** in 108 §1). **The app already solves
the storage-vs-display concern with a different, shipped mechanism** — and per effort
discipline + the Prime Directive we keep it, we do not adopt the fixed-width format:

| Bengt's point | Already true on HEAD |
|---|---|
| Alt 1 — full Y-M-D | ISO `YYYY-MM-DD` in `date_value`; `date_original` keeps authored text |
| Alt 2 — year + month | `DateInput.vue` accepts `"1984-05"` |
| Alt 3 — year only | accepts `"1984"` |
| 108 §1 — store padded, never show the padding | this *is* the `date_original` (authored) ÷ `date_value` (normalized/sortable) split the schema already has |
| 107 timeline main rule — incomplete sorts **before** complete same year | `"1936" < "1936-02-15"` lexicographically — already the behavior |
| 107 Undantag 2 — birth first | renderer tie-break gives `birth` priority 0; incomplete birth also sorts first by string order |

`src/api/schema.ts` (`events.date_type`/`date_value`/`date_value_end`/`date_original`),
`src/gedcom/date.ts` (`parseGedcomDate`/`formatGedcomDate`),
`src/renderer/components/DateInput.vue`.

## 3. GEDCOM grounding (the binding constraint)

User directive at triage: *"follow GEDCOM here, don't invent something that breaks GEDCOM
compatibility, ever."* So the supported year range is **exactly what the GEDCOM date
grammar expresses**, not an arbitrary cutoff:

- GEDCOM 5.5.1 year = digits, **no 4-digit restriction** (`999`, `44`, `7` are valid);
  BCE via the `B.C.` suffix; dual year `1699/00`.
- GEDCOM 7.0 = calendar-aware; epoch `BCE` (e.g. `BCE 44`); default GREGORIAN.

Current `parseDate` in `src/gedcom/date.ts:6-18` only matches `^\d{4}$` / `MON \d{4}` /
`DD MON \d{4}`. Consequences today:

- A 3-digit year (`999`) or a BCE date falls through to `date_type:'unknown'`,
  `date_value: null`. **Round-trip is still safe** — `date_original` carries the verbatim
  GEDCOM string and `formatGedcomDate` prefers it (`date.ts:120`). The loss is **sort +
  timeline placement only**: no `date_value` ⇒ the event lands in the "undated" bucket.
- When `date_value` *is* a variable-width year, lexicographic sort is wrong:
  `"999" > "1000"` because `'9' > '1'`.

Registry: `events.date_value` is `lossless-via: reformatted via formatGedcomDate /
parseGedcomDate` (both versions) — `src/api/gedcom_fidelity_registry.ts:428`. Any change
that lets `date_value` hold pre-1000/BCE values must keep that round-trip green (see §6).

## 4. Decisions taken at triage

- **Future years (Q1): warn but allow.** Non-blocking inline warning on `DateInput.vue`;
  never reject the save. Consistent with the Prime Directive's "don't prevent authored
  input" stance. Bengt's literal "hård avvisning" is *not* adopted.
- **Year range (Q2): whatever GEDCOM expresses.** No `100–999` cutoff invented. Pre-1000
  and BCE are in scope precisely because GEDCOM models them; the work is making the
  internal **sort key** correct for that full range without ever breaking round-trip.

## 5. The genuine gaps (the design surface)

### Theme A — sortable date_value across the full GEDCOM range

A1. **Relax `parseDate`** so a GEDCOM-expressible year of any width (and BCE) yields a
    `date_value` instead of `null`. This is the *documented mapping* extended, not
    inference — same status as `"1845" → "1845"` in the gedcom skill's date table.

A2. **Render/query-time sort key.** Introduce a pure function that maps a `date_value`
    (`"999"`, `"1984-05"`, BCE form) to a totally-ordered, zero-padded sortable string —
    e.g. `999 → "0999"`, BCE negative ordering ahead of year 1. **Computed on demand,
    persisted never** (Prime Directive). This replaces the raw lexicographic `<`/`>` at
    both sort sites (§ Theme B). This is Bengt's "leading zero that is never shown" — but
    as a *sort key*, not a stored value.

A3. **Future-year warning** in `DateInput.vue` — inline, non-blocking, i18n key.

A4. **(minor)** Alt 4 affordance — when a user has month/day but no year, the date field
    can't represent it; signpost "describe in the note field." Low priority; can drop to a
    separate polish item.

### Theme B — Timeline ordering of incomplete dates

B1. **Reconcile the two sort sites.** API `src/api/report_data/timeline.ts:463` sorts raw
    lexicographic with **no** type priority; renderer
    `src/renderer/components/PersonTimeline.vue:293` adds birth/death/burial priority but
    **only on exact string ties**. Decide one authoritative comparator (recommend: the API
    produces the sort key + the biological-order rank; renderer trusts it) and remove the
    divergence.

B2. **Death-with-incomplete-date sorts after the year's complete-dated events**
    (107 Undantag 1). `"1936"` death must fall *after* `"1936-02-15"` residence.

B3. **Burial/cremation always follows death** (109). Target order for
    {death `1936`, residence `1936-02-15`, burial `1936-10-02`}:
    `residence → death → burial`. So burial sorts by its own complete date *unless* that
    would place it before the death, in which case death-then-burial is forced. This is a
    biological-order fallback (birth → … → death → burial/cremation) applied **only** when
    date precision can't decide the order. Bengt notes it fires "ytterst sällan" — correct,
    but it's the difference between a sensible and a nonsensical life-page.

## 6. GEDCOM round-trip impact (must stay green)

- `formatGedcomDate` already prefers `date_original`, so **imported** pre-1000/BCE dates
  round-trip unchanged regardless of A1/A2.
- The new surface is **UI-authored** pre-1000/BCE dates (no `date_original`):
  `formatGedcomDate` must emit a valid GEDCOM date for them (5.5.1 `B.C.` / 7.0 `BCE`).
- The three fidelity tests must stay green: `gedcom-fidelity-registry-coverage`,
  `gedcom-fidelity-per-field`, `gedcom-fidelity-golden`. Add per-field cases for a
  3-digit year and a BCE year. No new schema column ⇒ no new registry entry; but the
  `events.date_value` mechanism note may need updating if the parse rule changes.

## 7. Verification (for the eventual implementation plan)

1. **Sort key unit tests** (`src/api/`): `"999"` sorts before `"1000"`; `"1936"` (year)
   sorts after `"1936-02-15"` for a death event; BCE before year 1; year+month between
   adjacent months.
2. **Timeline comparator tests**: the rapport-109 example
   ({death 1936, residence 1936-02-15, burial 1936-10-02}) renders as
   residence → death → burial. Birth-first and incomplete-before-complete still hold.
   A single authoritative comparator — assert the two sites agree.
3. **GEDCOM round-trip**: seed an event with `date_value="0999"`-class and a BCE date with
   **no** `date_original`; export → re-import → `date_value` preserved; all three fidelity
   tests green.
4. **DateInput warning** (component test): a future year shows the warning and the save
   still succeeds (value persisted).
5. **e2e** (`[panels]` / timeline): the rapport-109 ordering visible on a real person page.

User-goal-falsifiability check: if 1–5 pass, can the goal still be unmet? The Alt-4
affordance (A4) is the only part not covered — flagged as droppable / separate polish.

## 8. Explicitly closed (not now)

- **Bengt's fixed-width `ååååmmdd` storage format** — superseded by the existing
  `date_original` ÷ `date_value` split (§2). Reopen only if that split is ever removed.
- **107 C/D as a *separate* concern** — "years 0–99" and "BCE" are *not* closed; they're
  folded into "follow GEDCOM" (§4 Q2). What's closed is treating them as a bespoke
  blank-padding scheme.

## 9. Reply to Bengt (draft — Tier 3, do not send without the user)

> Tack Bengt — rapport 107–109 är genomarbetade. Goda nyheter: det mesta av 107 är redan
> löst, fast på ett annat sätt än du föreslår. Appen lagrar redan ofullständiga datum
> (bara år, eller år + månad) och håller den autorerade texten separat från den
> sorterbara formen — så din "inledande nolla som aldrig visas" (108 §1) finns redan, som
> en intern sorteringsnyckel. Vi inför därför ingen fast teckenbredd.
>
> Det vi tar tag i: (1) år före 1000 och f.Kr. ska sortera rätt och visas i tidslinjen —
> vi följer GEDCOM:s egen datumgrammatik så att inget bryter kompatibiliteten; (2)
> tidslinjeordningen för din döds-/begravningsregel (107 undantag 1 + 109) — bostad → död
> → begravning även när dödsdatumet bara är ett årtal. (3) Framtida årtal: vi visar en
> varning men blockerar inte — en del forskare noterar förväntade händelser.
>
> Din 107 Alt 4 (månad/dag utan år) hänvisar vi tills vidare till anteckningsfältet.
