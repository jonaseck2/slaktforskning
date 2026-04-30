# Project Subagents

Each `.md` file in this directory is a Claude Code subagent — registered with YAML frontmatter (`name`, `description`, `tools`) so the harness exposes it as a `subagent_type` in the Task tool. Auto-discovered every session.

## Agents

| Subagent | Layer | Steps |
|----------|-------|-------|
| `api-implementer` | Types + schema + CRUD functions in `src/api/` | 1–3 |
| `test-writer` | Vitest unit tests for `src/api/` | 4 |
| `ipc-mcp-wirer` | IPC channel registry + preload + MCP tool exposure | 5–7 |
| `vue-ui-builder` | Vue views/components/modals/panels in `src/renderer/` | 8 |
| `ux-reviewer` | Read-only consistency review of list views and side panels | (review) |

## Parallelism

```
Phase 1 (parallel): api-implementer + test-writer (test-writer starts once api signatures are committed)
Phase 2 (parallel): ipc-mcp-wirer + vue-ui-builder
Optional:           ux-reviewer (read-only, can run anytime)
```

## How to dispatch

Use the Task tool with the matching `subagent_type`, passing a concrete task description as the `prompt`. The agent body becomes the system prompt; your prompt becomes the task. `superpowers:subagent-driven-development` orchestrates this with two-stage review (spec compliance + code quality) after each agent.

**Each agent commits its own work AND its own docs.** Per the `/commit` skill's bundle rule, docs that describe what just changed go in the same commit as the code — not a follow-up "doc-sync" pass. Cross-cutting milestone closeout (archiving the plan file, updating `docs/PLAN.md` roadmap, the `## vX.Y.Z` CHANGELOG header) happens in the **last** commit of a multi-commit feature, also via `/commit`.
