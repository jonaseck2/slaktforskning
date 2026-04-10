# Usability Test Plan: Minimum-Click Family Tree Entry

## 1. Data Inventory (from GEDCOM)

### Persons (10)

| # | Name | Sex | Events | Citations | Names | Notes |
|---|------|-----|--------|-----------|-------|-------|
| 1 | Eva Linda Marie (Nord → Ahnstedt) | F | birth, name-change | 2 | 2 (birth + married) | 1 (birth note) |
| 2 | Jonas Alexander (Eckerström → Ahnstedt) | M | birth | 1 | 2 (birth + married) | — |
| 3 | Siri Alma Alexandra Ahnstedt | F | birth | 1 | 1 | — |
| 4 | Emma Wilma Eva Ahnstedt | F | birth | 1 | 1 | — |
| 5 | Stig Ingvar Raine Ahnstedt | M | birth, christening | 2 (each with page+note) | 1 | — |
| 6 | Eva Anna-Greta (Nord → Ahnstedt) | F | birth, residence | 2 | 2 (birth + married) | — |
| 7 | Gustav Erik Vilhelm Ahnstedt | M | birth, christening, death | 3 | 1 | — |
| 8 | Elsa Linnéa Astrid (Andersson → Ahnstedt) | F | birth, 3× residence, death | 5 | 2 (birth + married) | — |
| 9 | Frans Josef Nord | M | birth, christening, death | 5 (some events have 2 cites) | 1 | — |
| 10 | Karin Rosa Kristina (Holm → Nord) | F | birth, christening, 3× residence, death | 10 (many multi-cited) | 2 (birth + married) | 3 (event notes) |

### Relationships (9)

| # | Type | Persons | Event | Citation |
|---|------|---------|-------|----------|
| 1 | couple | Jonas + Linda | marriage 2017, Växjö | 1 (Muntlig) |
| 2 | couple | Ingvar + Anna-Greta | marriage 1986, Fröderyd | 1 (Muntlig egen) |
| 3 | couple | Gustaf + Elsa | marriage 1945, Hultsjö | 1 (with long transcription) |
| 4 | couple | Frans Josef + Karin | marriage 1949, Skepperstad | 1 (with transcription) |
| 5 | parent_child | Ingvar + Anna-Greta → Linda | — | — |
| 6 | parent_child | Ingvar + Anna-Greta → (Zandra, out of scope) | — | — |
| 7 | parent_child | Jonas + Linda → Emma | — | — |
| 8 | parent_child | Jonas + Linda → Siri | — | — |
| 9 | parent_child | Gustaf + Elsa → Ingvar | — | — |
| 10 | parent_child | Frans Josef + Karin → Anna-Greta | — | — |

### Sources (17 unique)

| # | Source | Used by |
|---|--------|---------|
| 1 | Muntlig källa | Linda, Siri, Emma, Anna-Greta, F1 marriage |
| 2 | Sveriges Befolkning 1980 | Jonas birth |
| 3 | Muntlig (egen) | Linda name-change, F2 marriage |
| 4 | Skepperstad C:8 (1921-1952) | Ingvar birth+chr, Anna-Greta birth |
| 5 | Skepperstad C:7 (1895-1920) | Gustaf birth+chr, Frans Josef birth+chr |
| 6 | Dödboken 1860-2016 | Gustaf death, Elsa death, Frans Josef death, Karin death |
| 7 | Hultsjö AIIa:4 (1914-1951) | Elsa birth, 3× residence |
| 8 | Skepperstad C:6 (1878-1897) | Frans Josef birth (2nd cite) |
| 9 | Muntlig (mamma) | Frans Josef death, Karin death |
| 10 | Skepperstad BI:1 (1897-1947) | Karin residence |
| 11 | Skepperstad AII:2 (1906-1914) | Karin residence |
| 12 | Norra Sandsjö AIIa:5 (1906-1915) | Karin residence |
| 13 | Norra Sandsjö BI:5 (1897-1915) | Karin residence |
| 14 | Norra Sandsjö C:4 (1897-1919) | Karin birth+chr |
| 15 | Sveriges Befolkning 1940 | Karin residence |
| 16 | Sveriges befolkning 1990 | F111 marriage (Jonas parents) |
| 17 | Skepperstad EI:2 (1940-1965) | F9 marriage |
| 18 | Hultsjö EI:2 (1930-1969) | F4 marriage |

