---
name: interview-synthesis
description: Synthesize user interviews, survey responses, or forum threads from genealogists into structured product insights and design prompts.
---

# Interview Synthesis for Genealogy Research

This skill turns raw qualitative research — interview transcripts, notes, survey answers, forum threads — into structured product insights that drive genealogy app ideation.

## What to look for

When reading interview material, extract insights across these dimensions:

### Pain points
What frustrates users? Where do they get stuck? What takes too long? What feels broken or missing?

### Workflows
How do users actually work? What's their step-by-step process for:
- Starting a new tree
- Finding and attaching records
- Resolving conflicting information
- Sharing findings with family
- Collaborating with other researchers

### Mental models
How do users think about genealogy data? What metaphors do they use? How do they conceptualize relationships, time, and evidence? Mismatches between user mental models and software models are fertile ground for design improvement.

### Vocabulary
What words do genealogists use that software doesn't reflect? (e.g., "my brick wall", "collateral lines", "cluster research", "reasonably exhaustive search")

### Jobs to be done
What are users ultimately trying to accomplish? (e.g., "prove my grandfather's immigration story", "connect with living relatives", "write a family history book")

### Delight moments
What do users love? What makes them feel accomplished or excited?

### Workarounds
What tools or hacks do users employ because the software doesn't support their need? Workarounds reveal strong unmet needs.

## Synthesis process

1. **Read all material** in full before extracting anything.
2. **Tag each notable passage** with a dimension (pain, workflow, mental model, etc.) and a short label.
3. **Cluster tags** into themes — look for patterns that appear across multiple participants.
4. **Rank themes** by frequency and intensity (a theme that one person felt strongly about may outweigh one seven people mentioned briefly).
5. **Write insight statements** that capture the theme in user terms, supported by direct quotes.

## Output format

### Key Themes
Numbered list of 5-10 themes, each with:
- **Theme name** (short label)
- **Insight** (1-2 sentence summary in user terms)
- **Supporting quotes** (1-3 direct quotes)
- **Frequency** (how many participants expressed this)

### User Needs Summary
Bulleted "How might we..." questions derived from the themes. These are design prompts.
Example: *"How might we help users track which sources they've already searched, not just what they found?"*

### Persona Sketches (if data supports)
If the material reveals distinct user types, sketch 2-3 personas with: name/label, goals, frustrations, technical comfort, how they use genealogy apps.

### Implications for a New App
Top 5 product directions suggested by the research.

## Tips

- Preserve users' own language in quotes — don't paraphrase away nuance.
- Distinguish between stated needs ("I want X") and inferred needs (what the workaround reveals they actually need).
- Note when users contradict each other — divergent needs may indicate distinct user segments worth designing for separately.
- Secondary sources like Reddit's r/Genealogy, GenealogyRooms Facebook groups, or app store reviews are valid input — treat them like interview excerpts.

## Project context

Släktforskning is a local-first, privacy-preserving desktop genealogy app with a built-in MCP server for AI-assisted research. When synthesizing interviews, pay special attention to:

- **Data ownership concerns** — how strongly do genealogists feel about keeping data local vs. cloud?
- **AI attitudes** — are researchers open to AI-assisted data entry, record matching, or source evaluation? What are their concerns?
- **Citation friction** — how do researchers currently manage sources and evidence? What's painful about it?
- **Collaboration patterns** — how do researchers share findings without cloud platforms?
- **Desktop workflow preferences** — multi-window usage, keyboard shortcuts, bulk operations

These align with Släktforskning's core differentiators. See `docs/PLAN.md` for the current roadmap to connect insights to planned features.
