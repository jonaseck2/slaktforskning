# Media → Source links (Ben rapport 104, Framing B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Ben can open a media item, see which sources it is linked to, and link it to another source (existing or newly created) directly from the Media panel.

**Architecture:** Implements **Framing B** of the [media-citations design spec](2026-05-31-media-citations-design.md) (chosen 2026-05-31). Surfaces the `media_links` rows with `entity_type='source'` that the schema *already* supports but the MediaPanel never showed. A new "Källor" section is added to `MediaPanel.vue` as a fourth linked-entity bucket alongside the existing Linked Persons / Places / Events sections — same data source (`media.linksForMedia`), same add/unlink mechanics. **Zero schema change.** The media↔source link is **made lossless** by extending the GEDCOM exporter to emit `OBJE` under `SOUR` records and the importer to read it back into a `media_links(entity_type='source')` row, backed by a **new per-field round-trip test**. (`OBJE` under `SOURCE_RECORD` is spec-legal in both 5.5.1 and 7.0; the exporter simply never wired sources — it already emits inline OBJE for persons/events/relationships. The existing golden round-trip test explicitly *excludes* `media_links`, so "covered by existing tests" was false — corrected here.) The reciprocal direction (a source showing its linked media) already exists on `SourcePanel.vue` via `EntityMediaSection`.

**Tech Stack:** Vue 3 `<script setup>`, `useEntityData` reactive loader, `useDeleteConfirm`, existing `window.api.media.{linksForMedia,addLink,removeLink}` + `window.api.sources.create`, `SourcePicker.vue`, Vitest component tests, Playwright `[panels]` e2e.

---

## User goal

Ben opens a media item (a portrait, a scanned page) and sees a **"Källor"** section listing every source that media is linked to. He can click **"+ Källa"** to link it to an existing source — or type a new title to create-and-link in one step — and he can remove a link he no longer wants. Opening the source's own panel shows the same media in its media list (the link is reciprocal). Nothing he records is lost across a GEDCOM export + re-import.

This is the "expose what I can already do elsewhere" shape Ben's reports consistently ask for: the link type already exists in the data model; it was simply never surfaced on the Media panel — and never wired through GEDCOM export/import, which this plan corrects so the link survives the round-trip.

## Scope

The only surface that changes is **`MediaPanel.vue`** plus its i18n keys and tests. Enumeration of every touched file is in **File Structure** below.

- **MediaPanel.vue** — gains a "Källor" section (the one new UI surface).
- **i18n (`sv.ts` + `en.ts`)** — three new keys + one onboarding-empty block.
- **`src/gedcom/exporter.ts`** — widen `emitMediaBlocks` to accept `'source'` and call it from the SOUR-record writer (emit `OBJE` under `SOUR`).
- **`src/import/gedcom/phases/sources.ts`** — read inline/referenced `OBJE` children under each `SOUR` node and create `media_links(entity_type='source')`, mirroring the event-importer (`event-importer.ts:156-159`).
- **`src/api/gedcom_fidelity_registry.ts`** — correct the `media_links.entity_type` entry prose (its "verified by golden round-trip tests" rationale was false for the source case).
- **Tests** — one new component test file; one new per-field GEDCOM round-trip test (seed media→source link → export 5.5.1 + 7.0 → re-import → assert survives); one new `[panels]` e2e step.

### Scope deviations (explicit)

- **No new panel/section *pattern* is introduced.** This is a fourth instance of MediaPanel's existing inline linked-entity section pattern (Persons / Places / Events). The renderer rule "pattern migrations are all-or-nothing" does not trigger — there is no reusable shell being extracted, only one more bucket added to an existing panel. The four sibling sections in the same panel already differ slightly (Events has no picker); adding Sources alongside them is consistent, not divergent.
- **Reciprocal direction is NOT built** — `SourcePanel.vue:199-210` already renders linked media via `<EntityMediaSection entity-type="source" :entity-id="sourceId">`. The plan *asserts* the reciprocal shows up; it writes no reciprocal code.
- **No `citations.media_id` column, no schema migration.** That is Framing A, explicitly deferred. With zero schema change the schema-introspection registry test is unaffected (the `media_links.entity_type` entry already exists; this plan corrects its prose, not its presence). Framing A stays in `docs/PLAN.md` "Considered, not now" with a reopen trigger (a user asking for per-scan page/confidence/transcription).
- **Exporter/importer scope correction (added 2026-05-31 after code-quality review):** the original plan asserted the round-trip was "already lossless / covered by existing tests." That was an unverified, false claim — the exporter emits no `OBJE` under `SOUR` and the golden test excludes `media_links`. Making the round-trip genuinely lossless is *load-bearing for the user goal's "nothing lost across export + re-import" clause*, so it is in scope (per `.claude/rules/plans.md` §5). It is NOT a new pattern, schema change, or Framing-A creep — it wires an existing inline-OBJE export/import pattern to the source entity.
- **No per-link page / confidence / transcription.** Those are Framing A fields. Under Framing B a media-to-source association is a plain link; provenance detail is recorded on the source row itself. This is the documented limitation of the chosen framing.

## Verification

### User-observable outcomes (match User goal)

