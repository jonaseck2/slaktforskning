# Competitor Gap Analysis v2 — Släktforskning

Date: 2026-04-17 | Previous: [v1 (2026-04-11)](archive/2026-04-11-competitor-gap-analysis.md)

## Competitive Landscape Summary

The genealogy software market splits into four tiers relevant to Släktforskning:

**Swedish desktop apps** (Disgen 550 SEK, Genney 650 SEK, MinSläkt ~450 SEK, Holger ~675 SEK) serve the Swedish genealogy community with varying degrees of polish. Disgen dominates (~50% share) through its DIS association backing. Genney is the only cross-platform option. Holger is abandoned (company deregistered 2022). MinSläkt is Windows-only and beginner-oriented. None have AI features or modern UI frameworks.

**International desktop apps** (RootsMagic $40, MacFamilyTree $40, Legacy free, Family Historian $65, Gramps free) compete on polish, printing, and cloud platform integrations. Legacy went fully free in 2024. Gramps is the only open-source option but uses GTK/Python. None have AI integration.

**Cloud platforms** (Ancestry ~$30/mo, MyHeritage ~$24/mo, FamilySearch free) compete on record databases, DNA, hints, and collaboration. All require accounts. Ancestry added AI Stories (narrated record summaries, prone to hallucination). MyHeritage has AI photo tools (Deep Nostalgia, colorize, enhance).

**Record archives** (ArkivDigital ~$41/mo, Riksarkivet free) are not genealogy software but are essential infrastructure for Swedish research. ArkivDigital has 110M+ color scans with HTR transcription. Riksarkivet is free but has older B&W scans.

**Släktforskning occupies a gap nobody else fills:** open source, modern UI (Electron/Vue), cross-platform, local-first with no account, research-grade source model, Swedish-first with import from Genney/Holger/GEDCOM, and native AI agent integration via MCP. No competitor — Swedish or international — has anything comparable to the MCP server.

---

## Competitor Profiles

### Swedish Desktop Apps

**Disgen 2025** (Föreningen DIS) — Windows only — 550 SEK + DIS membership (~250 SEK/yr)
- Market leader among Swedish genealogy programs (~50% share)
- "Ortsträdet" hierarchical place tree with pre-1989 Swedish parish boundaries
- DNA match tracking with centimorgan values
- Disbyt integration (Sweden-wide family database sharing)
- Dispos shortcuts to Swedish primary/secondary sources
- Duplicate detection (three analysis variants in 2025)
- Privacy flags on events excluded from GEDCOM export
- High-contrast accessibility theme
- *GUI:* Classic Windows desktop app — functional, dense, not design-forward. Has been around since the mid-1980s (now version 14). Looks like a traditional database application.
- *Weaknesses:* Windows only, no Mac/Linux. UI feels dated and overwhelming for beginners. Requires DIS membership. No web/mobile companion. No AI features. No maps.

**Genney 4.1** (Genney Digit) — Windows/Mac/Linux — 650 SEK one-time
- Only cross-platform Swedish genealogy app (Java-based)
- Up to 20-generation ancestor/descendant charts, circle diagrams, genograms
- Bundled Swedish parish registry with coordinates and map layers
- Automatic source insertion from Riksarkivet and ArkivDigital
- Phonetic person search, duplicate detection with merging
- DNA haplogroup storage (Y-DNA, mtDNA)
- Reports to PDF, Word, Excel, HTML
- Dark/light interface modes
- *GUI:* Spreadsheet-like person data entry that diverges from the traditional tabbed card layout. Integrated Swedish parish maps. Modern and clean for a small Swedish product.
- *Weaknesses:* Performance issues on larger databases, especially on newer macOS. Steep learning curve despite being marketed as beginner-friendly. UX described as "different" — takes adjustment. Small developer, slow release cadence.

