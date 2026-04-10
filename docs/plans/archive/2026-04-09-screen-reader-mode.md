# Screen Reader Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone screen reader mode that narrates every focused element, provides single-key hotkey navigation, and enables arrow-key family tree traversal — so a visually impaired genealogist can fully use the app without VoiceOver/NVDA.

**Architecture:** Vue directive (`v-narrate`) + composable layer (`useScreenReaderMode`). The directive registers narration text on elements; a global `focusin` listener speaks it. A `HotkeyRegistry` manages global + view-scoped keyboard shortcuts. High Contrast is an independent Appearance theme.

**Tech Stack:** Vue 3 Composition API, Web Speech API (existing `useTTS`), Vue custom directives, CSS custom properties, Vue I18n

**Spec:** `docs/plans/2026-04-09-screen-reader-mode-design.md`

---

## File Map

### New Files

| File | Responsibility |
|------|----------------|
| `src/renderer/directives/narrate.ts` | `v-narrate` directive — stores narration in WeakMap, resolves on focus |
| `src/renderer/composables/useScreenReaderMode.ts` | Global mode state, focus listener, live-region observer, route announcements |
| `src/renderer/composables/useHotkeyRegistry.ts` | Hotkey registration (global + view-scoped), `?` help, input suppression |
| `src/renderer/composables/useChartNavigation.ts` | Arrow-key tree cursor for pedigree/circle/hourglass charts |
| `src/renderer/utils/screenReaderNarration.ts` | All new narration builders (row summaries, chart nodes, UI, forms) |
| `src/renderer/components/ConfirmModal.vue` | Accessible delete confirmation (replaces browser `confirm()`) |
| `tests/unit/screenReaderNarration.test.ts` | Unit tests for narration builders |
| `tests/unit/hotkeyRegistry.test.ts` | Unit tests for hotkey registry |
| `tests/unit/narrateDirective.test.ts` | Unit tests for v-narrate directive |

### Modified Files

| File | Change |
|------|--------|
| `src/renderer/main.ts` | Register `v-narrate` directive |
| `src/renderer/App.vue` | Three-way Appearance, three-way Read Aloud, route-change announcements, screen reader init |
| `src/renderer/styles/shared.css` | High contrast theme (`html.high-contrast`), enhanced focus indicators |
| `src/renderer/locales/en.ts` | `screenReader.*` namespace (~80 keys) |
| `src/renderer/locales/sv.ts` | `screenReader.*` namespace (~80 keys) |
| `src/renderer/views/PersonsView.vue` | `v-narrate` on rows, arrow nav, empty state narration |
| `src/renderer/views/PersonDetailView.vue` | Section hotkeys (1-6), section narration, `v-narrate` on items |
| `src/renderer/views/RelationshipsView.vue` | `v-narrate` on rows, arrow nav |
| `src/renderer/views/RelationshipDetailView.vue` | Section narration |
| `src/renderer/views/SourcesView.vue` | `v-narrate` on rows, arrow nav |
| `src/renderer/views/SourceDetailView.vue` | Section narration |
| `src/renderer/views/PlacesView.vue` | `v-narrate` on rows, arrow nav |
| `src/renderer/views/PlaceDetailView.vue` | Section narration |
| `src/renderer/views/VisualizationView.vue` | Chart navigation hotkeys, screen reader announcements |
| `src/renderer/views/SearchView.vue` | Result narration |
| `src/renderer/views/QualityView.vue` | Row narration |
| `src/renderer/views/ResearchTasksView.vue` | Row narration |
| `src/renderer/components/charts/PedigreeChart.vue` | Arrow-key navigation integration |
| `src/renderer/components/charts/CircleChart.vue` | Arrow-key navigation integration |
| `src/renderer/components/charts/HourglassChart.vue` | Arrow-key navigation integration |
| `src/renderer/components/BaseModal.vue` | Modal open narration, field narration |
| `src/renderer/components/EventForm.vue` | Field narration |
| `src/renderer/components/PersonPicker.vue` | Search result narration in screen reader mode |
| `src/renderer/components/PlacePicker.vue` | Search result narration in screen reader mode |
| `src/renderer/components/DateInput.vue` | Compound field narration |

---

## Task 1: i18n — Add screenReader Namespace

**Files:**
- Modify: `src/renderer/locales/en.ts`
- Modify: `src/renderer/locales/sv.ts`

This task adds all i18n keys needed by later tasks. Do this first so narration builders can reference real keys.

- [ ] **Step 1: Add screenReader namespace to en.ts**

Open `src/renderer/locales/en.ts`. Find the `narration:` block (around line 723). After the closing `}` of `narration`, add the new `screenReader` namespace:

```typescript
screenReader: {
  // Mode
  welcome: 'Screen reader mode active. Press question mark for available commands.',
  modeOff: 'Screen reader mode deactivated.',

  // Hotkey help
  hotkeysAvailable: 'Available commands: {list}',
  hotkeyPersons: 'P persons',
  hotkeyRelationships: 'R relationships',
  hotkeySources: 'S sources',
  hotkeyPlaces: 'L places',
  hotkeyTasks: 'T research tasks',
  hotkeyVisualization: 'V visualization',
  hotkeyQuality: 'Q quality checks',
  hotkeyDatabase: 'D database',
  hotkeySearch: 'slash or F search',
  hotkeyNew: 'N new item',
  hotkeyEdit: 'E edit',
  hotkeyDelete: 'Delete remove',
  hotkeyHome: 'H home',
  hotkeyHelp: 'question mark help',
  hotkeyStopSpeech: 'Control period stop speech',

  // Navigation
  navPersonsList: 'Persons list, {count} persons',
  navRelationshipsList: 'Relationships, {count} relationships',
  navSourcesList: 'Sources, {count} sources',
  navPlacesList: 'Places, {count} places',
  navTasksList: 'Research tasks, {count} tasks',
  navVisualization: 'Visualization view',
  navQuality: 'Quality checks',
  navDatabase: 'Database settings',
  navSearch: 'Search, type to find persons',
  navHome: 'Home, {name}',
  navPersonDetail: 'Person detail: {name}, {sex}, {summary}. {sectionCount} sections available. Press 1 through {sectionCount} to jump to a section, or Tab to move through.',
  navRelationshipDetail: 'Relationship detail: {summary}',
  navSourceDetail: 'Source detail: {title}',
  navPlaceDetail: 'Place detail: {name}',

  // Row narration
  rowPerson: '{name}, {sex}, {summary}',
  rowRelationship: '{type}: {person1} and {person2}, {summary}',
  rowSource: '{sourceType}: {title}, {citationCount} citations',
  rowPlace: '{name}, {placeType}, {path}',
  rowTask: '{priority} priority, {status}: {task}',
  rowEvent: '{eventType}, {date}, {place}',
  rowMedia: '{title}, {format}',
  rowQuality: '{severity}: {message}',

  // Chart
  chartFather: 'Father: {name}, {summary}',
  chartMother: 'Mother: {name}, {summary}',
  chartChild: 'Child: {name}, {summary}',
  chartSpouse: 'Spouse: {name}, {summary}',
  chartSibling: 'Sibling: {name}, {summary}',
  chartAncestor: '{relationship}: {name}, {summary}. Generation {generation}. {childCount} children.',
  chartFocusPerson: 'Focus person: {name}, {summary}. Generation 1. {parentsHint}, {childrenHint}.',
  chartOpening: 'Opening {name}',
  chartNoFather: 'No father recorded',
  chartNoMother: 'No mother recorded',
  chartNoChildren: 'No children recorded',
  chartNoSpouse: 'No spouse recorded',
  chartNoAncestors: 'No further ancestors loaded',
  chartCollapsed: 'Collapsed ancestors of {name}',
  chartExpanded: 'Expanded, {count} generations',
  chartParentsAbove: 'Parents available above',
  chartNoParents: 'No parents recorded',
  chartChildrenBelow: '{count} children below',
  chartNoChildrenBelow: 'No children below',

  // Sections (detail views)
  sectionNames: 'Names section, {count} names. {summary}',
  sectionEvents: 'Events section, {count} events. {summary}',
  sectionRelationships: 'Relationships section, {count} relationships. {summary}',
  sectionMedia: 'Media section, {count} items. {summary}',
  sectionIdentifiers: 'Identifiers section, {count} identifiers. {summary}',
  sectionChecks: 'Quality checks section, {count} issues. {summary}',
  sectionGroups: 'Groups section, {count} groups.',
  sectionTasks: 'Research tasks section, {count} tasks.',
  sectionNotes: 'Notes: {content}',
  sectionNotesEmpty: 'Notes: empty.',

  // Forms
  formOpen: '{title}. Form with {count} fields. Tab to move between fields.',
  fieldText: '{label}, text field, {value}',
  fieldTextEmpty: '{label}, text field, empty',
  fieldDropdown: '{label}, dropdown, {value}',
  fieldSearch: '{label}, search field. Type to search, {value}',
  fieldSearchEmpty: '{label}, search field. Type to search.',
  searchMatches: '{count} matches',
  searchNoMatches: 'No matches',
  selected: 'Selected {name}',

  // Actions
  actionSaved: 'Saved',
  actionDeleted: 'Deleted {name}',
  actionModalClosed: 'Modal closed',
  actionEditing: 'Editing {name}',
  actionNew: 'New {type}',
  actionError: 'Error: {message}',

  // Delete confirmation
  confirmDelete: 'Confirm delete. Delete {name}? This cannot be undone. Enter to confirm, Escape to cancel.',

  // Table
  tableEmpty: 'No {type} found. Press N to add.',
  tableResults: '{count} results',
  tableNoResults: 'No results found',

  // Buttons (for narration fallback)
  btnSave: 'Save, button',
  btnCancel: 'Cancel, button',
  btnAdd: 'Add, button',
  btnDelete: 'Delete, button',
},
```

