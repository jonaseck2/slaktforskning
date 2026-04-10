/**
 * Screen reader narration utility functions.
 *
 * Each function takes data + a vue-i18n `t` function and returns a localized
 * narration string for screen reader / TTS consumption. These serve the
 * "Screen Reader" mode (distinct from the "Narrate" mode in narration.ts).
 */

type T = (key: string, params?: Record<string, string | number>) => string;

// ---------------------------------------------------------------------------
// Data interfaces
// ---------------------------------------------------------------------------

export interface PersonRowData {
  given_name: string;
  surname: string;
  sex: string;
  event_count: number;
  relationship_count: number;
}

export interface RelationshipRowData {
  type: string;
  person1_given_name: string;
  person1_surname: string;
  person2_given_name: string;
  person2_surname: string;
  event_summary: string;
}

export interface SourceRowData {
  title: string;
  source_type: string;
  citation_count: number;
}

export interface PlaceRowData {
  name: string;
  place_type: string;
  path: string;
}

export interface EventRowData {
  event_type: string;
  date_value: string;
  place_name: string;
}

export interface TaskRowData {
  priority: number;
  status: string;
  task: string;
}

export interface MediaRowData {
  title: string;
  format: string;
}

export interface QualityRowData {
  severity: string;
  message: string;
}

export interface PersonDetailData {
  name: string;
  sex: string;
  summary: string;
  sectionCount: number;
}

export interface ChartNodeData {
  name: string;
  summary: string;
  relationship: string;
  generation: number;
  childCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fullName(given_name: string, surname: string): string {
  return [given_name, surname].filter(Boolean).join(' ');
}

function sexLabel(sex: string): string {
  if (sex === 'M') return 'Male';
  if (sex === 'F') return 'Female';
  return 'Unknown';
}

function priorityLabel(priority: number): string {
  if (priority === 1) return 'high';
  if (priority === 2) return 'medium';
  if (priority === 3) return 'low';
  return String(priority);
}

// ---------------------------------------------------------------------------
// Entity row narration
// ---------------------------------------------------------------------------

export function narratePersonRow(data: PersonRowData, t: T): string {
  const name = fullName(data.given_name, data.surname);
  const sex = sexLabel(data.sex);
  const summary = `${data.event_count} events, ${data.relationship_count} relationships`;
  return t('screenReader.rowPerson', { name, sex, summary });
}

export function narrateRelationshipRow(data: RelationshipRowData, t: T): string {
  const person1 = fullName(data.person1_given_name, data.person1_surname);
  const person2 = fullName(data.person2_given_name, data.person2_surname);
  return t('screenReader.rowRelationship', {
    type: data.type,
    person1,
    person2,
    summary: data.event_summary,
  });
}

export function narrateSourceRow(data: SourceRowData, t: T): string {
  return t('screenReader.rowSource', {
    sourceType: data.source_type,
    title: data.title,
    citationCount: data.citation_count,
  });
}

export function narratePlaceRow(data: PlaceRowData, t: T): string {
  return t('screenReader.rowPlace', {
    name: data.name,
    placeType: data.place_type,
    path: data.path,
  });
}

export function narrateEventRow(data: EventRowData, t: T): string {
  return t('screenReader.rowEvent', {
    eventType: data.event_type,
    date: data.date_value,
    place: data.place_name,
  });
}

export function narrateTaskRow(data: TaskRowData, t: T): string {
  return t('screenReader.rowTask', {
    priority: priorityLabel(data.priority),
    status: data.status,
    task: data.task,
  });
}

export function narrateMediaRow(data: MediaRowData, t: T): string {
  return t('screenReader.rowMedia', {
    title: data.title,
    format: data.format,
  });
}

export function narrateQualityRow(data: QualityRowData, t: T): string {
  return t('screenReader.rowQuality', {
    severity: data.severity,
    message: data.message,
  });
}

// ---------------------------------------------------------------------------
// Person detail narration
// ---------------------------------------------------------------------------

export function narratePersonDetail(data: PersonDetailData, t: T): string {
  return t('screenReader.navPersonDetail', {
    name: data.name,
    sex: data.sex,
    summary: data.summary,
    sectionCount: data.sectionCount,
  });
}

// ---------------------------------------------------------------------------
// Chart narration
// ---------------------------------------------------------------------------

export function narrateChartNode(data: ChartNodeData, t: T): string {
  if (data.generation === 1) {
    return t('screenReader.chartFocusPerson', {
      name: data.name,
      summary: data.summary,
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

export function narrateChartBoundary(
  direction: 'father' | 'mother' | 'children' | 'spouse' | 'ancestors',
  t: T
): string {
  const keyMap: Record<typeof direction, string> = {
    father: 'screenReader.chartNoFather',
    mother: 'screenReader.chartNoMother',
    children: 'screenReader.chartNoChildren',
    spouse: 'screenReader.chartNoSpouse',
    ancestors: 'screenReader.chartNoAncestors',
  };
  return t(keyMap[direction]);
}

// ---------------------------------------------------------------------------
// UI narration
// ---------------------------------------------------------------------------

export function narratePageEntry(
  routeName: string,
  t: T
): string {
  switch (routeName) {
    case 'persons':
      return t('screenReader.navPersonsList');
    case 'relationships':
      return t('screenReader.navRelationshipsList');
    case 'sources':
      return t('screenReader.navSourcesList');
    case 'places':
      return t('screenReader.navPlacesList');
    case 'tasks':
      return t('screenReader.navTasksList');
    case 'visualization':
      return t('screenReader.navVisualization');
    case 'groups':
      return t('screenReader.navGroupsList');
    case 'media':
      return t('screenReader.navMediaList');
    case 'reports':
      return t('screenReader.navReportsList');
    case 'quality':
      return t('screenReader.navQuality');
    case 'database':
      return t('screenReader.navDatabase');
    case 'importExport':
      return t('screenReader.navImportExport');
    case 'search':
      return t('screenReader.navSearch');
    default:
      return t('screenReader.navPersonsList');
  }
}

export function narrateModalOpen(title: string, fieldCount: number, t: T): string {
  return t('screenReader.formOpen', { title, count: fieldCount });
}

export function narrateFieldFocus(
  label: string,
  type: 'text' | 'dropdown' | 'search',
  value: string,
  t: T
): string {
  if (type === 'text') {
    if (!value) {
      return t('screenReader.fieldTextEmpty', { label });
    }
    return t('screenReader.fieldText', { label, value });
  }
  if (type === 'dropdown') {
    return t('screenReader.fieldDropdown', { label, value });
  }
  // search
  if (!value) {
    return t('screenReader.fieldSearchEmpty', { label });
  }
  return t('screenReader.fieldSearch', { label, value });
}

export function narrateSearchResults(count: number, t: T): string {
  if (count <= 0) {
    return t('screenReader.searchNoMatches');
  }
  return t('screenReader.searchMatches', { count });
}

export function narrateAction(
  action: 'saved' | 'deleted' | 'modalClosed' | 'editing' | 'new' | 'error',
  target: string | undefined,
  t: T
): string {
  switch (action) {
    case 'saved':
      return t('screenReader.actionSaved');
    case 'deleted':
      return t('screenReader.actionDeleted', { name: target ?? '' });
    case 'modalClosed':
      return t('screenReader.actionModalClosed');
    case 'editing':
      return t('screenReader.actionEditing', { name: target ?? '' });
    case 'new':
      return t('screenReader.actionNew', { type: target ?? '' });
    case 'error':
      return t('screenReader.actionError', { message: target ?? '' });
  }
}
