# Workflow: Generate a Research Report

Use Claude to gather all available data about a person and produce a structured research report with known facts, gaps, and next steps.

## When to Use

- Starting research on a new ancestor
- Preparing for an archive visit
- Summarizing what you know before sharing with a relative

## Step-by-Step

### 1. Find the person

Ask Claude to search for the person you want to research:

> "Search for Anna Larsdotter in my family tree."

Claude calls `search_persons` with query "Anna Larsdotter" and returns matching persons with their IDs.

### 2. Gather person details

Once you have the person ID, ask Claude to pull together all the relevant data:

> "For Anna Larsdotter (that person), get me: all her names, all her events, all her relationships, all citations attached to her, and any research tasks."

Claude will call multiple tools:
- `get_person` -- basic person record (sex, living, notes)
- `get_person_names` -- all name variants (birth name, married name, aliases)
- `get_events_for_person` -- all life events (birth, death, marriage, christening, residence, etc.)
- `get_relationships_of_person` -- all relationships (parents, spouses, children, siblings)
- `get_citations_for_person` -- all source citations attached directly to the person
- `get_research_tasks_for_person` -- any open research tasks

For each relationship returned, Claude can follow up with `get_person` on the related person IDs to get partner/parent/child names.

### 3. Get place context

For each event that has a `place_id`, ask Claude to resolve the place:

> "Look up the places for those events so I can see the full location names."

Claude calls `get_place` for each place_id, returning hierarchical place information.

### 4. Check source coverage

Ask Claude to evaluate which facts have sources and which don't:

> "Which of Anna's events have citations? Which are unsourced?"

Claude can cross-reference the events list with `get_citations_for_event` for each event to identify gaps.

### 5. Generate the report

Now ask Claude to synthesize everything into a report:

> "Based on all this data, write a research report for Anna Larsdotter. Include:
> - A summary of what is known (with source references)
> - Key dates and places in chronological order
> - Family connections
> - What is missing or unsourced
> - Suggested next research steps (which archives, what records to look for)"

## Example Prompt (All-in-One)

If you want to do this in a single conversation turn:

> "I want a research report for a person in my tree. Search for 'Anna Larsdotter', then gather all her data -- names, events, relationships, citations, and research tasks. Look up the places for her events. Then write a structured research report covering what's known, what's missing, and what I should research next."

## Tips

- If `search_persons` returns multiple matches, specify which one by noting distinguishing details (birth year, location, spouse name)
- For deeper context, ask Claude to also look up the person's parents and spouse: their events and citations can fill in gaps about the person you're researching
- Ask Claude to create research tasks for identified gaps: "Create a research task for finding Anna's birth record"
- The `run_checks_for_person` tool can identify data quality issues (missing dates, duplicate events, etc.) that should be addressed
