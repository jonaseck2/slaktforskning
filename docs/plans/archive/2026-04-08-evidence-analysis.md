# Research: Evidence Analysis & Genealogical Proof Standard

> Research document informing the unified "Evidence Analysis" roadmap milestone.
> Consolidates: Research Tools, Evidence Model & Source UX, Assertion GEDCOM Export.

---

## Background

The app's tagline promises **research-grade data model** with proper source - citation - assertion separation. The schema already has an `assertions` table (created at startup, no API/UI). Three separate roadmap items touch this area — this document unifies them into one coherent feature.

### What We Have Today

| Layer | Status |
|-------|--------|
| **Sources** | Full CRUD, SourceDetailView, GEDCOM roundtrip |
| **Citations** | Full CRUD, linked to events/persons/relationships/places, CitationBadge on events, edit modal |
| **Mention events** | Person-level sourcing flows through events (v0.15.0) |
| **Assertions table** | Schema exists, zero API/UI — `citation_id, subject_type, subject_id, attribute, value, value_original, confidence, is_accepted, notes` |
| **Research tasks** | Full CRUD + UI, per-person or general |
| **Quality checks** | 26 checks including unsourced entity detection |

---

## The Genealogical Proof Standard (GPS)

Five elements defined by the Board for Certification of Genealogists:

1. **Reasonably exhaustive search** — check all relevant sources, not just the first hit
2. **Complete and accurate citations** — every piece of information traceable to its source
3. **Analysis and correlation of evidence** — assess quality (original/derivative, primary/secondary, direct/indirect/negative)
4. **Resolution of conflicting evidence** — contradictions must be explained, not ignored
5. **Soundly reasoned, coherently written conclusion** — a proof summary or argument

### The Evidence Pipeline

```
SOURCE -> INFORMATION -> EVIDENCE -> CONCLUSION
```

- **Source**: A document, record, or artifact. Original or derivative.
- **Information**: A statement extracted from a source. Primary (firsthand knowledge) or secondary (hearsay).
- **Evidence**: Information applied to a research question. Direct (answers explicitly), indirect (requires inference), or negative (expected info absent).
- **Claim/Assertion**: What a specific source says — may be wrong. "The 1880 census says born Ohio circa 1838."
- **Conclusion**: What the researcher decides after weighing all claims. One conclusion, potentially many competing claims.

**Critical insight**: Most genealogy software conflates claims and conclusions. When you enter a birth date, it's treated as a conclusion, but there's no mechanism to record competing claims or reasoning.

---

## How Other Apps Handle This

### FamilySearch / GEDCOM-X (most rigorous model)

GEDCOM-X separates "evidence persons" (extracted from sources) from "conclusion persons" (your tree). Each fact on a conclusion person has:
- `confidence` (HIGH/MEDIUM/LOW)
- `analysis` reference to a Document of type ANALYSIS (the proof argument)
- `sources[]` array of evidence references

**In practice on FamilySearch.org**: Simplified. Multiple sources can be attached to facts, but there's no structured way to record conflict resolution — last editor wins. The evidence/conclusion split exists in the API but isn't exposed to typical users.

### Evidentia (dedicated GPS tool — most instructive)

The only app built specifically for evidence analysis:
1. Enter a source with citation details
2. Extract individual **claims** from that source ("this document says X about person Y"), tagged with information quality and evidence type
3. Group claims into **analysis tables** per research question ("What is person X's birth date?")
4. Write a **conclusion** resolving the claims — which accepted, which rejected, and why
5. Export as proof summary document (PDF/Word)

**Key insight**: Evidentia exists precisely because no genealogy database handles evidence analysis natively. It's a companion tool. On GEDCOM export, only final conclusion values survive — all claim-level analysis is lost.

### RootsMagic, Family Historian, Gramps

All follow the same basic pattern:
- Source -> Citation -> Fact chain
- Multiple citations can attach to one fact
- Citations have quality/confidence fields
- **No structured place to record conflict resolution** — the "resolved" value is whatever the user typed
- Notes fields serve as the unstructured analysis container
- Research logs/tasks are flat text, not structured

### Ancestry.com

