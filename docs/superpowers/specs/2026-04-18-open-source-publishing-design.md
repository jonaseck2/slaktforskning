# Open Source Publishing

Publish Släktforskning as a public GitHub repository with CI/CD, automated releases, Claude-powered issue triage, and community-ready documentation.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Release strategy | Main-branch auto-release | Every commit is already versioned; no manual tags needed |
| Code signing | Skip for now | Add as a separate milestone when there's a user base |
| Claude maintainer scope | GitHub Actions only | Simple, auditable, everything lives in the repo |
| Documentation | README + in-repo docs | No wiki; docs/ is already comprehensive, avoid drift |

---

## 1. Repository Infrastructure

### Files to Add

| File | Content |
|------|---------|
| `LICENSE` | MIT license text (year: 2026, holder: Jonas Ahnstedt) |
| `CONTRIBUTING.md` | Dev setup, commit conventions (version bump per commit), PR guidelines, link to CODE_OF_CONDUCT |
| `CODE_OF_CONDUCT.md` | Contributor Covenant v2.1 |
| `SECURITY.md` | Vulnerability disclosure via email (jonas.ahnstedt@imeto.se), responsible disclosure expectations |
| `.github/ISSUE_TEMPLATE/bug_report.yml` | YAML form: description, steps to reproduce, expected/actual behavior, OS, app version |
| `.github/ISSUE_TEMPLATE/feature_request.yml` | YAML form: problem statement, proposed solution, alternatives considered |
| `.github/PULL_REQUEST_TEMPLATE.md` | Checklist: description, test plan, screenshots (if UI), lint/test pass confirmation |

### package.json Updates

Add `"repository"` and `"homepage"` fields pointing to the GitHub URL. The exact URL is TBD until the repo is created/made public — use a placeholder like `github.com/jonasahnstedt/slaktforskning` and update when finalized.

---

## 2. CI/CD Pipelines

Three GitHub Actions workflows.

### 2.1 `ci.yml` — PR Checks

**Trigger:** Pull request to `main`.

**Matrix:** Node 22 on `ubuntu-latest`, `macos-latest`, `windows-latest`.

**Steps (all platforms):**
1. Checkout
2. `npm ci`
3. `npm run lint`
4. `npm test`

**Steps (ubuntu only):**
5. Install Playwright deps
6. Start Xvfb
7. `npx playwright test`

E2E tests run only on Ubuntu because they require Xvfb and the devcontainer setup is Linux-based. Unit tests and lint run on all three platforms to catch platform-specific issues.

### 2.2 `release.yml` — Build & Publish

**Trigger:** Push to `main`.

**Version-change gate:** Compare `package.json` version in current commit vs. parent commit. If unchanged, skip all build/release jobs. This avoids releasing for docs-only or config-only commits.

**Build matrix:** Native runners per platform.

| Runner | Makers | Artifacts |
|--------|--------|-----------|
| `macos-latest` | DMG, ZIP | `Släktforskning-x.y.z-arm64.dmg`, `.zip` |
| `windows-latest` | Squirrel | `Släktforskning-x.y.z Setup.exe` |
| `ubuntu-latest` | Deb, RPM, ZIP | `.deb`, `.rpm`, `.zip` |

**Release job** (after all builds):
- Create GitHub Release tagged `vX.Y.Z`
- Attach all platform artifacts
- Auto-generate release notes from commits since last release

**Note:** Builds are unsigned. macOS users will see "unidentified developer" and Windows users will see SmartScreen warnings. This is acceptable for now — code signing is a future milestone.

### 2.3 `claude.yml` — Claude Maintainer

**Trigger:** `issues.opened`, `issue_comment.created`, `pull_request.opened`.

**Action:** `anthropics/claude-code-action` (official GitHub Action).

**Behavior by trigger:**

**On new issue:**
- Classify and apply labels: `bug`, `feature`, `question`, `docs`
- If bug report is missing reproduction steps or version info, comment asking for them
- Search existing issues for potential duplicates, link if found
- Do NOT auto-close or make decisions

**On new PR:**
- Review code against CLAUDE.md conventions (architecture, patterns, testing)
- Comment with feedback on style, correctness, test coverage
- Flag any security concerns (OWASP top 10)
- Do NOT approve or merge

**On issue comment:**
- Respond to questions about the codebase, architecture, or how features work
- Use CLAUDE.md and docs/ as reference material
- Identify as an AI assistant helping maintain the project

**Permissions:** The workflow needs `issues: write`, `pull-requests: write`, `contents: read`.

**API key:** Stored as a GitHub Actions secret (`ANTHROPIC_API_KEY`).

---

## 3. README Redesign

Replace current README with a structure optimized for three audiences: users, AI agents, and contributors.

### Structure

1. **Hero** — one-line tagline, badges (CI, Release, License), screenshot placeholder
2. **What is this** — 2-3 sentences: local-first, cross-platform, AI-native genealogy app
3. **Features** — bullet highlights: SQLite local storage, MCP server, GEDCOM import/export, Swedish & English, charts (pedigree/hourglass/descendant/fan/circle), quality checks, place resolution with gazetteers
4. **Installation** — pre-built binaries from GitHub Releases (mac/win/linux), or build from source (`git clone`, `npm ci`, `npm start`)
5. **Getting Started** — brief first-run walkthrough
6. **MCP Server** — setup instructions + one example workflow (condensed from current README, link to `docs/MCP.md` for full reference)
7. **Development** — `npm start`, `npm test`, `npm run lint`, project structure overview, link to CLAUDE.md for full architecture
8. **Contributing** — pointer to CONTRIBUTING.md
9. **License** — MIT

### Badges

```markdown
[![CI](https://github.com/{owner}/{repo}/actions/workflows/ci.yml/badge.svg)](https://github.com/{owner}/{repo}/actions/workflows/ci.yml)
[![Release](https://github.com/{owner}/{repo}/actions/workflows/release.yml/badge.svg)](https://github.com/{owner}/{repo}/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
```

Replace `{owner}/{repo}` with actual GitHub path when known.

### Content Migration

The current README's detailed MCP workflow examples and data model documentation are already covered in `docs/MCP.md` and `docs/DATA_MODEL.md`. The new README links to these rather than duplicating them.

---

## 4. Future Milestones (Out of Scope)

These are not part of this plan but should be tracked for later:

- **Code signing** — Apple Developer + Windows EV cert for trusted installs
- **Dependabot / Renovate** — automated dependency updates
- **Branch protection rules** — require CI pass before merge (configure in GitHub repo settings, not in code)
- **GitHub Discussions** — enable if community grows beyond issue-based Q&A
- **macOS universal binary** — build for both arm64 and x64