### Places (14 unique)

| # | Place | Coordinates | Used by |
|---|-------|-------------|---------|
| 1 | Skepperstad, Jönköpings län | 57.35/14.76 | Linda, Ingvar, Anna-Greta, Gustaf, Frans Josef, Karin, F2, F9 |
| 2 | Brännkyrka, Stockholms län | 59.28/18.02 | Jonas |
| 3 | Växjö, Kronobergs län | 56.88/14.81 | Siri, Emma, F1 |
| 4 | Skärsjö säteri, Skepperstad | 57.35/14.76 | Ingvar, Gustaf (births) |
| 5 | Skepperstad Nedregård, Skepperstad | 57.35/14.76 | Anna-Greta, Karin |
| 6 | Fröderyd, Jönköpings län | 57.32/14.87 | F2 marriage |
| 7 | Hultsjö, Jönköpings län | 57.32/14.71 | F4 marriage |
| 8 | Rya, Hultsjö | 57.32/14.71 | Elsa birth+resi |
| 9 | Lönåsa, Hultsjö | 57.32/14.71 | Elsa resi |
| 10 | Högafällan, Skepperstad Övregård | 57.35/14.76 | Frans Josef birth |
| 11 | Björkelund, Grimstorp, Norra Sandsjö | 57.47/14.76 | Karin birth+resi |
| 12 | Norra Sandsjö, Jönköpings län | 57.47/14.76 | Karin chr |
| 13 | Sävsjö, Jönköpings län | 57.40/14.69 | Gustaf death, Elsa death |
| 14 | Spånga, Stockholms län | 59.39/17.91 | (Jonas parents marriage, out of scope) |

### Totals

| Entity | Count |
|--------|-------|
| Persons | 10 |
| Additional names (married/birth) | 5 |
| Sources | 17-18 |
| Places | 13-14 |
| Couple relationships | 4 |
| Parent-child relationships | 5 |
| Person events (birth, chr, death, resi, name-change) | 26 |
| Relationship events (marriages) | 4 |
| Citations (total, some events have 2) | ~35 |
| Event/person notes | ~6 |

---

## 2. Current UI Action Counts

### Action costs per operation (current UI)

| Operation | Actions | Breakdown |
|-----------|---------|-----------|
| Navigate sidebar | 1 | Click sidebar link |
| Create person | 6 | Click Add + given(1) + surname(1) + sex(1) + submit(1) |
| Navigate to person detail | 1 | Click row |
| Add birth event (no cite) | 8 | Click Add + type(1) + date-type(1) + date(1) + orig-date(1) + place(2: type+select) + submit(1) |
| Add event with 1 citation | 12 | Event(8) + checkbox(1) + source-select(1) + page(1) + submit already counted |
| Add 2nd citation to event | 5 | Open event + checkbox + source + page + submit |
| Add additional name | 8 | Click Add + given(1) + surname(1) + type(1) + submit(1) + optional fields |
| Create source | 4 | Click Add + title(1) + type-select(1) + submit(1) |
| Create source (full) | 7 | + author(1) + repository(1) + url(1) |
| Create place | 4 | Click Add + name(1) + type(1) + submit(1) |
| Create place (with coords) | 7 | + parent(1) + lat(1) + lon(1) |
| Create couple relationship | 8 | Click Add + type(1) + subtype(1) + person1-pick(2) + person2-pick(2) + submit(1) |
| Create parent_child relationship | 7 | Click Add + type(1) + person1-pick(2) + person2-pick(2) + submit(1) |
| Add marriage event to relationship | 8 | Navigate to rel detail(1) + Click Add + type(1) + date-type(1) + date(1) + orig-date(1) + place(2) |
| Add marriage with cite | 12 | + checkbox(1) + source(1) + page(1) |
| Add note to person | 3 | Navigate to detail, click field, type text |
| Add transcription to citation | 2 | Open event, fill transcription field |

