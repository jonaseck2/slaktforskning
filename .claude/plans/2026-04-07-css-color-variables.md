# CSS Color Variables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the 70+ hardcoded hex colors in `shared.css` and the most frequently repeated colors across component `<style scoped>` blocks into CSS custom properties, making the color system maintainable and consistent.

**Architecture:** Extend the `:root` block in `src/renderer/styles/shared.css` with a color palette. Replace all hardcoded values in `shared.css` itself. For component scoped styles, replace the most frequently repeated values (any hex that appears in 3+ files). Add dark mode variable overrides in the `html.dark` block. Do NOT change component-specific one-off colors.

**Tech Stack:** CSS custom properties (`var()`), `shared.css`

---

### Task 1: Define the color palette in shared.css

**Files:**
- Modify: `src/renderer/styles/shared.css`

- [ ] **Step 1: Add color variables to :root**

In `shared.css`, find the `:root` block (currently only contains font variables) and extend it:

```css
:root {
  /* -- Typography (existing) -- */
  --font-xs:   11px;
  --font-sm:   13px;
  --font-base: 14px;
  --font-md:   15px;
  --font-lg:   16px;

  /* -- Color palette -- */
  /* Primary/brand */
  --color-primary:        #2c3e50;
  --color-primary-hover:  #3d5166;

  /* Backgrounds */
  --color-bg:             #ffffff;
  --color-bg-subtle:      #f8f9fa;
  --color-bg-muted:       #f0f4f8;
  --color-bg-table-head:  #eeeeee;

  /* Borders */
  --color-border:         #dddddd;
  --color-border-input:   #cccccc;
  --color-border-chip:    #c8d0db;

  /* Text */
  --color-text:           #333333;
  --color-text-muted:     #555555;
  --color-text-subtle:    #666666;
  --color-text-faint:     #999999;

  /* Semantic */
  --color-danger-bg:      #fee2e2;
  --color-danger-text:    #b91c1c;
  --color-danger-hover:   #fecaca;
  --color-link:           #2563eb;

  /* Row hover */
  --color-row-hover:      #f0f4ff;
}
```

- [ ] **Step 2: Replace hardcoded values in shared.css with variables**

Replace every hardcoded hex value in `shared.css` with its variable. Work section by section:

**Layout section (`.count-label`, `.running-hint`, `.empty`, `.empty-hint`):**
```css
/* Before */
.count-label { color: #666; }
.running-hint { color: #999; }
.empty { color: #999; }
.empty-hint { color: #999; }
/* After */
.count-label { color: var(--color-text-subtle); }
.running-hint { color: var(--color-text-faint); }
.empty { color: var(--color-text-faint); }
.empty-hint { color: var(--color-text-faint); }
```

**Table section:**
```css
/* Before */
.data-table th, .data-table td { border-bottom: 1px solid #ddd; }
.data-table th { background: #eee; color: #666; }
.clickable-row:hover { background: #f0f4ff; }
/* After */
.data-table th, .data-table td { border-bottom: 1px solid var(--color-border); }
.data-table th { background: var(--color-bg-table-head); color: var(--color-text-subtle); }
.clickable-row:hover { background: var(--color-row-hover); }
```

**Chips section:**
```css
/* Before */
.chip { border: 1px solid #c8d0db; background: #f0f4f8; color: #4a5568; }
.chip:hover { background: #e2e8f0; }
.chip.active { background: #2c3e50; color: white; border-color: #2c3e50; }
/* After */
.chip { border: 1px solid var(--color-border-chip); background: var(--color-bg-muted); color: var(--color-text-muted); }
.chip:hover { background: #e2e8f0; }
.chip.active { background: var(--color-primary); color: white; border-color: var(--color-primary); }
```

**Buttons section:**
```css
/* Before */
.btn-add { background: #2c3e50; color: white; }
.btn-delete { background: #fee2e2; color: #b91c1c; }
.btn-delete:hover { background: #fecaca; }
.btn-cancel { background: #e0e0e0; color: #333; }
/* After */
.btn-add { background: var(--color-primary); color: white; }
.btn-delete { background: var(--color-danger-bg); color: var(--color-danger-text); }
.btn-delete:hover { background: var(--color-danger-hover); }
.btn-cancel { background: #e0e0e0; color: var(--color-text); }
```

