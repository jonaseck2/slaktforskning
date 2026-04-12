# Napkin Runbook

## Curation Rules
- Re-prioritize on every read.
- Keep recurring, high-value notes only.
- Max 10 items per category.
- Each item includes date + "Do instead".

## Execution & Validation (Highest Priority)
1. **[2026-04-12] `npx tsc --noEmit` errors are all in node_modules**
   Do instead: filter with `grep "^src/"` to find actual source errors.

## Shell & Command Reliability

## Domain Behavior Guardrails
1. **[2026-04-12] Leaflet icon fix must happen at module level**
   Do instead: BaseMap.vue handles this centrally — don't duplicate in consuming components.