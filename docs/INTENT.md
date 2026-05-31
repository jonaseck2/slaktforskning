# Intent: Släktforskning

The product north star. Single referent for "is this in scope, is this at-odds, is this worth building?" Lives next to `CLAUDE.md` (technical Prime Directives) and `WORKFLOW.md` (process intent). When a UX report, a feature request, a plan, or an idea conflicts with this file, the file wins — or the file changes; both options are open, neither is silent override.

If a plan begins with mechanism instead of intent (per `.claude/rules/plans.md`), this file is the test for whether the intent is even legitimate.

---

## What this app is

**A local-first desktop archive for one researcher's lifetime of genealogy work.**

- **Local-first:** the database, the media, the gazetteers, the indexes — everything lives on the user's machine. No cloud account, no remote sync, no telemetry, no "trust us with your data."
- **Lifetime-scale:** designed to outlast subscriptions, app stores, and OS releases. The user's data must remain accessible decades after this codebase stops shipping updates. SQLite + plaintext media + GEDCOM round-trip are the survivability primitives.
- **For one researcher:** the application surface is single-user. Collaboration, sharing, and publishing exist only as *exports* (GEDCOM, archive `.zip`, HTML website). The DB is never a shared working surface.
- **A desktop app:** Tauri 2 + Vue 3 + SQLite. Cross-platform (macOS, Windows, Linux) but emphatically not mobile, not browser-hosted, not progressive-web. The user is sitting at a real computer with keyboard, mouse, and screen.

## Who it serves

**The 60+ hobbyist genealogist who has outgrown commercial tools and wants their decades of work on their own machine, forever.**

The archetype:
- Has used Holger / MyHeritage / Ancestry / Gramps / RootsMagic for years.
- Knows GEDCOM exists, has imported and exported it, knows what gets lost.
- Reads carefully, types in Swedish (or their own language), prefers explicit text to icons.
- May have limited vision; uses larger text, high-contrast, sometimes a screen reader.
- Does not want an AI to "help finish" their tree. The act of researching IS the value.
- Does not want recommendations from a recommendation engine. The data is sacred.
- Has files going back to the 1990s in unspecified formats. Compatibility with their accumulated work is a precondition, not a feature.

Second-order users:
- The researcher's family who inherits the file when they pass. The HTML-website export targets this case.
- The contributor who wants to extend the codebase. Documentation and workflow live here for them too — but they are not the primary user.

Out of scope, deliberately:
- Casual users who "want to find their roots." Ancestry/MyHeritage serve them better; we'd compromise core values to chase them.
- DNA-driven discovery, ethnicity estimates, autosomal matching. Different product. Different value system.
- Live researchers in a shared tree. That's a collaboration product, not an archive.

## What this app explicitly rejects

Each rejection has a reason; every reason is a value, not a constraint. Reopening any of these requires changing the value.

| Rejection | Value it protects |
|---|---|
| **Cloud sync / remote DB** | The data is yours forever, not held hostage by our continued operation. |
| **Subscription / paywall** | The same. A lifetime archive cannot rent itself back to its owner. |
| **In-app AI / integrated chatbot / in-process LLM** | The DB stores what the user authored, never what an algorithm guessed. The MCP server gives *external* agents read/write access; the app itself ships no integrated agent. (See CLAUDE.md.) |
| **Inferred values written back to the DB** | Prime Directive. Inference is a render-time computation, never persisted. |
| **Silent GEDCOM data loss** | Prime Directive (cont.). Every authored field round-trips or is documented as lossy with a spec citation. |
| **Auto-suggestions that mutate the DB** | Same family as the previous two. The user does the work. Tools surface possibilities; tools never commit. |
| **Telemetry, analytics, "anonymous usage data"** | A local-first archive that phones home is no longer local-first. |
| **Social features** — sharing, comments, following | Not a genealogy app's job. The user's family tree is private until the user exports it. |
| **DNA matching / autosomal tooling** | Different domain entirely. Different ethical surface (privacy, ancestry inference). |
| **Mobile / web / PWA target** | Real desktop, real keyboard, real file system. The 60+ archivist isn't researching on a phone. |
| **Recommendation engines / "you might be interested in"** | The data is sacred and the user is sovereign. We surface what they authored, not what we guessed they want. |
| **Forced upgrades / breaking changes without migration** | A lifetime archive cannot orphan its own users. Every schema change ships a migration; every UI rename ships an i18n key continuation. |

## What's in scope

A change is in scope if it makes the local archive **more accurate, more accessible, more portable, or more durable**. These four dimensions are the test.

