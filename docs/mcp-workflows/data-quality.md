# Workflow: Check and Fix Data Quality

Use Claude to run quality checks on your tree, review the results, and fix issues.

## When to Use

- After importing data from GEDCOM or another program
- Periodically to maintain data integrity
- Before exporting or sharing your tree

## Step-by-Step

### 1. Run a global quality check

> "Run quality checks on my entire family tree."

Claude calls `run_checks`, which returns a list of issues across all persons. Each issue has a category, severity, description, and the affected person.

### 2. Review the results

> "Summarize the quality check results. Group them by category and show how many issues are in each category. What are the most common problems?"

Claude organizes the results to give you a clear picture of your tree's overall health.

### 3. Deep-dive on flagged persons

For persons with multiple issues:

> "Run a detailed quality check on [person name/ID] and show me all the issues."

Claude calls `run_checks_for_person` with the person ID. This returns person-specific issues with more detail.

### 4. Fix straightforward issues

For issues that have clear fixes (wrong date format, missing sex, etc.):

> "Fix the following issues:
> - Set [person]'s sex to 'M'
> - Update [person]'s birth date to '1845-03-15'
> - Add a death event for [person] with date '1920-11-02'"

Claude calls the appropriate update tools (`update_person`, `update_event`, `add_event`, etc.).

### 5. Create research tasks for ambiguous issues

For issues that need research rather than a quick fix:

> "For the issues that need further research (conflicting dates, missing parents, uncertain places), create research tasks describing what needs to be investigated."

Claude calls `create_research_task` for each, linking to the affected person.

### 6. Check for duplicates

> "Check for duplicate persons in my tree."

Claude calls `find_duplicates`, which uses name and date similarity to identify potential duplicates. For each candidate pair:

> "Show me the details of both persons so I can decide if they're the same person."

If confirmed:

> "Merge person [source_id] into person [target_id]."

Claude calls `merge_persons`, which moves all names, events, relationships, citations, and other linked data from the source person to the target person, then deletes the source.

## Common Quality Issues

| Issue | Fix |
|-------|-----|
| Person missing sex | `update_person` with sex: "M" or "F" |
| No birth event | `add_event` with event_type: "birth" + `add_event_participant` |
| No death event (non-living person) | `add_event` with event_type: "death" + `add_event_participant` |
| Event without a date | `update_event` with date fields |
| Event without a place | `update_event` with place_id or `add_place` first |
| Unsourced event | `add_citation` linking a source to the event |
| Person with no relationships | `create_relationship` linking to parents/spouse |
| Duplicate persons | `merge_persons` after verifying they're the same |

## Example Prompt (All-in-One)

> "Run quality checks on my tree. Summarize the results, then fix any issues that are clearly mechanical errors (missing sex where it can be inferred from name or relationships, obviously wrong date formats). For anything that needs research, create research tasks. Finally, check for duplicates and show me any candidates."

## Tips

- Run quality checks after every GEDCOM import -- imported data often has format issues
- The `run_checks` tool catches issues that are easy to miss when entering data manually
- Use `find_duplicates` periodically, especially if you import data from multiple sources
- After fixing issues, run `run_checks` again to confirm the fixes resolved the problems
- Quality checks are non-destructive -- they only report issues, never modify data automatically
