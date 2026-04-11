# Workflow: Audit Source Coverage

Use Claude to analyze which persons and events in your tree have proper source citations and which need sourcing work.

## When to Use

- Preparing to share your research with others (sourced trees are more credible)
- Planning an archive visit and want to know what to look for
- Evaluating the overall quality of imported data

## Step-by-Step

### 1. Get an overview of your tree

> "How many persons, sources, and relationships are in my tree? List all persons."

Claude calls `list_persons`, `list_sources`, and `list_relationships` to give you a high-level picture.

### 2. Check citation coverage for specific persons

Pick persons you care about most (direct ancestors, for example) and check their citation status:

> "For each of these persons [list names or IDs], check what citations they have. Which of their events are sourced and which are not?"

For each person, Claude calls:
- `get_events_for_person` -- all events
- `get_citations_for_person` -- citations linked directly to the person
- `get_citations_for_event` for each event -- citations linked to specific events

An event with no citations from either path is unsourced.

### 3. Find completely unsourced persons

> "Go through my persons list and identify anyone who has zero citations -- no citations on the person and no citations on any of their events."

Claude iterates through persons, calling `get_citations_for_person` and `get_events_for_person` + `get_citations_for_event` for each. This is thorough but may take a while for large trees -- consider batching:

> "Check the first 20 persons for citation coverage."

### 4. Analyze source usage

> "List all my sources and for each one, show how many citations reference it."

Claude calls `list_sources`, then `get_citations_for_source` for each source. This reveals:
- Which sources are heavily used (your core sources)
- Which sources have only one or two citations (might be underutilized)
- Sources with zero citations (potentially orphaned records)

### 5. Generate a prioritized sourcing plan

> "Based on this analysis, create a prioritized list of persons who need sourcing most urgently. Consider:
> - Direct ancestors should be sourced first
> - Birth, death, and marriage events are highest priority
> - Persons with no sources at all are more urgent than those with partial sourcing
>
> For each priority person, suggest what types of records to look for and where."

### 6. Create research tasks

> "For the top 5 highest-priority unsourced persons, create research tasks describing what records to look for."

Claude calls `create_research_task` for each, with a description of the needed research linked to the person.

## Example Prompt (Quick Audit)

For a fast overview without iterating through every person:

> "Run a quality check on my entire tree using run_checks. Then summarize the source-related issues -- how many events are unsourced, how many persons lack citations. Group the issues by severity."

The `run_checks` tool returns quality issues including missing sources, which gives you a fast aggregate view.

## Tips

- Start with `run_checks` for a quick overview before doing detailed per-person analysis
- For large trees (100+ persons), audit in batches of 10-20 persons at a time
- Focus on direct-line ancestors first -- collateral relatives can wait
- Ask Claude to suggest specific Swedish archives (Riksarkivet, ArkivDigital) or record types (husforhor, church books) based on the time period and location of unsourced events
- After creating research tasks, you can review them all with `list_research_tasks`
