# Track D: MCP & Agent Story

Source: [competitor gap analysis](2026-04-11-competitor-gap-analysis.md)

Amplify the differentiator nobody else has. The MCP server already has 80+ CRUD tools — this track adds higher-level tools designed for AI-driven research and content generation.

---

## D1: MCP Report Generation Tools [feature]

Higher-level MCP tools that return structured data optimized for narrative generation. Lets Claude Desktop/cowork produce rich research output directly from the data.

### Steps

- [x] Create `src/api/report_data.ts` — pure functions assembling rich data structures:
  - [x] `getPersonSummary(db, personId)` — person with all names, all events (with place paths), all relationships (with partner/parent/child names and key dates), all citations (with source titles), all groups, research tasks
  - [x] `getFamilyUnit(db, relationshipId)` — couple + all children with birth/death/marriage events, sources
  - [x] `getAncestorTree(db, personId, generations)` — N generations of ancestors with key events (birth, death, marriage), returns nested tree structure
  - [ ] `getDescendantTree(db, personId, generations)` — N generations of descendants with key events
  - [x] `getPlaceHistory(db, placeId)` — all events at place chronologically with participant names and roles
  - [x] `getTimeline(db, personId)` — person's events merged with family events (spouse events, children births/deaths) in chronological order
  - [x] `getResearchGaps(db, personId)` — analyzes missing data: no birth event, no death event (if not living), no parents, unsourced events, missing places, name without dates
  - [ ] `getSourceUsage(db, sourceId)` — persons and events citing this source, with citation details
- [x] Register MCP tools in `src/mcp/createServer.ts`:
  - [x] `get_person_summary` — input: person_id
  - [x] `get_family_unit` — input: relationship_id
  - [x] `get_ancestor_tree` — input: person_id, generations (default 4)
  - [ ] `get_descendant_tree` — input: person_id, generations (default 3)
  - [x] `get_place_history` — input: place_id
  - [x] `get_timeline` — input: person_id
  - [x] `get_research_gaps` — input: person_id
  - [ ] `get_source_usage` — input: source_id
- [x] All tools return well-structured JSON with denormalized names/dates (agent shouldn't need follow-up queries)
- [x] Unit tests for each report_data function
- [ ] MCP integration tests (tool input → output shape)
- [ ] Create example prompt templates in `docs/mcp-workflows/`:
  - [ ] "Generate a person biography" — uses get_person_summary + get_timeline
  - [ ] "Write a family history chapter" — uses get_family_unit + get_ancestor_tree
  - [ ] "Find research gaps" — uses get_research_gaps for multiple persons
  - [ ] "Analyze source coverage" — uses get_source_usage across all sources
- [x] Update `docs/MCP.md` with new tool documentation

### Dependencies
None — uses existing API functions.

### Key decisions
- Tools return denormalized data (names resolved, places expanded) — one call should give the agent everything it needs
- Research gaps function codifies what experienced genealogists look for
- Example prompts are documentation AND marketing — they show what's possible

---

## D2: MCP Media Tools for AI [feature]

Tools for AI agents to process photos, suggest face tags, and extract metadata. All vision processing happens in the agent.

### Steps

- [x] MCP tool `get_media_file_base64`:
  - [ ] Input: media_id, max_dimension? (optional downscale)
  - [ ] Returns: base64-encoded file content, mime type, dimensions
  - [ ] Downscale large images to max_dimension (e.g. 1024px) to reduce token usage
  - [ ] Error if file not found or not readable
- [ ] MCP tool `get_media_metadata`:
  - [ ] Input: media_id
  - [ ] Returns: file size, dimensions, format, EXIF data if available (date taken, camera, GPS)
  - [ ] Use `sharp` or similar for image metadata extraction
- [x] MCP tool `get_untagged_media`:
  - [ ] Input: limit? (default 20)
  - [ ] Returns: media items with no media_regions, ordered by entity link count (most connected first)
  - [ ] Include linked entity summary for context
- [ ] MCP tool `suggest_media_regions`:
  - [ ] Input: media_id, regions: [{ x, y, width, height, person_id?, label? }]
  - [ ] Creates media_region records for each suggestion
  - [ ] Returns created region IDs
- [ ] MCP tool `get_persons_for_matching`:
  - [ ] Input: limit? (default 50)
  - [ ] Returns: persons who have existing region crops — person_id, name, region coordinates, media_id
  - [ ] Agent can use these as reference faces for matching
- [x] MCP tool `get_media_for_person_context`:
  - [ ] Input: person_id
  - [ ] Returns: media linked to person's events, relationships, family members — places where person might appear
- [x] Unit tests for each tool
- [ ] Document batch-tagging workflow:
  1. Call get_untagged_media to find photos
  2. Call get_media_file_base64 for each photo
  3. Use vision to detect faces
  4. Call get_persons_for_matching for reference faces
  5. Call suggest_media_regions with detected faces + person assignments
- [x] Update `docs/MCP.md` with media tool documentation

### Dependencies
B4 (media_regions table). Can be built in parallel if schema is agreed on.

### Key decisions
- Image downscaling is critical — sending 50MB photos to an LLM is wasteful
- get_persons_for_matching enables the agent to do face recognition by comparison
- Batch workflow is documented step-by-step because this is a novel use case

---

## D3: Claude Desktop/Cowork Integration [research + docs]

Validate MCP works with Claude's desktop products. Create documentation and example workflows.

### Steps

- [ ] Test MCP server connection from Claude Desktop:
  - [ ] Configure claude_desktop_config.json with Släktforskning MCP server
  - [ ] Verify tool discovery (all 80+ tools listed)
  - [ ] Test basic CRUD operations
  - [ ] Test report generation tools (D1)
  - [ ] Test media tools (D2) with real photos
- [ ] Test with Claude Code (cowork mode):
  - [ ] Run MCP server alongside code editing
  - [ ] Test research workflow: explore tree, find gaps, suggest next steps
- [ ] Create workflow documentation (`docs/mcp-workflows/`):
  - [ ] Getting started: MCP setup guide for Claude Desktop
  - [ ] "Research a person" — find gaps, suggest sources, generate summary
  - [ ] "Generate a family history narrative" — multi-generation story
  - [ ] "Audit source coverage" — find unsourced facts across entire tree
  - [ ] "Auto-tag photos" — batch face detection and person assignment
  - [ ] "Import analysis" — review imported data quality, suggest corrections
- [ ] Identify MCP improvements from real usage:
  - [ ] Missing tools discovered during testing
  - [ ] Tool output format improvements
  - [ ] Error message clarity
  - [ ] Performance with large databases
- [ ] Add MCP setup section to README.md
- [ ] Consider: app Settings UI for MCP server configuration (enable/disable, show connection status)
- [ ] Create demo video script or GIF walkthrough of key workflows

### Dependencies
D1 and D2 for full testing, but basic CRUD testing can happen anytime.

### Key decisions
- Documentation is the product — great tools are useless without clear workflows
- Real-database testing catches issues that unit tests miss
- Focus on Claude Desktop first (most users), cowork second (developers)
- App settings for MCP are optional but improve discoverability