| Dimension | What it means | Examples in our history |
|---|---|---|
| **More accurate** | The DB reflects what the user authored, no more, no less. | GEDCOM round-trip alignment, the Prime Directives, gazetteer disambiguation, quality checks that surface but don't auto-fix. |
| **More accessible** | The 60+ archivist with limited vision can use every feature. | WCAG 2.1 AAA in high-contrast mode, screen-reader mode, three-way appearance, three-way Read Aloud, Swedish-first i18n. |
| **More portable** | Data flows out (and back in) without loss. | GEDCOM 5.5.1 + 7.0 export with `lossy:<reason>` disclosure, archive `.zip` round-trip, HTML website export, native binary importers (Holger, Genney, RootsMagic, Gramps). |
| **More durable** | The archive survives this codebase's lifecycle. | SQLite DELETE journaling, sibling `<dbname>-media/` folder, no proprietary blob formats, plain-file backups via filesystem copy. |

A change failing all four is at-odds and should be killed, even if a user asks for it. A change that serves one but degrades another (e.g. a new feature that breaks GEDCOM round-trip) is at-odds *unless* it ships with the round-trip preserved or explicitly excluded.

## The bar for "worth building"

A feature is **worth building** when:

1. It serves at least one of the four in-scope dimensions above.
2. It does not violate any of the explicit rejections.
3. It is grounded in a real user surface (a panel, a modal, an export, an import, an MCP tool) — not in a "platform" or "framework" abstraction.
4. Its user goal is statable in plain user language, not in mechanism (per `.claude/rules/plans.md` §1).
5. The smallest version is shippable. Multi-quarter rewrites without intermediate shippable wins are at-odds with the lifetime-archive bias.

A feature is **worth killing** (writing "closed without plan — at-odds with INTENT.md §X" and moving on) when:

1. It serves a different user archetype (the casual ancestry-curious user, the DNA-matcher, the live collaborator).
2. It serves a different value system (recommendation, social, cloud, subscription).
3. It requires the app to phone home, mutate data without authoring, or rely on a remote service.
4. It is mechanism-first ("we should refactor X", "we should add framework Y") without a user-observable outcome.
5. Its smallest version is multi-week and has no intermediate user-observable result.

Bad ideas are not bad because they're hard. They're bad because they're at-odds. This file is what makes that distinction utterable.

## Relationship to other docs

- **`CLAUDE.md`** carries the technical Prime Directives (data fidelity, GEDCOM round-trip, surface contract). INTENT is the product-side complement.
- **`docs/WORKFLOW.md`** carries the agentic delivery process — how features go from intent to archive. WORKFLOW assumes INTENT exists.
- **`.claude/rules/plans.md`** governs plan format. Plans must declare a User goal in user language; INTENT is the test for whether the user goal is legitimate.
- **`.claude/rules/mandate.md`** declares the agent's authority. Authority to kill ideas as at-odds is grounded in this file.
- **`docs/PLAN.md`** lists planned work. Anything in "Planned" must be defensible against INTENT.

## When this file changes

INTENT is not immutable. It changes when:

- The user (project owner) explicitly redirects what the product is.
- A pattern of beta-tester feedback reveals that an archetype assumption is wrong.
- An "explicit rejection" becomes load-bearing for an in-scope goal (rare, requires explicit reasoning).

It does **not** change when:

- A specific user asks for an out-of-scope feature once.
- A maintainer briefly thinks a new direction would be exciting.
- A scheduled retro finds drift in plans — that's a workflow problem, not an intent problem.

Changes to INTENT are PR-shaped and reviewed against historical decisions documented in `docs/plans/archive/`. The git log on this file is the audit trail of how the product's meaning shifted.

## Meta — why this file exists

Through 2026-04 and -05, the project shipped substantial features (GEDCOM alignment, gazetteer disambiguation, modal refactors, e2e expansion) while the workflow drifted (stale plans, PLAN.md out of sync, four 2026-05-14 plans needing a manual sweep, multiple FELRAPPORTs sitting on "we should reproduce next time"). The drift's structural cause was that the workflow itself was an unowned artifact — every artifact in the repo had a guardian rule except the workflow.

The 2026-05-31 retro identified that the agent had been relying on the human to remember 6-step close-out across multi-day sessions. The fix is to make INTENT (this file), WORKFLOW (`docs/WORKFLOW.md`), and MANDATE (`.claude/rules/mandate.md`) first-class artifacts that ship with the app and version with the app, owned by the agent the same way the schema and the importers are owned.

This file is the foundation of that ownership. Everything else (workflow, mandate, skills, retro) refers back here.