### Scenario A: Person List, Bottom-Up Order (grandparents → parents → children)

This is the most natural "build the foundation first" order.

**Step 1: Create all sources (17 sources)**
- Navigate to Sources: 1
- Per source: 4 actions avg (Click Add + title + submit, some have type)
- 17 × 4 = 68
- **Subtotal: 69 actions**

**Step 2: Create all places (13 places)**
- Navigate to Places: 1
- Per place with coordinates: 7 actions (Click Add + name + type + parent + lat + lon + submit)
- Per place without coords: 4 actions
- Places with coords: ~10 places × 7 = 70
- Places without coords: ~3 × 4 = 12
- **Subtotal: 83 actions**

**Step 3: Create all 10 persons**
- Navigate to Persons: 1
- Per person: 6 actions
- 10 × 6 = 60
- **Subtotal: 61 actions**

**Step 4: Add additional names (5 persons with married/birth names)**
- Navigate to person detail: 5 × 1 = 5
- Per name: 8 actions (Click Add Name + given + surname + type + submit)
- 5 × 8 = 40
- **Subtotal: 45 actions**

**Step 5: Add person events + citations**
Person-by-person event entry:

| Person | Events | Cites | Navigate | Event actions | Cite actions | Notes | Subtotal |
|--------|--------|-------|----------|---------------|--------------|-------|----------|
| Gustaf | 3 (birth+chr+death) | 3 | 1 | 3×8=24 | 3×4=12 | — | 37 |
| Elsa | 5 (birth+3resi+death) | 5 | 1 | 5×8=40 | 5×4=20 | — | 61 |
| Frans Josef | 3 (birth+chr+death) | 5 | 1 | 3×8=24 | 5×4=20 | — | 45 |
| Karin | 6 (birth+chr+3resi+death) | 10 | 1 | 6×8=48 | 10×4=40 | 3 notes×2=6 | 95 |
| Ingvar | 2 (birth+chr) | 2 | 1 | 2×8=16 | 2×4=8 | — | 25 |
| Anna-Greta | 2 (birth+resi) | 2 | 1 | 2×8=16 | 2×4=8 | — | 25 |
| Linda | 2 (birth+namechange) | 2 | 1 | 2×8=16 | 2×4=8 | 1 note=2 | 27 |
| Jonas | 1 (birth) | 1 | 1 | 1×8=8 | 1×4=4 | — | 13 |
| Siri | 1 (birth) | 1 | 1 | 1×8=8 | 1×4=4 | — | 13 |
| Emma | 1 (birth) | 1 | 1 | 1×8=8 | 1×4=4 | — | 13 |

**Subtotal: 354 actions**

**Step 6: Create relationships**
- Navigate to Relationships: 1
- 4 couples: 4 × 8 = 32
- 5 parent-child: 5 × 7 = 35
- **Subtotal: 68 actions**

**Step 7: Add marriage events to couple relationships**
- Navigate to each relationship detail: 4 × 1 = 4
- Per marriage event with citation: 12
- 4 × 12 = 48
- **Subtotal: 52 actions**

**Step 8: Citation transcriptions**
- Many citations have lengthy transcription text
- ~20 citations with transcriptions: 20 × 3 = 60 (navigate + open + type)
- **Subtotal: 60 actions**

### TOTAL SCENARIO A: ~792 actions

---

### Scenario B: Person List, Top-Down Order (Linda first → parents → grandparents)

Same total work, but different navigation pattern:

- Create Linda first → add her events → need sources/places first anyway
- Create Jonas → events
- Create Emma, Siri → events
- Need to go back and create parents, then grandparents
- Then create all relationships pointing to existing persons

The total is approximately the same (~790-800) because:
- Same number of entities to create
- Slightly more navigation (back-and-forth between persons and detail views)
- Sources/places still need to be pre-created or created inline

**TOTAL SCENARIO B: ~810 actions** (slightly more due to extra navigation)

