# Napkin Runbook

## Curation Rules
- Re-prioritize on every read.
- Keep recurring, high-value notes only.
- Max 10 items per category.
- Each item includes date + "Do instead".

## Execution & Validation (Highest Priority)
1. **[2026-04-17] Adding `const` vars inside handler scope can shadow outer declarations**
   Do instead: check for existing same-name `const` later in the function before adding new ones (e.g. `dbDir` in media.ts).
2. **[2026-04-12] `npx tsc --noEmit` errors are all in node_modules**
   Do instead: filter with `grep "^src/"` to find actual source errors.

## Shell & Command Reliability

## Domain Behavior Guardrails
1. **[2026-04-17] `usePlaceResolver` defaults to empty gazetteers on new databases**
   Do instead: when `gazetteer_config` is null, default to all bundled gazetteers (same as GazetteersView).
2. **[2026-04-17] Component tests break when removing UI elements (checkbox toggles etc.)**
   Do instead: update component tests in the same commit when changing component structure.
3. **[2026-04-12] Leaflet icon fix must happen at module level**
   Do instead: BaseMap.vue handles this centrally — don't duplicate in consuming components.
