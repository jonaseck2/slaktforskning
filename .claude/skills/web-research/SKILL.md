---
name: web-research
description: Research genealogy apps (Ancestry, FamilySearch, MyHeritage, etc.) to identify features, UX patterns, pricing, and competitive gaps.
---

# Genealogy App Web Research

This skill helps you research existing genealogy applications to inform product ideation — understanding what's out there, what works, what's missing, and where opportunities lie.

## Research targets

When researching the competitive landscape, prioritize these platforms:

- **Ancestry.com** — largest paid genealogy platform, rich record access, DNA testing
- **MyHeritage** — strong European records, AI-enhanced photo tools, DNA matching
- **FamilySearch** — free, LDS-backed, massive digitized record collection
- **Findmypast** — strong UK/Irish records, newspaper archives
- **Geni** — collaborative world family tree, social features
- **WikiTree** — free collaborative platform, strict sourcing standards
- **MacFamilyTree / RootsMagic / Gramps** — desktop/local software options

## Research process

1. **Fetch the homepage and key subpages** of each target (features, pricing, about). Use WebFetch to extract content.
2. **Extract structured insights** under these dimensions:
   - Core features (tree building, record search, DNA, collaboration, media)
   - UX patterns (onboarding, tree visualization, record attachment)
   - Pricing model (free tier, subscription tiers, one-time purchase)
   - Target audience (casual hobbyist, serious researcher, professional genealogist)
   - Unique differentiators
   - Apparent weaknesses or limitations
3. **Synthesize across platforms** to identify:
   - Features that appear universally (table stakes)
   - Features unique to one platform (potential differentiators)
   - Common pain points mentioned in user-facing copy or FAQs
   - Gaps — things none of them do well

## Output format

Structure your findings as:

### Competitive Landscape Summary
Brief overview of the market (2-3 sentences).

### Platform Profiles
For each platform: name, pricing, target user, 3-5 key features, 1-2 notable weaknesses.

### Feature Matrix
A markdown table: platforms as columns, feature categories as rows, with ✓/✗/partial markers.

### Market Gaps & Opportunities
Bulleted list of underserved needs or missing features that a new app could address.

### Recommendations for a New App
Top 3-5 strategic opportunities based on the research.

## Project context

Släktforskning differentiates on being **local-first** (no cloud, no subscription), **agent-friendly** (built-in MCP server for AI assistance), and **research-grade** (Source → Citation model). When researching competitors, pay special attention to:

- **Data ownership & privacy** — most competitors require cloud accounts. How do they handle data export/portability?
- **AI integration** — are competitors adding AI features? How do they compare to native MCP tool access?
- **Citation workflows** — this is a known pain point. How do competitors handle source attachment and evidence evaluation?
- **Desktop vs. web vs. mobile** — Släktforskning is desktop-first. What do desktop competitors (RootsMagic, Gramps, MacFamilyTree) do well that web-first platforms don't?

See `.claude/PLAN.md` for the current roadmap — focus research on features relevant to upcoming work.

## Tips

- Focus on what users actually experience, not just marketing copy — check FAQ, help center, and community forum content when accessible.
- Note whether features are behind a paywall vs. free.
- Pay attention to how platforms handle sourcing and citations — this is a major pain point in genealogy.
- Mobile experience quality is often a gap worth noting.