- Yellow alert icon when records conflict — user "resolves" by choosing a value
- No audit trail of resolution
- Optimized for casual users who attach records, not analyze them

### Summary: Nobody Does This Well

| App | Source tracking | Claim extraction | Conflict detection | Resolution recording | Proof arguments |
|-----|:---:|:---:|:---:|:---:|:---:|
| Evidentia | Yes | **Yes** | **Yes** | **Yes** | **Yes** |
| FamilySearch (API) | Yes | Partial | No | No | Partial |
| RootsMagic | Yes | No | No | No | No |
| Family Historian | Yes | No | Visual only | No | No |
| Gramps | Yes | No | No | No | No |
| Ancestry | Yes | No | Visual only | No | No |
| **Slaktforskning (goal)** | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** |

This is genuinely differentiating territory. No integrated desktop genealogy app does evidence analysis natively.

---

## How It Fits GEDCOM-X

Our existing assertion schema maps cleanly to GEDCOM-X concepts:

| Our Schema | GEDCOM-X Equivalent |
|---|---|
| `assertions.attribute` + `value` | Fact.type + Fact.date/place/value on an evidence-Person |
| `assertions.value_original` | Evidence-Person's fact value (preserved as-is from source) |
| `assertions.confidence` | Conclusion.confidence on the evidence fact |
| `assertions.is_accepted` | Whether the conclusion-Person's fact references this evidence |
| `assertions.notes` | Conclusion.notes or the analysis Document |
| `citations` | SourceReference on a Conclusion |

### What's Missing vs GEDCOM-X

1. **Proof argument / analysis document** — GEDCOM-X has Document type ANALYSIS linked from Conclusion.analysis. We need a place for written conclusions that ties multiple assertions together. Could be:
   - A `notes` field on a dedicated "proof" entity
   - Or simply a structured note on the person/event itself, flagged as analysis

2. **Evidence classification** — GEDCOM-X doesn't formalize direct/indirect/negative, but serious genealogists want it. Optional field on assertions.

---

## Import/Export Implications

### GEDCOM 5.5.1 / 7.0

**Assertions cannot be round-tripped through either GEDCOM version.** Neither has:
- A place for claim-level data separate from fact values
- A way to mark evidence as accepted/rejected
- A structured analysis field

What survives: concluded fact value, source citations with QUAY, unstructured notes.
What's lost: individual claims, evidence classification, acceptance status, proof arguments.

GEDCOM 7.0 added CONF on citations but still no evidence analysis structures.

### Custom Extension Tags (current plan)

The existing roadmap item proposed custom `0 @Ax@ _ASSN` records. This works for round-tripping within our own app but:
- No other app will read them
- Adds complexity to the exporter/importer
- Value is limited to backup/restore scenarios (which we already handle via SQLite backup)

**Recommendation**: Deprioritize custom GEDCOM assertion export. The value of assertions is internal to the researcher's workflow. SQLite backup preserves them. If GEDCOM-X JSON ever gains traction as an interchange format, the mapping is straightforward.

### GEDCOM-X JSON Export (future option)

- The only specification that can preserve the full evidence pipeline
- No major desktop app imports/exports it yet
- FamilySearch uses it internally but exports GEDCOM 7.0
- Worth supporting eventually as a lossless export, but not blocking

---

## User Workflow Analysis

### Who Actually Uses This?

| Level | ~% of users | Behavior |
|---|---|---|
| No sources | 30-40% | Names and dates only |
| Source attachment | 40-50% | Attach records but don't analyze conflicts |
| Informal analysis | 10-15% | Notice conflicts, resolve mentally, add notes |
| Formal GPS | 3-5% | Full evidence pipeline, proof arguments |

### What Users Actually Want (practical priority)

1. **See conflicting information** — "These 3 sources say different things about this birth date" — **this is the killer feature**
2. **Mark which one I chose** — Accept/reject per claim
3. **Remember why** — A text note explaining the choice
4. **Don't lose the rejected data** — Original claim values preserved
5. **Research planning** — What sources haven't I checked yet? (already have research tasks)
6. **Proof summaries** — Written argument documents (serious researchers only)

What they do NOT want:
- Formal ontology of evidence types for every citation
- To classify every piece of information as direct/indirect/negative before saving
- Friction on the happy path (most data entry is uncontested)

