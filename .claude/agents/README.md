# Project Subagents

Each `.md` file in this directory is a Claude Code subagent — registered with YAML frontmatter (`name`, `description`, `tools`) so the harness exposes it as a `subagent_type` in the Task tool. Auto-discovered every session.

## Agents

| Subagent | Layer |
|----------|-------|
| `api-implementer` | Types + schema + CRUD functions in `src/api/` |
| `test-writer` | Vitest unit tests for `src/api/` |
| `vue-ui-builder` | Vue views/components/modals/panels in `src/renderer/` |
| `ux-reviewer` | Read-only consistency review of list views and side panels |

## Parallelism

```
Phase 1: api-implementer (then test-writer once api signatures are committed)
Phase 2: vue-ui-builder
Optional: ux-reviewer (read-only, any time)
```

There is no IPC/MCP wiring agent. Rust commands generate `src/renderer/bindings.ts` via Specta automatically; renderer-local API surface is hand-wired in `src/renderer/tauri-window-api.ts`; MCP tools are added in `src/mcp/createProdServer.ts` / `createDevServer.ts`. See the `tauri-bridge` and `slaktforskning-mcp-dev` skills.

## How to dispatch

Use the Task tool with the matching `subagent_type`, passing a concrete task description as the `prompt`. The agent body becomes the system prompt; your prompt becomes the task. `superpowers:subagent-driven-development` orchestrates this with two-stage review (spec compliance + code quality) after each agent.

**Each agent commits its own work AND its own docs.** Per the `/commit` skill's bundle rule, docs that describe what just changed go in the same commit as the code — not a follow-up "doc-sync" pass. Cross-cutting milestone closeout (archiving the plan file, updating `docs/PLAN.md` roadmap, the new `## vX.Y.Z` CHANGELOG block) happens in the **last** commit of a multi-commit feature, also via `/commit`. CHANGELOG mechanics are owned by `oss-release`; agents never touch CHANGELOG.md directly.