1. Open a media item that is linked to a source: the MediaPanel shows a **"Källor"** section listing that source's title.
2. Click **"+ Källa"** on the Källor section → a source picker appears → pick an existing source → the source appears in the Källor list without a page reload or route change.
3. In the same picker, type a title that doesn't exist and choose create → a new source is created and immediately linked; it appears in the Källor list.
4. Click the unlink (IconUnlink) control on a Källor row → confirm → the link is removed and the row disappears.
5. Open that source's own panel (`/sources/:id`) → its **Media** section lists the media you just linked (reciprocal link is live).
6. Export the database to GEDCOM 5.5.1 **and** 7.0, re-import → the media↔source link survives. Proven by a **new per-field round-trip test** (the existing golden test excludes `media_links`, so it does NOT cover this — that gap is closed here).

### Tests that observe the user goal (not structure)

- **Component test** `tests/components/media-panel-sources-section.test.ts`:
  - Mount `MediaPanel` with `window.api.media.linksForMedia` stubbed to return one `entity_type:'source'` link and `window.api.sources.get` returning its title → assert the rendered Källor section contains the source title (outcome 1).
  - Click the section's `+ Källa` action, drive `SourcePicker`'s `select` emit → assert `window.api.media.addLink` was called with `{ media_id, entity_type: 'source', entity_id }` (outcome 2).
  - Drive `SourcePicker`'s `create-new` emit with a title → assert `window.api.sources.create({ title })` then `addLink` were called (outcome 3).
  - Assert each Källor row renders an `IconUnlink` (never a raw ✕ — enforced separately by `panel-cta-conventions.test.ts`); click it, confirm → assert `window.api.media.removeLink(linkId)` (outcome 4).
- **New per-field round-trip test** (outcome 6) `tests/unit/media-source-link-roundtrip.test.ts`: seed a source + a media + `addMediaLink({entity_type:'source'})`; for each version in `['5.5.1','7.0']` export → re-import into a fresh DB → assert a `media_links` row with `entity_type='source'` links the same source (by title) to the same media (by `file_ref`/`title`). Plus the existing `tests/unit/media.test.ts` and `tests/unit/gedcom-fidelity-golden.test.ts` asserted still-green.
- **`[panels]` e2e step** (outcomes 2 + 5): link a media to a source through the real UI, assert it shows on the Källor section, navigate to the source panel, assert the media shows in its Media section.

### Required CI gates (per `.claude/rules/plans.md` "e2e is load-bearing verification")

- `npm test` → `N passed (Xs)`; the new component test is included.
- `npm run build` → exits 0; tail line shows build time.
- `npm run test:e2e:full` → required because the user goal touches a right-side panel (`MediaPanel`) and a picker flow. Watch the `[panels]` project.

### User-goal-falsifiability check

*If every test passes, can Ben still hit friction?* The residual risks:
- **Discoverability** — the section must be visible without hunting. Mitigation: the Källor section is open-by-default (mirrors `places`, which is `true` in both `usePanelSections` maps), so a media with no source links still shows an empty Källor section with coaching copy + the `+ Källa` CTA. Verified by `panel-empty-state-coverage.test.ts` (any `v-for` needs an adjacent `SectionEmpty`).
- **Create-new path** — covered by the component test's `create-new` assertion (outcome 3), the path most likely to be skipped.

## Failure modes / RCA reference

- **This plan's own first version made an unverified round-trip claim (caught by code-quality review, 2026-05-31).** The design spec and the original plan asserted Framing B was "entirely lossless / already covered by existing round-trip tests." Reading the exporter (`emitMediaBlocks` typed `person|relationship|event` only; SOUR writer emits no OBJE) and the golden test (explicitly excludes `media_links`) showed the link was **silently dropped on export** — a Round-Trip Fidelity Prime Directive violation. RCA: a spec claim about round-trip status was written without grepping the exporter/importer. Lesson reinforced: a "maps to OBJE under SOUR" *spec* statement is not evidence the *code* emits it. Tasks 6–7 close the gap; the round-trip test (Task 6) is the standing guard.
- **No prior failed *plan* attempt** at media-source-links exists in `docs/plans/archive/`.
- **Adjacent contract:** the `panel-cta-conventions.test.ts` gate rejects a raw `✕` glyph inside a panel button — the Källor unlink control MUST be `<IconUnlink>` (severs link, keeps entity), matching the sibling Places/Events rows. Using `IconTrash` would wrongly imply deleting the source.
- **Adjacent contract:** `panel-empty-state-coverage.test.ts` rejects a `v-for` with no adjacent `SectionEmpty` — the new section's empty state is mandatory, not optional.
- **Prior incident — subagent CWD drift.** When executing under worktree + subagents, follow [`.claude/rules/worktrees.md`](../../.claude/rules/worktrees.md) strictly (`git -C` / `npm --prefix <wt>` / vitest `--root <wt>`).

---

## File Structure

