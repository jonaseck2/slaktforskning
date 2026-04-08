---
title: GPS Workflow Gap Analysis & Implementation Plan
date: 2026-04-08
status: rejected
---

# GPS Workflow — Gap Analysis & Implementation Plan

## What is GPS? (Explain Like I'm 5)

Imagine you want to prove that your great-grandma's name was Anna and she was born in 1895.

GPS is a checklist with 5 rules:

1. **Look everywhere you can** — Don't just check one book. Check the church records, the census, the immigration papers, grandma's Bible. If you only checked Ancestry.com, you didn't look hard enough.

2. **Write down where you found each fact** — "The church book in Lund parish, page 47, says Anna was born March 3, 1895." Not just "I think she was born in 1895."

3. **Think about how good each fact is** — Did the pastor write it down the day she was born? (Great!) Or did her grandson tell someone 80 years later? (Not as reliable.) Was the record the original, or a copy of a copy?

4. **When facts fight, pick a winner and explain why** — The church book says 1895, but the census says 1893. You need to figure out which one is more trustworthy and write down WHY. You can't just ignore the one you don't like.

5. **Write it all up so someone else can follow your thinking** — Not just "Anna was born 1895" but a little essay explaining all the evidence, why you trust some sources over others, and how you reached your conclusion.

The key insight: **proof is not a document you find — it is a conclusion you build** from many pieces of evidence, carefully analyzed.


## The GPS Data Flow

The GPS process follows this chain:

```
RESEARCH QUESTION  ("Who were Anna's parents?")
       |
       v
STEP 1: EXHAUSTIVE SEARCH
  Search church books, census, emigration records...
  Log EVERY search — even ones that found nothing
  Track which source categories remain unsearched
       |
       v
STEP 2: SOURCE --> CITATION
  Source: "Lund Parish Birth Register 1890-1900"
  Citation: "Page 47, entry #12, March 3 1895"
  Classify source: Original / Derivative / Authored
       |
       v
STEP 3: INFORMATION --> EVIDENCE (Analysis)
  Extract claims from citation:
    "Anna born March 3, 1895" (primary info, direct evidence)
    "Father: Carl Nilsson" (primary info, direct evidence)
  Classify each:
    Information quality: Primary / Secondary / Indeterminate
    Evidence type: Direct / Indirect / Negative
       |
       v
STEP 4: CONFLICT DETECTION & RESOLUTION
  Census says born 1893, church says 1895
  --> Conflict detected on birth date
  --> Resolve: church record is original + primary info
               census is derivative + secondary info (self-reported)
  --> Accept church date, reject census date, explain why
       |
       v
STEP 5: WRITTEN CONCLUSION
  Simple case (no conflicts): Proof Statement or Proof Summary
    --> Auto-generated table of accepted evidence with sources
  Complex case (conflicts/indirect): Proof Argument
    --> Researcher writes narrative explaining reasoning
       |
       v
PROVEN CONCLUSION
```


## How the Current UI Maps to GPS

| GPS Element | What We Have | Status |
|---|---|---|
| 1. Exhaustive Search | Research Tasks (todo list for what to search) | Partial |
| 2. Source Citations | Sources + Citations with page, confidence, transcription | Good |
| 3. Analysis & Correlation | Assertions with evidence_type (direct/indirect/negative) | Partial |
| 4. Conflict Resolution | Conflict detection + accept/reject toggle + notes | Good |
| 5. Written Conclusion | Auto-generated proof summary table | Partial |

### What Works Well

- **Source -> Citation -> Assertion chain** is solid. You can trace any claim back to its source.
- **Conflict detection** automatically finds when two sources disagree about the same fact.
- **Accept/reject with notes** lets you record which evidence you trust and why.
- **Quality checks** flag unresolved conflicts so nothing falls through the cracks.
- **Proof summary generation** produces a table of accepted evidence per person.

### The Gaps

#### Gap 1: No Research Log (GPS Element 1)
**Problem:** Research Tasks are a to-do list ("search the church records"). But GPS requires tracking what you *actually searched* and what you found — including **negative results** ("searched 1890-1900 census, person not found"). Without this, you cannot demonstrate "reasonably exhaustive search."

