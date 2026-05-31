# 2026-05-31 — Ben feedback polish (Rapport 100-103, 105; v215→v265)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

## User goal

When Ben (beta tester, Holger 8 background, limited vision) walks through the flows in his Rapport 100-103 + 105 batch on the next release, every friction he flagged is gone: the citation entry form reads "Källhänvisning" with confidence levels ordered most-reliable-first and the source field obviously offers a dropdown; counts in the event modal read "(1)" not "1" and the row-delete control is a trash icon, not a close icon; opening a residence-event form says "Inflyttningsdatum" / "Eventuellt utflyttningsdatum" and offers a "Övriga boende i bostaden" section instead of generic "Deltagare"; the person panel surfaces authored data first and derived views (Tidslinje, Livskarta) below them right before Fortsatt forskning and Kvalitet.

Ben is one of two known beta testers, so this batch is the canary for whether the polish-loop with him actually closes — the user goal includes him being able to ack the changes on his next sync without re-filing the same items.

## Scope

Bundled because every item is i18n + template/markup polish with zero data-model or GEDCOM round-trip impact (see cross-check from investigation 2026-05-31).

### A. Citation modal (Rapport 100)

- **A1.** Modal title rename. `citations.addTitle` "Lägg till hänvisning" → "Lägg till källhänvisning". `citations.editTitle` "Redigera hänvisning" → "Redigera källhänvisning". English unchanged ("Add Citation" / "Edit citation" already read correctly). Files: `src/renderer/i18n/sv.ts:501-502`.
- **A2.** Source field dropdown affordance. Render a `▾` chevron inside `SourcePicker.vue` (right-aligned, before the existing edit `✎` button when one is shown). Pure CSS pseudo-element or inline SVG — no behaviour change. Files: `src/renderer/components/SourcePicker.vue:1-30,227-292`.
- **A3.** Page/Location label expanded to mention URL. `citations.pageLocation` "Sida / Plats" → "Sida / Plats / URL". English "Page / Location" → "Page / Location / URL". Files: `src/renderer/i18n/sv.ts:507`, `src/renderer/i18n/en.ts:507`.
- **A4.** Confidence section title clarified. `citations.confidence` "Tillförlitlighet" → "Källans tillförlitlighet". English "Confidence" → "Source reliability". Files: `src/renderer/i18n/sv.ts:509`, `src/renderer/i18n/en.ts:509`. *(Lyx — included because cost is zero and it reads more clearly out of context.)*
- **A5.** Reverse confidence button order. Currently iterates `CONFIDENCE_LEVEL_VALUES = [0, 1, 2, 3]` left-to-right showing Opålitlig → Tveksam → Sekundärkälla → Primärkälla. After: Primärkälla → Sekundärkälla → Tveksam → Opålitlig (most-reliable on the left). Achieved by `[...CONFIDENCE_LEVEL_VALUES].reverse()` in the template iteration. The constant itself stays `[0, 1, 2, 3]` (it's the storage enum, not a render hint) so the gedcom_fidelity_registry entry [src/api/gedcom_fidelity_registry.ts:624](../../src/api/gedcom_fidelity_registry.ts) and QUAY round-trip are unchanged. Files: `src/renderer/components/modals/CitationModal.vue:51-61`.

### B. Event modal citation row (Rapport 101)

- **B1.** Section count in parentheses. EventModal renders citation count as bare `1` via inline markup ([EventModal.vue:205-213](../../src/renderer/components/modals/EventModal.vue#L205-L213)). PersonPanel via `SectionHeader.vue:7` already renders `({{ count }})`. Make EventModal's citation section use `SectionHeader` so the parens shape is shared, or — if migrating the whole `ep-sec-header`/`ep-sec-count` family is out of scope here — patch the inline span to render `({{ allCitationRows.length }})`. **Decision: patch the inline span**. Migrating `ep-sec-header` is its own consistency plan; this one stays scoped to the visible defect.
- **B2.** Delete control changed from `✕` to `IconTrash`. Files: `src/renderer/components/modals/EventModal.vue:232-238`. Pattern reference: `MediaPanel.vue:191`, `SourcePanel.vue:149`. **Sibling fix:** `EventParticipantsSection.vue:51-58` uses the same `✕` for participant removal — apply the same change there to keep the modal coherent (otherwise the citation row gets a trash icon while the participant row right below still has `✕`).

### C. Residence event modal (Rapport 102 #1, #2, #3, #4)

- **C1.** Per-event-type DATE labels. For `event_type === 'residence'`: top date label "Inflyttningsdatum" (was "Datum"), end-date label "Eventuellt utflyttningsdatum" (was "Slutdatum (valfritt)"). For other span events (`occupation`, `education`, `military`, `travel`) the existing labels stay. Mechanism: a small `eventDateLabels(event_type)` helper in `EventModal.vue` returning `{ start, end, endHint? }` from a per-type i18n map. Default falls back to `events.date` / `events.endDateOptional`. Files: `src/renderer/components/modals/EventModal.vue:60,73`, add keys under `events.dateLabels.<type>` in both `sv.ts` and `en.ts`.
- **C2.** Drop irrelevant end-date hint for residence. Same `eventDateLabels(event_type)` returns `endHint: null` for residence (the "händelsen pågick under en enda tidpunkt" wording is nonsense for a residence). The `<p class="ep-field-hint">` at `EventModal.vue:85` conditional-renders on `endHint`. Other span types keep their hint.
- **C3.** Participants section label "Övriga boende i bostaden" for residence. Per-event-type label for `events.participants`, same mechanism as C1. **Important caveat in the plan: `event_participants.role` enum is unchanged — the role dropdown beside each row still offers `vittne / fadder / officiant / …`. This plan stops at the label rename; reworking the role vocabulary for residence is a separate design call** (it would need a new role value `resident`, a CHECK constraint migration, and a 7.0 ASSO ROLE PHRASE mapping — out of scope).
- **C4.** Inline save-prompt when adding a participant on an unsaved event. Today `EventParticipantsSection.vue:13-15` shows a static hint and the picker is hidden. Replace with: section body shows the existing PersonPicker, but clicking a person triggers a confirm dialog "Händelsen måste sparas innan deltagare kan läggas till. [Spara och fortsätt] [Avbryt]". On Spara: dispatch the EventModal's existing `save()` (the composable already returns the new id), then `participantAdd(event_id, person_id, role)` with the resolved id. Files: `src/renderer/components/EventParticipantsSection.vue` (template + handler), `src/renderer/components/modals/EventModal.vue` (expose save trigger to the section, e.g. via a `defineExpose({ saveAndContinue })` on the modal or a prop callback).

### D. Research tasks rename (Rapport 103)

- **D1.** `researchTasks.title` and `researchTasks.nav` "Uppgifter" → "Fortsatt forskning". English `researchTasks.title` and `nav` "Tasks" stay (in English "Research" already lives in the section title; "Continued research" is awkward — defer the en.ts change unless Ben's English-speaker peer raises it). Also rename `nav.researchTasks` "Uppgifter" → "Fortsatt forskning" so the sidebar matches.
- **D2.** Audit the rest of the `researchTasks.*` namespace for "uppgift" wording — singular `addTask: 'Uppgift'`, `task: 'Uppgift'`, `newTask: 'Ny uppgift'`. These describe the entity itself, not the section, and "fortsatt forskning" doesn't substitute one-for-one ("Lägg till fortsatt forskning" reads oddly). Keep entity-level singular as "Uppgift"; only the section/nav title changes. Document this delta in the commit message so future readers don't try to "complete" the rename.

### E. PersonPanel section order (Rapport 105)

- **E1.** Move the `<div class="panel-section">` blocks for Timeline (`sections.timeline`) and Map (`sections.map`) from their current position right after Events ([PersonPanel.vue:116,124](../../src/renderer/components/PersonPanel.vue#L116-L131)) down to immediately precede Research ([PersonPanel.vue:182](../../src/renderer/components/PersonPanel.vue#L182)) — so the order becomes: personSection → names → identifiers → events → relationships → media → mediaTimeline → groups → sources → associations → sharedNotes → **timeline → map** → research → quality.
- **E2.** localStorage open/closed keys for `slaktforskning-section-timeline-open` and `slaktforskning-section-map-open` are unaffected (the section identifier stays the same).
- **E3.** `panel-layout-consistency.test.ts` checks root class membership, not child order — no test breakage expected. But the e2e suite has selectors keyed on section headers; verify (see Verification).

### Scope deviations

- **Rapport 102 #5 (FELRAPPORT: lägga till fler boende fungerar inte)** — Ben self-diagnoses the cause as viewport cutoff in v215.2 ("händelsen hämnar nedanför min visade skärmbild"). Reproduction on 0.265.0 is required before designing a fix; the modal layout has been touched many times in the ~50 versions since. Carved out so this plan doesn't blindly add a "scroll fix" that's solving a problem that no longer exists. Tracked as: manually repro on next build, file a follow-up plan only if still live.
- **Rapport 104 (citation on media)** — Substantive data-model decision (citations.media_id vs surfacing existing media_links→source). A separate design spec [2026-05-31-media-citations-design.md](./2026-05-31-media-citations-design.md) captures the design question.
- **Rapport 106 (cannot update relationship event)** — FELRAPPORT against v215.2. Update path at `useEventSave.ts:130-132` → `events.ts:158-181` reads correctly today; the failure mode Ben hit may be incidentally fixed in the churn since. Same as 102 #5: repro on 0.265.0+1 before committing to a plan. Asking Ben to retest on the next build is the cheap first move.
- **EventModal `ep-sec-header` migration to `SectionHeader`** — would harmonize the parens-vs-bare-count and chevron behaviour across every section inside every modal. Real consistency win but blast radius is wide (every modal touches it). Carved out as its own plan; this batch patches the one visible defect (B1).

## Verification

### User-observable outcomes (matching User goal §1)

1. Open the Citation modal in the running app: title reads "Lägg till källhänvisning" / "Redigera källhänvisning"; the source field shows a visible ▾ affordance; page-label reads "Sida / Plats / URL"; confidence section title reads "Källans tillförlitlighet"; confidence buttons render Primärkälla → Sekundärkälla → Tveksam → Opålitlig left-to-right.
2. Open the Event modal with `event_type='residence'`: top date label reads "Inflyttningsdatum"; end-date label reads "Eventuellt utflyttningsdatum"; no end-date hint paragraph is rendered; participants section header reads "Övriga boende i bostaden".
3. Inside the Event modal with at least one citation, the section count reads "(1)" not "1"; the row-delete control on each citation row and each participant row is a trash icon, not `✕`.
4. From the Event modal (event not yet saved), clicking a person in the participants picker shows a confirm dialog "Händelsen måste sparas innan…", and choosing "Spara och fortsätt" saves the event and adds the participant in one shot.
5. In the sidebar, the entry reads "Fortsatt forskning"; the PersonPanel section header at the bottom of the panel reads "Fortsatt forskning".
6. In PersonPanel, scrolling through sections: Timeline ("Tidslinje") and Life Map ("Livskarta") appear after Notes, immediately before Fortsatt forskning and Kvalitet.

### Tests that observe the user goal (not structure)

- **Component test, citation modal:** mount `CitationModal.vue`, assert (a) the rendered modal title text matches the localized "Lägg till källhänvisning"; (b) the first rendered confidence button's text is the i18n value for `confidenceLevels.3` (Primärkälla in sv).
- **Component test, residence event labels:** mount `EventModal.vue` with `event_type='residence'`, assert the rendered DATE label text equals "Inflyttningsdatum" (sv) / the new English equivalent, and that no element matches the `endDateHint` text.
- **Component test, section count parens:** mount `EventModal.vue` with one citation, assert the citation section header rendered text matches `/\(1\)$/`.
- **Component test, PersonPanel section order:** mount `PersonPanel.vue` against a seeded person, query rendered `.section-title` nodes in document order, assert the sequence ends `…Anteckningar → Tidslinje → Livskarta → Fortsatt forskning → Kvalitet`. This protects E1 against accidental future reorders.
- **Unit i18n parity test:** `tests/unit/i18n-parity.test.ts` (or extending an existing one — check first) asserts every key added under `events.dateLabels.*` exists in both `sv.ts` and `en.ts`.

### Required CI gates (per .claude/rules/plans.md "e2e is load-bearing verification")

- `npm test` — N passed (Xs); the new component tests above are included.
- `npm run build` — exits 0; tail line shows build time.
- `npm run test:e2e:full` — required because the user goal touches modals (CitationModal, EventModal), a list view's right-side panel (PersonPanel section reorder), and the participants flow. Specifically watch `[panels]` and `[reactivity]` projects for any selectors keyed on section header order or the `✕` glyph; update selectors if they break.

### User-goal-falsifiability check

Running the test list aloud: *if every component test, every unit test, every e2e project passes — can Ben still hit the friction he reported?* The risk surfaces:

- **A2 (chevron affordance)** has no component test — the chevron is purely cosmetic. Mitigation: a screenshot in the close-out commit message showing the rendered SourcePicker with the chevron visible. Cheap, captures the user-observable intent.
- **C4 (save-and-continue flow)** is the most complex — needs an e2e or a component test that drives the picker, asserts the dialog appears, clicks Spara, and asserts the event is created + the participant attached. Add a component-level test wiring the EventModal + EventParticipantsSection together with `window.api` stubs.

## Failure modes / RCA reference

- **Prior plan** [2026-05-04-event-participants-and-marriage-flow](./archive/2026-05-04-event-participants-and-marriage-flow.md) introduced the `EventParticipantsSection.vue` participants section and the "save first" hint that C4 replaces. Review that plan's verification approach before changing the hint — the e2e tests for the marriage flow assert participant counts after save and should still pass after C4.
- **Prior incident** — subagent CWD drift and worktree-vs-controller command shape have bitten this project before. When executing this plan under worktree + subagents, follow [`.claude/rules/worktrees.md`](../../.claude/rules/worktrees.md) strictly (`git -C` / `npm --prefix <wt>` / vitest `--root <wt>`). The subagent-handoff skill encodes this.

---

## File structure

| File | Touch type | What changes |
|---|---|---|
| `src/renderer/i18n/sv.ts` | Modify | A1, A3, A4, D1, D2 keys; new `events.dateLabels.residence.*` map (C1, C2, C3) |
| `src/renderer/i18n/en.ts` | Modify | A3, A4 keys; new `events.dateLabels.residence.*` map for English parity |
| `src/renderer/components/SourcePicker.vue` | Modify | A2 chevron affordance |
| `src/renderer/components/modals/CitationModal.vue` | Modify | A5 reverse confidence button iteration |
| `src/renderer/components/modals/EventModal.vue` | Modify | B1 parens, B2 trash icon, C1/C2/C3 per-event-type labels, C4 save trigger expose |
| `src/renderer/components/EventParticipantsSection.vue` | Modify | B2 trash icon, C3 participant section label override, C4 save-and-continue flow |
| `src/renderer/components/PersonPanel.vue` | Modify | E1 reorder Timeline + Map blocks |
| `tests/components/citation-modal-labels.test.ts` | Create | A1, A4, A5 |
| `tests/components/event-modal-residence.test.ts` | Create | C1, C2, C3 |
| `tests/components/event-modal-section-counts.test.ts` | Create | B1 |
| `tests/components/event-modal-participants-save.test.ts` | Create | C4 |
| `tests/components/person-panel-section-order.test.ts` | Create | E1 |

---

## Tasks

### Task 1: Citation modal label rewrites (A1, A3, A4)

**Files:**
- Modify: `src/renderer/i18n/sv.ts:501-509`
- Modify: `src/renderer/i18n/en.ts:507,509`

- [ ] **Step 1: Write the failing test** — `tests/components/citation-modal-labels.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import sv from '../../src/renderer/i18n/sv';
import CitationModal from '../../src/renderer/components/modals/CitationModal.vue';

describe('CitationModal labels (Rapport 100)', () => {
  it('renders the modal title as "Lägg till källhänvisning" in Swedish', () => {
    const i18n = createI18n({ legacy: false, locale: 'sv', messages: { sv } });
    const wrapper = mount(CitationModal, {
      global: { plugins: [i18n], stubs: { SourcePicker: true, SourceModal: true, BaseSubPanel: { template: '<div><slot /></div><h2 class="title">{{ title }}</h2>', props: ['title'] } } },
      props: { mode: 'standalone' },
    });
    expect(wrapper.text()).toContain('Lägg till källhänvisning');
  });

  it('renders the page label as "Sida / Plats / URL"', () => {
    const i18n = createI18n({ legacy: false, locale: 'sv', messages: { sv } });
    const wrapper = mount(CitationModal, {
      global: { plugins: [i18n], stubs: { SourcePicker: true, SourceModal: true, BaseSubPanel: { template: '<div><slot /></div>' } } },
      props: { mode: 'standalone' },
    });
    expect(wrapper.text()).toContain('Sida / Plats / URL');
  });

  it('renders the confidence label as "Källans tillförlitlighet"', () => {
    const i18n = createI18n({ legacy: false, locale: 'sv', messages: { sv } });
    const wrapper = mount(CitationModal, {
      global: { plugins: [i18n], stubs: { SourcePicker: true, SourceModal: true, BaseSubPanel: { template: '<div><slot /></div>' } } },
      props: { mode: 'standalone' },
    });
    expect(wrapper.text()).toContain('Källans tillförlitlighet');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- citation-modal-labels
```

Expected: 3 failing assertions ("Lägg till hänvisning" doesn't include "källhänvisning", etc.)

- [ ] **Step 3: Apply the i18n changes**

In `src/renderer/i18n/sv.ts`:

```typescript
  citations: {
    entity: 'Hänvisning',
    title: 'Hänvisningar',
    addTitle: 'Lägg till källhänvisning',     // was 'Lägg till hänvisning'
    editTitle: 'Redigera källhänvisning',     // was 'Redigera hänvisning'
    noPage: '(ingen sida)',
    titleFor: '{title} – {name}',
    source: 'Källa',
    selectSource: 'Välj en källa…',
    pageLocation: 'Sida / Plats / URL',       // was 'Sida / Plats'
    pagePlaceholder: 't.ex. s. 42, Post #15',
    confidence: 'Källans tillförlitlighet',   // was 'Tillförlitlighet'
    // … rest unchanged
  },
```

In `src/renderer/i18n/en.ts`:

```typescript
    pageLocation: 'Page / Location / URL',    // was 'Page / Location'
    confidence: 'Source reliability',         // was 'Confidence'
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- citation-modal-labels
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/i18n/sv.ts src/renderer/i18n/en.ts tests/components/citation-modal-labels.test.ts
git commit -m "feat(i18n): clarify citation modal labels (Ben rapport 100 §1, §3, §4)"
```

### Task 2: SourcePicker dropdown affordance (A2)

**Files:**
- Modify: `src/renderer/components/SourcePicker.vue`

- [ ] **Step 1: Add the chevron element**

In `src/renderer/components/SourcePicker.vue` template, after the `<input>` element and before the edit button:

```vue
    <div class="picker-input-row">
      <input … />
      <span class="picker-chevron" aria-hidden="true">▾</span>
      <button v-if="modelValue" type="button" class="edit-source-btn" … />
    </div>
```

And add to scoped styles:

```css
.picker-chevron {
  position: absolute;
  right: 8px;                     /* shifts to right: 36px when edit btn is present */
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  font-size: 12px;
  pointer-events: none;
  line-height: 1;
}
.source-picker input.has-edit-btn ~ .picker-chevron { right: 36px; }
```

Adjust the `.source-picker input` padding-right so the input text doesn't run under the chevron:

```css
.source-picker input { …; padding-right: 24px; }
.source-picker input.has-edit-btn { padding-right: 56px; }
```

- [ ] **Step 2: Verify visually in the running app**

```bash
npm start
```

Open Persons → any person → Sources → "+ Källa" → confirm a ▾ glyph is visible right of the source-name input, and that resolving a source still shows the ✎ icon without overlap.

Capture a screenshot for the close-out commit.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/SourcePicker.vue
git commit -m "feat(ui): add dropdown affordance to SourcePicker (Ben rapport 100 §2)"
```

### Task 3: Reverse confidence button order (A5)

**Files:**
- Modify: `src/renderer/components/modals/CitationModal.vue:51-61`
- Test: `tests/components/citation-modal-labels.test.ts` (extend)

- [ ] **Step 1: Extend the test**

Append to `tests/components/citation-modal-labels.test.ts`:

```typescript
it('renders confidence buttons most-reliable-first (Primärkälla → Opålitlig)', () => {
  const i18n = createI18n({ legacy: false, locale: 'sv', messages: { sv } });
  const wrapper = mount(CitationModal, {
    global: { plugins: [i18n], stubs: { SourcePicker: true, SourceModal: true, BaseSubPanel: { template: '<div><slot /></div>' } } },
    props: { mode: 'standalone' },
  });
  const buttons = wrapper.findAll('.ep-seg-opt');
  expect(buttons[0].text()).toBe('Primärkälla');
  expect(buttons[1].text()).toBe('Sekundärkälla');
  expect(buttons[2].text()).toBe('Tveksam');
  expect(buttons[3].text()).toBe('Opålitlig');
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
npm test -- citation-modal-labels
```

Expected: the new assertion fails (current order is Opålitlig first).

- [ ] **Step 3: Reverse the iteration in CitationModal.vue**

```vue
<button
  v-for="level in [...CONFIDENCE_LEVEL_VALUES].reverse()"
  :key="level"
  …
```

Leave `CONFIDENCE_LEVEL_VALUES` in `src/renderer/constants/eventTypes.ts` untouched — it's the storage enum, not a render hint.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- citation-modal-labels
```

Expected: all assertions pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/modals/CitationModal.vue tests/components/citation-modal-labels.test.ts
git commit -m "feat(ui): show citation confidence most-reliable-first (Ben rapport 100 §5)"
```

### Task 4: Citation section count in parens + trash icon (B1, B2)

**Files:**
- Modify: `src/renderer/components/modals/EventModal.vue:205-238`
- Modify: `src/renderer/components/EventParticipantsSection.vue:51-58`
- Test: `tests/components/event-modal-section-counts.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import sv from '../../src/renderer/i18n/sv';
import EventModal from '../../src/renderer/components/modals/EventModal.vue';

describe('EventModal citation section (Rapport 101)', () => {
  it('renders the citation count in parentheses, not as a bare number', async () => {
    const i18n = createI18n({ legacy: false, locale: 'sv', messages: { sv } });
    // … minimal mount with one pending citation
    const wrapper = mount(EventModal, { /* … */ });
    const header = wrapper.find('[data-entity="citation"] .ep-sec-count');
    expect(header.text()).toMatch(/^\(\d+\)$/);
  });

  it('uses IconTrash for the citation row delete control', async () => {
    const wrapper = mount(EventModal, { /* one pending citation */ });
    const deleteBtn = wrapper.find('[data-entity="citation"] .ep-entity-row .btn-delete');
    expect(deleteBtn.findComponent({ name: 'IconTrash' }).exists()).toBe(true);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
npm test -- event-modal-section-counts
```

- [ ] **Step 3: Patch EventModal.vue**

At [src/renderer/components/modals/EventModal.vue:208](../../src/renderer/components/modals/EventModal.vue):

```vue
<span class="ep-sec-count">({{ allCitationRows.length }})</span>
```

At [src/renderer/components/modals/EventModal.vue:232-238](../../src/renderer/components/modals/EventModal.vue):

```vue
<button
  type="button"
  class="btn-sm btn-delete"
  style="flex-shrink:0"
  :aria-label="$t('common.remove')"
  @click.stop="cit.isPending ? removePendingCitation(cit.id) : deleteCitation(cit.id)"
>
  <IconTrash :size="14" />
</button>
```

Add the import at the top of `<script setup>`:

```typescript
import IconTrash from '../ui/IconTrash.vue';
```

- [ ] **Step 4: Patch EventParticipantsSection.vue (sibling fix)**

At [src/renderer/components/EventParticipantsSection.vue:51-58](../../src/renderer/components/EventParticipantsSection.vue):

```vue
<button
  type="button"
  class="btn-sm btn-delete"
  style="flex-shrink:0"
  :aria-label="$t('events.participantsRemove')"
  :title="$t('events.participantsRemove')"
  @click="onRemove(row.id)"
>
  <IconTrash :size="14" />
</button>
```

Add to `<script setup>`:

```typescript
import IconTrash from './ui/IconTrash.vue';
```

- [ ] **Step 5: Run the tests**

```bash
npm test -- event-modal-section-counts
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/modals/EventModal.vue src/renderer/components/EventParticipantsSection.vue tests/components/event-modal-section-counts.test.ts
git commit -m "feat(ui): parens for citation count + IconTrash on row delete (Ben rapport 101)"
```

### Task 5: Per-event-type date + participant labels (C1, C2, C3)

**Files:**
- Modify: `src/renderer/i18n/sv.ts` (add `events.dateLabels.residence.*` map)
- Modify: `src/renderer/i18n/en.ts` (mirror)
- Modify: `src/renderer/components/modals/EventModal.vue:60,73,85` (use mapped labels)
- Modify: `src/renderer/components/EventParticipantsSection.vue:8` (override label per event-type)
- Test: `tests/components/event-modal-residence.test.ts`

- [ ] **Step 1: Define the label map in i18n**

In `sv.ts` under `events`:

```typescript
    dateLabels: {
      residence: {
        start: 'Inflyttningsdatum',
        end: 'Eventuellt utflyttningsdatum',
        // endHint omitted → no hint rendered
      },
    },
    participantsLabels: {
      residence: 'Övriga boende i bostaden',
    },
```

Mirror in `en.ts`:

```typescript
    dateLabels: {
      residence: {
        start: 'Move-in date',
        end: 'Optional move-out date',
      },
    },
    participantsLabels: {
      residence: 'Other residents',
    },
```

- [ ] **Step 2: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import sv from '../../src/renderer/i18n/sv';
import EventModal from '../../src/renderer/components/modals/EventModal.vue';

describe('EventModal residence labels (Rapport 102)', () => {
  function mountAs(eventType: string) {
    const i18n = createI18n({ legacy: false, locale: 'sv', messages: { sv } });
    return mount(EventModal, {
      props: {
        // editingEvent shape with event_type set
        editingEvent: { id: 'evt-1', event_type: eventType, /* … other required defaults */ },
      },
      global: { plugins: [i18n], stubs: { /* … */ } },
    });
  }

  it('shows "Inflyttningsdatum" for residence', () => {
    expect(mountAs('residence').text()).toContain('Inflyttningsdatum');
  });

  it('shows "Eventuellt utflyttningsdatum" for residence', () => {
    expect(mountAs('residence').text()).toContain('Eventuellt utflyttningsdatum');
  });

  it('omits the "händelsen pågick under en enda tidpunkt" hint for residence', () => {
    expect(mountAs('residence').text()).not.toContain('pågick under en enda tidpunkt');
  });

  it('keeps the default "Datum" label for occupation', () => {
    const w = mountAs('occupation');
    expect(w.text()).toContain('Datum');
    expect(w.text()).not.toContain('Inflyttningsdatum');
  });
});
```

- [ ] **Step 3: Wire the helper + labels in EventModal.vue**

Inside `<script setup>` near the other computed values:

```typescript
const dateLabels = computed(() => {
  const overrides = (t('events.dateLabels.' + form.event_type, undefined, { fallbackWarn: false, missingWarn: false }) as unknown);
  const isMap = overrides && typeof overrides === 'object';
  return {
    start: isMap && 'start' in (overrides as Record<string, unknown>) ? (overrides as Record<string, string>).start : t('events.date'),
    end: isMap && 'end' in (overrides as Record<string, unknown>) ? (overrides as Record<string, string>).end : t('events.endDateOptional'),
    endHint: isMap && 'endHint' in (overrides as Record<string, unknown>)
      ? (overrides as Record<string, string>).endHint
      : t('events.endDateHint'),
  };
});

const participantsLabel = computed(() => {
  const overrideKey = 'events.participantsLabels.' + form.event_type;
  // i18n returns the key itself when not present — use te() to detect
  const i18n = useI18n();
  return i18n.te(overrideKey) ? t(overrideKey) : t('events.participants');
});
```

(Adjust to match the project's existing `useI18n()` usage in this file — there's already `const { t } = useI18n();` so reuse it; pass `participantsLabel` down as a prop to `EventParticipantsSection` instead of duplicating the helper.)

In the template at line 60:

```vue
<span class="ep-field-label">{{ dateLabels.start }}</span>
```

At line 73:

```vue
<span class="ep-field-label">{{ dateLabels.end }}</span>
```

At line 85, wrap with v-if:

```vue
<p v-if="dateLabels.endHint" class="ep-field-hint">{{ dateLabels.endHint }}</p>
```

- [ ] **Step 4: Wire the participants override**

Pass `:label="participantsLabel"` from `EventModal.vue` to `EventParticipantsSection`. Inside the section, replace the hardcoded title:

```vue
<span class="ep-sec-title">👥 {{ label ?? $t('events.participants') }}</span>
```

with a new optional prop `label?: string`.

- [ ] **Step 5: Run the tests**

```bash
npm test -- event-modal-residence
```

Expected: all 4 pass.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/i18n/sv.ts src/renderer/i18n/en.ts \
        src/renderer/components/modals/EventModal.vue \
        src/renderer/components/EventParticipantsSection.vue \
        tests/components/event-modal-residence.test.ts
git commit -m "feat(ui): per-event-type date and participant labels for residence (Ben rapport 102 §1-§3)"
```

### Task 6: Save-and-continue when adding participant on unsaved event (C4)

**Files:**
- Modify: `src/renderer/components/EventParticipantsSection.vue`
- Modify: `src/renderer/components/modals/EventModal.vue` (expose save trigger)
- Test: `tests/components/event-modal-participants-save.test.ts`

- [ ] **Step 1: Decide the contract**

`EventParticipantsSection` currently hides the picker when `eventId === null` and shows a static hint. Replace with:

- Picker always rendered.
- On `update:modelValue` with a person picked, if `eventId === null`, emit `requestSave` to the parent and pass the picked person id.
- Parent (`EventModal.vue`) handles `@request-save="(personId) => onParticipantRequestSave(personId)"`:
  - Show a `ConfirmModal` (already in the codebase) with title "Händelsen måste sparas innan…" and actions "Spara och fortsätt" / "Avbryt".
  - On confirm: `await composableSave()`, then `await window.api.eventParticipants.add({ event_id: savedEventId.value, person_id: personId, role: 'other' })`.
  - On cancel: clear the picker's `pickedId`.

- [ ] **Step 2: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
// ...
describe('EventModal participant add on unsaved event (Rapport 102 §4)', () => {
  it('shows a confirm dialog when picking a participant before the event is saved', async () => {
    const wrapper = mount(EventModal, { props: { /* no editingEvent, personId='p-1' */ } });
    await wrapper.find('[data-test="participant-picker"]').trigger('select-person', { personId: 'p-2' });
    expect(wrapper.text()).toContain('Händelsen måste sparas');
  });

  it('on "Spara och fortsätt" saves the event then adds the participant', async () => {
    const createSpy = vi.fn().mockResolvedValue({ id: 'evt-1' });
    const addSpy = vi.fn().mockResolvedValue({ id: 'part-1' });
    // stub window.api
    // … mount, trigger pick, click confirm
    expect(createSpy).toHaveBeenCalledOnce();
    expect(addSpy).toHaveBeenCalledWith({ event_id: 'evt-1', person_id: 'p-2', role: 'other' });
  });
});
```

- [ ] **Step 3: Implement EventParticipantsSection changes**

Replace the existing `<p v-if="!eventId">` block with the picker emitting an event when no eventId is present. Add an emit type:

```typescript
const emit = defineEmits<{
  'request-save': [personId: string];
}>();

async function onPicked(personId: string | null) {
  if (!personId) return;
  if (!props.eventId) {
    emit('request-save', personId);
    pickedId.value = null;
    return;
  }
  await addParticipant(personId);
}
```

- [ ] **Step 4: Implement EventModal handler**

```vue
<EventParticipantsSection
  v-if="!form.is_negation"
  :event-id="savedEventId"
  :exclude-person-ids="extraParticipantsExcludeIds"
  :label="participantsLabel"
  @request-save="onParticipantRequestSave"
/>

<ConfirmModal
  v-if="pendingParticipantPersonId"
  :title="$t('events.participantSaveFirstTitle')"
  :body="$t('events.participantSaveFirstBody')"
  :confirm-label="$t('events.saveAndContinue')"
  :cancel-label="$t('common.cancel')"
  @confirm="onConfirmSaveForParticipant"
  @cancel="pendingParticipantPersonId = null"
/>
```

```typescript
const pendingParticipantPersonId = ref<string | null>(null);
function onParticipantRequestSave(personId: string) {
  pendingParticipantPersonId.value = personId;
}
async function onConfirmSaveForParticipant() {
  const personId = pendingParticipantPersonId.value;
  pendingParticipantPersonId.value = null;
  if (!personId) return;
  await composableSave();
  const eventId = savedEventId.value;
  if (!eventId || !window.api) return;
  await window.api.eventParticipants.add({ event_id: eventId, person_id: personId, role: 'other' });
}
```

Add the three i18n keys (`participantSaveFirstTitle`, `participantSaveFirstBody`, `saveAndContinue`) to both `sv.ts` and `en.ts` under `events`.

- [ ] **Step 5: Run the test, then run e2e to make sure existing participant flows still pass**

```bash
npm test -- event-modal-participants-save
npm run test:e2e -- [panels]
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/EventParticipantsSection.vue \
        src/renderer/components/modals/EventModal.vue \
        src/renderer/i18n/sv.ts src/renderer/i18n/en.ts \
        tests/components/event-modal-participants-save.test.ts
git commit -m "feat(ui): inline save-and-continue when adding participant on unsaved event (Ben rapport 102 §4)"
```

### Task 7: Research tasks rename — section + nav (D1)

**Files:**
- Modify: `src/renderer/i18n/sv.ts:25, 1387-1388`

- [ ] **Step 1: Apply the rename**

```typescript
nav: {
  // …
  researchTasks: 'Fortsatt forskning',    // was 'Uppgifter'
}

// later …
researchTasks: {
  title: 'Fortsatt forskning',            // was 'Uppgifter'
  nav: 'Fortsatt forskning',              // was 'Uppgifter'
  // entity-level singular keys unchanged: addTask, task, newTask remain 'Uppgift' / 'Ny uppgift' / 'Lägg till uppgift'
  // …
},
```

Leave `en.ts` alone unless an English-speaking user reports it (commit message documents the deliberate skip).

- [ ] **Step 2: Spot-check by running the app**

```bash
npm start
```

Sidebar reads "Fortsatt forskning". PersonPanel section header at the bottom reads "Fortsatt forskning". The "+ Uppgift" action button keeps the singular entity wording.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/i18n/sv.ts
git commit -m "feat(i18n): rename research-tasks section to 'Fortsatt forskning' (sv) (Ben rapport 103)"
```

### Task 8: PersonPanel section reorder — Timeline + Map after Notes (E1)

**Files:**
- Modify: `src/renderer/components/PersonPanel.vue`
- Test: `tests/components/person-panel-section-order.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import sv from '../../src/renderer/i18n/sv';
import PersonPanel from '../../src/renderer/components/PersonPanel.vue';

describe('PersonPanel section order (Rapport 105)', () => {
  it('renders sections in the canonical order with Timeline + Map preceding Research', async () => {
    const i18n = createI18n({ legacy: false, locale: 'sv', messages: { sv } });
    // Stub window.api with the minimum loaders to render every section header
    const wrapper = mount(PersonPanel, {
      props: { personId: 'p-1' },
      global: { plugins: [i18n], stubs: { /* all children stubbed */ } },
    });
    await wrapper.vm.$nextTick();
    const headers = wrapper.findAll('.section-title').map((n) => n.text());
    const idxTimeline = headers.indexOf('Tidslinje');
    const idxMap = headers.indexOf('Livskarta');
    const idxResearch = headers.indexOf('Fortsatt forskning');
    const idxNotes = headers.indexOf('Anteckningar');
    expect(idxNotes).toBeLessThan(idxTimeline);
    expect(idxTimeline).toBeLessThan(idxMap);
    expect(idxMap).toBeLessThan(idxResearch);
  });
});
```

- [ ] **Step 2: Run and watch fail**

```bash
npm test -- person-panel-section-order
```

- [ ] **Step 3: Move the Timeline and Map `<div class="panel-section">` blocks**

Cut [PersonPanel.vue:112-128](../../src/renderer/components/PersonPanel.vue#L112-L128) (the two `panel-section` blocks for `sections.timeline` and `sections.map`) and paste them immediately above the Research section (`<SectionHeader :title="$t('researchTasks.nav')"…>`) at line 182.

Verify the surrounding `<template v-if="…">` wrappers (if any) still bracket the right set of children.

- [ ] **Step 4: Run the test + the existing panel-layout-consistency test**

```bash
npm test -- person-panel-section-order panel-layout-consistency
```

- [ ] **Step 5: Run the panel e2e tier**

```bash
npm run test:e2e -- [panels]
```

If any selectors broke, fix them in the same commit.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/PersonPanel.vue tests/components/person-panel-section-order.test.ts
git commit -m "feat(ui): move Timeline and Life Map sections below authored data in PersonPanel (Ben rapport 105)"
```

### Task 9: i18n parity + close-out

**Files:**
- Modify: `tests/unit/i18n-parity.test.ts` (if exists) OR create
- Verify: `src/renderer/i18n/sv.ts` and `en.ts` parity for new keys

- [ ] **Step 1: Confirm or add an i18n parity check**

```bash
grep -l i18n-parity tests/unit/
```

If a parity test exists, extend it to cover the new `events.dateLabels.*` and `events.participantsLabels.*` and `events.participantSaveFirstTitle/Body/saveAndContinue` keys. If it doesn't exist, add `tests/unit/i18n-parity.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import sv from '../../src/renderer/i18n/sv';
import en from '../../src/renderer/i18n/en';

function collectKeys(obj: unknown, prefix = ''): string[] {
  if (!obj || typeof obj !== 'object') return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out.push(...collectKeys(v, key));
    } else {
      out.push(key);
    }
  }
  return out;
}

describe('i18n parity', () => {
  it('every key in sv.ts exists in en.ts', () => {
    const svKeys = new Set(collectKeys(sv));
    const enKeys = new Set(collectKeys(en));
    const missing = [...svKeys].filter((k) => !enKeys.has(k));
    expect(missing).toEqual([]);
  });

  it('every key in en.ts exists in sv.ts', () => {
    const svKeys = new Set(collectKeys(sv));
    const enKeys = new Set(collectKeys(en));
    const missing = [...enKeys].filter((k) => !svKeys.has(k));
    expect(missing).toEqual([]);
  });
});
```

- [ ] **Step 2: Run**

```bash
npm test -- i18n-parity
```

If failing, add missing keys to either side (D1 deliberately keeps `researchTasks.title/nav` in English untouched; if the test fails on those, mark them as accepted divergence in the test by listing them in an allowlist constant — but only if no other approach works).

- [ ] **Step 3: Commit**

```bash
git add tests/unit/i18n-parity.test.ts
git commit -m "test(i18n): assert sv ↔ en key parity"
```

### Task 10 (Tier 1): Close-out via /close-out skill

- [ ] **Step 1** — Capture A2 (SourcePicker chevron) screenshot via dev MCP: navigate to a citation modal, `ui_screenshot` the SourcePicker, save to `/tmp/ben-polish-A2-chevron.png`. A2 has no automated test, so the screenshot is the load-bearing user-observable evidence for that item.
- [ ] **Step 2** — Invoke `/close-out` skill. The skill walks the 6+1 steps (evidence capture from `npm test` / `npm run build` / `npm run test:e2e:full`, archive, version bump to minor per feature plan, CHANGELOG, PLAN.md, archive PLAN.md, commit, post-close hygiene sweep). The A2 screenshot from Step 1 is referenced in the close-out commit body.