---

### Scenario C: Tree View with PersonPanel Sidebar

Starting from VisualizationView, using the sidebar panel:

- Navigation to add events via panel saves some clicks (no page transition)
- But person creation still requires going to Persons view (no "add person" from tree)
- Relationship creation still requires Relationships view
- Sources/places still need separate creation

**Key differences from Scenario A:**
- Panel sections need expanding (click chevron): +1 per section access
- But no full page navigation between person detail pages: saves ~10 transitions
- Panel has "Add Parent"/"Add Spouse"/"Add Child" buttons if they exist

**TOTAL SCENARIO C: ~770 actions** (marginally better due to panel quick access)

---

### Scenario D: Family-Unit Order (couple + children as a batch)

**Unit 1:** Gustaf + Elsa → create both → couple relationship → marriage → Ingvar as child
**Unit 2:** Frans Josef + Karin → create both → couple → marriage → Anna-Greta as child
**Unit 3:** Ingvar + Anna-Greta → couple → marriage → Linda as child
**Unit 4:** Jonas → couple with Linda → Emma + Siri as children

This groups related work but still requires the same total entities.
The slight advantage: when creating relationships, you just finished creating the persons, so person picker searches are faster (you know the names).

**TOTAL SCENARIO D: ~785 actions** (similar to A)

---

## 3. Optimization Proposals

### Option A: "Quick Add Related Person" (from Person Detail or Tree)

**Concept:** When viewing a person, buttons for "Add Father", "Add Mother", "Add Child", "Add Spouse" open a combined form that:
1. Creates the new person (name + sex + birth)
2. Creates the relationship
3. Optionally creates marriage event (for spouse)

**Current flow to add a child:**
1. Navigate to Persons view (1)
2. Click Add Person (1)
3. Fill given name (1)
4. Fill surname (1)
5. Select sex (1)
6. Click submit (1)
7. Navigate to Relationships (1)
8. Click Add Relationship (1)
9. Select type: parent_child (1)
10. Pick Person 1 (parent): search + select (2)
11. Pick Person 2 (child): search + select (2)
12. Click submit (1)
Total: **14 actions**

**Proposed flow:**
1. On parent's detail page, click "Add Child" (1)
2. Modal: fill given name (1)
3. Fill surname (pre-filled from parent!) (0 or 1)
4. Select sex (1)
5. Fill birth date (1)
6. Fill birth place (1, via picker)
7. Click submit (1)
Total: **6-7 actions** → **saves 7-8 actions per child**

For this tree: 5 parent-child relationships × 7 saved = **35 actions saved**

**Add Spouse variant:**
1. On person's detail page, click "Add Spouse" (1)
2. Fill given name (1)
3. Fill surname (1)
4. Select sex (auto-inferred!) (0)
5. Fill marriage date (1)
6. Fill marriage place (1)
7. Click submit (1)
Total: **6 actions** vs current **22 actions** (create person + relationship + marriage event)
Savings: **16 actions per couple** × 4 = **64 actions saved**

**Add Parent variant (existing person):**
1. Click "Add Father" or "Add Mother" (1)
2. Toggle: "Existing person" / "New person" (1 if existing)
3. Pick existing person (2)
4. Click submit (1)
Total: **4-5 actions** for existing, **6-7 for new**

### Option B: "Add Family" Wizard

**Concept:** Single multi-step form that creates an entire family unit:
- Step 1: Husband (name + sex + birth)
- Step 2: Wife (name + sex + birth)
- Step 3: Marriage (date + place + source)
- Step 4: Children (repeat: name + sex + birth, "+Add Another Child")

**Current flow for 1 family unit (couple + 2 children):**
- Create husband: 6
- Create wife: 6
- Husband birth event: 12
- Wife birth event: 12
- Create relationship: 8
- Marriage event: 12
- Create child 1: 6
- Create child 2: 6
- Child 1 birth: 12
- Child 2 birth: 12
- Parent-child rel 1: 7
- Parent-child rel 2: 7
Total: **106 actions**

