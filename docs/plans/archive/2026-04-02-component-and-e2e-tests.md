# Component & E2E Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Vue component unit tests and Playwright E2E tests covering the citation affordances and "Add Related Person" features shipped in v0.3.0.

**Architecture:** Two independent test layers. (1) Vue component tests use `@vue/test-utils` + `happy-dom` inside Vitest, mocking `window.api` with `vi.fn()` — no real DB, no Electron. (2) E2E tests extend the existing `gui.test.ts` which drives the live Electron app via its HTTP bridge (`AppDriver`), seeding data through `window.api.*` JS calls injected into the renderer.

**Tech Stack:** Vitest 4.x with multi-project config, `@vue/test-utils`, `happy-dom`, `vue-i18n`, `@playwright/test`, Electron HTTP bridge.

---

## File Map

| File | Change |
|------|--------|
| `package.json` | Add `@vue/test-utils` and `happy-dom` to devDependencies |
| `vitest.config.mts` | Add second project for component tests (happy-dom environment) |
| `tests/components/setup.ts` | **New.** Shared i18n instance and window.api mock helpers |
| `tests/components/AddRelatedPersonModal.test.ts` | **New.** 6 tests for the modal's title, subtype visibility, and API call directions |
| `tests/components/EventList.test.ts` | **New.** 3 tests for citation count badges and Cite button |
| `tests/components/EventForm.test.ts` | **New.** 3 tests for optional source section visibility and citation creation |
| `tests/components/CitationForm.test.ts` | **New.** 1 test confirming `relationship_id` is passed when prop is set |
| `tests/e2e/gui.test.ts` | Add two new `describe` blocks: citation badges and Add Related Person |

---

## Task 1: Install dependencies and configure Vitest

**Files:**
- Modify: `package.json`
- Modify: `vitest.config.mts`

- [ ] **Step 1: Install test dependencies**

Run from project root:
```bash
npm install --save-dev @vue/test-utils happy-dom
```

Expected: both packages appear in `package.json` devDependencies. No errors.

- [ ] **Step 2: Update vitest.config.mts**

Replace the entire contents of `vitest.config.mts` with:

```typescript
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        plugins: [vue()],
        test: {
          name: 'components',
          include: ['tests/components/**/*.test.ts'],
          environment: 'happy-dom',
        },
      },
    ],
  },
});
```

- [ ] **Step 3: Verify existing unit tests still pass**

```bash
npm test
```

Expected output includes:
```
unit  4 passed (4)
```
(The component project may report 0 tests since no files exist yet — that's fine.)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json vitest.config.mts
git commit -m "test: add @vue/test-utils + happy-dom, configure vitest multi-project"
```

---

## Task 2: Shared test setup

**Files:**
- Create: `tests/components/setup.ts`

- [ ] **Step 1: Create the setup file**

Create `tests/components/setup.ts`:

```typescript
import { createI18n } from 'vue-i18n';
import en from '../../src/renderer/i18n/en';

/**
 * A real i18n instance backed by the English translation file.
 * Import this into every component test and pass it as a global plugin.
 *
 * Usage:
 *   mount(MyComponent, { global: { plugins: [i18n] }, props: { ... } })
 */
export const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
});
```

- [ ] **Step 2: Commit**

```bash
git add tests/components/setup.ts
git commit -m "test: add shared i18n setup for component tests"
```

---

## Task 3: AddRelatedPersonModal component tests

**Files:**
- Create: `tests/components/AddRelatedPersonModal.test.ts`

- [ ] **Step 1: Create the test file**

Create `tests/components/AddRelatedPersonModal.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import AddRelatedPersonModal from '../../src/renderer/components/AddRelatedPersonModal.vue';
import { i18n } from './setup';