**MinSläkt 4.10** (Dannbergs Data) — Windows only — ~450 SEK one-time
- ~30% Swedish market share, positioned as beginner-friendly
- Pedigree charts, descendant reports, individual record printouts
- Built-in historical calendar 1585–present (Julian/Gregorian conversion)
- Built-in Latin word glossary for interpreting church records
- Data reasonableness validation on entry and import
- Relationship calculator between two individuals
- Confidential notes that can be excluded from exports
- HTML and PDF export
- *GUI:* Traditional Windows app with graphic family/pedigree chart as primary entry point. Lighter, simpler interface than Disgen. Dated but functional.
- *Weaknesses:* Windows only, Swedish UI only. Feature set fairly basic. GEDCOM UTF-8 import limited to Windows-1252 subset. No web/mobile. No collaboration. Primarily aimed at amateurs/beginners.

**Holger 8** (Holger Data HB) — Windows only — ~675 SEK one-time — **ABANDONED**
- Company deregistered December 2022; Holger 9 announced 2019 but never shipped
- Familjeregister (parish-wide registers) — somewhat unique Swedish feature
- Basic pedigree and descendant charts
- *GUI:* Distinctly dated early-2000s MFC-style interface. The oldest-looking entry in this comparison.
- *Weaknesses:* Dead product. No maps, no media management beyond basic, no Mac support. Still used by a loyal base who need migration paths.

### International Desktop Apps

**RootsMagic 11** — Windows/Mac — $39.95 one-time
- TreeShare: bidirectional sync with Ancestry trees (unique in desktop tier)
- Also syncs with FamilySearch and MyHeritage
- DNA tools and family health history reports (added in v10)
- SourceWriter for structured citations
- Research logs and to-do lists
- *GUI:* Clean sidebar navigation, tabbed person detail panels. v11 replaced cryptic icons with labeled menus and added a "Life Summary" side panel. Professional but not design-award-winning.
- *Weaknesses:* No Linux. Ancestry sync requires active Ancestry subscription. No AI features.

**MacFamilyTree 10** — macOS/iOS only — $39.99 one-time
- Best-in-class visualization: 3D Virtual Globe, interactive/fan/group chart views
- Tightest Apple ecosystem integration via iCloud CloudTree Sync
- MobileFamilyTree companion on iOS
- *GUI:* Premium Apple-native design — clean typography, smooth CoreAnimation transitions, light/dark mode, color coding. 3D interactive tree rendered with SceneKit. Most visually impressive of any desktop genealogy app.
- *Weaknesses:* Mac/iOS only. No Ancestry TreeShare. Citations/sourcing comparatively weak. No AI features.

**Gramps 6.0** — Windows/Mac/Linux — Free, open source
- Human-readable database format (new in 6.0)
- Large Python plugin ecosystem (100+ community addons)
- Gramps Web companion for self-hosted sync
- Strong Python scripting access for power users
- *GUI:* Standard GTK gray/white desktop look. Pedigree view shows up to 9 generations. Dashboard "Gramplets" panel is distinctive. Feels developer-oriented. Dark mode via addon.
- *Weaknesses:* GTK UI feels dated. Steep learning curve. No cloud sync without self-hosting Gramps Web. No AI features.

**Legacy Family Tree 10** — Windows only — Free (was paid, went free June 2024)
- 100+ charts and reports
- SourceWriter-style citation tool
- Integrates with FindMyPast, FamilySearch, MyHeritage, GenealogyBank
- DNA tools, hashtag/color coding system
- *GUI:* UI unchanged for years — feels 2010-era. Functional but dated.
- *Weaknesses:* Windows only. Unclear future development investment after going free. No Mac/Linux. No cloud sync.

**Family Historian 7** — Windows only — $64.95 one-time
- Most powerful custom reporting of any desktop app — 45 configurable reports plus user-defined
- Unique "All Relatives" chart type
- Strong GEDCOM compliance
- *GUI:* Traditional Windows app. Word-processing-quality notes editing. Not design-forward.
- *Weaknesses:* Windows only, highest price. Primarily UK-focused. No AI features.

### Cloud Platforms