| File | Touch type | What changes |
|---|---|---|
| `src/renderer/components/MediaPanel.vue` | Modify | New "Källor" section: template block, `linkedSources` data bucket + computed, `sections.sources` key, `showSourcePicker`, `openSourcePicker`, `linkSource`, `createAndLinkSource`. The existing generic `delLink`/`unlinkEntity` already handles source links — no change there. |
| `src/renderer/i18n/sv.ts` | Modify | `media.linkedSources`, `media.linkSource`, `onboarding.empty.mediaLinkedSources.{purpose,cta}` |
| `src/renderer/i18n/en.ts` | Modify | English parity of the same three keys |
| `src/gedcom/exporter.ts` | Modify | Widen `emitMediaBlocks` to `'source'`; call it from the SOUR-record writer (emit `OBJE` under `SOUR`) |
| `src/import/gedcom/phases/sources.ts` | Modify | Read `OBJE` under each `SOUR` → `addMediaLink(entity_type='source')`, mirroring `event-importer.ts:156-159` |
| `src/api/gedcom_fidelity_registry.ts` | Modify | Correct the `media_links.entity_type` entry prose (source links now round-trip via SOUR-OBJE, covered by the new test — not the golden test) |
| `tests/components/media-panel-sources-section.test.ts` | Create | All four component assertions above |
| `tests/unit/media-source-link-roundtrip.test.ts` | Create | Per-field round-trip (seed link → export 5.5.1 + 7.0 → re-import → assert survives) |
| `tests/e2e/...` (the `[panels]` project) | Modify | One spec exercising link-add + reciprocal (mirror nearest existing MediaPanel `[panels]` spec) |

---

## Tasks

Tasks tagged with mandate tier per `.claude/rules/mandate.md`. All are Tier 1 (own outright) — additive UI + GEDCOM export/import wiring, zero schema, zero data-model migration, zero outbound communication. (Tasks 1–5 are the in-app UI, already implemented + reviewed; Tasks 6–8 are the round-trip wiring added after code-quality review caught the false "already lossless" claim.)

### Task 1 (Tier 1): Worktree setup

**Files:** none (creates `.worktrees/media-source-links`)

- [x] **Step 1: Create the worktree from `main`**

Use the `superpowers:using-git-worktrees` skill. Target path: `.worktrees/media-source-links`, branch `media-source-links`, from `main`. All subsequent tasks run inside that worktree (subagents are cwd-correct; the controller uses `git -C` / `npm --prefix` / vitest `--root` per `.claude/rules/worktrees.md`).

---

### Task 2 (Tier 1): i18n keys

**Files:**
- Modify: `src/renderer/i18n/sv.ts:1806-1810` (the `media.linked*` / `media.link*` block) and the `onboarding.empty` block near `src/renderer/i18n/sv.ts:2297`
- Modify: `src/renderer/i18n/en.ts:1806-1810` and the parallel `onboarding.empty` block near `src/renderer/i18n/en.ts:2295`
- Test: `tests/unit/i18n-parity.test.ts` (existing — do not create; it auto-covers new keys)

- [x] **Step 1: Add the Swedish keys**

In `src/renderer/i18n/sv.ts`, in the `media:` object alongside `linkedEvents`/`linkPlace` (around line 1808-1810), add:

```ts
    linkedSources: 'Källor',
    linkSource: '+ Källa',
```

In the same file's `onboarding.empty` object, right after the `mediaLinkedEvents` block (around line 2297), add:

```ts
      mediaLinkedSources: {
        purpose: 'Här kopplar du mediafilen till de källor den kommer från eller hör till — en kyrkboksskanning till husförhörslängden, ett foto till arkivposten — så att samma fil syns på källans sida.',
        cta: 'Lägg till källa',
      },
```

- [x] **Step 2: Add the English keys (parity)**

In `src/renderer/i18n/en.ts`, in the `media:` object (around line 1808-1810):

```ts
    linkedSources: 'Linked Sources',
    linkSource: '+ Source',
```

In the same file's `onboarding.empty` object, after `mediaLinkedEvents`:

```ts
      mediaLinkedSources: {
        purpose: 'Link this media to the sources it comes from or belongs to — a church-record scan to the household examination roll, a photo to its archive record — so the same file appears on the source’s page.',
        cta: 'Add source',
      },
```

- [x] **Step 3: Run the i18n parity test**

Run: `npx vitest run --root <worktree-abs-path> tests/unit/i18n-parity.test.ts`
Expected: PASS (both files carry identical key sets).

- [x] **Step 4: Commit**

```bash
git add src/renderer/i18n/sv.ts src/renderer/i18n/en.ts
git commit -m "i18n: media linked-sources section keys (rapport 104, framing B)"
```

---

### Task 3 (Tier 1): Failing component test + data layer

**Files:**
- Create: `tests/components/media-panel-sources-section.test.ts`
- Modify: `src/renderer/components/MediaPanel.vue` (data layer only this task)

- [x] **Step 1: Write the failing component test**

Create `tests/components/media-panel-sources-section.test.ts`. Mirror the `window.api` proxy-mock approach used by `tests/components/panel-layout-consistency.test.ts`, but stub the specific calls `MediaPanel` makes during load. The first test asserts the rendered Källor section shows the linked source's title:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import sv from '../../src/renderer/i18n/sv';
import MediaPanel from '../../src/renderer/components/MediaPanel.vue';