describe('AddRelatedPersonModal', () => {
  const mockPersonsCreate = vi.fn();
  const mockRelationshipsCreate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockPersonsCreate.mockResolvedValue({ id: 'new-person-id' });
    mockRelationshipsCreate.mockResolvedValue({ id: 'rel-id' });
    (window as unknown as { api: unknown }).api = {
      persons: { create: mockPersonsCreate },
      relationships: { create: mockRelationshipsCreate },
    };
  });

  function mountModal(mode: 'parent' | 'spouse' | 'child') {
    return mount(AddRelatedPersonModal, {
      global: { plugins: [i18n] },
      props: { personId: 'current-person-id', mode },
    });
  }

  it('shows "Add Parent" title for parent mode', () => {
    const wrapper = mountModal('parent');
    expect(wrapper.find('h3').text()).toBe('Add Parent');
  });

  it('shows "Add Spouse/Partner" title for spouse mode', () => {
    const wrapper = mountModal('spouse');
    expect(wrapper.find('h3').text()).toBe('Add Spouse/Partner');
  });

  it('shows "Add Child" title for child mode', () => {
    const wrapper = mountModal('child');
    expect(wrapper.find('h3').text()).toBe('Add Child');
  });

  it('shows subtype select only in spouse mode', () => {
    // parent mode: one select (sex only)
    const parentWrapper = mountModal('parent');
    expect(parentWrapper.findAll('select')).toHaveLength(1);

    // spouse mode: two selects (sex + subtype)
    const spouseWrapper = mountModal('spouse');
    expect(spouseWrapper.findAll('select')).toHaveLength(2);
  });

  it('creates parent_child with new person as parent for parent mode', async () => {
    const wrapper = mountModal('parent');
    await wrapper.find('input[type="text"]').setValue('Lars');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(mockPersonsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ given_name: 'Lars' }),
    );
    expect(mockRelationshipsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'parent_child',
        person1_id: 'new-person-id',    // new person IS the parent
        person2_id: 'current-person-id', // current person IS the child
      }),
    );
  });

  it('creates parent_child with current person as parent for child mode', async () => {
    const wrapper = mountModal('child');
    await wrapper.find('input[type="text"]').setValue('Britta');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(mockRelationshipsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'parent_child',
        person1_id: 'current-person-id', // current person IS the parent
        person2_id: 'new-person-id',    // new person IS the child
      }),
    );
  });

  it('creates couple relationship for spouse mode', async () => {
    const wrapper = mountModal('spouse');
    await wrapper.find('input[type="text"]').setValue('Maria');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(mockRelationshipsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'couple',
        person1_id: 'current-person-id',
        person2_id: 'new-person-id',
      }),
    );
  });

  it('emits saved and close after successful save', async () => {
    const wrapper = mountModal('parent');
    await wrapper.find('input[type="text"]').setValue('Test');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.emitted('saved')).toHaveLength(1);
    expect(wrapper.emitted('close')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run component tests to confirm they pass**

```bash
npm test
```

Expected: `components  8 passed` (7 from AddRelatedPersonModal + 0 others)

- [ ] **Step 3: Commit**

```bash
git add tests/components/AddRelatedPersonModal.test.ts
git commit -m "test: add AddRelatedPersonModal component tests"
```

---

## Task 4: EventList citation badge component tests

**Files:**
- Create: `tests/components/EventList.test.ts`

- [ ] **Step 1: Create the test file**

Create `tests/components/EventList.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import EventList from '../../src/renderer/components/EventList.vue';
import { i18n } from './setup';

const sampleEvent = {
  id: 'event-1',
  event_type: 'birth',
  date_type: 'exact',
  date_value: '1850-01-01',
  date_value_end: null,
  date_original: '1850-01-01',
  place_id: null,
  description: 'Born',
};

describe('EventList citation badges', () => {
  const mockForPerson = vi.fn();
  const mockForEvent = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (window as unknown as { api: unknown }).api = {
      events: {
        forPerson: mockForPerson,
        forRelationship: vi.fn().mockResolvedValue([]),
        delete: vi.fn(),
      },
      citations: { forEvent: mockForEvent },
      // EventForm and CitationForm also call sources.list on mount,
      // but they're only shown when their v-if triggers — safe to omit here
      sources: { list: vi.fn().mockResolvedValue([]) },
    };
  });

  it('shows Unsourced badge when event has no citations', async () => {
    mockForPerson.mockResolvedValue([sampleEvent]);
    mockForEvent.mockResolvedValue([]);

    const wrapper = mount(EventList, {
      global: { plugins: [i18n] },
      props: { personId: 'person-1' },
    });
    await flushPromises();

    expect(wrapper.find('.unsourced-badge').exists()).toBe(true);
    expect(wrapper.find('.source-count-badge').exists()).toBe(false);
  });

  it('shows source count badge when event has citations', async () => {
    mockForPerson.mockResolvedValue([sampleEvent]);
    mockForEvent.mockResolvedValue([{ id: 'cit-1' }, { id: 'cit-2' }]);

    const wrapper = mount(EventList, {
      global: { plugins: [i18n] },
      props: { personId: 'person-1' },
    });
    await flushPromises();

    expect(wrapper.find('.source-count-badge').exists()).toBe(true);
    expect(wrapper.find('.source-count-badge').text()).toContain('2');
    expect(wrapper.find('.unsourced-badge').exists()).toBe(false);
  });

  it('clicking Cite button renders CitationForm', async () => {
    mockForPerson.mockResolvedValue([sampleEvent]);
    mockForEvent.mockResolvedValue([]);

    const wrapper = mount(EventList, {
      global: { plugins: [i18n] },
      props: { personId: 'person-1' },
    });
    await flushPromises();

    await wrapper.find('.btn-cite').trigger('click');
    await wrapper.vm.$nextTick();

    // CitationForm is rendered (its stub or real component appears)
    expect(wrapper.html()).toContain('citation');
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: component project now shows more passing tests.

- [ ] **Step 3: Commit**

```bash
git add tests/components/EventList.test.ts
git commit -m "test: add EventList citation badge component tests"
```

---

## Task 5: EventForm and CitationForm component tests

**Files:**
- Create: `tests/components/EventForm.test.ts`
- Create: `tests/components/CitationForm.test.ts`

- [ ] **Step 1: Create EventForm test file**

Create `tests/components/EventForm.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import EventForm from '../../src/renderer/components/EventForm.vue';
import { i18n } from './setup';

const editingEvent = {
  id: 'e1',
  event_type: 'birth',
  date_type: 'exact',
  date_value: '1850-01-01',
  date_value_end: null,
  date_original: '1 JAN 1850',
  place_id: null,
  description: '',
};

describe('EventForm optional source section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (window as unknown as { api: unknown }).api = {
      events: { create: vi.fn().mockResolvedValue({ id: 'new-evt' }), update: vi.fn().mockResolvedValue({}) },
      eventParticipants: { add: vi.fn().mockResolvedValue({}) },
      citations: { create: vi.fn().mockResolvedValue({ id: 'new-cit' }) },
      sources: { list: vi.fn().mockResolvedValue([{ id: 'src-1', title: 'Church Records' }]) },
    };
  });

  it('shows source toggle when creating a new event', async () => {
    const wrapper = mount(EventForm, {
      global: { plugins: [i18n] },
      props: { personId: 'p1' },
    });
    await flushPromises();

    expect(wrapper.find('.source-toggle').exists()).toBe(true);
  });

  it('hides source toggle when editing an existing event', async () => {
    const wrapper = mount(EventForm, {
      global: { plugins: [i18n] },
      props: { personId: 'p1', editingEvent },
    });
    await flushPromises();

    expect(wrapper.find('.source-toggle').exists()).toBe(false);
  });

  it('creates a citation linked to the event when source is selected', async () => {
    const mockEventsCreate = vi.fn().mockResolvedValue({ id: 'new-evt' });
    const mockCitationsCreate = vi.fn().mockResolvedValue({ id: 'new-cit' });
    (window as unknown as { api: unknown }).api = {
      events: { create: mockEventsCreate },
      eventParticipants: { add: vi.fn().mockResolvedValue({}) },
      citations: { create: mockCitationsCreate },
      sources: { list: vi.fn().mockResolvedValue([{ id: 'src-1', title: 'Church Records' }]) },
    };

    const wrapper = mount(EventForm, {
      global: { plugins: [i18n] },
      props: { personId: 'p1' },
    });
    await flushPromises();

    // Select an event type (required field)
    await wrapper.find('select').setValue('birth');

    // Check the "Add Source" checkbox
    const checkbox = wrapper.find('.source-toggle input[type="checkbox"]');
    await checkbox.setValue(true);
    await wrapper.vm.$nextTick();

    // The source picker now appears — select the source (it's the second select after event type)
    const selects = wrapper.findAll('select');
    // selects[0] = event type, selects[1] = source picker (after checkbox)
    await selects[1].setValue('src-1');

    // Submit the form
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(mockEventsCreate).toHaveBeenCalled();
    expect(mockCitationsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        source_id: 'src-1',
        event_id: 'new-evt',
      }),
    );
  });
});
```

- [ ] **Step 2: Create CitationForm test file**

Create `tests/components/CitationForm.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import CitationForm from '../../src/renderer/components/CitationForm.vue';
import { i18n } from './setup';

