# Open Source Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish Släktforskning as a community-ready open-source project with CI/CD, automated releases, and Claude-powered issue triage.

**Architecture:** Add repository governance files (LICENSE, CONTRIBUTING, etc.), three GitHub Actions workflows (CI, release, Claude maintainer), structured issue/PR templates, and a redesigned README. All automation lives in-repo as GitHub Actions.

**Tech Stack:** GitHub Actions, anthropics/claude-code-action, Electron Forge makers

**Spec:** [docs/plans/2026-04-18-open-source-publishing-design.md](docs/plans/2026-04-18-open-source-publishing-design.md)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `LICENSE` | MIT license text |
| `CONTRIBUTING.md` | Dev setup, commit conventions, PR guidelines |
| `CODE_OF_CONDUCT.md` | Contributor Covenant v2.1 |
| `SECURITY.md` | Vulnerability disclosure policy |
| `.github/ISSUE_TEMPLATE/bug_report.yml` | Structured bug report form |
| `.github/ISSUE_TEMPLATE/feature_request.yml` | Structured feature request form |
| `.github/PULL_REQUEST_TEMPLATE.md` | PR checklist template |
| `.github/workflows/ci.yml` | PR checks (lint, test, e2e) |
| `.github/workflows/release.yml` | Auto-release on main push |
| `.github/workflows/claude.yml` | Claude issue triage and PR review |
| `README.md` | Redesigned for open-source audience |
| `package.json` | Add repository + homepage fields |
| `.devcontainer/Dockerfile` | Patch any missing system libs so builds + E2E run in-container |
| `.devcontainer/xvfb-start.sh` | Ensure Xvfb auto-starts so Playwright picks up `DISPLAY=:99` |
| `docs/PLAN.md` | Implementation status entry |

---

### Task 1: LICENSE file

**Files:**
- Create: `LICENSE`

- [ ] **Step 1: Create MIT license file**

```
MIT License

Copyright (c) 2026 Jonas Ahnstedt

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "chore: add MIT LICENSE file"
```

---

### Task 2: CODE_OF_CONDUCT.md

**Files:**
- Create: `CODE_OF_CONDUCT.md`

- [ ] **Step 1: Create Contributor Covenant v2.1**

Use the standard Contributor Covenant v2.1 text from https://www.contributor-covenant.org/version/2/1/code_of_conduct/

Set the enforcement contact to: `jonas.ahnstedt@imeto.se`

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "chore: add Contributor Covenant code of conduct"
```

---

### Task 3: CONTRIBUTING.md

**Files:**
- Create: `CONTRIBUTING.md`

- [ ] **Step 1: Create contributing guide**

Cover these sections:

**Getting Started:**
- Prerequisites: Node.js 22+, npm
- Clone, `npm install`, `npm start`
- `npm test` for unit tests, `npm run lint` for linting

**Development Workflow:**
- Create a feature branch from `main`
- Make changes, run `npm run lint && npm test` before committing
- Every commit that ships a fix or feature bumps `package.json` version (patch for fixes, minor for features)
- Open a PR against `main`

**Commit Messages:**
- Use imperative mood: "add feature" not "added feature"
- Prefix with type: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`

**Architecture:**
- `src/api/` is the single source of truth for business logic — no Electron imports
- Both IPC handlers and MCP server call the same api/ functions
- All api/ functions take a `Database` instance as first argument
- See `CLAUDE.md` for the full architecture reference

**Testing:**
- Unit tests: `tests/unit/` — test `src/api/` with in-memory SQLite
- E2E tests: `tests/e2e/` — Playwright app launch + MCP server
- New features need tests; bug fixes need a regression test

**Code of Conduct:**
- Link to `CODE_OF_CONDUCT.md`

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "docs: add CONTRIBUTING.md"
```

---

### Task 4: SECURITY.md

**Files:**
- Create: `SECURITY.md`

- [ ] **Step 1: Create security policy**

```markdown
# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

**Email:** jonas.ahnstedt@imeto.se

