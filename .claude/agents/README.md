# Project Subagents

Each `.md` file in this directory is a Claude Code subagent — registered with YAML frontmatter (`name`, `description`, `tools`) so the harness exposes it as a `subagent_type` in the Task tool. Auto-discovered every session.

## Agents

| Subagent | Layer | Steps |
|----------|-------|-------|
| `api-implementer` | Types + schema + CRUD functions in `src/api/` | 1–3 |
| `test-writer` | Vitest unit tests for `src/api/` | 4 |
| `ipc-mcp-wirer` | IPC channel registry + preload + MCP tool exposure | 5–7 |
| `vue-ui-builder` | Vue views/components/modals/panels in `src/renderer/` | 8 |
| `doc-syncer` | Sync CLAUDE.md, IPC_REFERENCE.md, PLAN.md, README, skills, rules to match a committed feature | 10 |
| `ux-reviewer` | Read-only consistency review of list views and side panels | (review) |

## Parallelism

```
Phase 1 (parallel): api-implementer + test-writer (test-writer starts once api signatures are committed)
Phase 2 (parallel): ipc-mcp-wirer + vue-ui-builder
Phase 3:            doc-syncer
Optional:           ux-reviewer (read-only, can run anytime)
```

## How to dispatch

Use the Task tool with the matching `subagent_type`, passing a concrete task description as the `prompt`. The agent body becomes the system prompt; your prompt becomes the task. `superpowers:subagent-driven-development` orchestrates this with two-stage review (spec compliance + code quality) after each agent.

Each agent commits its own work.