**Impact:** A researcher cannot prove they looked everywhere. There is no record of searches that yielded nothing.

#### Gap 2: No Source Classification (GPS Element 3 — EAP Level 1)
**Problem:** Sources have a `source_type` field (vital_record, census, church_record...) but not the GPS classification: **Original / Derivative / Authored**. This classification is critical for weighing conflicting evidence — an original parish register outweighs a published transcription.

**Impact:** When resolving conflicts, the researcher has no structured way to record WHY one source is more reliable than another.

#### Gap 3: No Information Classification (GPS Element 3 — EAP Level 2)
**Problem:** Assertions have `evidence_type` (direct/indirect/negative) but not **information quality** (primary/secondary/indeterminate). These are different axes. A single citation can contain both primary info (death date on death certificate) and secondary info (birth date on death certificate).

**Impact:** The analysis is incomplete. You can say "this is direct evidence" but cannot record "this was told by someone who was there" vs "this was hearsay."

#### Gap 4: No Research Question Context (GPS Element 1 + 3)
**Problem:** Assertions float freely — they are attached to a citation and a subject, but not to a **research question**. GPS says evidence only exists in context of a question. The same fact is "direct evidence" for one question and "indirect evidence" for another.

**Impact:** You cannot organize evidence by research question. You cannot show "here is everything I found while trying to answer 'who were Anna's parents?'"

#### Gap 5: No Proof Argument Editor (GPS Element 5)
**Problem:** The proof summary is an auto-generated table. But GPS requires three forms of written conclusion:
- **Proof Statement** — one sentence with citation (for simple, uncontested facts)
- **Proof Summary** — table/list of agreeing evidence (approximately what we auto-generate)
- **Proof Argument** — written narrative for complex/conflicting cases

The proof argument is the most important one and it is completely missing. It is where the researcher explains their reasoning in prose.

**Impact:** The app can detect conflicts and show accepted evidence, but cannot capture the researcher's actual reasoning process.

#### Gap 6: Evidence View Does Not Guide the Workflow
**Problem:** The EvidenceView shows a flat list of all assertions. The PersonEvidenceSection shows per-person evidence. But neither view **guides the researcher through the GPS workflow**. They are data browsers, not workflow tools.

**Impact:** A researcher has to know GPS already and manually piece together the workflow. The app does not help them *do* GPS — it just stores GPS-adjacent data.


## Design: GPS-Guided Evidence Workflow

### Principle
Don't just store GPS data — **guide the researcher through the GPS process**. The UI should make it natural to follow GPS without thinking about it.

### Design Overview

Transform the Evidence view from a flat data browser into a **question-driven workflow** with 4 tabs:

```
+--------------------------------------------------------------+
|  Evidence Analysis                                            |
|                                                               |
|  [ Questions ] [ Evidence ] [ Conflicts ] [ Conclusions ]     |
|                                                               |
|  Tab 1: Research Questions                                    |
|  +--------------------------------------------------------+   |
|  | + Add Question                                          |   |
|  |                                                         |   |
|  | +-----------------------------------------------------+ |   |
|  | | Who were Anna Nilsson's parents?                     | |   |
|  | |   Person: Anna Nilsson                               | |   |
|  | |   Status: In Progress                                | |   |
|  | |   Evidence: 4 assertions, 1 conflict                 | |   |
|  | |   Search log: 6 searches, 2 pending                  | |   |
|  | |   Conclusion: Not yet written                        | |   |
|  | +-----------------------------------------------------+ |   |
|  | +-----------------------------------------------------+ |   |
|  | | When was Carl Nilsson born?                          | |   |
|  | |   Person: Carl Nilsson                               | |   |
|  | |   Status: Proven                                     | |   |
|  | |   Evidence: 3 assertions, 0 conflicts                | |   |
|  | |   Conclusion: Proof summary attached                 | |   |
|  | +-----------------------------------------------------+ |   |
|  +--------------------------------------------------------+   |
|                                                               |
|  Tab 2: All Evidence (current assertion browser)              |
|  Tab 3: Conflicts (current conflict view)                     |
|  Tab 4: Conclusions (proof summaries + arguments)             |
+--------------------------------------------------------------+
```

### Research Question Detail View

When you click a research question, you see the full GPS workflow:

```
+--------------------------------------------------------------+
|  <- Back to Questions                                         |
|                                                               |
|  Who were Anna Nilsson's parents?                             |
|  Person: Anna Nilsson  |  Status: In Progress                |
|                                                               |
|  -- Search Log --------------------------------------------- |
|  | Source Category       | Searched?  | Result               | |
|  |-----------------------|------------|----------------------| |
|  | Church birth records  | 2026-03-15 | Found: born 1895     | |
|  | Census 1890           | 2026-03-15 | Not found            | |
|  | Census 1900           | 2026-03-16 | Found: age 5         | |
|  | Emigration records    | 2026-03-16 | Found: parents       | |
|  | Court records         | --         | Not yet searched      | |
|  | Newspaper archives    | --         | Not yet searched      | |
|  | + Add search entry                                        | |
|  ------------------------------------------------------------ |
|                                                               |
|  -- Evidence ---------------------------------------------- - |
|  | Source       | Claim            | Type   | Quality        | |
|  |--------------|------------------|--------|----------------| |
|  | Church book  | Father: Carl N.  | Direct | Primary  [ok]  | |
|  | Church book  | Mother: Maria S. | Direct | Primary  [ok]  | |
|  | Census 1900  | Father: Karl N.  | Direct | Secondary      | |
|  | Emigration   | Parents: C & M N.| Direct | Primary  [ok]  | |
|  | 1 conflict: Father name spelling (Carl vs Karl)            | |
|  ------------------------------------------------------------- |
|                                                               |
|  -- Conclusion -------------------------------------------- - |
|  | Type: ( ) Statement  ( ) Summary  (x) Argument            | |
|  |                                                            | |
|  | [Text editor]                                              | |
|  | Anna Nilsson's parents were Carl Nilsson and Maria         | |
|  | Svensdotter. Three independent sources confirm this:       | |
|  | the Lund parish birth register (1895), the 1900            | |
|  | census, and the 1910 emigration record. The census          | |
|  | spells the father's name as "Karl" rather than              | |
|  | "Carl," but this is a common orthographic variation         | |
|  | in Swedish records of this period...                        | |
|  ------------------------------------------------------------- |
+--------------------------------------------------------------+
```


## Implementation Plan

### New Data Model

#### Table: research_questions
```sql
CREATE TABLE IF NOT EXISTS research_questions (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  person_id TEXT,
  status TEXT DEFAULT 'open',
  conclusion_type TEXT,
  conclusion_text TEXT,
  notes TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE SET NULL
);
```
- status: open | in_progress | proven | disproven | inconclusive
- conclusion_type: statement | summary | argument | null

#### Table: search_log
```sql
CREATE TABLE IF NOT EXISTS search_log (
  id TEXT PRIMARY KEY,
  question_id TEXT,
  source_category TEXT NOT NULL,
  repository TEXT,
  search_date TEXT,
  result TEXT NOT NULL DEFAULT 'not_searched',
  result_notes TEXT DEFAULT '',
  citation_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (question_id) REFERENCES research_questions(id) ON DELETE CASCADE,
  FOREIGN KEY (citation_id) REFERENCES citations(id) ON DELETE SET NULL
);
```
- result: not_searched | found | not_found

#### Table: question_assertions (link table)
```sql
CREATE TABLE IF NOT EXISTS question_assertions (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL,
  assertion_id TEXT NOT NULL,
  FOREIGN KEY (question_id) REFERENCES research_questions(id) ON DELETE CASCADE,
  FOREIGN KEY (assertion_id) REFERENCES assertions(id) ON DELETE CASCADE,
  UNIQUE(question_id, assertion_id)
);
```

#### Alter existing tables
```sql
ALTER TABLE sources ADD COLUMN source_classification TEXT;
-- values: original | derivative | authored

ALTER TABLE assertions ADD COLUMN info_quality TEXT;
-- values: primary | secondary | indeterminate
```

### Phase 1: Source & Assertion Classification (foundational)
Add EAP classification fields so researchers can properly analyze evidence quality.

