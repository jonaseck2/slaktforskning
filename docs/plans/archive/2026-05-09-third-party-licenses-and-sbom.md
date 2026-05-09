# Third-Party Licenses + SBOM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

---

## User goal

A user who downloads and runs OurLegacy can open **Settings → About → View open source notices** and read the full license text of every third-party library that travels inside the binary they're running. A maintainer or regulator looking at any GitHub release page can download a machine-readable SBOM (`sbom.cdx.json`, CycloneDX) listing every dependency and its version.

This closes a real gap before we publicize the app: most npm dependencies (MIT/BSD/ISC/Apache-2.0) require their license text to travel with the binary, and Apache-2.0 specifically requires NOTICE/attribution. Today we ship `LICENSE` (our MIT text) only — every other license obligation is silently unfulfilled. The SBOM is not legally required today, but the EU CRA window starts in late 2027 and emitting one now is a 10-line workflow change.

## Scope

The pattern this plan introduces is "third-party license attribution travels with the artifact." Every artifact we publish must carry it (or be explicitly excluded with a reason). Full enumeration:

- **Desktop app binaries** (`npm run make` → macOS .dmg, Windows .exe, Linux .deb/.rpm). **In scope.** Bundle `THIRD_PARTY_LICENSES.txt` via Forge `extraResource`; surface in `AboutModal`.
- **GitHub Release artifacts.** **In scope.** Attach the same `THIRD_PARTY_LICENSES.txt` and a CycloneDX `sbom.cdx.json` to every release in `.github/workflows/release.yml`.
- **Static SPA bundle** (`npm run build:static` → `dist-static/`, published by users to their own web hosts). **Scope deviation: not in this plan.** Reason: the static SPA is republished by the genealogist to a host of their choice, so license obligations for *that* redistribution fall on the user-as-publisher, not on us. We're not the distributor of those bytes once they've been exported. Revisit if/when we host a public preview ourselves; track as a backlog note in `docs/PLAN.md`.
- **MCP server (`npx tsx src/mcp/server.ts`).** **Out of scope.** Source-code distribution path; license obligations are satisfied by the in-tree `LICENSE` + `package.json` license fields. Not a binary artifact.

No other distribution channels exist today.

## Verification

User-observable outcomes the plan is verified against:

1. **In-app:** Run `npm run package`. Launch the packaged app from `out/`. Click *Settings → Om OurLegacy → Visa öppen källkod-information* (or the English equivalent). A scrollable view appears showing every production npm dependency with its name, version, license identifier, and full license text. Electron/Chromium's own `LICENSE`/`LICENSES.chromium.html` (already bundled by `electron-packager`) is mentioned with a pointer to the resources folder.
2. **In CI:** The next push to `main` that bumps version produces a GitHub Release with `Slaktforskning-<version>-<platform>.zip` (existing) **plus** `THIRD_PARTY_LICENSES.txt` and `sbom.cdx.json` attached as release assets. Download `sbom.cdx.json` and verify it parses as valid CycloneDX 1.5+ JSON listing top-level deps from `package.json`.
3. **Build determinism:** `node scripts/build-third-party-licenses.mjs` produces the same byte-identical file on two consecutive runs against an unchanged `node_modules` (test: run twice in succession, `diff` the outputs).

A unit test covers the script's structure (header, per-package format, footer) but does **not** count as user-goal verification by itself — it's hygiene. The user-goal check is "open the running app and read the licenses."

## Failure modes / RCA reference

Not a follow-up to a failed prior attempt. One pre-existing rule that applies and must be honored:

- **`.claude/rules/renderer.md` "Static SPA & website-export gotchas":** the in-app viewer reads the bundled file via an IPC call that returns the text — never via `fetch('file://...')` from the renderer (the static SPA bundle would inherit the same renderer code and break in the static context). Use `window.api.app.readThirdPartyLicenses()` returning a string.
- **No silent string-replace** (memory `feedback_no_silent_string_replace.md`). The script that walks `node_modules` must throw on missing license files for prod packages, not silently skip them. CI catches missing-license cases via the script's exit code.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `scripts/build-third-party-licenses.mjs` | Walk prod deps via `npm ls --omit=dev --all --json`; concat each package's LICENSE\* file with header (name, version, SPDX, repository); throw on missing license |
| `scripts/build-third-party-licenses.test.ts` | Unit test: smoke-runs the script, asserts header + at least one known package (e.g. Vue) appears |
| `forge.config.ts` | Add `hooks.generateAssets` to run the script before packaging; add `THIRD_PARTY_LICENSES.txt` to `packagerConfig.extraResource` |
| `package.json` | Add `build:third-party-licenses` npm script for manual / CI use |
| `src/main/ipc/app.ts` | New IPC handler `app:readThirdPartyLicenses` that reads `<resourcesPath>/THIRD_PARTY_LICENSES.txt` (or `<repo>/THIRD_PARTY_LICENSES.txt` in dev) and returns the string. Main-thread, not worker — pure fs read, no DB |
| `src/shared/channels/app.ts` | Register `app:readThirdPartyLicenses` typed channel |
| `src/preload/index.ts` | Expose `window.api.app.readThirdPartyLicenses(): Promise<string>` |
| `src/renderer/api.d.ts` | Add to typed `window.api.app` |
| `src/renderer/components/AboutModal.vue` | Add a "Visa öppen källkod-information" link that opens a `LicensesViewerModal` |
| `src/renderer/components/LicensesViewerModal.vue` | New modal: scrollable `<pre>` showing the bundled licenses text |
| `src/renderer/i18n/sv.ts` | Add `about.viewLicenses`, `about.licensesTitle`, `about.licensesElectronNote` |
| `src/renderer/i18n/en.ts` | Same keys in English |
| `tests/unit/scripts.thirdPartyLicenses.test.ts` | Unit test for the script |
| `tests/unit/preload-coverage.test.ts` | Existing — passes once preload entry is added |
| `tests/unit/ipc-worker-coverage.test.ts` | Existing — `app:readThirdPartyLicenses` runs on main, not worker; ensure it's tagged correctly |
| `.github/workflows/release.yml` | Add SBOM step + attach `sbom.cdx.json` and `THIRD_PARTY_LICENSES.txt` to the GitHub Release |
| `.gitignore` | Add `THIRD_PARTY_LICENSES.txt` and `sbom.cdx.json` (build outputs) |
| `docs/PLAN.md` | Implementation status row |

---

### Task 1: Build-time license generation script

**Files:**
- Create: `scripts/build-third-party-licenses.mjs`
- Create: `tests/unit/scripts.thirdPartyLicenses.test.ts`
- Modify: `package.json` (add npm script)
- Modify: `.gitignore` (ignore generated file)

- [x] **Step 1: Write the failing test**

Create `tests/unit/scripts.thirdPartyLicenses.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const OUTPUT = join(ROOT, 'THIRD_PARTY_LICENSES.txt');

describe('build-third-party-licenses script', () => {
  beforeAll(() => {
    if (existsSync(OUTPUT)) rmSync(OUTPUT);
    execFileSync('node', ['scripts/build-third-party-licenses.mjs'], { cwd: ROOT, stdio: 'pipe' });
  });

  it('produces an output file', () => {
    expect(existsSync(OUTPUT)).toBe(true);
  });

  it('starts with a project header naming the file purpose', () => {
    const content = readFileSync(OUTPUT, 'utf8');
    expect(content.split('\n')[0]).toMatch(/^# Third-Party Licenses for OurLegacy/);
  });

  it('includes Vue (a known production dependency)', () => {
    const content = readFileSync(OUTPUT, 'utf8');
    expect(content).toMatch(/^## vue@/m);
    expect(content).toMatch(/MIT/);
  });

  it('includes electron (a known dev/runtime dependency that ships in the binary)', () => {
    const content = readFileSync(OUTPUT, 'utf8');
    expect(content).toMatch(/^## electron@/m);
  });

  it('is byte-identical on a second run (deterministic ordering)', () => {
    const first = readFileSync(OUTPUT, 'utf8');
    execFileSync('node', ['scripts/build-third-party-licenses.mjs'], { cwd: ROOT, stdio: 'pipe' });
    const second = readFileSync(OUTPUT, 'utf8');
    expect(second).toBe(first);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/scripts.thirdPartyLicenses.test.ts`
Expected: FAIL — script doesn't exist yet.

- [x] **Step 3: Implement the script**

Create `scripts/build-third-party-licenses.mjs`:

