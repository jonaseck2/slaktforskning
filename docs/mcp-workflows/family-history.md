# Workflow: Write a Family History Narrative

Use Claude to compile multi-generation data from your tree and write a readable family history.

## When to Use

- Writing a family history book or chapter
- Preparing a story to share at a family gathering
- Creating a narrative gift for a relative

## Step-by-Step

### 1. Choose a focal couple

Start with a couple whose story you want to tell:

> "Search for relationships where one person is Erik Johansson."

Claude calls `search_relationships` with query "Erik Johansson". From the results, identify the couple relationship you want to focus on.

### 2. Gather the couple's data

> "For that couple relationship, get all events. Also get each person's names and individual events."

Claude calls:
- `get_events_for_relationship` -- shared events (marriage, divorce, census)
- `get_person` + `get_person_names` for each partner
- `get_events_for_person` for each partner -- individual events (birth, death, occupation, residence)

### 3. Find the children

> "Get all relationships for Erik where he is a parent, and get each child's names and birth/death events."

Claude calls:
- `get_relationships_of_person` -- returns all relationships; filter for `parent_child` type
- For each child: `get_person`, `get_person_names`, `get_events_for_person`

### 4. Go back in time -- ancestors

To add generational depth:

> "Now get Erik's parents and grandparents -- their names, birth, death, and marriage events."

Claude traces up through `parent_child` relationships, calling `get_relationships_of_person` and then gathering data for each ancestor found.

### 5. Add place context

> "For all the places mentioned in these events, get the full place details."

Claude calls `get_place` for each unique place_id, giving you parish names, counties, and coordinates.

### 6. Check sources

> "What source citations exist for the key events (births, deaths, marriages) in this family?"

Claude calls `get_citations_for_event` for the important events, then `get_source` for each cited source. This lets you include source references in the narrative.

### 7. Write the narrative

> "Write a family history narrative about Erik and Maria Johansson's family, covering roughly 1820-1920. Use a warm, storytelling style. Include:
> - How and where they met (based on their origins and marriage record)
> - Their life together: where they lived, what they did
> - Their children: birth order, key life events
> - Historical context appropriate to the time and place
> - Source references in footnotes
>
> Make it about 2 pages. Note where information is uncertain or missing."

## Tips

- Start with the couple you know the most about -- more data gives Claude more to work with
- Ask Claude to note which details come from sources and which are inferred from context
- For Swedish genealogy, ask Claude to explain historical context (e.g., patronymic naming, husforhorslanget, migration patterns)
- You can ask Claude to generate the narrative in Swedish if that suits your audience better
- If you want multiple chapters, process one family unit at a time to keep context manageable
- Consider asking Claude to `list_places` to identify the key geographic areas in your tree before starting
