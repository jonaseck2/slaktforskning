# Competitor Gap Analysis — Släktforskning

Date: 2026-04-11

## Competitive Landscape Summary

The desktop genealogy market splits into three tiers:

**Paid desktop apps** (RootsMagic $30, MacFamilyTree $40, Family Historian $50) compete on polish, printing, and cloud platform integrations (TreeShare with Ancestry/FamilySearch). Their moat is convenience for users already invested in those ecosystems.

**Open source desktop** is essentially Gramps alone — powerful, extensible via Python plugins, but showing its age (GTK UI, steep learning curve, no built-in AI story). Gramps Web adds a self-hosted layer but is a separate project.

**Web/cloud platforms** (Ancestry, MyHeritage, FamilySearch, webtrees) compete on record databases, DNA, and collaboration. They require accounts and often subscriptions.

**Släktforskning occupies a gap nobody else fills:** open source, modern UI (Electron/Vue), local-first with no account, research-grade source model, and native AI agent integration via MCP. The closest competitor is Gramps, but the technology stack and UX philosophy are fundamentally different.

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Cloud connectivity | No cloud, export-only | Maximum simplicity and privacy. Users share via PDF, GEDCOM, static HTML. Cloud sync through file system abstractions (iCloud/Dropbox) by keeping file structure predictable. |
| Target audience | Serious researchers + Swedish/Nordic genealogists (primary), casual family historians (secondary via outputs) | Research tool first, storytelling layer on top of solid data. |
| AI integration model | MCP for all AI features, no in-app cloud AI | Keeps app lean, no vendor lock-in. AI photo features via agents, not built-in. |
| Media philosophy | Entity-oriented, not file-oriented | Media items show what they link to, support multiple entity links. Not a photo organizer. |
| Collaboration model | File exchange with import/merge workflow | No accounts, no sync infrastructure. GEDCOM + portable archives for data exchange. |
| Exclusions | DNA tools, record search/hints, AI photo manipulation, mobile app, cloud sync, TreeShare-style API sync | Out of scope — either cloud-dependent, requires partnerships, or different platform. |

---

## Feature Gap Matrix

| Category | Competitors | Släktforskning Today | Status |
|----------|-------------|---------------------|--------|
| Core data model | Person, family, events, sources, citations | Same + places, groups, research tasks, repositories | **Ahead** |
| Source/citation model | Most have basic source attachment | Source → Citation with confidence levels, link rules auto-linking | **Ahead** |
| Quality checks | Gramps has plugins; RootsMagic has basic validation | 26 built-in checks, ignore/restore, per-person and global views | **Ahead** |
| AI integration | MyHeritage: cloud photo AI. Others: none. | MCP server with 80+ tools, agent can read/write all data | **Ahead** |
| Charts | Pedigree, hourglass, fan, descendant, wall-sized | Pedigree, hourglass, circle chart, collapsible nodes, infinite expansion | On par |
| Wall charts | RootsMagic, Legacy, MacFamilyTree: large-format print | Not yet | **Gap** |
| Media viewer | RootsMagic: gallery view. Gramps: cropping/regions. MacFamilyTree: lightbox | File table with ordering, profile pictures | **Gap** |
| Media portability | Gramps: .gpkg bundles media+data | GEDCOM media export (references only, not bundled) | **Gap** |
| Face/region tagging | Gramps: crop region → link to person. MyHeritage: auto face detection (cloud). | Not yet | **Gap** |
| Reports/books | RootsMagic/Legacy: narrative reports, book publishing center, PDF export | Ancestor chart, family group sheet, summary PDF | **Gap** (narrow report set) |
| Narrative/story output | Legacy: Publishing Centre (chapters, cover). Storied: storytelling focus. | Not yet | **Gap** |
| CSV export | Gramps: yes. Most others: no. | Not yet | Minor gap |
| Import formats | GEDCOM universal. RootsMagic imports from 10+ programs. | GEDCOM 5.5.1/7.0, Genney, Holger | On par for open source |
| GEDCOM robustness | Family Tree Maker notoriously lossy. RootsMagic solid. Gramps extensive. | Good with validation report, room for edge cases | Needs hardening |
| Plugin/addon system | Gramps: Python plugin API, 100+ community addons | MCP tools (agent-extensible, not user-installable plugins) | Different approach |
| i18n | Gramps: 40+ languages. MacFamilyTree: 15+. | Swedish + English | Acceptable for target audience |
| Undo/redo | Universal in paid apps, Gramps has it | Not yet | **Gap** |
| Timeline view | Several competitors have person timelines | Not yet | **Gap** |
| Place mapping | Most have map integration (Google/OpenStreetMap) | Places with lat/lon but no map view | **Gap** |
| Multi-database | RootsMagic: multiple open simultaneously with drag-drop | Database switcher, one active at a time | Acceptable |

---

## Prioritized Recommendations

### Track A: Presentation & Sharing

The "output" story — research tool that produces something worth sharing.

**A1. Richer narrative reports**
Person biography (life summary with events, relationships, sources in prose), place history (events at a place over time), family narrative (a couple and their children). PDF with clickable links to sources.

**A2. Export content options**
Configuration UI for what goes into exports: include/exclude living persons, media, notes, sources, specific branches. Shared across PDF and GEDCOM exports. Infrastructure that makes every export better.

**A3. Wall charts**
Large-format pedigree and descendant charts for printing. SVG-based (reuse existing chart infrastructure). A3/A0 paper sizes and tiled multi-page PDF for home printers.

**A4. Static HTML site export**
Generate a browsable family tree website from the database. Lower priority than PDF but adds self-hosting option. Could reuse report components.