**Ancestry** — Web — $20–45/mo subscription
- Largest record database (20B+ records), largest DNA database (25M+)
- Hints (leaf suggestions) from record matches
- AI Stories (Dec 2025): narrated audio summaries of individual records — prone to hallucination, available in English/Swedish/German/French/Spanish/Dutch/Italian
- Family Tree Maker (by MacKiev): one-time purchase desktop app that syncs with Ancestry trees
- *GUI:* Horizontal pedigree expanding left-to-right. Card-based design with profile photos. Modern web UI, off-white with blue/teal accents. Functional but not distinguished.
- *Swedish coverage:* Shallow — emigrant indexes, passenger lists, census fragments. Far weaker than ArkivDigital or FamilySearch for Swedish church records.
- *Weaknesses:* Expensive for global access. AI Stories hallucinate. All data cloud-locked. Citation workflow is superficial — hints attached, not analyzed. Privacy concerns (DNA data, Aug 2025 policy changes).

**MyHeritage** — Web/mobile — Free (250 persons) to ~$290/yr (Complete)
- Smart Matches (cross-user tree matching) and Record Matches
- Strong European record coverage, 21B records
- Photo AI suite: Deep Nostalgia (face animation), LiveMemory (scene animation), Photo Colorizer/Enhancer/Repair, PhotoDater
- Tree Consistency Checker
- *GUI:* Four views: Family (generational rows), Pedigree, List, Fan. Color-coding by branch. More visually polished than Ancestry. Mobile app redesigned March 2025.
- *Swedish coverage:* Notably strong — household examination rolls, births 1850–1920, 1930/1940 censuses, military lists from 1600s. Added 100M+ Nordic newspaper pages via OldNews.com in 2025.
- *Weaknesses:* Smart Matches encourage uncritical tree merging — documented source of errors. Cloud-only. 2018 data breach (92M records). Pricing confusing. Photo AI is viral/consumer-facing, not research-grade. Citation workflow weak.

### Record Archives (not genealogy software)

**ArkivDigital** — Web — ~$41/mo subscription
- 110M+ color scans of Swedish historical records
- Virtually all Swedish church books through ~1950
- 262M+ indexed name entries
- HTR (handwritten text recognition) AI transcription being rolled out
- *GUI:* Document-viewer style — large image pane with archive navigation side panel. Blue/white color scheme. Not a family-tree editor.
- *Weaknesses:* Record viewing only, not genealogy software. Expensive. No GEDCOM export. Users manually copy data to their genealogy program.

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Cloud connectivity | No cloud, export-only | Maximum simplicity and privacy. Users share via PDF, GEDCOM, static HTML, portable archive. |
| Target audience | Serious researchers + Swedish/Nordic genealogists (primary), casual family historians (secondary via outputs) | Research tool first, storytelling layer on top of solid data. |
| AI integration model | MCP for all AI features, no in-app cloud AI | Keeps app lean, no vendor lock-in. AI features via agents, not built-in cloud calls. |
| Media philosophy | Entity-oriented, not file-oriented | Media items show what they link to, support multiple entity links. Not a photo organizer. |
| Collaboration model | File exchange with import/merge workflow | No accounts, no sync infrastructure. GEDCOM + portable archives for data exchange. |
| Exclusions | DNA tools, record search/hints, AI photo manipulation, mobile app, cloud sync, TreeShare-style API sync | Out of scope — either cloud-dependent, requires partnerships, or different platform. |

---

## Feature Gap Matrix

*Honest assessment — distinguishes user-visible UI from API-only implementations.*