**Modal actions submit button:**
```css
/* Before */
.modal-actions button[type='submit'] { background: #2c3e50; color: white; }
/* After */
.modal-actions button[type='submit'] { background: var(--color-primary); color: white; }
```

**Person links:**
```css
/* Before */
.person-link { color: #2563eb; }
/* After */
.person-link { color: var(--color-link); }
```

**Tabs:**
```css
/* Before */
.tab-bar { border-bottom: 2px solid #e0e0e0; }
.tab-btn { color: #666; }
.tab-btn:hover { color: #2c3e50; }
.tab-btn.active { color: #2c3e50; border-bottom-color: #2c3e50; }
/* After */
.tab-bar { border-bottom: 2px solid var(--color-border); }
.tab-btn { color: var(--color-text-subtle); }
.tab-btn:hover { color: var(--color-primary); }
.tab-btn.active { color: var(--color-primary); border-bottom-color: var(--color-primary); }
```

**Modal form labels:**
```css
/* Before */
.modal form > label { color: #555; }
/* After */
.modal form > label { color: var(--color-text-muted); }
```

- [ ] **Step 3: Verify the app looks identical**

Run: `npm start`
Compare the UI against before — colors should be pixel-identical.

---

### Task 2: Add dark mode variable overrides

**Files:**
- Modify: `src/renderer/styles/shared.css`

- [ ] **Step 1: Add dark mode root variable overrides**

In the `html.dark` block at the bottom of `shared.css`, add variable overrides at the top of the block (before the existing element-specific rules):

```css
@media screen {
  html.dark {
    /* Override palette for dark mode */
    --color-primary:        #374151;
    --color-primary-hover:  #4b5563;
    --color-bg:             #111827;
    --color-bg-subtle:      #1f2937;
    --color-bg-muted:       #1f2937;
    --color-bg-table-head:  #1f2937;
    --color-border:         #374151;
    --color-border-input:   #374151;
    --color-border-chip:    #374151;
    --color-text:           #e2e8f0;
    --color-text-muted:     #9ca3af;
    --color-text-subtle:    #9ca3af;
    --color-text-faint:     #6b7280;
    --color-danger-bg:      #450a0a;
    --color-danger-text:    #fca5a5;
    --color-danger-hover:   #7f1d1d;
    --color-link:           #60a5fa;
    --color-row-hover:      #1e293b;
  }

  /* The existing element-specific dark rules stay below.
     Over time they can be removed as variables cover them,
     but keep them for now to avoid visual regressions. */
  html.dark body { ... }
  ...
}
```

- [ ] **Step 2: Verify dark mode still looks correct**

Run: `npm start`
Enable dark mode in settings. Verify the UI is correct.

---

### Task 3: Replace repeated colors in component scoped styles

**Files:**
- Modify: All `.vue` files in `src/renderer/` that have `#2c3e50`, `#fee2e2`, `#b91c1c`, `#2563eb` in `<style scoped>`

These are the four most frequently repeated colors. Replace them with variables.

- [ ] **Step 1: Find all occurrences**

Run each command and note the files:
```bash
grep -rn "#2c3e50" src/renderer/ --include="*.vue"
grep -rn "#fee2e2\|#b91c1c" src/renderer/ --include="*.vue"
grep -rn "#2563eb" src/renderer/ --include="*.vue"
```

- [ ] **Step 2: Replace in each file**

For each file, replace:
- `#2c3e50` → `var(--color-primary)`
- `#fee2e2` → `var(--color-danger-bg)`
- `#b91c1c` → `var(--color-danger-text)`
- `#2563eb` → `var(--color-link)`

Note: CSS custom properties work in `<style scoped>` — they inherit from `:root` defined in `shared.css`.

- [ ] **Step 3: Verify TypeScript and visual output**

Run: `npm start`
Run: `npm test`
Verify both light and dark mode look correct.

---

### Task 4: Run tests and commit

- [ ] **Step 1: Run unit tests**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "refactor(styles): extract hardcoded colors to CSS custom properties

Add 18 color variables to :root in shared.css. Replace all hardcoded
hex values in shared.css with var() references. Add html.dark variable
overrides. Replace the 4 most repeated hex colors (#2c3e50, #fee2e2,
#b91c1c, #2563eb) in component scoped styles."
```