**A5. CSV export**
Simple tabular export of persons, events, sources. Low effort, useful for analysis.

### Track B: Media Experience

Step-by-step evolution from file table to rich media management.

**B1. Media viewer redesign**
Entity-oriented (not file-oriented). Show what each media item links to, support linking to multiple entities, lightbox/gallery viewing, thumbnail previews. Foundation for everything else.

**B2. Media-bundled portable archive**
Export GEDCOM + all referenced media files as a single .zip. Import should unpack and re-link. Closes the portability gap — users know they can take everything with them.

**B3. Media timeline**
Photos and documents arranged chronologically across a person's life, or across a place's history. Leverages entity links from B1.

**B4. Face/region tagging (step 1 — manual)**
Select a rectangle in a photo, link it to a person, optionally use as profile picture. Local-only, no AI. Gramps proves this is valuable.

**B5. Face/region tagging (step 2 — MCP)**
MCP tools for bounding box detection so AI agents can suggest face regions. Keeps AI in the agent layer.

### Track C: Core Polish

Features users expect from a serious genealogy app.

**C1. Undo/redo**
Already on the roadmap. Table stakes for data-entry-heavy app.

**C2. Person timeline view**
Chronological view of all events for a person. Useful for spotting gaps and conflicts.

**C3. Place map visualization**
Display places on OpenStreetMap. Already store lat/lon. Show a person's life geographically or all events at a place.

**C4. GEDCOM hardening**
Edge case testing against exports from RootsMagic, Gramps, Legacy, Family Tree Maker. Make import truly bulletproof. Directly serves "reduce switching apprehension."

### Track D: MCP & Agent Story

Amplify the differentiator nobody else has.

**D1. MCP report generation**
Design MCP tools for generating narrative content (person summaries, research reports, conflict analysis). Lets Claude Desktop/cowork produce rich research output directly from the data.

**D2. MCP media tools for AI**
Tools for face detection results, photo metadata extraction, suggested entity linking. Keeps AI in the agent layer.

**D3. Claude Desktop/cowork integration testing**
Validate the MCP works well with Claude's desktop products. Document workflows. Product validation and demonstration.

---

## Unique Value Proposition Assessment

| Differentiator | Tried elsewhere? | Assessment |
|----------------|-----------------|------------|
| MCP server for AI agents | No. Zero competitors. | **Genuine innovation.** First-mover advantage. Risk: users don't know what MCP is — value must be shown through outcomes (reports, suggestions), not technology. |
| Source linker (auto-linking references) | No. Users manually copy-paste URLs everywhere. | **Novel and useful.** No one has tried regex-based configurable linking. Extensible by community via locale rule sets. |
| 26 integrated quality checks | Gramps has some via plugins (fragmented). | **Strong differentiator.** Built-in with good UX is meaningfully better than plugin-based. |
| Local-first + modern UI + open source | Gramps is the only peer but uses GTK/Python. | **Real gap in the market.** Gramps proves the audience exists; modern stack is the upgrade. |
| Swedish genealogy first-class | No competitor has patronymics, Swedish archive link rules, or Swedish-specific import profiles. | **Strong niche differentiator.** The wedge for initial adoption. |
| Research tasks integrated | Ancestral Quest and Ancestris have research managers. | On par, but MCP integration makes them more powerful. |
| Groups | Rare — most apps use tags or color coding. | Minor differentiator. Useful for organizing but not a switching reason. |

**Bottom line:** MCP, source linker, and quality checks are genuine innovations. Swedish niche + modern open-source stack fill a real market gap. The presentation/sharing features (Track A) are where competitors lead, and closing that gap completes the product.

---

## User Journey

**Import** (GEDCOM, bulletproof) → **Research** (enter data, attach sources, quality checks catch errors) → **Enrich** (attach media, link faces, build timelines) → **Share** (PDF narrative with links, wall chart for the reunion, portable archive for the cousin who wants to continue)

---

## Research Sources

- [Gramps Features](https://www.gramps-project.org/wiki/index.php/Features)
- [Gramps 6.0.0 Release](https://gramps-project.org/blog/2025/03/gramps-6-0-0-released/)
- [Gramps Addons](https://gramps-project.org/wiki/index.php/Third-party_Addons)
- [RootsMagic 10 Review](https://familytreemagazine.com/resources/software/rootsmagic-review/)
- [RootsMagic & Ancestry TreeShare](https://www.rootsmagic.com/ancestry)
- [RootsMagic & FamilySearch](https://www.rootsmagic.com/familysearch)
- [MacFamilyTree 11](https://www.syniumsoftware.com/macfamilytree)
- [MacFamilyTree Tech Specs](https://www.syniumsoftware.com/macfamilytree/tech-specs)
- [Comparison of Genealogy Software (Wikipedia)](https://en.wikipedia.org/wiki/Comparison_of_genealogy_software)
- [webtrees](https://webtrees.net/)
- [Ancestris](https://www.ancestris.org/)
- [MyHeritage Photo Features](https://education.myheritage.com/article/myheritage-photo-features/)
- [FamilySearch GEDCOM 7.0 Spec](https://gedcom.io/specifications/FamilySearchGEDCOMv7.html)
- [Solving the Genealogist's AI Dilemma (2026)](https://essentialgenealogy.substack.com/p/solving-the-genealogists-ai-dilemma)
- [Best AI Tools for Genealogy (2026)](https://cognitivefuture.ai/best-ai-tools-for-genealogy/)
- [GEDCOM-X Specification](https://www.familysearch.org/innovate/gedcom-x)
