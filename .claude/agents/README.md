# Subagent Templates

Prompt templates for dispatching focused subagents during feature development. Used with `superpowers:subagent-driven-development`.

## Agents

| Template | Layer | Steps |
|----------|-------|-------|
| `api-implementer.md` | Types + Schema + CRUD functions | 1–3 |
| `test-writer.md` | Unit tests for api/ functions | 4 |
| `ipc-mcp-wirer.md` | IPC handlers + preload + MCP tools | 5–7 |
| `vue-ui-builder.md` | Vue views, components, i18n | 8 |
| `doc-syncer.md` | CLAUDE.md, IPC_REFERENCE, PLAN.md, README | 10 |

## Parallelism

Two groups can run in parallel:

```
Phase 1 (parallel): api-implementer + test-writer
Phase 2 (parallel): ipc-mcp-wirer + vue-ui-builder
Phase 3:            doc-syncer
```

`test-writer` can start once `api-implementer` has committed (function signatures are visible in git).
`ipc-mcp-wirer` and `vue-ui-builder` can start once Phase 1 is done.

## How to dispatch

Fill in `{{TASK}}` with a concrete description of what to implement — the api function signatures, the schema change, the UI section, etc. The more specific, the better.

Each agent commits its own work. Reviews (spec compliance + code quality) run after each agent using `superpowers:subagent-driven-development`.