- [ ] **Step 2: Add screenReader namespace to sv.ts**

Open `src/renderer/locales/sv.ts`. Add the same structure with Swedish translations. Find the `narration:` block and add after it:

```typescript
screenReader: {
  welcome: 'Skarmlasar-lage aktivt. Tryck fragetecken for tillgangliga kommandon.',
  modeOff: 'Skarmlasar-lage avaktiverat.',
  hotkeysAvailable: 'Tillgangliga kommandon: {list}',
  hotkeyPersons: 'P personer',
  hotkeyRelationships: 'R relationer',
  hotkeySources: 'S kallor',
  hotkeyPlaces: 'L platser',
  hotkeyTasks: 'T forskningsuppgifter',
  hotkeyVisualization: 'V visualisering',
  hotkeyQuality: 'Q kvalitetskontroller',
  hotkeyDatabase: 'D databas',
  hotkeySearch: 'snedstreck eller F sok',
  hotkeyNew: 'N ny',
  hotkeyEdit: 'E redigera',
  hotkeyDelete: 'Delete ta bort',
  hotkeyHome: 'H hem',
  hotkeyHelp: 'fragetecken hjalp',
  hotkeyStopSpeech: 'Control punkt stoppa tal',
  navPersonsList: 'Personlista, {count} personer',
  navRelationshipsList: 'Relationer, {count} relationer',
  navSourcesList: 'Kallor, {count} kallor',
  navPlacesList: 'Platser, {count} platser',
  navTasksList: 'Forskningsuppgifter, {count} uppgifter',
  navVisualization: 'Visualiseringsvy',
  navQuality: 'Kvalitetskontroller',
  navDatabase: 'Databasinstellningar',
  navSearch: 'Sok, skriv for att hitta personer',
  navHome: 'Hem, {name}',
  navPersonDetail: 'Persondetalj: {name}, {sex}, {summary}. {sectionCount} sektioner tillgangliga. Tryck 1 till {sectionCount} for att hoppa till en sektion, eller Tab for att ga igenom.',
  navRelationshipDetail: 'Relationsdetalj: {summary}',
  navSourceDetail: 'Kalldetalj: {title}',
  navPlaceDetail: 'Platsdetalj: {name}',
  rowPerson: '{name}, {sex}, {summary}',
  rowRelationship: '{type}: {person1} och {person2}, {summary}',
  rowSource: '{sourceType}: {title}, {citationCount} kallhanvisningar',
  rowPlace: '{name}, {placeType}, {path}',
  rowTask: '{priority} prioritet, {status}: {task}',
  rowEvent: '{eventType}, {date}, {place}',
  rowMedia: '{title}, {format}',
  rowQuality: '{severity}: {message}',
  chartFather: 'Far: {name}, {summary}',
  chartMother: 'Mor: {name}, {summary}',
  chartChild: 'Barn: {name}, {summary}',
  chartSpouse: 'Make/maka: {name}, {summary}',
  chartSibling: 'Syskon: {name}, {summary}',
  chartAncestor: '{relationship}: {name}, {summary}. Generation {generation}. {childCount} barn.',
  chartFocusPerson: 'Fokusperson: {name}, {summary}. Generation 1. {parentsHint}, {childrenHint}.',
  chartOpening: 'Oppnar {name}',
  chartNoFather: 'Ingen far registrerad',
  chartNoMother: 'Ingen mor registrerad',
  chartNoChildren: 'Inga barn registrerade',
  chartNoSpouse: 'Ingen make/maka registrerad',
  chartNoAncestors: 'Inga fler anfader laddade',
  chartCollapsed: 'Dolde anfader for {name}',
  chartExpanded: 'Expanderad, {count} generationer',
  chartParentsAbove: 'Foraldrar tillgangliga ovan',
  chartNoParents: 'Inga foraldrar registrerade',
  chartChildrenBelow: '{count} barn nedan',
  chartNoChildrenBelow: 'Inga barn nedan',
  sectionNames: 'Namnsektion, {count} namn. {summary}',
  sectionEvents: 'Handelsesektion, {count} handelser. {summary}',
  sectionRelationships: 'Relationssektion, {count} relationer. {summary}',
  sectionMedia: 'Mediasektion, {count} objekt. {summary}',
  sectionIdentifiers: 'Identifierare-sektion, {count} identifierare. {summary}',
  sectionChecks: 'Kvalitetskontroller, {count} problem. {summary}',
  sectionGroups: 'Gruppsektion, {count} grupper.',
  sectionTasks: 'Forskningsuppgifter, {count} uppgifter.',
  sectionNotes: 'Anteckningar: {content}',
  sectionNotesEmpty: 'Anteckningar: tomt.',
  formOpen: '{title}. Formular med {count} falt. Tab for att flytta mellan falt.',
  fieldText: '{label}, textfalt, {value}',
  fieldTextEmpty: '{label}, textfalt, tomt',
  fieldDropdown: '{label}, rullgardinsmeny, {value}',
  fieldSearch: '{label}, sokfalt. Skriv for att soka, {value}',
  fieldSearchEmpty: '{label}, sokfalt. Skriv for att soka.',
  searchMatches: '{count} traffar',
  searchNoMatches: 'Inga traffar',
  selected: 'Vald {name}',
  actionSaved: 'Sparat',
  actionDeleted: 'Raderat {name}',
  actionModalClosed: 'Modal stangd',
  actionEditing: 'Redigerar {name}',
  actionNew: 'Ny {type}',
  actionError: 'Fel: {message}',
  confirmDelete: 'Bekrafta radering. Radera {name}? Detta kan inte angras. Enter for att bekrafta, Escape for att avbryta.',
  tableEmpty: 'Inga {type} hittade. Tryck N for att lagga till.',
  tableResults: '{count} resultat',
  tableNoResults: 'Inga resultat hittade',
  btnSave: 'Spara, knapp',
  btnCancel: 'Avbryt, knapp',
  btnAdd: 'Lagg till, knapp',
  btnDelete: 'Radera, knapp',
},
```

- [ ] **Step 3: Verify the app still compiles**

Run: `npm start` and confirm no i18n errors in console. Kill after confirming.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(i18n): add screenReader namespace for screen reader mode"
```

---

## Task 2: Narration Utility Functions

**Files:**
- Create: `src/renderer/utils/screenReaderNarration.ts`
- Create: `tests/unit/screenReaderNarration.test.ts`

Pure functions — no Vue dependencies, fully unit-testable.

- [ ] **Step 1: Write the test file**

Create `tests/unit/screenReaderNarration.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  narratePersonRow,
  narrateRelationshipRow,
  narrateSourceRow,
  narratePlaceRow,
  narrateEventRow,
  narrateTaskRow,
  narrateMediaRow,
  narrateQualityRow,
  narratePersonDetail,
  narrateChartNode,
  narrateChartBoundary,
  narratePageEntry,
  narrateModalOpen,
  narrateFieldFocus,
  narrateSearchResults,
  narrateAction,
} from '../../src/renderer/utils/screenReaderNarration';

// Mock t() function that returns the key with interpolations replaced
function mockT(key: string, params?: Record<string, string | number>): string {
  let result = key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      result = result.replace(`{${k}}`, String(v));
    }
  }
  return result;
}