**Proposed wizard:**
- Step 1 (husband): given(1) + surname(1) + birth-date(1) + birth-place(1) = 4
- Step 2 (wife): given(1) + surname(1) + birth-date(1) + birth-place(1) = 4
- Step 3 (marriage): date(1) + place(1) + source(1) = 3
- Step 4 (child 1): given(1) + sex(1) + birth-date(1) = 3
- Step 4 (child 2): given(1) + sex(1) + birth-date(1) = 3
- Submit: 1
Total: **18 actions** → **saves 88 actions per family unit**

For this tree: 4 family units (but overlapping persons), effective savings ~200+ actions

### Option C: Inline Birth During Person Creation

**Concept:** The "Add Person" modal includes optional birth date + place fields.

**Current: create person + birth event:**
- Add Person modal: 6
- Navigate to detail: 1
- Add birth event: 8-12
Total: **15-19 actions**

**Proposed:**
- Add Person modal with birth fields: given(1) + surname(1) + sex(1) + birth-date(1) + birth-place(1) + submit(1) = **6 actions**
Savings: **9-13 actions per person** × 10 = **90-130 actions saved**

### Option D: Source Session Memory

**Concept:** When adding citations, the last-used source stays pre-selected. A "Same source" button fills source + page pattern.

**Current:** For 3 events cited from same church book:
- Each citation: checkbox(1) + select-source(1) + page(1) = 3 per event × 3 = 9

**Proposed:** First citation: 3, subsequent: checkbox(1) + page(1) = 2 per event × 2 = 4
Total: **7 vs 9** → saves 2 actions

Across all citations with shared sources: saves **~10-15 actions**

### Option E: "Cite This Event" Button on Event List

**Concept:** Add citation directly from event list row without opening the full event edit form.

**Current:** Click event row → open EventForm → scroll to citations → checkbox → select → page → submit = 6 actions
**Proposed:** Click cite icon on row → mini-modal: source(1) + page(1) + submit(1) = 3 actions

Savings: **3 actions per citation** × 35 = **105 actions saved**

### Option F: Tree-Based Entry with Auto-Navigation

**Concept:** In VisualizationView, clicking an empty position (parent slot, child slot) opens the "Quick Add Related Person" form directly. After creation, the tree updates and the new person's panel opens.

**Current tree flow:**
1. See empty parent slot in tree
2. Navigate to Persons list (1)
3. Create person (6)
4. Navigate to Relationships (1)
5. Create relationship (8)
6. Navigate back to tree (1)
Total: **17 actions**

**Proposed:**
1. Click empty parent slot (1)
2. Fill name + birth (4-5)
3. Submit (1)
Total: **6-7 actions** → **saves 10-11 per tree addition**

### Option G: Batch Event Entry Mode

**Concept:** "Add Multiple Events" mode where you can enter several events in sequence without closing/reopening the modal.

**Current for 3 events:**
- 3 × (open form + fill + submit) = 3 × 10 = 30 actions

**Proposed:**
- Open once + fill first(8) + "Add Another"(1) + fill second(7) + "Add Another"(1) + fill third(7) + submit(1) = 25 actions
Savings: **5 actions for 3 events**

For Karin (6 events): saves ~10 actions. Total tree: saves ~25 actions.

### Option H: "Create from Clipboard" / Import Row

**Concept:** Paste a structured text line (e.g., "Gustaf Erik Vilhelm Ahnstedt, M, 1912-02-24, Skärsjö") and auto-parse it into person + birth event.

**Current:** 15-19 actions per person+birth
**Proposed:** Paste(1) + review(1) + submit(1) = 3 actions
Savings: **massive** but very different UX paradigm.

---

## 4. Comparative Summary

### Current totals (from Scenario A baseline: ~792 actions)