```javascript
#!/usr/bin/env node
/**
 * Walks production + Electron runtime deps and concatenates their LICENSE files
 * into a single THIRD_PARTY_LICENSES.txt at repo root.
 *
 * Throws on any prod dependency that doesn't have a recognizable LICENSE file —
 * we don't silently skip (per the no-silent-string-replace rule). If a package
 * legitimately has its license text in README only, add it to KNOWN_LICENSE_HINTS.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, 'THIRD_PARTY_LICENSES.txt');
const LICENSE_FILE_PATTERNS = /^(LICEN[SC]E|COPYING|NOTICE)(?:[-.].+)?$/i;

// Packages whose license text lives in README rather than a separate file.
// Empty for now — add entries (e.g. ['some-pkg', 'README.md']) as the script
// throws on real cases.
const KNOWN_LICENSE_HINTS = new Map();

/**
 * Walk the dep tree once, collecting the union of: production deps + Electron
 * (which is a devDep but ships in the binary). Output is a flat map keyed by
 * `<name>@<version>` for stable ordering.
 */
function collectDependencies() {
  const out = new Map();

  const prodTree = JSON.parse(
    execFileSync('npm', ['ls', '--omit=dev', '--all', '--json'], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] }).toString()
  );
  walk(prodTree, out);

  // Electron + electron-* runtime packages: dev deps that physically ship in
  // the binary's resources folder. Pull them via a targeted query.
  const electronTree = JSON.parse(
    execFileSync('npm', ['ls', 'electron', '--all', '--json'], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] }).toString()
  );
  walk(electronTree, out);

  return out;
}

function walk(node, out) {
  const deps = node.dependencies ?? {};
  for (const [name, info] of Object.entries(deps)) {
    if (!info?.version || info.extraneous) continue;
    const key = `${name}@${info.version}`;
    if (!out.has(key)) {
      out.set(key, { name, version: info.version, path: info.path ?? findPath(name) });
    }
    walk(info, out);
  }
}

function findPath(name) {
  // Fallback: standard node_modules lookup. We need this when `npm ls` doesn't
  // include a `path` (older npm versions); throws if the package isn't there,
  // surfacing the problem rather than silently dropping the entry.
  const p = join(ROOT, 'node_modules', ...name.split('/'));
  if (!existsSync(p)) throw new Error(`Cannot locate package directory for ${name}`);
  return p;
}

function readPackageMeta(pkgPath) {
  const pkg = JSON.parse(readFileSync(join(pkgPath, 'package.json'), 'utf8'));
  return {
    license: pkg.license ?? (Array.isArray(pkg.licenses) ? pkg.licenses.map(l => l.type ?? l).join(' OR ') : 'UNKNOWN'),
    repository: typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url ?? '',
    author: typeof pkg.author === 'string' ? pkg.author : pkg.author?.name ?? '',
  };
}

function readLicenseFile(pkgPath, name) {
  const hint = KNOWN_LICENSE_HINTS.get(name);
  if (hint) {
    const p = join(pkgPath, hint);
    if (!existsSync(p)) throw new Error(`KNOWN_LICENSE_HINTS points to missing file for ${name}: ${p}`);
    return readFileSync(p, 'utf8');
  }
  const entries = readdirSync(pkgPath);
  const candidate = entries.find(e => LICENSE_FILE_PATTERNS.test(e));
  if (!candidate) {
    throw new Error(
      `No LICENSE/COPYING/NOTICE file found for ${name} in ${pkgPath}. ` +
      `If the license text is in README, add ['${name}', '<filename>'] to KNOWN_LICENSE_HINTS.`
    );
  }
  return readFileSync(join(pkgPath, candidate), 'utf8');
}

function main() {
  const deps = collectDependencies();
  const sorted = [...deps.entries()].sort(([a], [b]) => a.localeCompare(b));
  const ourPkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

  const lines = [];
  lines.push(`# Third-Party Licenses for OurLegacy ${ourPkg.version}`);
  lines.push('');
  lines.push(`This file lists every third-party package whose code is bundled into the OurLegacy desktop application,`);
  lines.push(`together with its license text. OurLegacy itself is licensed under MIT (see LICENSE).`);
  lines.push('');
  lines.push(`Electron and Chromium ship their own license bundle inside the application resources;`);
  lines.push(`see \`LICENSES.chromium.html\` next to the application binary for those.`);
  lines.push('');
  lines.push(`Generated by scripts/build-third-party-licenses.mjs from ${sorted.length} packages.`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const [key, info] of sorted) {
    const meta = readPackageMeta(info.path);
    const licenseText = readLicenseFile(info.path, info.name);
    lines.push(`## ${key}`);
    lines.push('');
    lines.push(`- License: ${meta.license}`);
    if (meta.repository) lines.push(`- Repository: ${meta.repository}`);
    if (meta.author) lines.push(`- Author: ${meta.author}`);
    lines.push('');
    lines.push('```');
    lines.push(licenseText.trim());
    lines.push('```');
    lines.push('');
  }

  writeFileSync(OUTPUT, lines.join('\n'), 'utf8');
  console.log(`Wrote ${OUTPUT} (${sorted.length} packages, ${lines.join('\n').length} bytes)`);
}