| Category | Best competitor(s) | Släktforskning v0.93.0 | Status |
|----------|-------------------|------------------------|--------|
| **Data & Sources** | | | |
| Core data model | Most: person, family, events, sources | Same + places, groups, research tasks, repositories, gazetteers | **Ahead** |
| Source/citation model | RootsMagic SourceWriter, Family Historian | Source → Citation with confidence, configurable auto-linking rules (sv/en/universal) | **Ahead** |
| Quality checks | Gramps: plugins. Disgen: duplicate detection. | 26+ built-in checks + gazetteer place-match, fix actions, ignore/restore, per-person + global views | **Ahead** |
| Duplicate detection | Disgen: 3 analysis variants. Gramps: plugins. | API-only duplicate finder + merge, no side-by-side comparison UI | **Behind** |
| **Visualization** | | | |
| Charts (interactive) | MacFamilyTree: 3D globe, fan, group views. Genney: 20-gen, genograms. | Pedigree, hourglass, descendant, circle chart, collapsible nodes, infinite expansion, outline placeholders | **On par** |
| Wall charts (print) | RootsMagic/MacFamilyTree: large-format, customizable fonts/colors | API-only SVG generation — **no UI to generate from app** | **Gap** |
| Timeline view | Several competitors: visual timeline bars/charts | Chronological event list with gap detection — text list, not visual | **On par** (functional, not visual) |
| **Media** | | | |
| Media viewer | MacFamilyTree: lightbox. Gramps: cropping/regions. | Gallery + table toggle, lightbox, entity linking, inline editing, media timeline | **On par** |
| Face/region tagging | Gramps: manual crop → link to person. MyHeritage: cloud auto-detect. | API + MCP tools exist — **no UI for drawing/viewing regions on images** | **Gap** |
| Media portability | Gramps: .gpkg bundles media+data | GEDCOM + media .zip portable archive export/import — full UI | **On par** |
| Photo AI features | MyHeritage: Deep Nostalgia, colorize, enhance, repair | None (deliberate — AI via MCP agents, not built-in) | N/A |
| **Maps & Places** | | | |
| Place mapping | Genney: parish maps with lifelines. MacFamilyTree: 3D globe. | Leaflet/OSM, place pins, PlacePanel, person life path | **On par** |
| Place gazetteers | Genney: parish registry. Disgen: Ortsträdet. Neither has boundary overlays. | Swedish parishes + boundaries, resolution, import/export, boundary overlays, 7 MCP tools | **Ahead** |
| **Import/Export** | | | |
| Import formats | RootsMagic: 10+ programs. Gramps: many. | GEDCOM 5.5.1/7.0, Genney (XML + Derby), Holger (ElevateDB), import preview, validation report | **On par** for Swedish market |
| GEDCOM robustness | RootsMagic solid. Gramps extensive. | 8 edge case fixtures, date parser, import preview, UTF-8 auto-detection, 40 tests | **On par** |
| Reports/books | RootsMagic/Legacy: book publishing center. Family Historian: 45 configurable. | Person biography, place history, family narrative, ancestor book, family group sheet, summary PDF | **On par** (narrower set, good quality) |
| CSV export | Gramps: yes. | Persons, events, sources, places with delimiter/BOM options | **On par** |
| Static HTML site | webtrees: full web app. Gramps Web: self-hosted. | Static snapshot with search — not interactive | **On par** |
| **Platform & UX** | | | |
| AI integration | Ancestry: AI Stories (hallucinate). MyHeritage: photo AI. Others: none. | MCP server: 34 prod + 15 dev tools. Agent reads/writes all data, automates UI, inspects charts. | **Ahead** (unique) |
| Cross-platform | Genney: Win/Mac/Linux. RootsMagic: Win/Mac. Gramps: all. | Electron: Win/Mac/Linux | **On par** |
| Accessibility | Most: basic keyboard nav. Disgen: high-contrast theme. | WCAG 2.1 AA, screen reader mode (AAA), TTS, focus trapping, arrow-key chart nav | **Ahead** |
| Undo/redo | Universal in paid apps | Command pattern, Cmd+Z/Shift+Z, grouped operations | **On par** |
| Plugin/addon system | Gramps: Python API, 100+ addons | MCP tools (agent-extensible, not user plugins) | Different approach |
| DNA support | Ancestry/MyHeritage: full. Genney: haplogroups. Disgen: cM tracking. | None | N/A (deliberate exclusion) |
| Record search/hints | Ancestry: hints from 20B records. MyHeritage: Smart Matches. | None | N/A (deliberate exclusion) |
| Swedish archive integration | Genney: auto-source from Riksarkivet/ArkivDigital. Disgen: Dispos/Disbyt. | Source linker auto-links ArkivDigital, Riksarkivet, FamilySearch references | **On par** (different approach) |
| i18n | Gramps: 40+ languages. MacFamilyTree: 15+. MinSläkt: Swedish only. | Swedish + English | Acceptable |
| Multi-database | RootsMagic: multiple open simultaneously with drag-drop | Database switcher, one active at a time | Acceptable |