const i18n = createI18n({ legacy: false, locale: 'sv', messages: { sv } });

function stubApi(overrides: Record<string, unknown> = {}) {
  const base: any = {
    media: {
      get: vi.fn(async () => ({ id: 'm1', title: 'Skanning', file_ref: null, format: null, notes: '' })),
      readAsDataUrl: vi.fn(async () => null),
      linksForMedia: vi.fn(async () => [{ id: 'lnk1', entity_type: 'source', entity_id: 's1' }]),
      addLink: vi.fn(async () => ({ id: 'lnk2' })),
      removeLink: vi.fn(async () => true),
    },
    sources: {
      get: vi.fn(async () => ({ id: 's1', title: 'Husförhörslängd Ödeshög' })),
      create: vi.fn(async () => ({ id: 's2' })),
    },
    persons: { get: vi.fn(async () => null), getNames: vi.fn(async () => []) },
    places: { get: vi.fn(async () => null) },
    events: { get: vi.fn(async () => null) },
    mediaRegions: { getForMedia: vi.fn(async () => []) },
  };
  return Object.assign(base, overrides);
}

describe('MediaPanel Källor section', () => {
  beforeEach(() => {
    (globalThis as any).window = (globalThis as any).window || {};
    (window as any).api = stubApi();
  });

  it('renders the linked source title', async () => {
    const wrapper = mount(MediaPanel, {
      props: { mediaId: 'm1' },
      global: { plugins: [i18n] },
    });
    // useEntityData loads asynchronously; flush microtasks.
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('Källor');
    expect(wrapper.text()).toContain('Husförhörslängd Ödeshög');
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `npx vitest run --root <worktree-abs-path> tests/components/media-panel-sources-section.test.ts`
Expected: FAIL — "Husförhörslängd Ödeshög" not found (no Källor section exists yet; the source link is dropped on the floor in the load loop).

- [x] **Step 3: Add the data layer in MediaPanel.vue**

In `src/renderer/components/MediaPanel.vue`, extend the `MediaPanelData` interface (around line 443-451) with a sources bucket:

```ts
interface MediaPanelData {
  media: MediaData | null;
  thumbnailSrc: string | null;
  linkedPersons: LinkedEntity[];
  linkedPlaces: LinkedEntity[];
  linkedEvents: LinkedEntity[];
  linkedSources: LinkedEntity[];
  regions: RegionData[];
  regionIsProfile: Record<string, boolean>;
}
```

In the loader (around line 470-510), declare the bucket and push into it. Add `const sources: LinkedEntity[] = [];` next to `persons`/`places`/`events` (line 470-472), then extend the bucket dispatch (line 507-509):

```ts
    if (link.entity_type === 'person') persons.push(entity);
    else if (link.entity_type === 'place') places.push(entity);
    else if (link.entity_type === 'event') events.push(entity);
    else if (link.entity_type === 'source') sources.push(entity);
```

Update the early-return empty object (line 456) and the final return (line 559) to include `linkedSources`:

```ts
  // early return when media not found:
  if (!m) return { media: null, thumbnailSrc: null, linkedPersons: [], linkedPlaces: [], linkedEvents: [], linkedSources: [], regions: [], regionIsProfile: {} };
```

```ts
  // final return:
  return { media: m, thumbnailSrc, linkedPersons: persons, linkedPlaces: places, linkedEvents: events, linkedSources: sources, regions: enrichedRegions, regionIsProfile };
```

Add the computed alongside the others (around line 564-566):

```ts
const linkedSources = computed(() => panelData.value?.linkedSources ?? []);
```

`resolveEntityLabel` already returns the source title for `entity_type === 'source'` (line 582-584) — no change needed there.

- [x] **Step 4: Run the test — still fails (no template yet)**

Run: `npx vitest run --root <worktree-abs-path> tests/components/media-panel-sources-section.test.ts`
Expected: FAIL — title still not rendered (data is loaded but no DOM emits it). This is correct; Task 4 adds the template.

- [x] **Step 5: Commit**

```bash
git add src/renderer/components/MediaPanel.vue tests/components/media-panel-sources-section.test.ts
git commit -m "feat(media): load entity_type='source' links into a linkedSources bucket"
```

---

### Task 4 (Tier 1): Källor section template + handlers (makes the render test pass)

**Files:**
- Modify: `src/renderer/components/MediaPanel.vue`

- [x] **Step 1: Import SourcePicker**

In the `<script setup>` imports (near line 338 where `PlacePicker` is imported), add:

```ts
import SourcePicker from './SourcePicker.vue';
```

- [x] **Step 2: Register the section in `usePanelSections`**

In the `usePanelSections(...)` call (line 435-439), add a `sources` key to **both** maps, mirroring `places` (open by default for discoverability — surfacing this section is the whole point):

```ts
const { sections, toggleSection } = usePanelSections(
  'media-panel-section-',
  { notes: false, persons: true, places: true, events: false, sources: true, faceTags: false, sharedNotes: false, quality: false },
  { notes: true, persons: true, places: true, events: true, sources: true, faceTags: true, sharedNotes: false, quality: false },
);
```

- [x] **Step 3: Add the picker state + handlers**

Next to `showPlacePicker` (line 412) add:

```ts
const showSourcePicker = ref(false);
```

Next to `openPlacePicker` (line 423-426) add the auto-expand opener (mirrors the documented "no silent degradation" pattern):

```ts
function openSourcePicker() {
  if (!sections.sources) toggleSection('sources');
  showSourcePicker.value = true;
}
```

Next to `linkPlace` (line 646-656) add the link + create-and-link handlers:

```ts
async function linkSource(source: { id: string }) {
  if (!props.mediaId) return;
  await window.api.media.addLink({
    media_id: props.mediaId,
    entity_type: 'source',
    entity_id: source.id,
  });
  showSourcePicker.value = false;
  emit('link-changed');
  await reload();
}

async function createAndLinkSource(title: string) {
  if (!props.mediaId) return;
  const source = (await window.api.sources.create({ title })) as { id: string };
  await window.api.media.addLink({
    media_id: props.mediaId,
    entity_type: 'source',
    entity_id: source.id,
  });
  showSourcePicker.value = false;
  emit('link-changed');
  await reload();
}
```

The existing generic `delLink` / `unlinkEntity` (line 623-631) already removes any link by id — source links unlink with no change (the `linkedPersons.find` lookup returns undefined → `personId` null → plain `removeLink`).

- [x] **Step 4: Add the template section**

In the template, insert a new `<div class="panel-section">` block **immediately after the Linked Events section** (after line 248, before the Shared notes comment at line 250). Mirror the Linked Places block (line 197-225) exactly, swapping the picker and router-link target:

```vue
      <!-- Linked Sources (rapport 104, framing B) -->
      <div class="panel-section">
        <SectionHeader
          :title="$t('media.linkedSources')"
          :count="linkedSources.length"
          :collapsed="!sections.sources"
          :action-label="props.readonly ? undefined : $t('media.linkSource')"
          @toggle="toggleSection('sources')"
          @action="openSourcePicker"
        />
        <div v-if="sections.sources" class="panel-section-body">
          <div v-if="!props.readonly && showSourcePicker" class="picker-wrap">
            <SourcePicker :model-value="null" @select="linkSource" @create-new="createAndLinkSource" />
            <AppButton variant="ghost" size="sm" @click="showSourcePicker = false">{{ $t('common.cancel') }}</AppButton>
          </div>
          <SectionEmpty
            v-if="linkedSources.length === 0 && !showSourcePicker"
            purpose-key="onboarding.empty.mediaLinkedSources.purpose"
            :action-label-key="props.readonly ? undefined : 'onboarding.empty.mediaLinkedSources.cta'"
            @action="showSourcePicker = true"
          />
          <div v-for="ls in linkedSources" :key="ls.linkId" class="linked-row">
            <router-link :to="{ path: '/sources', query: { source: ls.entityId } }" class="person-link">{{ ls.label }}</router-link>
            <AppButton v-if="!props.readonly" variant="ghost" size="sm" class="unlink-btn" :aria-label="$t('a11y.unlinkItem', { item: ls.label })" :title="$t('common.unlinkTooltip')" @click="unlinkEntity(ls.linkId)">
              <IconUnlink :size="14" />
            </AppButton>
          </div>
        </div>
      </div>
```

> **Verify the source route shape** before committing: confirm `/sources/:id` or the `?source=` query is how the rest of the app links to a source panel (grep `path: '/sources'` and `query: { source` in `src/renderer/`). Use whichever shape SourcePanel navigation already uses; the block above assumes the `?source=` query mirror of the Places `?place=` pattern. If the app uses `/sources/:id`, switch the `:to` to `'/sources/' + ls.entityId`.

- [x] **Step 5: Run the render test — now passes**

Run: `npx vitest run --root <worktree-abs-path> tests/components/media-panel-sources-section.test.ts`
Expected: PASS — "Källor" and "Husförhörslängd Ödeshög" both render.

- [x] **Step 6: Commit**

```bash
git add src/renderer/components/MediaPanel.vue
git commit -m "feat(media): Källor section on MediaPanel — link media to sources (rapport 104, framing B)"
```

---

### Task 5 (Tier 1): Add-link, create-and-link, and unlink behavioral tests

**Files:**
- Modify: `tests/components/media-panel-sources-section.test.ts`

- [x] **Step 1: Add the add-link test**

Append to the describe block. Drive `SourcePicker`'s `select` emit and assert `addLink`:

```ts
  it('links an existing source via the picker', async () => {
    (window as any).api = stubApi();
    const wrapper = mount(MediaPanel, { props: { mediaId: 'm1' }, global: { plugins: [i18n] } });
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();

    // Open the picker via the section action.
    await wrapper.findComponent({ name: 'SectionHeader' }); // sanity
    (wrapper.vm as any).openSourcePicker?.();
    await wrapper.vm.$nextTick();

    const picker = wrapper.findComponent(SourcePicker);
    expect(picker.exists()).toBe(true);
    picker.vm.$emit('select', { id: 's9' });
    await new Promise((r) => setTimeout(r, 0));

    expect((window as any).api.media.addLink).toHaveBeenCalledWith({
      media_id: 'm1', entity_type: 'source', entity_id: 's9',
    });
  });
```

> If `openSourcePicker` is not exposed on the instance, click the section's action button instead: find the Källor `SectionHeader` and emit its `action` event, or `await wrapper.find('[data-test="media-link-source"]').trigger('click')` after adding that `data-test` attr. Prefer the real DOM path; only reach into the instance if the harness makes the button hard to target.

- [x] **Step 2: Add the create-and-link test**

```ts
  it('creates and links a new source from the picker', async () => {
    (window as any).api = stubApi();
    const wrapper = mount(MediaPanel, { props: { mediaId: 'm1' }, global: { plugins: [i18n] } });
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();
    (wrapper.vm as any).openSourcePicker?.();
    await wrapper.vm.$nextTick();

    const picker = wrapper.findComponent(SourcePicker);
    picker.vm.$emit('create-new', 'Ny kyrkbok');
    await new Promise((r) => setTimeout(r, 0));

    expect((window as any).api.sources.create).toHaveBeenCalledWith({ title: 'Ny kyrkbok' });
    expect((window as any).api.media.addLink).toHaveBeenCalledWith({
      media_id: 'm1', entity_type: 'source', entity_id: 's2',
    });
  });
```

- [x] **Step 3: Add the unlink test**

```ts
  it('unlinks a source link after confirmation', async () => {
    (window as any).api = stubApi();
    const wrapper = mount(MediaPanel, { props: { mediaId: 'm1' }, global: { plugins: [i18n] } });
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();

    // Render asserts an IconUnlink exists in the Källor row (not a raw ✕).
    expect(wrapper.findComponent({ name: 'IconUnlink' }).exists()).toBe(true);

    (wrapper.vm as any).unlinkEntity('lnk1');
    await wrapper.vm.$nextTick();
    // Confirm the delete dialog (useDeleteConfirm exposes .confirm()).
    (wrapper.vm as any).delLink?.confirm?.();
    await new Promise((r) => setTimeout(r, 0));

    expect((window as any).api.media.removeLink).toHaveBeenCalledWith('lnk1');
  });
```

> `delLink` may not be exposed on the instance. If so, drive the unlink through the rendered `ConfirmModal`: click the row's unlink button, then emit `confirm` on the `ConfirmModal` whose title is `media.unlinkConfirmTitle`. Use the DOM path; reach into the instance only as a fallback.

- [x] **Step 4: Run the full test file**

Run: `npx vitest run --root <worktree-abs-path> tests/components/media-panel-sources-section.test.ts`
Expected: PASS — all four tests green.

- [x] **Step 5: Commit**

```bash
git add tests/components/media-panel-sources-section.test.ts
git commit -m "test(media): cover link/create-and-link/unlink for the Källor section"
```

---

### Task 6 (Tier 1): GEDCOM round-trip — emit + read `OBJE` under `SOUR` (TDD)

This is one coherent round-trip capability: the failing test only goes green when **both** the exporter and importer halves land, so they ship in one task.

**Files:**
- Create: `tests/unit/media-source-link-roundtrip.test.ts`
- Modify: `src/gedcom/exporter.ts`
- Modify: `src/import/gedcom/phases/sources.ts`

- [x] **Step 1: Write the failing per-field round-trip test**

Create `tests/unit/media-source-link-roundtrip.test.ts`. Use `createTestDb()` from `tests/unit/helpers.ts` (the in-memory SQLite harness). For each version, seed a source + a media + a source-link, export, re-import into a fresh DB, and assert the link survived:

```ts
import { describe, it, expect } from 'vitest';
import { createTestDb } from './helpers';
import { createSource } from '../../src/api/sources';
import { createMedia, addMediaLink, getLinksForMedia, listMedia } from '../../src/api/media';
import { searchSources } from '../../src/api/sources';
import { exportGedcom } from '../../src/gedcom/exporter';
import { importGedcom } from '../../src/gedcom/importer';

describe.each(['5.5.1', '7.0'] as const)('media→source link round-trips under GEDCOM %s', (version) => {
  it('survives export + re-import', async () => {
    const db = createTestDb();
    const src = await createSource(db, { title: 'Husförhörslängd Ödeshög AI:1' });
    const med = await createMedia(db, { title: 'Scan p.42', file_ref: 'family-media/scan-42.jpg', format: 'image/jpeg' });
    await addMediaLink(db, { media_id: med.id, entity_type: 'source', entity_id: src.id });

    const { ged } = await exportGedcom(db, version);
    expect(ged).toMatch(/0 @S\d+@ SOUR[\s\S]*?\n1 OBJE/); // OBJE emitted under SOUR

    const db2 = createTestDb();
    await importGedcom(db2, ged);

    // Find the re-imported source + media, assert the link reconstructed.
    const sources2 = await searchSources(db2, 'Husförhörslängd');
    expect(sources2.length).toBe(1);
    const media2 = await listMedia(db2);
    const scan = media2.find((m: any) => (m.title ?? '').includes('Scan p.42') || (m.file_ref ?? '').includes('scan-42'));
    expect(scan, 'media re-imported').toBeTruthy();
    const links = await getLinksForMedia(db2, scan!.id);
    expect(links.some((l: any) => l.entity_type === 'source' && l.entity_id === sources2[0].id)).toBe(true);
  });
});
```

> **Verify the exact api signatures first** (`createSource`, `createMedia`, `addMediaLink`, `getLinksForMedia`, `searchSources`, and the media-list function name — it may be `listMedia`, `findMedia`, or similar; `getLinksForMedia` is confirmed at `src/api/media.ts:393`). Adjust imports/calls to the real names. The `importGedcom` entrypoint is in `src/gedcom/importer.ts` — confirm its signature `(db, gedString)` and adapt if it differs (some call sites pass an options object).

- [x] **Step 2: Run it — verify it fails**

Run: `npx vitest run --root <worktree-abs-path> tests/unit/media-source-link-roundtrip.test.ts`
Expected: FAIL — the `1 OBJE` assertion fails (exporter emits no OBJE under SOUR), or the link assertion fails (importer doesn't read it). This is the empirical reproduction of the code-quality finding.

- [x] **Step 3: Exporter — emit `OBJE` under `SOUR`**

In `src/gedcom/exporter.ts`, widen the `emitMediaBlocks` signature (line 154) to include `'source'`:

```ts
async function emitMediaBlocks(lines: string[], db: Database, entityType: 'person' | 'relationship' | 'event' | 'source', entityId: string, baseLevel: number): Promise<void> {
```

Then, inside the SOUR-record writer loop, immediately after the `await emitSourceCoverageEvents(db, src.id, 1, version, lines);` call (line 364, still inside the `for` loop over `sources`), add:

```ts
    if (includeMedia) await emitMediaBlocks(lines, db, 'source', src.id, 1);
```

(`includeMedia` is the top-level const resolved at line ~206; `getMediaForEntity(db, 'source', id)` already queries `media_links` by `entity_type`, so no change to that helper is needed.)

- [x] **Step 4: Importer — read `OBJE` under `SOUR` into `media_links`**

In `src/import/gedcom/phases/sources.ts`, mirror the event-importer's media-link pattern (`src/import/gedcom/event-importer.ts:156-159`). Read those reference lines and `src/import/gedcom/import-types.ts` for the exact `ImportContext` field names before writing.

Add imports at the top:
```ts
import { addMediaLink } from '../../../api/media';
import { importObjeNode } from '../obje-importer';
import { getChild, getChildren } from '../node-utils';   // getChildren in addition to existing getChild
```

Collect media-link pairs during the parse loop (the source `id` is already generated there as `const id = uuid()`), then flush them after `bulkCreateSources` — mirror exactly how `repoLinks` is collected-then-flushed. For each `node` in the parse loop:

```ts
    for (const objeNode of getChildren(node, 'OBJE')) {
      const mediaId = await importObjeNode(ctx.db, objeNode, ctx.objeMap, ctx.options, ctx.inlineMediaMap);
      if (mediaId) mediaLinkPairs.push({ media_id: mediaId, entity_id: id });
    }
```

…where `mediaLinkPairs: Array<{ media_id: string; entity_id: string }> = []` is declared next to `repoLinks`, and after `await bulkCreateSources(ctx.db, rows);`:

```ts
  for (const { media_id, entity_id } of mediaLinkPairs) {
    await addMediaLink(ctx.db, { media_id, entity_type: 'source', entity_id });
  }
```

> Confirm `importObjeNode`'s real parameter order/names against `src/import/gedcom/obje-importer.ts` and the `ImportContext` field names (`ctx.objeMap`, `ctx.inlineMediaMap`, `ctx.options`) against `import-types.ts` — adjust the call to match. `phaseSources` runs after the OBJE / prep-inline-media phases, so those maps are populated.

- [x] **Step 5: Run the round-trip test — now green (both versions)**

Run: `npx vitest run --root <worktree-abs-path> tests/unit/media-source-link-roundtrip.test.ts`
Expected: PASS for both `5.5.1` and `7.0`.

- [x] **Step 6: Regression — existing media + golden tests still green**

Run: `npx vitest run --root <worktree-abs-path> tests/unit/media.test.ts tests/unit/gedcom-fidelity-golden.test.ts tests/unit/gedcom*.test.ts`
Expected: PASS. The new SOUR-OBJE export adds output; confirm no golden/exporter test asserted the *absence* of OBJE under SOUR. If a golden snapshot needs updating because the export now legitimately includes source media, update it and note why in the commit.

- [x] **Step 7: Commit**

```bash
git add src/gedcom/exporter.ts src/import/gedcom/phases/sources.ts tests/unit/media-source-link-roundtrip.test.ts
git commit -m "feat(gedcom): round-trip media→source links via OBJE under SOUR (5.5.1 + 7.0)"
```

---

### Task 7 (Tier 1): Correct the `media_links.entity_type` fidelity-registry entry

**Files:**
- Modify: `src/api/gedcom_fidelity_registry.ts` (the `media_links.entity_type` entry, ~line 987-1004)

- [x] **Step 1: Read the current entry and correct the rationale**

The entry's prose claims the link is "verified by golden round-trip tests" and "derived at import from the parent GEDCOM record nesting the OBJE block." That was false for `entity_type='source'` (no OBJE was emitted; golden excludes `media_links`). Update the prose to state the truth as of this plan: person/event/relationship links derive from inline OBJE under those records; **source links derive from OBJE under SOUR (added in this plan), covered by `tests/unit/media-source-link-roundtrip.test.ts`** — not by the golden test, which still excludes the join table. Keep the status value (`lossless` / `lossless-via:…`) accurate for all entity_type values. Do not weaken any other column's entry.

- [x] **Step 2: Run the registry + schema-introspection test**

Run: `npx vitest run --root <worktree-abs-path> tests/unit/gedcom-fidelity-registry.test.ts` (or whichever test asserts registry completeness — `grep -rln "fidelity_registry\|registry" tests/unit`).
Expected: PASS.

- [x] **Step 3: Commit**

```bash
git add src/api/gedcom_fidelity_registry.ts
git commit -m "docs(gedcom): correct media_links.entity_type registry — source links now round-trip via SOUR-OBJE"
```

---

### Task 8 (Tier 1): Reciprocal + `[panels]` e2e

**Files:**
- Modify: one spec in the `[panels]` e2e project (mirror the nearest existing MediaPanel spec)

- [x] **Step 1: Identify the nearest existing MediaPanel `[panels]` e2e spec**

Run: `ls tests/e2e` and `grep -rln "MediaPanel\|linkedPlaces\|media" tests/e2e`. Read the closest spec to learn the project's `AppDriver` (fixture.ts) selectors and navigation helpers. Do **not** invent a Playwright API; copy the established one.

- [x] **Step 2: Add the link-add + reciprocal e2e**

In the chosen `[panels]` spec, add a test that, against the packaged binary:
1. Creates (or seeds) one media item and one source.
2. Opens the media's panel, expands/finds the **Källor** section (title from `media.linkedSources`), clicks **+ Källa**, selects the source in `SourcePicker`.
3. Asserts the source title now appears in the Källor list (outcome 2).
4. Navigates to that source's panel, asserts the media appears in its Media section (outcome 5 — reciprocal).

Mirror the assertions and selectors of the sibling spec you read in Step 1 (text-based locators on the section title + row are safest; avoid brittle nth-child).

- [x] **Step 3: Run the `[panels]` project**

Run: `npx playwright test --project=panels` (build first if `out/` is stale: `npm run build:bin`).
Expected: PASS, including the new test.

- [x] **Step 4: Commit**

```bash
git add tests/e2e
git commit -m "test(e2e): link media to source via Källor section + reciprocal on source panel"
```

---

### Task 9 (Tier 1): Full verification

**Files:** none (verification only)

- [x] **Step 1: Lint**

Run: `npm run lint --prefix <worktree-abs-path>`
Expected: 0 errors.

- [x] **Step 2: Unit + component tests**

Run: `npx vitest run --root <worktree-abs-path>`
Expected: `N passed (Xs)`. Capture the summary line.

- [x] **Step 3: Build**

Run: `npm run build --prefix <worktree-abs-path>`
Expected: exits 0; capture the `built in Xs` tail line.

- [x] **Step 4: e2e full**

Run: `npm run test:e2e:full --prefix <worktree-abs-path>` (or `npx playwright test` if `out/` is built).
Expected: all 7 projects pass. Capture per-project pass counts — **`[panels]`** is the load-bearing one for this plan.

- [x] **Step 5: Record evidence**

Paste the captured summary lines (test count, build tail, e2e per-project counts) into the close-out commit message in the next task. Invoke `superpowers:verification-before-completion`.

---

### Task 10 (Tier 1): Close-out

- [x] **T-final (Tier 1)** — Invoke `/close-out` skill. It walks the 6+1 steps (mark checkboxes, `git mv` this plan + the design sibling to `docs/plans/archive/`, version bump (feature → minor) + CHANGELOG block, `docs/PLAN.md` sync — remove the Blocked "Media citations design" entry and add a "Considered, not now" entry for Framing A with its reopen trigger, archive PLAN.md append, commit, merge/push), captures evidence, refuses partial. Note in the close-out: the design spec moves to archive too, since its framing question is now answered.

---

## Self-review checklist

- [x] User goal is the first thing in the plan and is user-observable (no mechanism).
- [x] Scope enumerates the only changed surface (MediaPanel) and lists deviations (no reciprocal code, no schema, no per-link fields, Framing A deferred).
- [x] Verification §1 has checks that fail if the user goal is unmet (component test renders + add + create + unlink; e2e reciprocal; round-trip green).
- [x] No placeholders — every code step shows the actual code; the one runtime check (source route shape) is flagged with a verify-before-commit note.
- [x] Type consistency: `linkedSources` / `LinkedEntity` / `addLink({media_id, entity_type, entity_id})` / `sources.create({title})` match the real signatures read from the codebase.
- [x] Every task tagged with its mandate tier (all Tier 1).
- [x] No self-referential tasks (no "write this plan" task).
- [x] Final task is the single `/close-out` line, not an inlined 6-step restatement.
- [x] No "smoke" identifiers.