main();
```

- [x] **Step 4: Add npm script and gitignore entry**

In `package.json`, add to `scripts`:

```json
"build:third-party-licenses": "node scripts/build-third-party-licenses.mjs"
```

In `.gitignore`, append:

```
# Generated build outputs (do not commit; regenerated by Forge hook)
THIRD_PARTY_LICENSES.txt
sbom.cdx.json
```

- [x] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/unit/scripts.thirdPartyLicenses.test.ts`
Expected: PASS — all five assertions green. If a package throws "No LICENSE file found", inspect the package and either (a) confirm it really has no license (legal red flag — surface to maintainer) or (b) add it to `KNOWN_LICENSE_HINTS` with the actual filename.

- [x] **Step 6: Verify lint and full test suite**

```bash
npm run lint
npm test
```

Both must pass.

- [x] **Step 7: Commit**

```bash
git add scripts/build-third-party-licenses.mjs tests/unit/scripts.thirdPartyLicenses.test.ts package.json .gitignore
git commit -m "feat: generate THIRD_PARTY_LICENSES.txt from prod deps"
```

---

### Task 2: Bundle the licenses file into the packaged Electron app

**Files:**
- Modify: `forge.config.ts`

- [x] **Step 1: Add Forge generateAssets hook + extraResource entry**

Open `forge.config.ts`. The existing `packagerConfig` has `extraResource: ['./dist-static']` at line 16. Add the licenses file there, and add a `hooks` block that runs the script before packaging:

```typescript
import { execFileSync } from 'node:child_process';

// ... existing config ...

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    extraResource: ['./dist-static', './THIRD_PARTY_LICENSES.txt'],
    // ... existing fields ...
  },
  hooks: {
    generateAssets: async () => {
      execFileSync('node', ['scripts/build-third-party-licenses.mjs'], { stdio: 'inherit' });
    },
  },
  // ... rest ...
};
```

If a `hooks` block already exists, merge the `generateAssets` entry into it instead of duplicating.

- [x] **Step 2: Verify packaging produces the file in the right place**

```bash
npm run package
```

Find the produced app (e.g. on macOS: `out/OurLegacy-darwin-*/OurLegacy.app/Contents/Resources/THIRD_PARTY_LICENSES.txt`; on Linux: `out/OurLegacy-linux-*/resources/THIRD_PARTY_LICENSES.txt`; on Windows: `out/OurLegacy-win32-*/resources/THIRD_PARTY_LICENSES.txt`).

Run an OS-appropriate file check, e.g. on macOS:

```bash
test -f out/OurLegacy-darwin-*/OurLegacy.app/Contents/Resources/THIRD_PARTY_LICENSES.txt && echo OK
```

Expected: `OK` printed.

- [x] **Step 3: Commit**

```bash
git add forge.config.ts
git commit -m "feat: bundle THIRD_PARTY_LICENSES.txt into packaged app"
```

---

### Task 3: IPC + preload + About modal extension

**Files:**
- Modify: `src/shared/channels/app.ts`
- Modify: `src/main/ipc/app.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/api.d.ts`
- Create: `src/renderer/components/LicensesViewerModal.vue`
- Modify: `src/renderer/components/AboutModal.vue`
- Modify: `src/renderer/i18n/sv.ts`
- Modify: `src/renderer/i18n/en.ts`

- [x] **Step 1: Define the IPC channel**

In `src/shared/channels/app.ts`, add a new channel definition next to the existing `app:getVersion` / `app:openExternal` entries:

```typescript
export const APP_READ_THIRD_PARTY_LICENSES = defineChannel<void, string>({
  name: 'app:readThirdPartyLicenses',
  runOn: 'main', // pure fs read; no DB, no worker
});
```

