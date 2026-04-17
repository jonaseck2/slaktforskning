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

*Updated 2026-04-17 to reflect all features implemented through v0.93.0.*

| Category | Competitors | Släktforskning Today | Status |
|----------|-------------|---------------------|--------|
| Core data model | Person, family, events, sources, citations | Same + places, groups, research tasks, repositories, gazetteers | **Ahead** |
| Source/citation model | Most have basic source attachment | Source → Citation with confidence levels, configurable link rules auto-linking (sv/en/universal) | **Ahead** |
| Quality checks | Gramps has plugins; RootsMagic has basic validation | 26 built-in checks + gazetteer place-match checks, ignore/restore, per-person and global views, fix actions from QualityView | **Ahead** |
| AI integration | MyHeritage: cloud photo AI. Others: none. | MCP server: 34 prod workflow tools + 15 dev tools (UI automation, chart inspection, seeding), AI media tools (base64, untagged discovery, person context, tagging status) | **Ahead** |
| Charts | Pedigree, hourglass, fan, descendant, wall-sized | Pedigree, hourglass, descendant, circle chart, collapsible nodes, infinite expansion, outline placeholders for adding relatives, wall charts (SVG + tiled PDF) | **Ahead** |
| Wall charts | RootsMagic, Legacy, MacFamilyTree: large-format print, customizable fonts/colors/backgrounds | Large-format pedigree/descendant SVG with tiled PDF (v0.62.0) | **On par** |
| Media viewer | RootsMagic: gallery view. Gramps: cropping/regions. MacFamilyTree: lightbox | Gallery + table toggle, lightbox viewing, entity linking, inline editing, media timeline per person/place (v0.54.0, v0.61.0, v0.82.0) | **On par** |
| Media portability | Gramps: .gpkg bundles media+data | GEDCOM + media .zip portable archive export/import (v0.58.0) | **On par** |
| Face/region tagging | Gramps: crop region → link to person. MyHeritage: auto face detection (cloud). | Manual crop + link to person (v0.64.0), MCP tools for AI batch suggest + person matching + tagging status (v0.67.0) | **Ahead** |
| Reports/books | RootsMagic/Legacy: narrative reports, book publishing center, PDF export | Ancestor chart, family group sheet, summary PDF, person biography, place history, family narrative, ancestor book with circle chart (v0.59.0, v0.20.0) | **On par** |
| Narrative/story output | Legacy: Publishing Centre (chapters, cover). Storied: storytelling focus. | Person biography, place history, family narrative reports (v0.59.0), MCP report generation tools for AI narratives (v0.53.0) | **On par** |
| CSV export | Gramps: yes. Most others: no. | Persons, events, sources, places with delimiter/BOM options (v0.60.0) | **On par** |
| Static HTML site | webtrees: full web app. Gramps Web: self-hosted. | Static snapshot export with search, XSS-safe (v0.65.0) | **On par** |
| Import formats | GEDCOM universal. RootsMagic imports from 10+ programs. | GEDCOM 5.5.1/7.0, Genney (XML + Derby), Holger (ElevateDB), import preview, validation report | **On par** |
| GEDCOM robustness | Family Tree Maker notoriously lossy. RootsMagic solid. Gramps extensive. | 8 edge case fixtures, improved date parser, import preview, 40 hardening tests, UTF-8 auto-detection (v0.66.0) | **On par** |
| Plugin/addon system | Gramps: Python plugin API, 100+ community addons | MCP tools (agent-extensible, not user-installable plugins) | Different approach |
| i18n | Gramps: 40+ languages. MacFamilyTree: 15+. | Swedish + English | Acceptable for target audience |
| Undo/redo | Universal in paid apps, Gramps has it | Command pattern, Cmd+Z/Shift+Z, grouped operations (v0.63.0) | **On par** |
| Timeline view | Several competitors have visual timeline bars/charts | Chronological event list with gap detection (v0.52.0) | **On par** |
| Place mapping | Most have map integration (Google/OpenStreetMap) | Leaflet/OpenStreetMap, place pins, PlacePanel side panel, boundary gazetteer overlays (parish outlines), person life path (v0.56.0, v0.68.0, v0.75.0) | **Ahead** |
| Place gazetteers | Most have no place resolution. Gramps: places hierarchy only. | Bundled Swedish parishes/boundaries, render-time resolution, gazetteer import/export, 7 MCP tools, disambiguation via hints | **Ahead** |
| Accessibility | Variable. Most desktop apps: basic keyboard nav. | WCAG 2.1 AA, screen reader mode (AAA), TTS narration, focus trapping, skip links, ARIA roles, arrow-key chart navigation (v0.44.0, v0.48.0) | **Ahead** |
| Multi-database | RootsMagic: multiple open simultaneously with drag-drop | Database switcher, one active at a time | Acceptable |

---

## Prioritized Recommendations

*All four tracks (A1-A5, B1-B5, C1-C4, D1-D3) are complete as of v0.93.0.*

### Track A: Presentation & Sharing [complete]

**A1. Richer narrative reports** [v0.59.0]
Person biography, place history, family narrative reports with PDF output.

**A2. Export content options** [v0.55.0]
Branch filtering, living person exclusion, content toggles for exports.

**A3. Wall charts** [v0.62.0]
Large-format pedigree/descendant SVG with tiled multi-page PDF.

**A4. Static HTML site export** [v0.65.0]
Browsable family tree website with search, XSS-safe output.

