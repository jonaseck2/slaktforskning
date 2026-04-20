# Napkin Runbook

## Curation Rules
- Re-prioritize on every read.
- Keep recurring, high-value notes only.
- Max 10 items per category.
- Each item includes date + "Do instead".

## Execution & Validation (Highest Priority)
1. **[2026-04-17] Never commit UI changes without verifying they work in the running app**
   Do instead: ask the user to run `./.devcontainer/dev-debug.sh`, verify CDP with `./.devcontainer/verify-cdp.sh`, then use Chrome DevTools MCP to interact and screenshot before committing.
2. **[2026-04-17] Cannot launch Electron GUI from Claude Code's background shell on macOS**
   Do instead: ask the user to launch the app from their terminal. Use `./.devcontainer/verify-cdp.sh` to confirm CDP is active before using Chrome DevTools MCP. Never `pkill -f Electron` — it kills the user's app too.
3. **[2026-04-17] Adding `const` vars inside handler scope can shadow outer declarations**
   Do instead: check for existing same-name `const` later in the function before adding new ones (e.g. `dbDir` in media.ts).
4. **[2026-04-12] `npx tsc --noEmit` errors are all in node_modules**
   Do instead: filter with `grep "^src/"` to find actual source errors.

## Shell & Command Reliability
1. **[2026-04-20] Never use `cd /path/to/.worktrees/... && git <cmd>` from the controller**
   Do instead: always use `git -C /abs/path/to/worktree <cmd>` — single git command, matches `Bash(git:*)` allowlist, no permission-prompt friction. Compound `cd && git` forms trigger repeated approval prompts and are forbidden.
2. **[2026-04-17] `setsid` doesn't exist on macOS**
   Do instead: don't try to detach Electron from terminal. Ask the user to run it.

## Build & Performance
1. **[2026-04-18] Gazetteer JSON files (~40 MB) must be externalized from main process Vite build**
   Do instead: keep the `externalize-gazetteers` plugin in `vite.main.config.ts`. New gazetteer JSON files in `place-gazetteers/data/` are automatically externalized. They load at runtime via Node.js `require()`.

## Domain Behavior Guardrails
1. **[2026-04-17] Component tests break when removing UI elements (checkbox toggles etc.)**
   Do instead: update component tests in the same commit when changing component structure.
2. **[2026-04-17] `usePlaceResolver` defaults to empty gazetteers on new databases**
   Do instead: when `gazetteer_config` is null, default to all bundled gazetteers (same as GazetteersView).
3. **[2026-04-12] Leaflet icon fix must happen at module level**
   Do instead: BaseMap.vue handles this centrally — don't duplicate in consuming components.