Use the existing pattern in the file (match the surrounding `defineChannel` calls verbatim — same generic shape, same `runOn` field).

- [x] **Step 2: Implement the main-thread handler**

In `src/main/ipc/app.ts`, register a handler:

```typescript
import { app, ipcMain } from 'electron';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ... in the existing registerAppIpc(...) function or its equivalent:

ipcMain.handle('app:readThirdPartyLicenses', () => {
  // Packaged: process.resourcesPath. Dev (npm start): repo root.
  const candidates = [
    join(process.resourcesPath, 'THIRD_PARTY_LICENSES.txt'),
    join(app.getAppPath(), 'THIRD_PARTY_LICENSES.txt'),
    join(app.getAppPath(), '..', 'THIRD_PARTY_LICENSES.txt'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p, 'utf8');
  }
  // Dev fallback: walk up to find the file at the repo root.
  const repoRoot = join(app.getAppPath(), '..', '..');
  const dev = join(repoRoot, 'THIRD_PARTY_LICENSES.txt');
  if (existsSync(dev)) return readFileSync(dev, 'utf8');
  throw new Error('THIRD_PARTY_LICENSES.txt not found in any expected location');
});
```

(Match the surrounding code style. If the existing handlers in this file use a thin wrapper or registry, follow that pattern instead — don't introduce a parallel registration scheme.)

- [x] **Step 3: Wire preload + renderer typings**

In `src/preload/index.ts`, add to the `app` namespace inside `contextBridge.exposeInMainWorld('api', { app: { ... } })`:

```typescript
readThirdPartyLicenses: () => ipcRenderer.invoke('app:readThirdPartyLicenses') as Promise<string>,
```

In `src/renderer/api.d.ts`, add to the `app` member:

```typescript
readThirdPartyLicenses: () => Promise<string>;
```

- [x] **Step 4: Verify preload coverage tests pass**

```bash
npx vitest run tests/unit/preload-coverage.test.ts tests/unit/ipc-worker-coverage.test.ts
```

Expected: PASS. These tests assert that every channel registered in `src/shared/channels/` has both a preload entry and runs in the right context (main vs worker).

- [x] **Step 5: Add i18n keys**

In `src/renderer/i18n/sv.ts`, find the `about: { ... }` block (around line 1820) and add three keys:

```typescript
about: {
  title: 'Om OurLegacy',
  openLink: 'Om OurLegacy',
  version: 'Version {version}',
  description: 'Ett släktforskningsprogram som körs lokalt på din dator. All data ligger kvar hos dig.',
  openSource: 'Öppen källkod (MIT-licens).',
  viewOnGitHub: 'Visa på GitHub',
  viewLicenses: 'Visa öppen källkod-information',
  licensesTitle: 'Öppen källkod-information',
  licensesElectronNote: 'Electron och Chromium har sina egna licensfiler i programmets resurser-mapp.',
},
```

In `src/renderer/i18n/en.ts`, find the matching `about: { ... }` block and add the same three keys with English values:

```typescript
viewLicenses: 'View open source notices',
licensesTitle: 'Open source notices',
licensesElectronNote: 'Electron and Chromium ship their own license files in the application resources folder.',
```

- [x] **Step 6: Create LicensesViewerModal**

Create `src/renderer/components/LicensesViewerModal.vue`:

```vue
<template>
  <BaseSubPanel
    v-if="visible"
    entity-type="neutral"
    :title="$t('about.licensesTitle')"
    icon="📄"
    mode="standalone"
    hide-save
    :cancel-label="$t('common.close')"
    @cancel="close"
    @close="close"
  >
    <div class="licenses-body">
      <p v-if="loading" class="loading">{{ $t('common.loading') }}</p>
      <p v-else-if="error" class="error">{{ error }}</p>
      <template v-else>
        <p class="electron-note">{{ $t('about.licensesElectronNote') }}</p>
        <pre class="licenses-text">{{ text }}</pre>
      </template>
    </div>
  </BaseSubPanel>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseSubPanel from './modals/BaseSubPanel.vue';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const loading = ref(false);
const error = ref('');
const text = ref('');

async function load() {
  loading.value = true;
  error.value = '';
  try {
    text.value = await window.api.app.readThirdPartyLicenses();
  } catch (err) {
    console.error('[LicensesViewerModal] load failed:', err);
    error.value = t('errors.loadFailed');
  } finally {
    loading.value = false;
  }
}

watch(() => props.visible, (v) => {
  if (v && !text.value && !loading.value) load();
}, { immediate: true });

function close() { emit('close'); }
</script>

<style scoped>
.licenses-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  max-width: 720px;
  max-height: 70vh;
}
.electron-note {
  margin: 0;
  padding: var(--space-sm);
  background: var(--info-bg);
  color: var(--info-text);
  border-radius: var(--radius-sm);
  font-size: var(--font-sm);
}
.licenses-text {
  margin: 0;
  padding: var(--space-md);
  background: var(--surface-bg);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-sm);
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: var(--font-xs);
  line-height: 1.4;
  white-space: pre-wrap;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}
.loading, .error {
  margin: 0;
  color: var(--text-secondary);
}
.error { color: var(--error-text); }
</style>
```

- [x] **Step 7: Extend AboutModal with the link**

Modify `src/renderer/components/AboutModal.vue`. After the existing `<p class="about-license">` block (around line 17–20), add:

```vue
<p class="about-license">
  <a href="#" class="about-link" @click.prevent="openLicenses">{{ $t('about.viewLicenses') }}</a>
</p>
<LicensesViewerModal :visible="licensesVisible" @close="licensesVisible = false" />
```

In the `<script setup>` block, add:

```typescript
import LicensesViewerModal from './LicensesViewerModal.vue';
const licensesVisible = ref(false);
function openLicenses() { licensesVisible.value = true; }
```

- [x] **Step 8: Smoke-check in dev mode**

```bash
npm run build:third-party-licenses   # produce the file at repo root for dev
npm start
```

In the running app: navigate to **Settings**, click the *Om OurLegacy / About OurLegacy* link, then click *Visa öppen källkod-information / View open source notices*. The modal should open with the licenses text scrolling. Vue, Electron, vue-i18n, etc. should appear as headings.

- [x] **Step 9: Run lint, unit tests, e2e**

```bash
npm run lint
npm test
npx playwright test
```

All must pass. The new IPC + preload entry will be exercised by `tests/unit/preload-coverage.test.ts`.

- [x] **Step 10: Commit**

```bash
git add src/shared/channels/app.ts src/main/ipc/app.ts src/preload/index.ts src/renderer/api.d.ts \
        src/renderer/components/LicensesViewerModal.vue src/renderer/components/AboutModal.vue \
        src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "feat: surface third-party license notices in About modal"
```

---

### Task 4: SBOM generation in release workflow

**Files:**
- Modify: `.github/workflows/release.yml`

- [x] **Step 1: Add SBOM step + license file to the release job**

Open `.github/workflows/release.yml`. The `release` job (around line 76) currently downloads artifacts from the build matrix and creates the GitHub Release. Modify it to:
1. Generate `sbom.cdx.json` from `package.json` / `package-lock.json` (no need to install full deps in this job — the lockfile is enough).
2. Generate `THIRD_PARTY_LICENSES.txt` from prod deps.
3. Attach both as additional release assets.

Replace the existing `release` job with:

```yaml
  release:
    needs: [ check-version, build ]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - name: Generate THIRD_PARTY_LICENSES.txt
        run: node scripts/build-third-party-licenses.mjs
      - name: Generate CycloneDX SBOM
        run: |
          npm sbom --sbom-format=cyclonedx --omit=dev > sbom.cdx.json
          test -s sbom.cdx.json
          node -e "JSON.parse(require('fs').readFileSync('sbom.cdx.json','utf8'))"
      - uses: actions/download-artifact@v8
        with:
          path: artifacts
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: v${{ needs.check-version.outputs.version }}
          name: v${{ needs.check-version.outputs.version }}
          generate_release_notes: true
          files: |
            artifacts/**/*
            THIRD_PARTY_LICENSES.txt
            sbom.cdx.json
```

The `npm sbom` flag was added in npm 10.x (Node 22 ships npm 10+); it produces CycloneDX 1.5+ JSON natively, no extra package needed. The post-generation `JSON.parse` smoke-checks that the output is valid JSON.

- [x] **Step 2: Verify the workflow YAML is syntactically valid**

```bash
npx yaml-lint .github/workflows/release.yml || npx js-yaml .github/workflows/release.yml > /dev/null
```

(Either lint passes, or the YAML parses cleanly. If neither tool is available, install nothing — just visually confirm indentation and structure match the rest of the file.)

- [x] **Step 3: Smoke-check the SBOM step locally**

```bash
npm sbom --sbom-format=cyclonedx --omit=dev > /tmp/sbom.cdx.json
node -e "const s = require('/tmp/sbom.cdx.json'); console.log('format:', s.bomFormat, 'specVersion:', s.specVersion, 'components:', s.components?.length)"
rm /tmp/sbom.cdx.json
```

Expected: prints `format: CycloneDX specVersion: 1.x components: <N>` with N matching roughly the number of prod deps.

- [x] **Step 4: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: attach SBOM + third-party-licenses to GitHub releases"
```

---

### Task 5: Version bump, PLAN.md update, archive plan

**Files:**
- Modify: `package.json` (version bump)
- Modify: `CHANGELOG.md`
- Modify: `docs/PLAN.md`
- Modify: `docs/plans/archive/PLAN.md`
- Move: `docs/plans/2026-05-09-third-party-licenses-and-sbom.md` → `docs/plans/archive/`
- Modify: this plan file (tick all checkboxes before archiving)

- [x] **Step 1: Tick every checkbox in this plan**

Edit this file and change every `- [ ]` to `- [x]` (Tasks 1–5, all steps, all self-review checks). Don't archive yet — the bump commit needs the closed plan first.

- [x] **Step 2: Bump version**

This is a feature (UI surface + CI artifact). Minor bump in `package.json`. If current is `0.227.6`, bump to `0.228.0`.

- [x] **Step 3: Add CHANGELOG entry**

Prepend under `## Unreleased`:

```markdown
## Unreleased

- Bundle THIRD_PARTY_LICENSES.txt into the packaged app and surface it from About → "View open source notices".
- Attach `sbom.cdx.json` (CycloneDX) and `THIRD_PARTY_LICENSES.txt` to every GitHub release.
```

- [x] **Step 4: Update docs/PLAN.md and the archive index**

In `docs/PLAN.md`: there's no current "Open source housekeeping" entry, so nothing to remove. No change needed unless the maintainer wants a one-line note in a "Recently shipped" section.

In `docs/plans/archive/PLAN.md`, append:

```markdown
### Third-Party Licenses + SBOM
Bundle a generated `THIRD_PARTY_LICENSES.txt` into the packaged app and surface it from the About modal. Attach the same file plus a CycloneDX `sbom.cdx.json` to every GitHub release. — [plan](2026-05-09-third-party-licenses-and-sbom.md)
```

(Match the existing entry format in that file.)

- [x] **Step 5: Move the plan to archive**

```bash
git mv docs/plans/2026-05-09-third-party-licenses-and-sbom.md docs/plans/archive/2026-05-09-third-party-licenses-and-sbom.md
```

- [x] **Step 6: Final commit + merge**

```bash
git add package.json CHANGELOG.md docs/PLAN.md docs/plans/archive/PLAN.md docs/plans/archive/2026-05-09-third-party-licenses-and-sbom.md
git commit -m "chore: archive third-party-licenses-and-sbom plan (v0.228.0)"
```

Then follow the project's `superpowers:finishing-a-development-branch` Option 1 to merge the worktree branch into `main`, delete the branch, remove the worktree.

---

## Self-review checklist

- [x] **Spec coverage:** every section in §Scope ("Desktop app binaries", "GitHub Release artifacts") has at least one task. Static SPA scope deviation is documented in §Scope and not in any task — correct.
- [x] **Placeholder scan:** no "TBD", "implement later", "appropriate error handling" without concrete try/catch + toast key. Every code step has a real code block.
- [x] **Type consistency:** `app:readThirdPartyLicenses` is the channel name used in `src/shared/channels/app.ts`, `src/main/ipc/app.ts` `ipcMain.handle`, and `src/preload/index.ts` `ipcRenderer.invoke`. The renderer surface is `window.api.app.readThirdPartyLicenses()`. Consistent across all files.
- [x] **No silent string-replace:** the script throws on missing license files instead of skipping. The `injectSnapshotIntoHtml` rule (which this plan does not touch) is not affected.
- [x] **User-observable verification:** §Verification names the in-app smoke check (open Settings → About → View notices) and the GitHub Release page check (download `sbom.cdx.json`, parse it). Test suites are explicitly named as hygiene-not-verification.