---

## Prioritized Recommendations

### Remaining Gaps (backend exists, no UI)

**1. Face/region tagging UI** — Priority: High
The entire API, IPC, MCP tools, i18n strings, and test suite exist (v0.64.0, v0.67.0). What's missing is the Vue component for drawing rectangles on images in MediaLightbox, displaying existing regions as overlays, and the person-assignment popup. Gramps has had this for years. Most "ready to ship" gap — all infrastructure is in place.

**2. Wall chart UI** — Priority: Medium
SVG generation exists in the API but there's no UI button or dialog to trigger it from the app. Competitors have print dialogs with paper size selection and tiled PDF output.

### Gaps vs. Competitors

**3. Side-by-side duplicate merge UI** — Priority: Medium
The API has `findDuplicates` and `mergePersons`, but no comparison view. Disgen has three duplicate analysis variants. A side-by-side view showing conflicting data with merge controls would close this gap.

**4. Visual timeline** — Priority: Low
Current timeline is a text event list with gap markers. Competitors show visual bar charts with life spans, overlapping generations. A visual timeline would be a UX upgrade but not a missing capability.

**5. Chart customization** — Priority: Low
MacFamilyTree leads with 3D globe, color coding, visual polish. RootsMagic has customizable fonts/colors/backgrounds. Our charts are functional but not customizable for print output.

### New Opportunities (from competitor research)

**6. Historical calendar / Latin glossary** — Priority: Low, high value for Swedish niche
MinSläkt bundles Julian/Gregorian conversion (1585–present) and a Latin glossary for old Swedish church records. Low effort, high value for Swedish target audience. Could be a simple reference panel or tooltip feature.

**7. Genogram support** — Priority: Low
Genney supports genograms (standardized family diagrams for therapists/social workers). No other Swedish competitor has this. Niche but differentiating.

---

## Unique Value Proposition Assessment

| Differentiator | Competitors | Assessment |
|----------------|------------|------------|
| MCP server for AI agents | Zero competitors have this. | **Genuine innovation.** 34 workflow + 15 dev tools. First-mover advantage. |
| Source linker (auto-linking) | No one has configurable regex-based source linking. Genney/Disgen have direct archive shortcuts. | **Novel.** Rule-based, extensible, works on any text field. |
| Quality checks with fix actions | Gramps: fragmented plugins. Disgen: duplicate-focused. MinSläkt: entry validation. | **Strong.** 26+ integrated checks with per-row fix actions. |
| Place gazetteers with boundaries | Genney: parish registry + maps. Disgen: Ortsträdet. Neither has boundary overlays. | **Ahead.** Boundary polygons + render-time resolution is unique. |
| Cross-platform + modern UI + open source | Genney: cross-platform but Java, not open source. Gramps: open source but GTK. | **Unique.** Only product that is all three. |
| Swedish import profiles | No one imports from competitors. Users rely on GEDCOM. | **Unique.** Direct import from Genney + Holger removes switching friction. |
| Accessibility (WCAG 2.1 AAA) | Disgen: high-contrast theme. Others: basic keyboard nav. | **Strong.** Screen reader mode, TTS narration — unique in genealogy. |

**Bottom line:** MCP, source linker, quality checks, place gazetteers with boundaries, and accessibility are genuine innovations. Cross-platform + modern UI + open source fills a real market gap. The main user-facing gaps are: face tagging UI (backend ready), wall chart UI (backend ready), and duplicate merge UI. The deliberate exclusions (DNA, record search, cloud sync) are sound.

---

## Market Dynamics

**Pricing pressure:** Legacy went free. MacFamilyTree dropped 43%. The desktop market is consolidating. Open source + free is increasingly expected.