**Please include:**
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

**Response timeline:**
- Acknowledgment within 48 hours
- Status update within 7 days
- Fix timeline communicated after assessment

**Please do NOT:**
- Open a public GitHub issue for security vulnerabilities
- Share vulnerability details publicly before a fix is available

## Supported Versions

Only the latest release is supported with security updates.
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "docs: add SECURITY.md"
```

---

### Task 5: Issue and PR Templates

**Files:**
- Create: `.github/ISSUE_TEMPLATE/bug_report.yml`
- Create: `.github/ISSUE_TEMPLATE/feature_request.yml`
- Create: `.github/PULL_REQUEST_TEMPLATE.md`

- [ ] **Step 1: Create bug report template**

```yaml
name: Bug Report
description: Report a bug in Släktforskning
labels: [bug]
body:
  - type: textarea
    id: description
    attributes:
      label: Description
      description: A clear description of the bug.
    validations:
      required: true
  - type: textarea
    id: steps
    attributes:
      label: Steps to Reproduce
      description: How can we reproduce this?
      placeholder: |
        1. Go to '...'
        2. Click on '...'
        3. See error
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: Expected Behavior
      description: What did you expect to happen?
    validations:
      required: true
  - type: textarea
    id: actual
    attributes:
      label: Actual Behavior
      description: What actually happened?
    validations:
      required: true
  - type: input
    id: version
    attributes:
      label: App Version
      description: "Found in Settings or About. Example: 0.105.0"
    validations:
      required: true
  - type: dropdown
    id: os
    attributes:
      label: Operating System
      options:
        - macOS
        - Windows
        - Linux
    validations:
      required: true
  - type: textarea
    id: additional
    attributes:
      label: Additional Context
      description: Screenshots, logs, or anything else that might help.
```

- [ ] **Step 2: Create feature request template**

```yaml
name: Feature Request
description: Suggest a feature for Släktforskning
labels: [enhancement]
body:
  - type: textarea
    id: problem
    attributes:
      label: Problem
      description: What problem does this solve? What are you trying to do?
    validations:
      required: true
  - type: textarea
    id: solution
    attributes:
      label: Proposed Solution
      description: How do you think this should work?
    validations:
      required: true
  - type: textarea
    id: alternatives
    attributes:
      label: Alternatives Considered
      description: Any other approaches you have considered?
  - type: textarea
    id: additional
    attributes:
      label: Additional Context
      description: Screenshots, mockups, references to other apps.
```

- [ ] **Step 3: Create PR template**

```markdown
## Summary

<!-- What does this PR do? Why? -->

## Changes

<!-- Bullet list of key changes -->

## Test Plan

- [ ] `npm run lint` passes
- [ ] `npm test` passes
- [ ] Tested in the app (if UI change)

## Screenshots

<!-- If UI changes, add before/after screenshots -->
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: add issue and PR templates"
```

---

### Task 6: CI Workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create CI workflow**

```yaml
name: CI

on:
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  lint-and-test:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm test

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps
      - name: Start Xvfb
        run: |
          Xvfb :99 -screen 0 1280x1024x24 &
          echo "DISPLAY=:99" >> $GITHUB_ENV
      - run: npx playwright test
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "ci: add PR check workflow (lint, test, e2e)"
```

---

### Task 7: Release Workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create release workflow**

```yaml
name: Release

on:
  push:
    branches: [main]

permissions:
  contents: write