| Optimization | Actions Saved | New Total | Reduction |
|-------------|---------------|-----------|-----------|
| Baseline (no changes) | — | 792 | — |
| A: Quick Add Related Person | ~99 | 693 | 12% |
| B: Add Family Wizard | ~200 | 592 | 25% |
| C: Inline Birth in Person Create | ~100 | 692 | 13% |
| D: Source Session Memory | ~15 | 777 | 2% |
| E: Cite Event from List | ~105 | 687 | 13% |
| F: Tree-Based Entry | ~55 | 737 | 7% |
| G: Batch Event Entry | ~25 | 767 | 3% |
| A+C+D+E combined | ~319 | 473 | 40% |
| B+D+E (wizard approach) | ~320 | 472 | 40% |
| A+C+D+E+F+G (all except wizard) | ~399 | 393 | 50% |

### Most impactful (pick list)

1. **Option A (Quick Add Related Person)** — easiest to implement, biggest ergonomic win
2. **Option C (Inline Birth)** — simple form expansion, large savings
3. **Option E (Quick Cite)** — reduces friction on most tedious workflow
4. **Option B (Family Wizard)** — most dramatic but biggest implementation effort

---

## 5. Entry Order Analysis

### Order 1: Bottom-Up (grandparents → Linda → children)

**Advantages:**
- All persons exist before relationships are created (no "person not found" friction)
- Natural for experienced genealogists (work from sources chronologically)

**Disadvantages:**
- 10 separate person creation flows before any relationships
- No surname pre-fill opportunity
- Must remember/search for persons when linking

**With Quick Add (Option A):** Order barely matters since relationships auto-create persons.

### Order 2: Top-Down (Linda → parents → grandparents)

**Advantages:**
- Most intuitive for "my family" tree building
- Tree view naturally supports this (fill empty parent slots)

**Disadvantages:**
- Need to create placeholder persons or navigate away to create parents
- Without Quick Add, requires more back-and-forth

**With Quick Add (Option A):** This becomes the optimal order. Start with Linda, click "Add Father" → Ingvar, click "Add Mother" → Anna-Greta, navigate to Ingvar → "Add Father" → Gustaf, etc.

**Top-down with Quick Add estimated total:**
- Create Linda (6) + birth event with cite (12) + name-change event (12) = 30
- Add Father (Ingvar): Quick Add (7) → detail → birth+chr+cites (24+8) = 39
- Add Mother (Anna-Greta): Quick Add (7) → detail → birth+resi+cites (24+8) = 39
- Navigate to Ingvar → Add Father (Gustaf): Quick Add (7) → detail → birth+chr+death+cites (36+12) = 55
- Navigate to Ingvar → Add Mother (Elsa): Quick Add (7) → detail → birth+3resi+death+cites (48+20) = 75
- Navigate to Anna-Greta → Add Father (Frans Josef): Quick Add (7) → detail → birth+chr+death+cites (36+20) = 63
- Navigate to Anna-Greta → Add Mother (Karin): Quick Add (7) → detail → birth+chr+3resi+death+cites (56+40+6) = 109
- Add Spouse to Linda (Jonas): Quick Add (6) → detail → birth+cite (12) = 18
- Add Child to Linda (Emma): Quick Add (6) → detail → birth+cite (12) = 18
- Add Child to Linda (Siri): Quick Add (6) → detail → birth+cite (12) = 18
- Sources (pre-create 17): 69
- Places (pre-create 13): 83
- Additional names (5): 45
- **Total: ~661 actions** (vs 792 baseline = 17% reduction just from Quick Add + good order)

### Order 3: Family Unit (couple-by-couple)

**Advantages:**
- Groups related data entry (entering from same source document at same time)
- Source session memory (Option D) works best here
- Natural for entering data from church records (one parish at a time)

**Disadvantages:**
- Requires more intentional planning
- Persons appear in tree view in stages

**With Family Wizard (Option B):** This becomes very efficient but requires the wizard feature.

### Order 4: Source-Driven (enter all data from one source at a time)

**Advantages:**
- Mimics real genealogy research workflow
- Maximum benefit from source session memory
- Natural when transcribing a church book page

**Disadvantages:**
- Persons get partial data (birth from one source, death from another)
- Many revisits to same persons
- Only efficient with Quick Cite (Option E)

### Recommended order by starting point

**From Person List (current UI):**
Best order: Bottom-Up with family grouping. Create sources first, then grandparent couples with marriage, then parents, then Linda's family.

