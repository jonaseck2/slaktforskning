---
name: web-research
description: Research existing genealogy applications by fetching and analyzing their websites to identify UX patterns, features, pricing models, and competitive gaps. Use this skill whenever the user wants to understand the competitive landscape for a genealogy app, analyze what Ancestry, MyHeritage, FamilySearch, Findmypast, or other genealogy platforms offer, identify market opportunities, or gather inspiration for features and design. Trigger when the user asks things like "what does Ancestry do?", "what features do genealogy apps have?", "research the competition", or "find gaps in existing genealogy tools".
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

## Tips

- Focus on what users actually experience, not just marketing copy — check FAQ, help center, and community forum content when accessible.
- Note whether features are behind a paywall vs. free.
- Pay attention to how platforms handle sourcing and citations — this is a major pain point in genealogy.
- Mobile experience quality is often a gap worth noting.