describe('screenReaderNarration', () => {
  describe('narratePersonRow', () => {
    it('returns narration with name, sex, and summary', () => {
      const result = narratePersonRow(
        { given_name: 'Anna', surname: 'Johansson', sex: 'F', event_count: 3, relationship_count: 2 },
        mockT,
      );
      expect(result).toContain('Anna Johansson');
      expect(result).toContain('screenReader.rowPerson');
    });

    it('handles missing name gracefully', () => {
      const result = narratePersonRow(
        { given_name: '', surname: '', sex: 'U', event_count: 0, relationship_count: 0 },
        mockT,
      );
      expect(result).toBeTruthy();
    });
  });

  describe('narrateRelationshipRow', () => {
    it('includes both person names and type', () => {
      const result = narrateRelationshipRow(
        {
          type: 'couple',
          person1_given_name: 'Erik', person1_surname: 'Johansson',
          person2_given_name: 'Anna', person2_surname: 'Persson',
          event_summary: 'married 1880',
        },
        mockT,
      );
      expect(result).toContain('Erik Johansson');
      expect(result).toContain('Anna Persson');
    });
  });

  describe('narrateSourceRow', () => {
    it('includes title and citation count', () => {
      const result = narrateSourceRow(
        { title: 'Husforhorslangd', source_type: 'church_record', citation_count: 5 },
        mockT,
      );
      expect(result).toContain('Husforhorslangd');
      expect(result).toContain('5');
    });
  });

  describe('narratePlaceRow', () => {
    it('includes name, type, and path', () => {
      const result = narratePlaceRow(
        { name: 'Lund', place_type: 'city', path: 'Skane, Sweden' },
        mockT,
      );
      expect(result).toContain('Lund');
    });
  });

  describe('narrateEventRow', () => {
    it('includes event type, date, place', () => {
      const result = narrateEventRow(
        { event_type: 'birth', date_value: '1892-03-15', place_name: 'Lund' },
        mockT,
      );
      expect(result).toContain('birth');
      expect(result).toContain('Lund');
    });
  });

  describe('narrateTaskRow', () => {
    it('includes priority, status, task', () => {
      const result = narrateTaskRow(
        { priority: 1, status: 'open', task: 'Find baptism record' },
        mockT,
      );
      expect(result).toContain('Find baptism record');
    });
  });

  describe('narrateChartNode', () => {
    it('includes relationship and generation', () => {
      const result = narrateChartNode(
        { name: 'Johan Eriksson', summary: 'born 1810', relationship: 'Paternal grandfather', generation: 3, childCount: 2 },
        mockT,
      );
      expect(result).toContain('Johan Eriksson');
      expect(result).toContain('3');
    });
  });

  describe('narrateChartBoundary', () => {
    it('returns boundary message for father', () => {
      const result = narrateChartBoundary('father', mockT);
      expect(result).toContain('screenReader.chartNoFather');
    });

    it('returns boundary message for children', () => {
      const result = narrateChartBoundary('children', mockT);
      expect(result).toContain('screenReader.chartNoChildren');
    });
  });

  describe('narratePageEntry', () => {
    it('formats page name and count', () => {
      const result = narratePageEntry('persons', 47, mockT);
      expect(result).toContain('47');
    });
  });

  describe('narrateModalOpen', () => {
    it('includes title and field count', () => {
      const result = narrateModalOpen('Add new person', 3, mockT);
      expect(result).toContain('Add new person');
      expect(result).toContain('3');
    });
  });

  describe('narrateFieldFocus', () => {
    it('includes label, type, and value', () => {
      const result = narrateFieldFocus('Given name', 'text', 'Anna', mockT);
      expect(result).toContain('Given name');
      expect(result).toContain('Anna');
    });

    it('says empty when no value', () => {
      const result = narrateFieldFocus('Given name', 'text', '', mockT);
      expect(result).toContain('screenReader.fieldTextEmpty');
    });
  });

  describe('narrateSearchResults', () => {
    it('returns count message', () => {
      const result = narrateSearchResults(3, mockT);
      expect(result).toContain('3');
    });

    it('returns no matches for zero', () => {
      const result = narrateSearchResults(0, mockT);
      expect(result).toContain('screenReader.searchNoMatches');
    });
  });

  describe('narrateAction', () => {
    it('returns action narration', () => {
      const result = narrateAction('saved', undefined, mockT);
      expect(result).toContain('screenReader.actionSaved');
    });

    it('includes target name for delete', () => {
      const result = narrateAction('deleted', 'Anna Johansson', mockT);
      expect(result).toContain('Anna Johansson');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/screenReaderNarration.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the narration utility**

Create `src/renderer/utils/screenReaderNarration.ts`:

```typescript
/**
 * Narration builders for screen reader mode.
 * All functions take an i18n t() function for localization.
 * These are pure functions with no Vue dependencies.
 */

type T = (key: string, params?: Record<string, string | number>) => string;

// --- Entity row narration ---

export interface PersonRowData {
  given_name: string;
  surname: string;
  sex: string;
  event_count: number;
  relationship_count: number;
}

export function narratePersonRow(data: PersonRowData, t: T): string {
  const name = [data.given_name, data.surname].filter(Boolean).join(' ') || t('common.unknown');
  const sex = data.sex === 'M' ? t('common.male') : data.sex === 'F' ? t('common.female') : t('common.unknown');
  const parts: string[] = [];
  if (data.event_count > 0) parts.push(`${data.event_count} ${t('events.title')}`);
  if (data.relationship_count > 0) parts.push(`${data.relationship_count} ${t('relationships.title')}`);
  const summary = parts.join(', ');
  return t('screenReader.rowPerson', { name, sex, summary });
}

export interface RelationshipRowData {
  type: string;
  person1_given_name: string;
  person1_surname: string;
  person2_given_name: string;
  person2_surname: string;
  event_summary: string;
}

export function narrateRelationshipRow(data: RelationshipRowData, t: T): string {
  const person1 = [data.person1_given_name, data.person1_surname].filter(Boolean).join(' ');
  const person2 = [data.person2_given_name, data.person2_surname].filter(Boolean).join(' ');
  return t('screenReader.rowRelationship', {
    type: data.type,
    person1: person1 || t('common.unknown'),
    person2: person2 || t('common.unknown'),
    summary: data.event_summary || '',
  });
}

export interface SourceRowData {
  title: string;
  source_type: string;
  citation_count: number;
}

export function narrateSourceRow(data: SourceRowData, t: T): string {
  return t('screenReader.rowSource', {
    sourceType: data.source_type || '',
    title: data.title || t('common.unknown'),
    citationCount: data.citation_count,
  });
}

export interface PlaceRowData {
  name: string;
  place_type: string;
  path: string;
}

export function narratePlaceRow(data: PlaceRowData, t: T): string {
  return t('screenReader.rowPlace', {
    name: data.name,
    placeType: data.place_type || '',
    path: data.path || '',
  });
}

export interface EventRowData {
  event_type: string;
  date_value: string;
  place_name: string;
}

export function narrateEventRow(data: EventRowData, t: T): string {
  return t('screenReader.rowEvent', {
    eventType: data.event_type,
    date: data.date_value || '',
    place: data.place_name || '',
  });
}

export interface TaskRowData {
  priority: number;
  status: string;
  task: string;
}

const PRIORITY_LABELS: Record<number, string> = { 1: 'high', 2: 'medium', 3: 'low' };

export function narrateTaskRow(data: TaskRowData, t: T): string {
  return t('screenReader.rowTask', {
    priority: PRIORITY_LABELS[data.priority] ?? 'normal',
    status: data.status,
    task: data.task,
  });
}

export interface MediaRowData {
  title: string;
  format: string;
}

export function narrateMediaRow(data: MediaRowData, t: T): string {
  return t('screenReader.rowMedia', { title: data.title, format: data.format || '' });
}

export interface QualityRowData {
  severity: string;
  message: string;
}

export function narrateQualityRow(data: QualityRowData, t: T): string {
  return t('screenReader.rowQuality', { severity: data.severity, message: data.message });
}

// --- Person detail narration ---

export interface PersonDetailData {
  name: string;
  sex: string;
  summary: string;
  sectionCount: number;
}

export function narratePersonDetail(data: PersonDetailData, t: T): string {
  const sex = data.sex === 'M' ? t('common.male') : data.sex === 'F' ? t('common.female') : t('common.unknown');
  return t('screenReader.navPersonDetail', {
    name: data.name,
    sex,
    summary: data.summary,
    sectionCount: data.sectionCount,
  });
}

// --- Chart narration ---

export interface ChartNodeData {
  name: string;
  summary: string;
  relationship: string;
  generation: number;
  childCount: number;
}

export function narrateChartNode(data: ChartNodeData, t: T): string {
  if (data.generation === 1) {
    return t('screenReader.chartFocusPerson', {
      name: data.name,
      summary: data.summary,
      parentsHint: data.relationship, // caller computes this
      childrenHint: data.childCount > 0
        ? t('screenReader.chartChildrenBelow', { count: data.childCount })
        : t('screenReader.chartNoChildrenBelow'),
    });
  }
  return t('screenReader.chartAncestor', {
    relationship: data.relationship,
    name: data.name,
    summary: data.summary,
    generation: data.generation,
    childCount: data.childCount,
  });
}

export function narrateChartBoundary(direction: 'father' | 'mother' | 'children' | 'spouse' | 'ancestors', t: T): string {
  const keyMap: Record<string, string> = {
    father: 'screenReader.chartNoFather',
    mother: 'screenReader.chartNoMother',
    children: 'screenReader.chartNoChildren',
    spouse: 'screenReader.chartNoSpouse',
    ancestors: 'screenReader.chartNoAncestors',
  };
  return t(keyMap[direction]);
}

// --- UI narration ---

export function narratePageEntry(routeName: string, count: number | undefined, t: T): string {
  const keyMap: Record<string, string> = {
    persons: 'screenReader.navPersonsList',
    relationships: 'screenReader.navRelationshipsList',
    sources: 'screenReader.navSourcesList',
    places: 'screenReader.navPlacesList',
    tasks: 'screenReader.navTasksList',
    visualization: 'screenReader.navVisualization',
    quality: 'screenReader.navQuality',
    database: 'screenReader.navDatabase',
    search: 'screenReader.navSearch',
  };
  const key = keyMap[routeName] ?? routeName;
  return t(key, count !== undefined ? { count } : {});
}

export function narrateModalOpen(title: string, fieldCount: number, t: T): string {
  return t('screenReader.formOpen', { title, count: fieldCount });
}

export function narrateFieldFocus(label: string, type: 'text' | 'dropdown' | 'search', value: string, t: T): string {
  if (type === 'text') {
    return value
      ? t('screenReader.fieldText', { label, value })
      : t('screenReader.fieldTextEmpty', { label });
  }
  if (type === 'dropdown') {
    return t('screenReader.fieldDropdown', { label, value });
  }
  // search
  return value
    ? t('screenReader.fieldSearch', { label, value })
    : t('screenReader.fieldSearchEmpty', { label });
}

export function narrateSearchResults(count: number, t: T): string {
  return count > 0
    ? t('screenReader.searchMatches', { count })
    : t('screenReader.searchNoMatches');
}

export function narrateAction(action: 'saved' | 'deleted' | 'modalClosed' | 'editing' | 'new' | 'error', target: string | undefined, t: T): string {
  const keyMap: Record<string, string> = {
    saved: 'screenReader.actionSaved',
    deleted: 'screenReader.actionDeleted',
    modalClosed: 'screenReader.actionModalClosed',
    editing: 'screenReader.actionEditing',
    new: 'screenReader.actionNew',
    error: 'screenReader.actionError',
  };
  const params: Record<string, string> = {};
  if (target) {
    // 'deleted' uses {name}, 'new' uses {type}, 'error' uses {message}, 'editing' uses {name}
    if (action === 'new') params.type = target;
    else if (action === 'error') params.message = target;
    else params.name = target;
  }
  return t(keyMap[action], params);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/screenReaderNarration.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add screen reader narration utility functions with tests"
```

---

## Task 3: Hotkey Registry

**Files:**
- Create: `src/renderer/composables/useHotkeyRegistry.ts`
- Create: `tests/unit/hotkeyRegistry.test.ts`

- [ ] **Step 1: Write the test file**

Create `tests/unit/hotkeyRegistry.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HotkeyRegistry, type Hotkey } from '../../src/renderer/composables/useHotkeyRegistry';

describe('HotkeyRegistry', () => {
  let registry: HotkeyRegistry;

  beforeEach(() => {
    registry = new HotkeyRegistry();
  });

  afterEach(() => {
    registry.destroy();
  });

  it('registers and triggers a global hotkey', () => {
    const action = vi.fn();
    registry.registerGlobal([{ key: 'p', action, description: 'Go to persons' }]);

    const event = new KeyboardEvent('keydown', { key: 'p' });
    registry.handleKeydown(event);

    expect(action).toHaveBeenCalledOnce();
  });

  it('is case-insensitive for letter keys', () => {
    const action = vi.fn();
    registry.registerGlobal([{ key: 'p', action, description: 'Go to persons' }]);

    const event = new KeyboardEvent('keydown', { key: 'P' });
    registry.handleKeydown(event);

    expect(action).toHaveBeenCalledOnce();
  });

  it('does not trigger when activeElement is an input', () => {
    const action = vi.fn();
    registry.registerGlobal([{ key: 'p', action, description: 'Go to persons' }]);

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    const event = new KeyboardEvent('keydown', { key: 'p' });
    registry.handleKeydown(event);

    expect(action).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('does not trigger when activeElement is a textarea', () => {
    const action = vi.fn();
    registry.registerGlobal([{ key: 'p', action, description: 'Go to persons' }]);

    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    ta.focus();

    const event = new KeyboardEvent('keydown', { key: 'p' });
    registry.handleKeydown(event);

    expect(action).not.toHaveBeenCalled();
    document.body.removeChild(ta);
  });

  it('view-scoped hotkeys override global ones', () => {
    const globalAction = vi.fn();
    const viewAction = vi.fn();
    registry.registerGlobal([{ key: 'n', action: globalAction, description: 'Global N' }]);
    const cleanup = registry.registerView([{ key: 'n', action: viewAction, description: 'View N' }]);

    const event = new KeyboardEvent('keydown', { key: 'n' });
    registry.handleKeydown(event);

    expect(viewAction).toHaveBeenCalledOnce();
    expect(globalAction).not.toHaveBeenCalled();

    cleanup();
  });

  it('cleans up view-scoped hotkeys', () => {
    const globalAction = vi.fn();
    const viewAction = vi.fn();
    registry.registerGlobal([{ key: 'n', action: globalAction, description: 'Global N' }]);
    const cleanup = registry.registerView([{ key: 'n', action: viewAction, description: 'View N' }]);

    cleanup();

    const event = new KeyboardEvent('keydown', { key: 'n' });
    registry.handleKeydown(event);

    expect(globalAction).toHaveBeenCalledOnce();
    expect(viewAction).not.toHaveBeenCalled();
  });

  it('handles Ctrl+. as a combo key', () => {
    const action = vi.fn();
    registry.registerGlobal([{ key: 'Ctrl+.', action, description: 'Stop speech' }]);

    const event = new KeyboardEvent('keydown', { key: '.', ctrlKey: true });
    registry.handleKeydown(event);

    expect(action).toHaveBeenCalledOnce();
  });

  it('lists all registered hotkeys', () => {
    registry.registerGlobal([
      { key: 'p', action: vi.fn(), description: 'Go to persons' },
      { key: 'r', action: vi.fn(), description: 'Go to relationships' },
    ]);
    const cleanup = registry.registerView([
      { key: '1', action: vi.fn(), description: 'Jump to names' },
    ]);

    const all = registry.listAll();
    expect(all).toHaveLength(3);
    expect(all.map(h => h.key)).toContain('p');
    expect(all.map(h => h.key)).toContain('1');

    cleanup();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/hotkeyRegistry.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the HotkeyRegistry**

Create `src/renderer/composables/useHotkeyRegistry.ts`:

```typescript
export interface Hotkey {
  key: string;          // e.g. 'p', '1', '/', 'Escape', 'Delete', 'Ctrl+.'
  action: () => void;
  description: string;  // for ? help listing
}

const INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function normalizeKey(key: string): string {
  return key.toLowerCase();
}

function matchesEvent(hotkey: Hotkey, event: KeyboardEvent): boolean {
  const parts = hotkey.key.split('+');
  if (parts.length === 2) {
    // Combo like Ctrl+.
    const modifier = parts[0].toLowerCase();
    const key = parts[1].toLowerCase();
    if (modifier === 'ctrl' && !event.ctrlKey && !event.metaKey) return false;
    if (modifier === 'shift' && !event.shiftKey) return false;
    if (modifier === 'alt' && !event.altKey) return false;
    return normalizeKey(event.key) === key;
  }
  // Single key — must not have Ctrl/Alt (Shift is ok for ? etc.)
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  return normalizeKey(event.key) === normalizeKey(hotkey.key);
}

export class HotkeyRegistry {
  private globalHotkeys: Hotkey[] = [];
  private viewHotkeys: Hotkey[] = [];

  registerGlobal(hotkeys: Hotkey[]): void {
    this.globalHotkeys = hotkeys;
  }

  registerView(hotkeys: Hotkey[]): () => void {
    this.viewHotkeys = [...this.viewHotkeys, ...hotkeys];
    return () => {
      const keySet = new Set(hotkeys.map(h => h.key));
      this.viewHotkeys = this.viewHotkeys.filter(h => !keySet.has(h.key));
    };
  }

  handleKeydown(event: KeyboardEvent): boolean {
    // Suppress in text inputs (unless it's Escape or Ctrl+combo)
    const tag = (document.activeElement as HTMLElement)?.tagName ?? '';
    const inInput = INPUT_TAGS.has(tag);
    if (inInput) {
      // Only allow Escape and Ctrl+combos in inputs
      if (event.key !== 'Escape' && !event.ctrlKey && !event.metaKey) return false;
    }

    // View hotkeys take priority
    for (const hotkey of this.viewHotkeys) {
      if (matchesEvent(hotkey, event)) {
        event.preventDefault();
        hotkey.action();
        return true;
      }
    }

    // Then global
    for (const hotkey of this.globalHotkeys) {
      if (matchesEvent(hotkey, event)) {
        event.preventDefault();
        hotkey.action();
        return true;
      }
    }

    return false;
  }

  listAll(): { key: string; description: string }[] {
    const seen = new Set<string>();
    const result: { key: string; description: string }[] = [];

    // View hotkeys first (they override global)
    for (const h of this.viewHotkeys) {
      seen.add(normalizeKey(h.key));
      result.push({ key: h.key, description: h.description });
    }
    for (const h of this.globalHotkeys) {
      if (!seen.has(normalizeKey(h.key))) {
        result.push({ key: h.key, description: h.description });
      }
    }
    return result;
  }

  destroy(): void {
    this.globalHotkeys = [];
    this.viewHotkeys = [];
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/hotkeyRegistry.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add HotkeyRegistry for screen reader mode hotkeys"
```

---

## Task 4: v-narrate Directive

**Files:**
- Create: `src/renderer/directives/narrate.ts`
- Modify: `src/renderer/main.ts`

- [ ] **Step 1: Create the directive**

Create `src/renderer/directives/narrate.ts`:

```typescript
import type { Directive, DirectiveBinding } from 'vue';

/**
 * WeakMap storing narration source for each element.
 * The focus listener in useScreenReaderMode reads from this map.
 */
export const narrationMap = new WeakMap<HTMLElement, string | (() => string)>();

/**
 * v-narrate directive.
 *
 * Usage:
 *   v-narrate="'static text'"
 *   v-narrate="() => computeText()"
 *   v-narrate="reactiveString"
 */
export const vNarrate: Directive<HTMLElement, string | (() => string)> = {
  mounted(el: HTMLElement, binding: DirectiveBinding<string | (() => string)>) {
    narrationMap.set(el, binding.value);
  },
  updated(el: HTMLElement, binding: DirectiveBinding<string | (() => string)>) {
    narrationMap.set(el, binding.value);
  },
  unmounted(el: HTMLElement) {
    narrationMap.delete(el);
  },
};

/**
 * Resolve narration text for an element.
 * Used by the focus listener in useScreenReaderMode.
 */
export function resolveNarration(el: HTMLElement): string | null {
  // 1. v-narrate directive value
  const source = narrationMap.get(el);
  if (source) {
    return typeof source === 'function' ? source() : source;
  }
  // 2. data-narrate attribute
  const dataNarrate = el.getAttribute('data-narrate');
  if (dataNarrate) return dataNarrate;
  // 3. aria-label
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;
  // 4. Visible text content (trim, max 200 chars)
  const text = el.textContent?.trim();
  if (text && text.length <= 200) return text;
  if (text) return text.slice(0, 200);
  return null;
}
```

- [ ] **Step 2: Register the directive in main.ts**

Open `src/renderer/main.ts`. After the line that creates the app (e.g. `const app = createApp(App)`), add:

```typescript
import { vNarrate } from './directives/narrate';

// ... after createApp ...
app.directive('narrate', vNarrate);
```

- [ ] **Step 3: Verify compilation**

Run: `npm start`, confirm no errors. Kill after confirming.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add v-narrate directive for screen reader narration"
```

---

## Task 5: useScreenReaderMode Composable

**Files:**
- Create: `src/renderer/composables/useScreenReaderMode.ts`
- Modify: `src/renderer/App.vue`

This is the core composable that wires together TTS, focus listening, hotkeys, live-region observation, and route announcements.

- [ ] **Step 1: Create the composable**

Create `src/renderer/composables/useScreenReaderMode.ts`:

```typescript
import { ref, computed, watch, type Ref, type ComputedRef } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useTTS } from './useTTS';
import { resolveNarration } from '../directives/narrate';
import { HotkeyRegistry, type Hotkey } from './useHotkeyRegistry';
import { narratePageEntry } from '../utils/screenReaderNarration';

export type TtsMode = 'off' | 'narrate' | 'screenReader';

const STORAGE_KEY = 'slaktforskning-tts-mode';
const OLD_STORAGE_KEY = 'slaktforskning-tts';

function loadMode(): TtsMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'off' || stored === 'narrate' || stored === 'screenReader') return stored;
  // Migrate from old boolean key
  const old = localStorage.getItem(OLD_STORAGE_KEY);
  if (old === 'true') return 'narrate';
  if (old === 'false') return 'off';
  return 'off';
}

// Singleton state (shared across all components)
const mode = ref<TtsMode>(loadMode());
const hotkeyRegistry = new HotkeyRegistry();
let focusListener: ((e: FocusEvent) => void) | null = null;
let keydownListener: ((e: KeyboardEvent) => void) | null = null;
let liveRegionObserver: MutationObserver | null = null;

export function useScreenReaderMode() {
  const tts = useTTS();
  const router = useRouter();
  const { t, locale } = useI18n();

  const isScreenReader = computed(() => mode.value === 'screenReader');
  const isNarrate = computed(() => mode.value === 'narrate');
  const isTtsEnabled = computed(() => mode.value !== 'off');

  function speak(text: string): void {
    tts.speak(text, locale.value);
  }

  function stopSpeech(): void {
    tts.stop();
  }

  // --- Focus-driven narration ---

  function onFocusIn(e: FocusEvent): void {
    const el = e.target as HTMLElement;
    if (!el) return;
    const text = resolveNarration(el);
    if (text) {
      tts.stop(); // interrupt current
      speak(text);
    }
  }

  // --- Live region observer ---

  function setupLiveRegionObserver(): void {
    liveRegionObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement) {
            const text = node.textContent?.trim();
            if (text) speak(text);
          } else if (node instanceof Text) {
            const text = node.textContent?.trim();
            if (text) speak(text);
          }
        }
      }
    });

    // Observe all aria-live regions
    const liveRegions = document.querySelectorAll('[aria-live]');
    liveRegions.forEach(region => {
      liveRegionObserver!.observe(region, { childList: true, subtree: true, characterData: true });
    });
  }

  // --- Global hotkeys ---

  function setupGlobalHotkeys(): void {
    hotkeyRegistry.registerGlobal([
      { key: '?', action: announceHelp, description: t('screenReader.hotkeyHelp') },
      { key: 'p', action: () => navigateTo('/'), description: t('screenReader.hotkeyPersons') },
      { key: 'r', action: () => navigateTo('/relationships'), description: t('screenReader.hotkeyRelationships') },
      { key: 's', action: () => navigateTo('/sources'), description: t('screenReader.hotkeySources') },
      { key: 'l', action: () => navigateTo('/places'), description: t('screenReader.hotkeyPlaces') },
      { key: 't', action: () => navigateTo('/tasks'), description: t('screenReader.hotkeyTasks') },
      { key: 'v', action: () => navigateTo('/visualization'), description: t('screenReader.hotkeyVisualization') },
      { key: 'q', action: () => navigateTo('/quality'), description: t('screenReader.hotkeyQuality') },
      { key: 'd', action: () => navigateTo('/database'), description: t('screenReader.hotkeyDatabase') },
      { key: '/', action: focusSearch, description: t('screenReader.hotkeySearch') },
      { key: 'f', action: focusSearch, description: t('screenReader.hotkeySearch') },
      { key: 'h', action: goHome, description: t('screenReader.hotkeyHome') },
      { key: 'Escape', action: handleEscape, description: '' },
      { key: 'Ctrl+.', action: stopSpeech, description: t('screenReader.hotkeyStopSpeech') },
    ]);
  }

  function navigateTo(path: string): void {
    router.push(path);
  }

  function focusSearch(): void {
    const searchInput = document.querySelector('.sidebar input[type="search"], .sidebar input[type="text"]') as HTMLElement | null;
    if (searchInput) {
      searchInput.focus();
      speak(t('screenReader.navSearch'));
    }
  }

  function goHome(): void {
    router.push('/');
  }

  function handleEscape(): void {
    stopSpeech();
  }

  function announceHelp(): void {
    const all = hotkeyRegistry.listAll().filter(h => h.description);
    const list = all.map(h => h.description).join(', ');
    speak(t('screenReader.hotkeysAvailable', { list }));
  }

  // --- Activation / Deactivation ---

  function activate(): void {
    // Focus listener
    focusListener = onFocusIn;
    document.addEventListener('focusin', focusListener);

    // Keydown listener
    keydownListener = (e: KeyboardEvent) => hotkeyRegistry.handleKeydown(e);
    document.addEventListener('keydown', keydownListener);

    // CSS class
    document.documentElement.classList.add('screen-reader');

    // Live region observer
    setupLiveRegionObserver();

    // Global hotkeys
    setupGlobalHotkeys();

    // Welcome
    speak(t('screenReader.welcome'));
  }

  function deactivate(): void {
    if (focusListener) {
      document.removeEventListener('focusin', focusListener);
      focusListener = null;
    }
    if (keydownListener) {
      document.removeEventListener('keydown', keydownListener);
      keydownListener = null;
    }
    if (liveRegionObserver) {
      liveRegionObserver.disconnect();
      liveRegionObserver = null;
    }
    hotkeyRegistry.destroy();
    document.documentElement.classList.remove('screen-reader');
    tts.stop();
  }

  function setMode(newMode: TtsMode): void {
    const wasScreenReader = mode.value === 'screenReader';
    mode.value = newMode;
    localStorage.setItem(STORAGE_KEY, newMode);
    // Clean up old key
    localStorage.removeItem(OLD_STORAGE_KEY);

    if (newMode === 'screenReader' && !wasScreenReader) {
      activate();
    } else if (newMode !== 'screenReader' && wasScreenReader) {
      deactivate();
      if (newMode === 'off') {
        speak(t('screenReader.modeOff'));
      }
    }
  }

  // --- Route announcements ---

  function announceRoute(routeName: string, count?: number): void {
    if (mode.value !== 'screenReader') return;
    const text = narratePageEntry(routeName, count, t);
    speak(text);

    // Focus the h1 if present
    requestAnimationFrame(() => {
      const h1 = document.querySelector('main h1') as HTMLElement | null;
      if (h1) {
        h1.setAttribute('tabindex', '-1');
        h1.focus();
      }
    });
  }

  // --- View hotkey registration ---

  function registerHotkeys(hotkeys: Hotkey[]): () => void {
    return hotkeyRegistry.registerView(hotkeys);
  }

  // Initialize on first use if already in screen reader mode
  function init(): void {
    if (mode.value === 'screenReader' && !focusListener) {
      activate();
    }
  }

  return {
    mode,
    isScreenReader,
    isNarrate,
    isTtsEnabled,
    setMode,
    speak,
    stopSpeech,
    registerHotkeys,
    announceRoute,
    init,
  };
}
```

- [ ] **Step 2: Initialize in App.vue**

Open `src/renderer/App.vue`. In the `<script setup>` section:

1. Import the composable:
```typescript
import { useScreenReaderMode } from './composables/useScreenReaderMode';
```

2. Initialize it in setup:
```typescript
const screenReader = useScreenReaderMode();
screenReader.init();
```

3. Add route-change watcher:
```typescript
import { watch } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
watch(() => route.path, () => {
  if (screenReader.isScreenReader.value) {
    // Map route to name for announceRoute
    const routeMap: Record<string, string> = {
      '/': 'persons',
      '/relationships': 'relationships',
      '/sources': 'sources',
      '/places': 'places',
      '/tasks': 'tasks',
      '/visualization': 'visualization',
      '/quality': 'quality',
      '/database': 'database',
      '/search': 'search',
    };
    const name = routeMap[route.path] ?? route.path;
    screenReader.announceRoute(name);
  }
});
```

4. Provide screenReader to children (alongside existing tts provide):
```typescript
provide('screenReader', screenReader);
```

- [ ] **Step 3: Verify compilation**

Run: `npm start`, confirm no errors, toggle to Screen Reader mode, verify welcome announcement plays. Kill after confirming.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add useScreenReaderMode composable with focus narration and hotkeys"
```

---

## Task 6: Settings UI — Three-Way Appearance and Read Aloud

**Files:**
- Modify: `src/renderer/App.vue`
- Modify: `src/renderer/styles/shared.css`

- [ ] **Step 1: Update Settings UI in App.vue**

In the template section of `src/renderer/App.vue`, find the current settings panel. Replace the dark mode toggle and TTS toggle with:

**Appearance section** (replaces the dark mode radio group):
```html
<div class="settings-group">
  <label>{{ $t('settings.appearance') }}</label>
  <div class="settings-options" role="radiogroup" :aria-label="$t('settings.appearance')">
    <button role="radio" :aria-checked="appearance === 'light'" :class="{ active: appearance === 'light' }" @click="setAppearance('light')">{{ $t('settings.light') }}</button>
    <button role="radio" :aria-checked="appearance === 'dark'" :class="{ active: appearance === 'dark' }" @click="setAppearance('dark')">{{ $t('settings.dark') }}</button>
    <button role="radio" :aria-checked="appearance === 'contrast'" :class="{ active: appearance === 'contrast' }" @click="setAppearance('contrast')">{{ $t('settings.highContrast') }}</button>
  </div>
</div>
```

**Read Aloud section** (replaces the TTS yes/no):
```html
<div class="settings-group">
  <label>{{ $t('settings.readAloud') }}</label>
  <div class="settings-options" role="radiogroup" :aria-label="$t('settings.readAloud')">
    <button role="radio" :aria-checked="screenReader.mode.value === 'off'" :class="{ active: screenReader.mode.value === 'off' }" @click="screenReader.setMode('off')">{{ $t('settings.off') }}</button>
    <button role="radio" :aria-checked="screenReader.mode.value === 'narrate'" :class="{ active: screenReader.mode.value === 'narrate' }" @click="screenReader.setMode('narrate')">{{ $t('settings.narrate') }}</button>
    <button role="radio" :aria-checked="screenReader.mode.value === 'screenReader'" :class="{ active: screenReader.mode.value === 'screenReader' }" @click="screenReader.setMode('screenReader')">{{ $t('settings.screenReaderMode') }}</button>
  </div>
</div>
```

- [ ] **Step 2: Add appearance state and handler**

In App.vue script setup, add:

```typescript
type Appearance = 'light' | 'dark' | 'contrast';
const appearance = ref<Appearance>(
  (localStorage.getItem('slaktforskning-appearance') as Appearance) || 'light'
);

function setAppearance(value: Appearance): void {
  appearance.value = value;
  localStorage.setItem('slaktforskning-appearance', value);
  document.documentElement.classList.remove('dark', 'high-contrast');
  if (value === 'dark') document.documentElement.classList.add('dark');
  if (value === 'contrast') document.documentElement.classList.add('high-contrast');
}

// Apply on load
onMounted(() => {
  setAppearance(appearance.value);
});
```

Remove the old `darkMode` and `ttsEnabled` state/handlers that are replaced.

- [ ] **Step 3: Add i18n keys for new settings options**

In `en.ts` settings section, add:
```typescript
highContrast: 'High Contrast',
off: 'Off',
narrate: 'Narrate',
screenReaderMode: 'Screen Reader',
```

In `sv.ts` settings section, add:
```typescript
highContrast: 'Hog kontrast',
off: 'Av',
narrate: 'Beratta',
screenReaderMode: 'Skarmlasar-lage',
```

- [ ] **Step 4: Add high contrast CSS**

In `src/renderer/styles/shared.css`, after the existing dark mode block, add:

```css
/* === High Contrast Theme === */
html.high-contrast {
  --color-bg: #000000;
  --color-text: #ffffff;
  --color-text-muted: #e0e0e0;
  --color-primary: #ffff00;
  --color-primary-hover: #ffdd00;
  --color-border: #ffffff;
  --color-border-light: #cccccc;
  --color-row-hover: #333333;
  --color-sidebar-bg: #111111;
  --color-sidebar-text: #ffffff;
  --color-sidebar-active: #ffff00;
  --color-input-bg: #1a1a1a;
  --color-input-border: #ffffff;
  --color-modal-overlay: rgba(0, 0, 0, 0.9);
  --color-modal-bg: #111111;
  --color-success: #00ff00;
  --color-danger: #ff4444;
  --color-warning: #ffff00;
  --color-badge-bg: #333333;
  --color-badge-text: #ffffff;
  --color-chip-bg: #333333;
  --color-chip-active: #ffff00;
  --color-chip-active-text: #000000;
}

html.high-contrast :focus-visible {
  outline: 3px solid #ffff00 !important;
  outline-offset: 3px !important;
}

html.high-contrast a {
  text-decoration: underline !important;
}

/* Color-independent indicators in high contrast mode */
html.high-contrast .sex-indicator-label,
html.high-contrast .status-text-label,
html.high-contrast .confidence-text-label {
  display: inline !important;
}
```

- [ ] **Step 5: Add `.screen-reader` heading and focus management CSS**

In shared.css, add:

```css
/* === Screen Reader Mode === */
html.screen-reader h1:focus {
  outline: none;
}
```

- [ ] **Step 6: Verify the settings UI works**

Run: `npm start`. Toggle between Light/Dark/High Contrast — verify each applies. Toggle Read Aloud to Screen Reader — verify welcome announcement. Kill after confirming.

- [ ] **Step 7: Run existing tests to check for regressions**

Run: `npm test`
Expected: All existing tests pass.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: three-way Appearance (Light/Dark/High Contrast) and Read Aloud settings"
```

---

## Task 7: v-narrate Integration — List Views

**Files:**
- Modify: `src/renderer/views/PersonsView.vue`
- Modify: `src/renderer/views/RelationshipsView.vue`
- Modify: `src/renderer/views/SourcesView.vue`
- Modify: `src/renderer/views/PlacesView.vue`
- Modify: `src/renderer/views/ResearchTasksView.vue`
- Modify: `src/renderer/views/QualityView.vue`

For each list view: add `v-narrate` to table rows, add arrow key navigation between rows, add empty-state narration.

- [ ] **Step 1: Add v-narrate to PersonsView.vue**

In `PersonsView.vue`, import the narration function:
```typescript
import { narratePersonRow } from '../utils/screenReaderNarration';
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
```

On each `<tr>` in the table body, add `v-narrate`:
```html
<tr
  v-for="person in filteredPersons"
  :key="person.id"
  v-narrate="() => narratePersonRow({
    given_name: person.given_name || '',
    surname: person.surname || '',
    sex: person.sex,
    event_count: person.event_count || 0,
    relationship_count: person.relationship_count || 0,
  }, t)"
  tabindex="0"
  class="clickable-row"
  @click="goToPerson(person.id)"
  @keydown.enter="goToPerson(person.id)"
  @keydown.space.prevent="goToPerson(person.id)"
  @keydown.down.prevent="focusNextRow($event)"
  @keydown.up.prevent="focusPrevRow($event)"
>
```

Add the row navigation helpers to the script:
```typescript
function focusNextRow(e: KeyboardEvent): void {
  const row = (e.target as HTMLElement).nextElementSibling as HTMLElement | null;
  if (row?.matches('tr')) row.focus();
}
function focusPrevRow(e: KeyboardEvent): void {
  const row = (e.target as HTMLElement).previousElementSibling as HTMLElement | null;
  if (row?.matches('tr')) row.focus();
}
```

On the empty state element, add:
```html
<p v-if="filteredPersons.length === 0" class="empty" tabindex="0" :data-narrate="t('screenReader.tableEmpty', { type: t('persons.title') })">
```

- [ ] **Step 2: Repeat for RelationshipsView.vue**

Same pattern. Import `narrateRelationshipRow`, add `v-narrate` to rows, add arrow key handlers, add empty-state narration.

- [ ] **Step 3: Repeat for SourcesView.vue**

Import `narrateSourceRow`, same pattern.

- [ ] **Step 4: Repeat for PlacesView.vue**

Import `narratePlaceRow`, same pattern.

- [ ] **Step 5: Repeat for ResearchTasksView.vue**

Import `narrateTaskRow`, same pattern.

- [ ] **Step 6: Repeat for QualityView.vue**

Import `narrateQualityRow`, same pattern.

- [ ] **Step 7: Verify narration works**

Run: `npm start`, enable Screen Reader mode, navigate to Persons list, Tab to first row — verify it speaks the person summary. Arrow down to next row — verify it speaks. Test each list view.

- [ ] **Step 8: Run tests**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add v-narrate and arrow navigation to all list views"
```

---

## Task 8: v-narrate Integration — Detail Views

**Files:**
- Modify: `src/renderer/views/PersonDetailView.vue`
- Modify: `src/renderer/views/RelationshipDetailView.vue`
- Modify: `src/renderer/views/SourceDetailView.vue`
- Modify: `src/renderer/views/PlaceDetailView.vue`

- [ ] **Step 1: Add section hotkeys to PersonDetailView.vue**

Import and set up:
```typescript
import { useScreenReaderMode } from '../composables/useScreenReaderMode';
import { narratePersonDetail } from '../utils/screenReaderNarration';
import { onMounted, onUnmounted } from 'vue';

const screenReader = useScreenReaderMode();
```

Register section hotkeys:
```typescript
const sectionRefs = ref<Record<string, HTMLElement | null>>({});

function jumpToSection(index: number): void {
  const sectionIds = ['section-names', 'section-events', 'section-relationships', 'section-media', 'section-identifiers', 'section-checks'];
  const el = document.getElementById(sectionIds[index]);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth' });
    const firstFocusable = el.querySelector('[tabindex="0"], button, a, input') as HTMLElement | null;
    if (firstFocusable) firstFocusable.focus();
    // Section narration will be triggered by focus
  }
}

let cleanupHotkeys: (() => void) | undefined;

onMounted(() => {
  if (screenReader.isScreenReader.value) {
    cleanupHotkeys = screenReader.registerHotkeys([
      { key: '1', action: () => jumpToSection(0), description: t('persons.names') },
      { key: '2', action: () => jumpToSection(1), description: t('events.title') },
      { key: '3', action: () => jumpToSection(2), description: t('relationships.title') },
      { key: '4', action: () => jumpToSection(3), description: t('media.title') },
      { key: '5', action: () => jumpToSection(4), description: t('identifiers.title') },
      { key: '6', action: () => jumpToSection(5), description: t('quality.title') },
    ]);
  }
});

onUnmounted(() => {
  cleanupHotkeys?.();
});
```

Add page-level `<h1>` with person name:
```html
<h1 class="sr-page-title">{{ personDisplayName }}</h1>
```

Add `v-narrate` to section headers and items within sections. Each section header element should have a narration function that describes the section content.

- [ ] **Step 2: Add narration to RelationshipDetailView.vue**

Same pattern — add `<h1>`, section narration, view-specific hotkeys if applicable.

- [ ] **Step 3: Add narration to SourceDetailView.vue**

Same pattern.

- [ ] **Step 4: Add narration to PlaceDetailView.vue**

Same pattern.

- [ ] **Step 5: Add sr-page-title CSS**

In `shared.css`:
```css
.sr-page-title {
  font-size: var(--font-lg);
  font-weight: 600;
  margin: 0 0 16px;
}
```

- [ ] **Step 6: Verify section hotkeys work**

Run: `npm start`, enable Screen Reader mode, navigate to a person detail, press 1-6 — verify each jumps to the correct section and narrates.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add screen reader narration and section hotkeys to detail views"
```

---

## Task 9: Modal and Form Narration

**Files:**
- Modify: `src/renderer/components/BaseModal.vue`
- Modify: `src/renderer/components/EventForm.vue`
- Modify: `src/renderer/components/PersonPicker.vue`
- Modify: `src/renderer/components/PlacePicker.vue`
- Modify: `src/renderer/components/DateInput.vue`
- Create: `src/renderer/components/ConfirmModal.vue`

- [ ] **Step 1: Add modal-open narration to BaseModal.vue**

In `BaseModal.vue`, when the modal becomes visible and screen reader mode is on, narrate the modal title and field count:

```typescript
import { inject } from 'vue';
import { narrateModalOpen } from '../utils/screenReaderNarration';

const screenReader = inject('screenReader', null);

// In the onMounted or watch for visibility:
if (screenReader?.isScreenReader.value) {
  const title = props.title || '';
  const fields = modalEl.value?.querySelectorAll('input, select, textarea').length ?? 0;
  screenReader.speak(narrateModalOpen(title, fields, t));
}
```

- [ ] **Step 2: Add field narration to form inputs**

For inputs/selects/textareas in modals, add `v-narrate` with field-level narration:

```html
<input
  v-narrate="() => narrateFieldFocus(t('persons.givenName'), 'text', form.given_name, t)"
  v-model="form.given_name"
  type="text"
/>
```

Apply this pattern to all form components: EventForm, CitationForm, PersonNameFormModal, etc.

- [ ] **Step 3: Add search result narration to PersonPicker.vue**

PersonPicker already has an `aria-live` region (line 36-38). Add a `v-narrate` to each dropdown result item:

```html
<li
  v-for="person in results"
  :key="person.id"
  v-narrate="() => `${person.given_name} ${person.surname}`"
  ...
>
```

When results change, the existing live region already announces count. Add narration for selection:
```typescript
// After selecting a person:
if (screenReader?.isScreenReader.value) {
  screenReader.speak(t('screenReader.selected', { name: selectedName }));
}
```

- [ ] **Step 4: Repeat for PlacePicker.vue**

Same pattern as PersonPicker.

- [ ] **Step 5: Add compound narration to DateInput.vue**

Add `v-narrate` to each sub-field of DateInput:
```html
<select v-narrate="() => narrateFieldFocus(t('a11y.dateTypeLabel'), 'dropdown', dateType, t)" ...>
<input v-narrate="() => narrateFieldFocus(t('a11y.dateStartLabel'), 'text', dateValue, t)" ...>
```

- [ ] **Step 6: Create ConfirmModal.vue**

Create `src/renderer/components/ConfirmModal.vue`:

```vue
<template>
  <div v-if="visible" class="modal-overlay" @click.self="cancel">
    <div class="modal" role="alertdialog" aria-modal="true" :aria-labelledby="titleId" :aria-describedby="descId">
      <h3 :id="titleId">{{ title }}</h3>
      <p :id="descId">{{ message }}</p>
      <div class="modal-actions">
        <button ref="cancelBtn" class="btn-cancel" @click="cancel" v-narrate="t('screenReader.btnCancel')">{{ $t('common.cancel') }}</button>
        <button class="btn-delete" @click="confirm" v-narrate="t('screenReader.btnDelete')">{{ $t('common.delete') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFocusTrap } from '../composables/useFocusTrap';

const { t } = useI18n();

const props = defineProps<{
  visible: boolean;
  title: string;
  message: string;
}>();

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

const titleId = 'confirm-modal-title';
const descId = 'confirm-modal-desc';
const cancelBtn = ref<HTMLElement | null>(null);

const { activate, deactivate } = useFocusTrap(ref(null));

watch(() => props.visible, async (val) => {
  if (val) {
    await nextTick();
    cancelBtn.value?.focus();
  }
});

function confirm(): void {
  emit('confirm');
}

function cancel(): void {
  emit('cancel');
}
</script>
```

- [ ] **Step 7: Verify modal narration**

Run: `npm start`, enable Screen Reader mode, open Add Person modal — verify it narrates title and field count. Tab through fields — verify each is narrated. Test PersonPicker search narration.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add screen reader narration to modals, forms, and pickers"
```

---

## Task 10: Chart Tree Navigation

**Files:**
- Create: `src/renderer/composables/useChartNavigation.ts`
- Modify: `src/renderer/views/VisualizationView.vue`
- Modify: `src/renderer/components/charts/PedigreeChart.vue`

- [ ] **Step 1: Create useChartNavigation composable**

Create `src/renderer/composables/useChartNavigation.ts`:

```typescript
import { ref, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { narrateChartNode, narrateChartBoundary, type ChartNodeData } from '../utils/screenReaderNarration';

export interface TreeNode {
  id: string;
  name: string;
  birthYear?: string;
  deathYear?: string;
  birthPlace?: string;
  sex: string;
  father?: TreeNode | null;
  mother?: TreeNode | null;
  children?: TreeNode[];
  spouses?: TreeNode[];
  generation: number;
}

export function useChartNavigation(
  tree: Ref<TreeNode | null>,
  rootPersonId: Ref<string | null>,
  speak: (text: string) => void,
) {
  const { t } = useI18n();
  const cursor = ref<TreeNode | null>(null);

  function setCursor(node: TreeNode | null): void {
    cursor.value = node;
    if (node) {
      announceNode(node);
    }
  }

  function announceNode(node: TreeNode): void {
    const summary = buildSummary(node);
    const relationship = computeRelationship(node);
    const childCount = node.children?.length ?? 0;

    const data: ChartNodeData = {
      name: node.name,
      summary,
      relationship,
      generation: node.generation,
      childCount,
    };
    speak(narrateChartNode(data, t));
  }

  function buildSummary(node: TreeNode): string {
    const parts: string[] = [];
    if (node.birthYear) parts.push(`${t('narration.born')} ${node.birthYear}${node.birthPlace ? ` ${t('narration.in')} ${node.birthPlace}` : ''}`);
    if (node.deathYear) parts.push(`${t('narration.died')} ${node.deathYear}`);
    return parts.join(', ');
  }

  function computeRelationship(node: TreeNode): string {
    // Simplified — compute path from root to this node
    if (node.id === rootPersonId.value) {
      const hasParents = !!(node.father || node.mother);
      return hasParents ? t('screenReader.chartParentsAbove') : t('screenReader.chartNoParents');
    }
    // For ancestors, the tree structure implicitly encodes the relationship
    // This would need the full path computation from the tree data
    return '';
  }

  function moveUp(): void {
    if (!cursor.value) return;
    if (cursor.value.father) {
      setCursor(cursor.value.father);
    } else {
      speak(narrateChartBoundary('father', t));
    }
  }

  function moveDown(): void {
    if (!cursor.value) return;
    if (cursor.value.children?.length) {
      setCursor(cursor.value.children[0]);
    } else {
      speak(narrateChartBoundary('children', t));
    }
  }

  function moveLeft(): void {
    if (!cursor.value) return;
    if (cursor.value.mother) {
      setCursor(cursor.value.mother);
    } else {
      speak(narrateChartBoundary('mother', t));
    }
  }

  function moveRight(): void {
    if (!cursor.value) return;
    if (cursor.value.spouses?.length) {
      setCursor(cursor.value.spouses[0]);
    } else {
      speak(narrateChartBoundary('spouse', t));
    }
  }

  function handleKeydown(event: KeyboardEvent): boolean {
    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        moveUp();
        return true;
      case 'ArrowDown':
        event.preventDefault();
        moveDown();
        return true;
      case 'ArrowLeft':
        event.preventDefault();
        moveLeft();
        return true;
      case 'ArrowRight':
        event.preventDefault();
        moveRight();
        return true;
      default:
        return false;
    }
  }

  function initCursor(): void {
    if (tree.value) {
      setCursor(tree.value);
    }
  }

  return {
    cursor,
    setCursor,
    handleKeydown,
    initCursor,
    moveUp,
    moveDown,
    moveLeft,
    moveRight,
  };
}
```

- [ ] **Step 2: Integrate chart navigation in VisualizationView.vue**

In `VisualizationView.vue`:

```typescript
import { useChartNavigation } from '../composables/useChartNavigation';
import { useScreenReaderMode } from '../composables/useScreenReaderMode';

const screenReader = useScreenReaderMode();
const chartNav = useChartNavigation(treeData, focusPersonId, screenReader.speak);

// Register arrow keys as view-specific hotkeys when in screen reader mode
let cleanupHotkeys: (() => void) | undefined;

onMounted(() => {
  if (screenReader.isScreenReader.value) {
    cleanupHotkeys = screenReader.registerHotkeys([
      { key: 'ArrowUp', action: () => chartNav.moveUp(), description: 'Navigate to father' },
      { key: 'ArrowDown', action: () => chartNav.moveDown(), description: 'Navigate to child' },
      { key: 'ArrowLeft', action: () => chartNav.moveLeft(), description: 'Navigate to mother/sibling' },
      { key: 'ArrowRight', action: () => chartNav.moveRight(), description: 'Navigate to spouse/sibling' },
    ]);
    chartNav.initCursor();
  }
});

onUnmounted(() => {
  cleanupHotkeys?.();
});
```

- [ ] **Step 3: Update PedigreeChart.vue to sync visual focus with cursor**

When `chartNav.cursor` changes, update the `.focused` class on the corresponding SVG box:

```typescript
watch(() => chartNav.cursor.value, (node) => {
  // Remove old focus
  document.querySelectorAll('.chart-box.focused').forEach(el => el.classList.remove('focused'));
  if (node) {
    const box = document.querySelector(`[data-person-id="${node.id}"]`) as HTMLElement | null;
    if (box) box.classList.add('focused');
  }
});
```

- [ ] **Step 4: Verify chart navigation**

Run: `npm start`, enable Screen Reader mode, navigate to Visualization, use arrow keys — verify narration of family members and boundary announcements.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add arrow-key chart navigation with narration for screen reader mode"
```

---

## Task 11: High Contrast Color Independence

**Files:**
- Modify: `src/renderer/styles/shared.css`
- Modify views/components that use color-only indicators

- [ ] **Step 1: Add text labels for sex indicators**

Find all places where sex is indicated by color alone (chart boxes, person detail). Add a text label that is hidden by default but visible in high contrast:

```css
.sex-indicator-label {
  display: none;
}

html.high-contrast .sex-indicator-label {
  display: inline;
  font-weight: bold;
  margin-left: 4px;
}
```

In templates where sex is shown with color, add:
```html
<span class="sex-indicator-label">{{ person.sex }}</span>
```

- [ ] **Step 2: Add text labels for confidence badges**

Find confidence badges (used in citations). Add text visible in high contrast:

```html
<span class="confidence-text-label">{{ CONFIDENCE_LABELS[citation.confidence] }} ({{ citation.confidence }})</span>
```

CSS: same pattern as sex indicators — hidden by default, shown in high contrast.

- [ ] **Step 3: Add text labels for living/deceased status**

Same pattern for status indicators.

- [ ] **Step 4: Verify high contrast appearance**

Run: `npm start`, switch to High Contrast — verify text labels appear for sex, confidence, status. Verify 7:1 contrast ratios visually. Verify links are underlined.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add color-independent text labels for high contrast mode"
```

---

## Task 12: Heading Structure and Focus Management

**Files:**
- Modify: All view components (add `<h1>`)
- Modify: `src/renderer/App.vue` (route focus management)

- [ ] **Step 1: Add h1 to all views**

Each view that doesn't have one needs a page-level `<h1>`:

- PersonsView: `<h1>{{ $t('persons.title') }}</h1>`
- RelationshipsView: `<h1>{{ $t('relationships.title') }}</h1>`
- SourcesView: `<h1>{{ $t('sources.title') }}</h1>`
- PlacesView: `<h1>{{ $t('places.title') }}</h1>`
- PersonDetailView: `<h1>{{ personDisplayName }}</h1>`
- RelationshipDetailView: `<h1>{{ relationshipTitle }}</h1>`
- SourceDetailView: `<h1>{{ source?.title }}</h1>`
- PlaceDetailView: `<h1>{{ place?.name }}</h1>`
- VisualizationView: `<h1>{{ $t('visualization.title') }}</h1>`
- QualityView: `<h1>{{ $t('quality.title') }}</h1>`
- SearchView: `<h1>{{ $t('search.title') }}</h1>`
- DatabaseView: `<h1>{{ $t('database.title') }}</h1>`

- [ ] **Step 2: Focus h1 on route change (already done in useScreenReaderMode)**

Verify the route-change watcher in useScreenReaderMode focuses the h1. If the h1 doesn't exist yet when the watcher fires (async component), use `nextTick`:

```typescript
// Already in useScreenReaderMode.announceRoute:
requestAnimationFrame(() => {
  const h1 = document.querySelector('main h1') as HTMLElement | null;
  if (h1) {
    h1.setAttribute('tabindex', '-1');
    h1.focus();
  }
});
```

- [ ] **Step 3: Focus return after modal close**

In BaseModal.vue, save the trigger element on open and restore focus on close:

```typescript
let triggerEl: HTMLElement | null = null;

watch(() => props.visible, (val) => {
  if (val) {
    triggerEl = document.activeElement as HTMLElement | null;
  } else if (triggerEl) {
    nextTick(() => triggerEl?.focus());
    triggerEl = null;
  }
});
```

- [ ] **Step 4: Focus next item after delete**

In list views, after a delete operation, focus the next row:

```typescript
async function deletePerson(id: string, index: number): Promise<void> {
  await window.api.persons.delete(id);
  await loadPersons();
  // Focus next row
  nextTick(() => {
    const rows = document.querySelectorAll('.data-table tbody tr');
    const nextRow = rows[Math.min(index, rows.length - 1)] as HTMLElement | null;
    if (nextRow) nextRow.focus();
    else {
      // Empty state
      const empty = document.querySelector('.empty[tabindex]') as HTMLElement | null;
      empty?.focus();
    }
  });
}
```

- [ ] **Step 5: Verify heading and focus management**

Run: `npm start`, enable Screen Reader mode:
- Navigate between views — verify h1 is focused and narrated
- Open and close a modal — verify focus returns to trigger
- Delete an item — verify focus moves to next item

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add heading hierarchy and focus management for screen reader mode"
```

---

## Task 13: Integration Testing

**Files:**
- Run existing tests
- Manual verification checklist

- [ ] **Step 1: Run all unit tests**

Run: `npm test`
Expected: All tests pass (including new narration and hotkey tests).

- [ ] **Step 2: Run E2E tests**

Run: `npx playwright test`
Expected: All E2E tests pass.

- [ ] **Step 3: Manual verification checklist**

Test each scenario in the app with Screen Reader mode active:

1. Enable Screen Reader mode in settings — hear welcome message
2. Press `?` — hear list of available hotkeys
3. Press `P` — navigate to persons, hear page announcement
4. Tab to first row — hear person summary
5. Arrow Down through rows — hear each row
6. Enter on a row — navigate to detail, hear detail summary
7. Press `1` through `6` — jump to each section, hear section summary
8. Press `N` — open add modal, hear modal announcement
9. Tab through form fields — hear each field
10. Escape — close modal, focus returns
11. Press `V` — navigate to visualization
12. Arrow keys — traverse family tree
13. Switch to High Contrast — verify text labels appear
14. Press `Ctrl+.` — speech stops
15. Toggle back to Off — verify all listeners cleaned up

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: screen reader mode integration test fixes"
```

---

## Task 14: Documentation Update

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/PLAN.md`
- Modify: `README.md`

- [ ] **Step 1: Update CLAUDE.md**

Add screen reader mode to the Accessibility section. Document the three-way Read Aloud setting, the `v-narrate` directive pattern, the hotkey registry, and the chart navigation composable.

- [ ] **Step 2: Update PLAN.md**

Mark the screen reader mode milestone as complete. Add to Implementation Status table.

- [ ] **Step 3: Update README.md**

Add screen reader mode to the features list. Document the hotkey shortcuts.

- [ ] **Step 4: Bump version**

This is a new feature — minor bump in `package.json`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: update documentation for screen reader mode"
```

- [ ] **Step 6: Archive the plan**

Move the plan file to `docs/plans/archive/` and update `docs/PLAN.md` pointer.