**A5. CSV export** [v0.60.0]
Persons, events, sources, places with delimiter/BOM options.

### Track B: Media Experience [complete]

**B1. Media viewer redesign** [v0.54.0, v0.82.0]
Gallery + table toggle, lightbox viewing, entity linking, inline title/notes editing.

**B2. Media-bundled portable archive** [v0.58.0]
GEDCOM + all referenced media files as a single .zip export/import.

**B3. Media timeline** [v0.61.0]
Chronological media per person/place with lightbox integration.

**B4. Face/region tagging — manual** [v0.64.0]
Crop rectangle → link to person, use as profile picture. 14 tests.

**B5. Face/region tagging — MCP** [v0.67.0]
AI batch suggest, person matching, tagging status tools.

### Track C: Core Polish [complete]

**C1. Undo/redo** [v0.63.0]
Command pattern, Cmd+Z/Shift+Z, grouped operations, 30 tests.

**C2. Person timeline view** [v0.52.0]
Chronological events with gap detection.

**C3. Place map visualization** [v0.56.0, v0.68.0, v0.75.0]
Leaflet/OpenStreetMap with place pins, PlacePanel side panel (8 collapsible sections, drag-resize), boundary gazetteer overlays (parish outlines), person life path.

**C4. GEDCOM hardening** [v0.66.0]
8 edge case fixtures, improved date parser, import preview, 40 tests.

### Track D: MCP & Agent Story [complete]

**D1. MCP report generation** [v0.53.0]
6 higher-level tools for AI narrative generation (person summary, family unit, ancestor tree, place history, research gaps, timeline).

**D2. MCP media tools for AI** [v0.57.0, v0.67.0]
Base64 retrieval, untagged media discovery, person context, batch face tagging, tagging status.

**D3. Claude Desktop/cowork integration** [docs]
6 workflow guides, README MCP setup section.

### Beyond the Original Tracks

Features implemented since the gap analysis that were not in the original plan:

| Feature | Version | Description |
|---------|---------|-------------|
| Place gazetteers | v0.73.2–v0.77.0 | Bundled Swedish parishes, render-time resolution, gazetteer import/export, boundary overlays, disambiguation |
| MCP server overhaul | v0.82.1–v0.90.0 | Prod/dev split, 34 workflow tools + 15 dev tools, chart inspection, UI automation, seed/inspect |
| Accessibility + Screen reader | v0.44.0, v0.48.0 | WCAG 2.1 AA/AAA, TTS narration, focus trapping, arrow-key chart nav, 80+ i18n keys |
| Usability optimizations | v0.49.0, v0.91.0 | Quick-add relatives, source memory, multi-token search, DateInput auto-advance, modal redesign |
| Quality check fix actions | v0.92.0 | Fix button per check type, QualityView → PersonDetailView action routing |
| CDP debugging | v0.93.0 | Chrome DevTools Protocol support for development |

---

## Unique Value Proposition Assessment

*Updated 2026-04-17.*

| Differentiator | Tried elsewhere? | Assessment |
|----------------|-----------------|------------|
| MCP server for AI agents (34 workflow + 15 dev tools) | No. Zero competitors. | **Genuine innovation.** First-mover advantage. Now proven with Claude Desktop workflows, documented integration guides, and AI-powered media tagging. |
| Source linker (auto-linking references) | No. Users manually copy-paste URLs everywhere. | **Novel and useful.** Configurable regex rules for Swedish (ArkivDigital, Riksarkivet) and English (FamilySearch, Ancestry) sources. Community-extensible via locale rule sets. |
| Quality checks with fix actions | Gramps has some via plugins (fragmented). | **Strong differentiator.** 26+ built-in checks including gazetteer place-match validation (ambiguous/partial/none/wrong_level), per-row fix actions routing to correct modal, ignore/restore. |
| Place gazetteers with boundary overlays | No desktop app has this. | **Genuine innovation.** Bundled Swedish parishes + boundaries (Lantmäteriet CC0), render-time resolution, disambiguation hints, polygon overlay on map pins. |
| Local-first + modern UI + open source | Gramps is the only peer but uses GTK/Python. | **Real gap in the market.** Now with full presentation layer (reports, wall charts, HTML export, CSV) that was previously the gap. |
| Swedish genealogy first-class | No competitor has patronymics, Swedish archive link rules, Swedish-specific import profiles, or bundled Swedish gazetteers. | **Strong niche differentiator.** Genney + Holger direct import, Swedish parish gazetteers, patronymic handling. |
| WCAG 2.1 AA/AAA + screen reader mode | Most desktop genealogy apps have basic keyboard nav at best. | **Strong differentiator.** TTS narration, focus trapping, arrow-key chart navigation, 80+ i18n keys for screen reader mode. |
| Research tasks integrated | Ancestral Quest and Ancestris have research managers. | On par, but MCP integration makes them uniquely powerful for AI-assisted research. |
| Face/region tagging with MCP AI pipeline | Gramps: manual only. MyHeritage: cloud AI. | **Ahead.** Manual local tagging + MCP tools for AI batch suggest, keeping AI in the agent layer without cloud dependency. |

**Bottom line:** All four tracks from the original gap analysis are complete. The presentation/sharing gap that competitors led on is now closed. MCP, source linker, quality checks, place gazetteers, and accessibility are genuine innovations where Släktforskning leads. The remaining competitive gaps are narrow: plugin ecosystem (different approach via MCP), i18n breadth (acceptable for target audience), and multi-database UX (acceptable).

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