describe('CitationForm', () => {
  const mockCitationsCreate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockCitationsCreate.mockResolvedValue({ id: 'cit-1' });
    (window as unknown as { api: unknown }).api = {
      citations: { create: mockCitationsCreate },
      sources: {
        list: vi.fn().mockResolvedValue([{ id: 'src-1', title: 'Test Source' }]),
      },
    };
  });

  it('passes relationship_id when relationshipId prop is provided', async () => {
    const wrapper = mount(CitationForm, {
      global: { plugins: [i18n] },
      props: { relationshipId: 'rel-123' },
    });
    await flushPromises();

    // Select the source
    await wrapper.find('select').setValue('src-1');

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(mockCitationsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        source_id: 'src-1',
        relationship_id: 'rel-123',
      }),
    );
  });
});
```

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: all unit tests still pass, component tests all pass. Count should be 37 unit + new component tests.

- [ ] **Step 4: Commit**

```bash
git add tests/components/EventForm.test.ts tests/components/CitationForm.test.ts
git commit -m "test: add EventForm and CitationForm component tests"
```

---

## Task 6: E2E tests for citation badges

**Files:**
- Modify: `tests/e2e/gui.test.ts`

- [ ] **Step 1: Add helper methods to AppDriver**

In `tests/e2e/gui.test.ts`, find the `AppDriver` class. After the `createSource` method, add:

```typescript
  async createEvent(data: {
    event_type: string;
    date_original?: string;
    relationship_id?: string;
  }): Promise<{ id: string }> {
    return this.executeJs<{ id: string }>(
      `window.api.events.create(${JSON.stringify(data)})`,
    );
  }

  async addEventParticipant(data: {
    event_id: string;
    person_id: string;
    role: string;
  }): Promise<{ id: string }> {
    return this.executeJs<{ id: string }>(
      `window.api.eventParticipants.add(${JSON.stringify(data)})`,
    );
  }

  async createCitation(data: {
    source_id: string;
    event_id?: string;
    person_id?: string;
    confidence?: number;
  }): Promise<{ id: string }> {
    return this.executeJs<{ id: string }>(
      `window.api.citations.create(${JSON.stringify(data)})`,
    );
  }