**From Tree View (current UI):**
Best order: Top-Down. Start with Linda, use "Add Parent"/"Add Spouse"/"Add Child" buttons to build outward. Requires Quick Add (Option A) to be truly efficient.

**From Tree View (with proposed optimizations):**
Best order: Top-Down with source pre-creation. Create sources first (or inline), then build tree outward from Linda using Quick Add in every direction.

---

## 6. Usability Test Design

### Test 1: Baseline (Current UI, Person List)

**Task:** Enter the complete Linda Ahnstedt family tree (10 persons, all events, citations, sources, places, relationships) starting from an empty database using the Persons list view.

**Measure:**
- Total actions to completion
- Time to completion
- Number of navigation transitions (view changes)
- Error rate (wrong data entered, need to edit)
- Frustration points (where user pauses, backtracks, or expresses confusion)

**Expected result:** ~792 actions, significant frustration around:
- Creating sources before they can be cited
- Person picker search when creating relationships
- Repetitive citation entry from same source
- No way to see tree structure while entering data

### Test 2: Baseline (Current UI, Tree View)

**Task:** Same as Test 1, but start from VisualizationView.

**Measure:** Same metrics.

**Expected result:** ~770 actions, but with different frustration:
- Cannot create persons from tree view
- Panel sections need expanding
- Better spatial awareness of tree structure
- More mouse movement between tree and panel

### Test 3: With Quick Add (Option A)

**Task:** Same family tree, using "Add Father/Mother/Child/Spouse" buttons.

**Entry order:** Top-down from Linda.

**Measure:** Same metrics.

**Expected result:** ~660 actions, significantly less frustration:
- Natural tree-building flow
- Less navigation
- Pre-filled surnames reduce typing
- But still need source/place pre-creation

### Test 4: With Quick Add + Inline Birth + Quick Cite (Options A+C+E)

**Task:** Same family tree, all three optimizations enabled.

**Measure:** Same metrics.

**Expected result:** ~470 actions (40% reduction), much smoother flow:
- Create source list first
- Build tree top-down with birth data inline
- Quick-cite from event list
- Minimal modal fatigue

### Test 5: Family Wizard (Option B)

**Task:** Same family tree using Add Family wizard.

**Measure:** Same metrics.

**Expected result:** ~472 actions, qualitatively different experience:
- 4 wizard runs cover most persons
- But person overlap (Ingvar appears in 2 families) needs handling
- May feel "too structured" for experienced genealogists

### Test Protocol

1. **Participants:** 3-5 genealogy hobbyists with varying experience
2. **Setup:** Empty database, GEDCOM printout as reference (not for import)
3. **Think-aloud:** Ask participants to narrate their thinking
4. **Screen recording:** Capture all interactions
5. **Post-task interview:** What was tedious? What was missing? What would you do differently?

### Key Metrics

| Metric | Baseline Target | Optimized Target |
|--------|----------------|-----------------|
| Total actions | ~792 | ~470 (40% less) |
| Total time | ~60 min | ~35 min |
| Navigation transitions | ~40 | ~15 |
| Modals opened | ~50 | ~30 |
| Source selections | 35 | 35 (same data) |
| Frustration events | ~15 | ~5 |

---

## 7. Implementation Priority

| Priority | Feature | Effort | Impact | Dependencies |
|----------|---------|--------|--------|-------------|
| 1 | Quick Add Related Person (A) | Medium | High (12%) | None |
| 2 | Inline Birth in Create (C) | Small | High (13%) | None |
| 3 | Quick Cite from Event List (E) | Small | High (13%) | None |
| 4 | Source Session Memory (D) | Small | Low (2%) | None |
| 5 | Tree-Based Entry shortcuts (F) | Medium | Medium (7%) | Option A |
| 6 | Batch Event Entry (G) | Medium | Low (3%) | None |
| 7 | Add Family Wizard (B) | Large | Very High (25%) | Options A, C |
| 8 | Clipboard Import (H) | Large | Very High | Parse logic |