### How This Differs From Other Apps

**Key difference: assertions are optional, not required.** The existing workflow (add event -> attach citation) continues to work exactly as today. Assertions add a deeper analysis layer that users can engage with when they encounter conflicts or want to document their reasoning.

**The 90/10 split**: 90% of the time, a citation on an event is sufficient. The user found a birth record, attached it, done. The assertion layer activates for the 10% of cases where sources disagree, the researcher wants to record their reasoning, or they're building a proof argument.

---

## Proposed Architecture

### Phase 1: Assertion CRUD + Conflict Detection (core)

Add API/IPC/MCP for assertions. Auto-detect conflicts (same subject + attribute, different values). Surface conflicts in QualityView.

**Schema change**: Add one optional column to the existing assertions table:

```sql
ALTER TABLE assertions ADD COLUMN evidence_type TEXT;
-- CHECK: 'direct' | 'indirect' | 'negative' | null
```

**API functions** (new file `src/api/assertions.ts`):
- `createAssertion(db, { citation_id, subject_type, subject_id, attribute, value, value_original?, confidence?, is_accepted?, evidence_type?, notes? })`
- `getAssertionsForSubject(db, subject_type, subject_id)` — all claims about an entity
- `getAssertionsForAttribute(db, subject_type, subject_id, attribute)` — competing claims for one field
- `getAssertionsForCitation(db, citation_id)` — what does this citation claim?
- `updateAssertion(db, id, updates)`
- `deleteAssertion(db, id)`
- `getConflicts(db)` — pairs/groups where same subject+attribute have different values

### Phase 2: Assertion UI — View & Resolve Conflicts

**Per-event evidence summary** (the key UX innovation):
- On EventList rows, a new icon/badge when assertions exist
- Click to expand: shows all assertions for that event's attributes side by side
- Accept/reject toggle per assertion
- Notes field for reasoning
- Conflict highlight when values differ

**Per-person evidence overview** (PersonDetailView section):
- "Evidence Analysis" section showing all assertions grouped by attribute
- Conflict indicators: birth date has 2 competing claims, death place has 3
- Quick navigation to the source/citation for each claim

**Assertion entry points**:
- From CitationBadge -> "What does this citation claim?" -> create assertions
- From event row -> "Add evidence" -> create assertion linked to citation + event attribute
- From SourceDetailView -> when viewing a citation, "Extract claims" button

### Phase 3: Research Audit & Proof Summaries

**Research audit view** (extends QualityView):
- All unsourced entities ranked by evidence gap (partially exists in quality checks)
- Entities with unresolved conflicts highlighted
- Per-person "evidence completeness" score

**Proof summary** (for serious researchers):
- Per-person or per-question text document
- Auto-populated template: lists all assertions, sources, accepted/rejected status
- Editable narrative section for the researcher's written argument
- Exportable as text (could be a research task with structured result)

### Phase 4: Merge/Deduplicate Persons

- Detect potential duplicates (same name + similar dates)
- Side-by-side comparison view
- Merge: combine assertions, citations, events, names — resolve conflicts
- Naturally uses the assertion infrastructure for conflict resolution

---

## What NOT to Build

- **Mandatory assertion entry** — assertions must never be required to save data
- **Evidence type classification as required field** — make it optional, default null
- **Complex assertion ontology** — keep it flat: subject + attribute + value
- **GEDCOM assertion export** (initially) — internal feature, SQLite backup preserves it
- **Separate "evidence persons"** a la GEDCOM-X — too complex, our assertion model achieves the same goal more simply

---

## Comparison: Before and After

### Before (current)
1. Find a source -> create citation -> attach to event (works)
2. Find a conflicting source -> create another citation -> attach to same event (works)
3. But: no way to see what each citation claims, no way to mark which is correct, no audit trail

### After (with assertions)
1. Find a source -> create citation -> attach to event (unchanged)
2. Optionally: extract claims from citation -> create assertions
3. Find conflicting source -> create citation + assertions
4. View all assertions side by side for the same attribute
5. Mark one as accepted, note why
6. Quality checks flag unresolved conflicts
7. Proof summary auto-generates from accepted assertions + notes