**AI adoption:** Ancestry added AI Stories (Dec 2025) but they hallucinate. MyHeritage leads in consumer photo AI. No desktop app has meaningful AI integration. MCP is a fundamentally different approach — agent-extensible rather than built-in cloud features.

**Swedish market consolidation:** Holger is dead. MinSläkt is maintenance-mode. Genney is small. Disgen is the incumbent but Windows-only and institutionally slow. There's a real opening for a modern, cross-platform alternative that imports from existing Swedish programs.

**Windows-only trap:** 4 of 5 Swedish desktop apps are Windows-only. 3 of 5 international desktop apps are Windows-only. Mac users in Sweden have exactly two options: Genney (Java, mixed reviews) or MacFamilyTree (no Swedish features). Släktforskning fills this gap.

---

## User Journey

**Switch** (import from Genney/Holger/GEDCOM, validation report shows what transferred) → **Research** (enter data, attach sources, quality checks catch errors, link rules auto-link archives) → **Enrich** (attach media, build timelines, map places with parish overlays) → **Share** (PDF narrative, wall chart, portable archive, HTML site)

---

## Research Sources

### Swedish competitors
- [Genney – Wikipedia (sv)](https://sv.wikipedia.org/wiki/Genney)
- [Genney features](https://genny.se/content.php?rid=99)
- [Genney user discussion — Anbytarforum](https://forum.rotter.se/index.php?topic=138621.0)
- [MinSläkt — Dannbergs Data](https://www.dannbergsdata.se/)
- [MinSläkt – Wikipedia (sv)](https://sv.wikipedia.org/wiki/Minsl%C3%A4kt)
- [MinSläkt 4.10 release — ÖGF](https://ogf.info/2025/12/21/minslakt-ny-version/)
- [Disgen 2025 — DIS](https://www.dis.se/disgen2025)
- [Holger Data](https://www.holgerdata.se/)
- [Vilket släktforskningsprogram är bäst? — Släktingar-bloggen](https://blogg.slaktingar.se/vilket-slaktforskningsprogram-ar-bast/)
- [ArkivDigital — Wikipedia](https://en.wikipedia.org/wiki/Arkiv_Digital)
- [ArkivDigital](https://www.arkivdigital.net/)
- [ArkivDigital intro for Disgen users](https://www.arkivdigital.se/slaktforskning/introduktion/disgen)

### International competitors
- [Gramps 6.0.0 Release](https://gramps-project.org/blog/2025/03/gramps-6-0-0-released/)
- [Gramps Features](https://www.gramps-project.org/wiki/index.php/Features)
- [RootsMagic 11 What's New](https://www.rootsmagic.com/rootsmagic/whats-new)
- [RootsMagic & Ancestry TreeShare](https://www.rootsmagic.com/ancestry)
- [MacFamilyTree 10 — Synium](https://www.syniumsoftware.com/macfamilytree)
- [MacFamilyTree 10 review](https://www.aboutdarwin.com/macfamilytree-10-review/)
- [Legacy Family Tree 10 — What's New](https://familytreesupport.com/legacy-family-tree-10/)
- [Family Historian 7 Review](https://www.toptenreviews.com/family-historian-7-review)
- [Comparison of Genealogy Software (Wikipedia)](https://en.wikipedia.org/wiki/Comparison_of_genealogy_software)

### Cloud platforms
- [Ancestry Subscription Plans](https://familytreemagazine.com/websites/ancestry-help/subscription-plans-explained/)
- [Ancestry AI Stories](https://www.semafor.com/article/12/12/2025/ancestrys-new-ai-feature-narrates-ancestors-stories)
- [MyHeritage Pricing](https://www.dnaweekly.com/blog/myheritage-pricing/)
- [MyHeritage LiveMemory update July 2025](https://blog.myheritage.com/2025/07/livememory-brings-your-photos-to-life-now-with-fun-new-effects-and-improved-ai-technology/)
- [MyHeritage Swedish/Danish free access June 2025](https://www.geneamusings.com/2025/06/myheritage-news-free-access-to-350.html)
- [FamilySearch GEDCOM 7.0 Spec](https://gedcom.io/specifications/FamilySearchGEDCOMv7.html)