- [ ] Schema migration: add `source_classification` to sources, `info_quality` to assertions
- [ ] API: update create/update functions for both to accept new fields
- [ ] Types: add `SourceClassification` and `InfoQuality` type unions to types.ts
- [ ] IPC + Preload: wire through (handled by existing update functions)
- [ ] MCP: update tool schemas for create/update source and create/update assertion
- [ ] UI: SourceDetailView — add source classification dropdown (Original / Derivative / Authored)
- [ ] UI: AssertionFormModal — add info quality dropdown (Primary / Secondary / Indeterminate)
- [ ] UI: PersonEvidenceSection + EvidenceView — show classification badges in rows
- [ ] i18n: add labels for en/sv
- [ ] Constants: add SOURCE_CLASSIFICATION_VALUES, INFO_QUALITY_VALUES to eventTypes.ts
- [ ] Tests: unit tests for new fields in sources and assertions

### Phase 2: Research Questions + Search Log (core GPS workflow)
Let researchers frame questions and track their search process.

- [ ] Schema: create research_questions, search_log, question_assertions tables
- [ ] API: src/api/research_questions_gps.ts — CRUD for questions, search log, assertion linking
  - createResearchQuestion, getResearchQuestion, listResearchQuestions
  - updateResearchQuestion, deleteResearchQuestion
  - addSearchLogEntry, getSearchLog, updateSearchLogEntry, deleteSearchLogEntry
  - linkAssertionToQuestion, unlinkAssertionFromQuestion, getAssertionsForQuestion
  - getResearchQuestionsForPerson
- [ ] IPC + Preload: wire all new channels under window.api.researchQuestions
- [ ] MCP tools: expose research question + search log tools
- [ ] Tests: unit tests for all CRUD + linking operations

### Phase 3: Research Question UI (the workflow view)
Build the question-driven GPS workflow interface.

- [ ] Router: add /evidence/questions/:id route for question detail
- [ ] EvidenceView refactor: add tab bar (Questions | Evidence | Conflicts | Conclusions)
- [ ] ResearchQuestionsTab component: list of questions with status, counts, person links
- [ ] ResearchQuestionDetailView: full GPS workflow view
  - Question header with status + focal person
  - SearchLogSection: table of search entries with add/edit/delete
  - QuestionEvidenceSection: linked assertions with classification badges + conflict summary
  - ConclusionSection: type selector + textarea for written conclusion
- [ ] Link assertions to questions: "Link to question" action in assertion rows
- [ ] PersonPanel / PersonDetailView: show research questions for this person
- [ ] i18n: all new labels for en/sv

### Phase 4: Proof Arguments & Conclusions (GPS Element 5)
Enable researchers to write proper GPS conclusions.

- [ ] Conclusion editor: textarea (markdown) in question detail view
- [ ] Conclusion type selector: Statement / Summary / Argument radio buttons
- [ ] Auto-populated proof summary: generate from accepted assertions (reuse generateProofSummary)
- [ ] Proof argument template: pre-fill with question, evidence list, conflict list
- [ ] Conclusions tab in EvidenceView: browse all written conclusions
- [ ] Export: proof argument as printable document (reuse report infrastructure)

### Phase 5: GPS Completeness Dashboard
Show researchers where their GPS compliance gaps are.

- [ ] GPS scorecard per question (5 elements as checkmarks):
  - Exhaustive search: any pending search log entries?
  - Complete citations: do all assertions have citations?
  - Analysis done: are assertions classified with evidence_type + info_quality?
  - Conflicts resolved: any unresolved conflicts?
  - Conclusion written: is conclusion_text non-empty?
- [ ] Dashboard widget: summary across all questions
- [ ] Integration with QualityView: GPS completeness as quality checks


## What NOT to Build

- **Don't replace Research Tasks** — they serve a different purpose (general to-do items). Research Questions are specifically about GPS proof workflow.
- **Don't force GPS on everyone** — the question-based workflow is opt-in. Researchers who don't care about GPS can keep using assertions directly.
- **Don't build a full rich text editor** — a textarea with markdown support is sufficient for proof arguments.
- **Don't auto-classify sources** — source classification (original/derivative/authored) requires human judgment. Just provide the dropdown.


## Priority & Sequencing

Phase 1 is small and foundational — do it first.
Phase 2 + 3 are the core and should be done together.
Phase 4 completes the GPS workflow.
Phase 5 is nice-to-have polish.