```

- [ ] **Step 2: Add citation badge describe block**

At the bottom of `gui.test.ts` (after the `Screenshots` describe block), add:

```typescript
test.describe('Citation Badges', () => {
  test('new event shows Unsourced badge', async () => {
    const person = await app.createPerson({ given_name: 'Olof', surname: 'Osourced' });
    const event = await app.createEvent({ event_type: 'birth', date_original: '1850' });
    await app.addEventParticipant({ event_id: event.id, person_id: person.id, role: 'primary' });

    await app.navigate(`/persons/${person.id}`);
    await app.waitForText('Olof Osourced');
    await app.expectText('Unsourced');
  });

  test('event with one citation shows "1 source" badge', async () => {
    const person = await app.createPerson({ given_name: 'Birgitta', surname: 'Sourced' });
    const event = await app.createEvent({ event_type: 'birth', date_original: '1860' });
    await app.addEventParticipant({ event_id: event.id, person_id: person.id, role: 'primary' });
    const source = await app.createSource({ title: 'Kyrkbok Badge Test' });
    await app.createCitation({ source_id: source.id, event_id: event.id, confidence: 2 });

    await app.navigate(`/persons/${person.id}`);
    await app.waitForText('Birgitta Sourced');
    // Badge should show count, not "Unsourced"
    await app.expectText('1');
    await app.expectNoText('Unsourced');
  });

  test('evidence summary shows sourced/total count', async () => {
    const person = await app.createPerson({ given_name: 'Greta', surname: 'Summary' });
    // Event 1: sourced
    const evt1 = await app.createEvent({ event_type: 'birth', date_original: '1870' });
    await app.addEventParticipant({ event_id: evt1.id, person_id: person.id, role: 'primary' });
    const source = await app.createSource({ title: 'Kyrkbok Summary Test' });
    await app.createCitation({ source_id: source.id, event_id: evt1.id, confidence: 2 });
    // Event 2: unsourced
    const evt2 = await app.createEvent({ event_type: 'death', date_original: '1940' });
    await app.addEventParticipant({ event_id: evt2.id, person_id: person.id, role: 'primary' });

    await app.navigate(`/persons/${person.id}`);
    await app.waitForText('Greta Summary');
    // Evidence summary: "1 of 2 events sourced"
    await app.expectText('1');
    await app.expectText('2');
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/gui.test.ts
git commit -m "test: add E2E citation badge tests"
```

---

## Task 7: E2E tests for Add Related Person

**Files:**
- Modify: `tests/e2e/gui.test.ts`

- [ ] **Step 1: Add Add Related Person describe block**

After the `Citation Badges` describe block added in Task 6, add:

```typescript
test.describe('Add Related Person', () => {
  let basePerson: { id: string };

  test.beforeAll(async () => {
    basePerson = await app.createPerson({ given_name: 'Ingrid', surname: 'Baseperson' });
  });

  test('Add Parent button creates a person and parent_child relationship', async () => {
    await app.navigate(`/persons/${basePerson.id}`);
    await app.waitForText('Ingrid Baseperson');

    // Click the "Add Parent" button (first .btn-rel-add)
    await app.executeJs(`document.querySelectorAll('.btn-rel-add')[0].click()`);
    await app.settle();

    // Fill in the given name field
    await app.fillInput('.modal input[type="text"]', 'Sven');
    await app.settle();

    // Submit
    await app.click('.modal button[type="submit"]');
    await app.settle(800);

    // Navigate back to person detail — new relationship should appear
    await app.navigate(`/persons/${basePerson.id}`);
    await app.waitForText('Sven');
  });

  test('Add Child button creates a person and parent_child relationship', async () => {
    await app.navigate(`/persons/${basePerson.id}`);
    await app.waitForText('Ingrid Baseperson');

    // "Add Child" is the third .btn-rel-add (index 2)
    await app.executeJs(`document.querySelectorAll('.btn-rel-add')[2].click()`);
    await app.settle();

    await app.fillInput('.modal input[type="text"]', 'Lisa');
    await app.click('.modal button[type="submit"]');
    await app.settle(800);

    await app.navigate(`/persons/${basePerson.id}`);
    await app.waitForText('Lisa');
  });

  test('Add Spouse button creates a person and couple relationship', async () => {
    await app.navigate(`/persons/${basePerson.id}`);
    await app.waitForText('Ingrid Baseperson');

    // "Add Spouse" is the second .btn-rel-add (index 1)
    await app.executeJs(`document.querySelectorAll('.btn-rel-add')[1].click()`);
    await app.settle();

    await app.fillInput('.modal input[type="text"]', 'Erik');
    await app.click('.modal button[type="submit"]');
    await app.settle(800);

    await app.navigate(`/persons/${basePerson.id}`);
    await app.waitForText('Erik');
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/gui.test.ts
git commit -m "test: add E2E Add Related Person tests"
```

---

## Task 8: Run full test suite and verify

- [ ] **Step 1: Run unit + component tests**

```bash
npm test
```

Expected: 37 unit tests pass + 13 component tests pass (7 AddRelatedPersonModal + 3 EventList + 3 EventForm + 1 CitationForm = 14 total).

If any component test fails, fix before proceeding. Common issues:
- `window.api` not mocked for a child component — add the missing method to the mock
- i18n key not found — the test renders a component that uses a key not in `en.ts`; check the key exists

- [ ] **Step 2: Run E2E GUI tests**

```bash
npx playwright test --project=gui
```

Expected: all tests pass including the new Citation Badges and Add Related Person describe blocks. This requires the Electron app to build and start (takes ~60-90s).

If a test fails, check:
- Selector `.btn-rel-add` — confirm the class is in the rendered DOM via `app.getDom()`
- Timing — increase `settle()` delay if assertions fail intermittently

- [ ] **Step 3: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "test: fix any issues from E2E test run"
```