jobs:
  check-version:
    runs-on: ubuntu-latest
    outputs:
      changed: ${{ steps.check.outputs.changed }}
      version: ${{ steps.check.outputs.version }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2
      - name: Check version change
        id: check
        run: |
          CURRENT=$(node -p "require('./package.json').version")
          PREVIOUS=$(git show HEAD~1:package.json | node -p "JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).version")
          if [ "$CURRENT" != "$PREVIOUS" ]; then
            echo "changed=true" >> $GITHUB_OUTPUT
            echo "version=$CURRENT" >> $GITHUB_OUTPUT
            echo "Version changed: $PREVIOUS -> $CURRENT"
          else
            echo "changed=false" >> $GITHUB_OUTPUT
            echo "Version unchanged: $CURRENT"
          fi

  build:
    needs: check-version
    if: needs.check-version.outputs.changed == 'true'
    strategy:
      matrix:
        include:
          - os: macos-latest
            platform: darwin
          - os: windows-latest
            platform: win32
          - os: ubuntu-latest
            platform: linux
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run make -- --platform ${{ matrix.platform }}
      - uses: actions/upload-artifact@v4
        with:
          name: build-${{ matrix.platform }}
          path: out/make/**/*

  release:
    needs: [check-version, build]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with:
          path: artifacts
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: v${{ needs.check-version.outputs.version }}
          name: v${{ needs.check-version.outputs.version }}
          generate_release_notes: true
          files: artifacts/**/*
```

**Key design points:**
- `check-version` job compares current `package.json` version with the parent commit. If unchanged, all downstream jobs are skipped.
- `build` runs on native runners (macOS builds macOS binaries, etc.)
- `release` collects all artifacts and creates a GitHub Release with auto-generated notes.
- Uses `softprops/action-gh-release` which is the most popular release action.

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "ci: add auto-release workflow for all platforms"
```

---

### Task 8: Claude Maintainer Workflow

**Files:**
- Create: `.github/workflows/claude.yml`

- [ ] **Step 1: Create Claude maintainer workflow**

```yaml
name: Claude

on:
  issues:
    types: [opened]
  issue_comment:
    types: [created]
  pull_request:
    types: [opened]

permissions:
  contents: read
  issues: write
  pull-requests: write

jobs:
  claude:
    if: ${{ github.event.comment == null || github.event.comment.performed_via_github_app == null }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: |
            You are an AI assistant helping maintain the Släktforskning genealogy app.
            You should identify yourself as an AI assistant when interacting with users.
            Use CLAUDE.md as your primary reference for architecture and conventions.

            **On new issues:**
            - Apply one label: bug, enhancement, question, or docs
            - If a bug report is missing reproduction steps or app version, politely ask for them
            - Search existing open issues for potential duplicates; if found, comment with a link
            - Do NOT close issues or make decisions — flag things for the maintainer

            **On new PRs:**
            - Review code against the conventions in CLAUDE.md
            - Check: architecture alignment (api/ has no Electron deps, db passed as param), test coverage, TypeScript types, i18n
            - Flag any security concerns
            - Do NOT approve or merge — provide review feedback only

            **On issue comments:**
            - If someone asks a question about the codebase or how a feature works, answer using CLAUDE.md and the docs/ directory
            - Be helpful and welcoming to new contributors
            - If you don't know the answer, say so rather than guessing
```

**Prerequisites:** The repo must have an `ANTHROPIC_API_KEY` secret configured in GitHub Settings > Secrets and variables > Actions.

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "ci: add Claude maintainer workflow for issue triage and PR review"
```

---

### Task 9: Update package.json metadata

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add repository and homepage fields**

Add these fields to `package.json` after the `"license"` field:

```json
"repository": {
  "type": "git",
  "url": "https://github.com/jonaseck2/slaktforskning.git"
},
"homepage": "https://github.com/jonaseck2/slaktforskning"
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "chore: add repository and homepage to package.json"
```

---

### Task 10: Redesign README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Rewrite README**

Replace the entire README with the new structure. Key sections:

**1. Hero:**
```markdown
# Släktforskning

A local-first, cross-platform desktop app for genealogy research. Your family tree, your data, your machine.

[![CI](https://github.com/jonaseck2/slaktforskning/actions/workflows/ci.yml/badge.svg)](https://github.com/jonaseck2/slaktforskning/actions/workflows/ci.yml)
[![Release](https://github.com/jonaseck2/slaktforskning/actions/workflows/release.yml/badge.svg)](https://github.com/jonaseck2/slaktforskning/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
```

**2. What is this** — 2-3 sentences: Electron + Vue 3 + SQLite desktop app. All data stays local. Built-in MCP server for AI agent access. Swedish and English.

**3. Features** — Concise bullet list:
- Local SQLite database — no cloud, no account
- GEDCOM 5.5.1 & 7.0 import/export
- Family tree charts (pedigree, hourglass, descendant, fan, circle, timeline)
- Place resolution with 25 bundled gazetteers (Scandinavia, North America, world)
- Source citations with confidence levels and transcriptions
- Built-in MCP server (34 tools) for AI-powered research
- Multi-window support
- Accessibility: screen reader mode, high contrast, keyboard navigation
- Swedish and English interface

**4. Installation** — Two paths:
- Download from [Releases](https://github.com/jonaseck2/slaktforskning/releases) (macOS .dmg, Windows .exe, Linux .deb/.rpm)
- Or build from source: `git clone`, `npm install`, `npm start`
- Note: builds are unsigned — macOS/Windows may show security warnings on first launch

**5. Getting Started** — Brief: sidebar nav, add person, add events, Cmd+N for new window.

**6. MCP Server** — Condensed setup (Claude Desktop config JSON + `npx tsx src/mcp/server.ts`), link to [docs/MCP.md](docs/MCP.md) for full tool reference and example workflows.

**7. Development:**
```
npm start              # Launch in dev mode
npm test               # Unit tests (Vitest)
npm run lint           # ESLint
npx playwright test    # E2E tests
npm run make           # Build installers
npm run make:mac       # Build macOS only
npm run make:win       # Build Windows only
npm run make:linux     # Build Linux only
```
Brief project structure, link to CLAUDE.md for full architecture.

**8. Contributing** — "See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines."

**9. License** — "MIT — see [LICENSE](LICENSE)."

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "docs: redesign README for open-source launch"
```

---

### Task 11: Update .gitignore

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add .env pattern**

Add `.env*` to `.gitignore` to prevent accidental secret commits from contributors:

```
.env*
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "chore: add .env to .gitignore"
```

---

### Task 12: Fix devcontainer builds and E2E tests

**Goal:** Ensure `npm run package` and `npx playwright test` work inside the repo's VS Code Dev Container so contributors can build and run the full test matrix without a local macOS/Windows environment. The devcontainer already installs Xvfb and Electron system libraries (see [.devcontainer/Dockerfile](.devcontainer/Dockerfile)) and the `postStartCommand` launches Xvfb on `:99` — this task verifies that pipeline end-to-end and patches whatever is currently broken. Keeps devcontainer in parity with the Ubuntu CI runner in Task 6, so CI failures can be reproduced locally.

**Files:**
- Modify (as needed): `.devcontainer/Dockerfile`
- Modify (as needed): `.devcontainer/devcontainer.json`
- Modify (as needed): `.devcontainer/xvfb-start.sh`
- Modify (as needed): `.devcontainer/ensure-native-binaries.sh`
- Modify: `CONTRIBUTING.md` (document the supported flows)
- Modify (as needed): `CLAUDE.md` (update the "In the Dev Container" block if commands change)

- [ ] **Step 1: Rebuild the container and verify baseline**

"Dev Containers: Rebuild Container" in VS Code (or `devcontainer up --workspace-folder .`). Wait for `postCreateCommand` (`npm install && ensure-native-binaries && npx playwright install chromium && bash .devcontainer/check-claude-skills.sh || true`) and `postStartCommand` (`bash .devcontainer/xvfb-start.sh`) to finish.

Verify inside the container:
- `node --version` → 22.x
- `echo $DISPLAY` → `:99`
- `pgrep -x Xvfb` → non-empty
- `ls node_modules/node-sqlite3-wasm/dist/` includes the Linux WASM binary

- [ ] **Step 2: Verify lint + unit tests**

```bash
npm run lint
npm test
```

Both must pass with zero errors. If native modules complain about architecture mismatch, `ensure-native-binaries` should have handled it — re-run `ensure-native-binaries` manually and re-check.

- [ ] **Step 3: Verify Linux build**

```bash
npm run package
```

Expected: a Linux distributable under `out/make/**`. If it fails with missing `.so` libraries, add the relevant `lib*` package to the `apt-get install` list in [.devcontainer/Dockerfile](.devcontainer/Dockerfile) and rebuild. Common Electron/Forge suspects: `libxss1`, `libgconf-2-4`, `fuse` (for AppImage), `rpm`, `dpkg`, `fakeroot`.

- [ ] **Step 4: Verify E2E tests with Xvfb**

```bash
npx playwright test
```

Both Playwright tests (app launch + MCP server handshake) must pass. If Electron fails to start:
- Confirm `DISPLAY=:99` is exported in the shell (`echo $DISPLAY`)
- Confirm `Xvfb :99` is still running (`pgrep -x Xvfb`)
- Inspect `~/.npm/_logs/` and any `electron-*.log` for the underlying error
- If a Chromium runtime lib is missing, add it to the Dockerfile

- [ ] **Step 5: Document the devcontainer flow in CONTRIBUTING.md**

Add a section to `CONTRIBUTING.md` (created in Task 3):

```markdown
## Using the Dev Container

The repo includes a VS Code Dev Container with Node 22, Electron system dependencies, Xvfb, and a headless JRE (for Genney imports).

Open the project in VS Code with the "Dev Containers" extension and choose "Reopen in Container". Once built:

- `npm test` — unit tests
- `npm run lint` — linting
- `npx playwright test` — E2E tests (Xvfb auto-starts on container launch via `postStartCommand`; `DISPLAY=:99` is set in `remoteEnv`)
- `npm run package` — build a Linux distributable under `out/make/`

`npm start` (interactive dev mode) does not work in the devcontainer — there is no physical display. Use your host machine for interactive UI development.
```

- [ ] **Step 6: Sync CLAUDE.md if commands changed**

If Step 3 or 4 required new Dockerfile packages or new scripts, update the "In the Dev Container" block in `CLAUDE.md` so agents running inside the container see the current instructions.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "fix(devcontainer): verify builds and E2E tests work with Xvfb"
```

---

### Task 13: Version bump + PLAN.md entry

**Files:**
- Modify: `package.json` (version bump)
- Modify: `docs/PLAN.md` (implementation status entry)

- [ ] **Step 1: Bump version**

This is a feature (minor bump). Bump from current version to the next minor in `package.json`.

- [ ] **Step 2: Add PLAN.md implementation status row**

Add to the Implementation Status table:

```
| vX.Y.0 | Open source publishing: CI/CD, releases, Claude triage, README redesign | [spec](plans/2026-04-18-open-source-publishing-design.md) |
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: open source publishing infrastructure

Add LICENSE, CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md.
Add GitHub Actions: CI (lint/test/e2e), auto-release, Claude maintainer.
Add issue and PR templates. Redesign README with badges."
```

**Note:** If tasks 1-12 were committed individually, this task is just the version bump + PLAN.md update. If using subagent-driven-development where all tasks are batched, this is the final commit that ties everything together.

---

### Task 14: Verify and configure GitHub

**Files:** None (manual GitHub configuration)

- [ ] **Step 1: Push to GitHub**

```bash
git push origin main
```

- [ ] **Step 2: Add ANTHROPIC_API_KEY secret**

Go to GitHub repo > Settings > Secrets and variables > Actions > New repository secret.
Name: `ANTHROPIC_API_KEY`, Value: your Anthropic API key.

- [ ] **Step 3: Make repo public**

GitHub repo > Settings > Danger Zone > Change visibility > Public.

- [ ] **Step 4: Verify CI badge**

Check that the CI and Release badges in the README render correctly on the GitHub repo page.

- [ ] **Step 5: Test Claude workflow**

Create a test issue to verify the Claude workflow triggers and responds appropriately. Delete the test issue afterward.
