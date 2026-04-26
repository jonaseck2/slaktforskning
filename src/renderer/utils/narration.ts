export interface PersonNarration {
  name: string;
  birthDate?: string;
  birthPlace?: string;
  deathDate?: string;
  deathPlace?: string;
  spouseName?: string;
  marriageYear?: string;
  childrenNames?: string[];
}

export interface RelationshipNarration {
  type: string;
  person1Name: string;
  person2Name: string;
  eventSummary?: string;
  childCount?: number;
}

export interface SourceNarration {
  title: string;
  author?: string;
  citationCount: number;
}

export interface NarrationLabels {
  born: string;
  died: string;
  in_: string;
  marriedTo: string;
  children: string;
  between: string;
  and: string;
  author: string;
  citationsLinked: string;

  // Media
  photo: string;
  document: string;
  tagged: string;
  taken: string;
  about: string;

  // Place
  eventsRecorded: string;

  // Event
  of: string;
  on: string;

  // Citation
  page: string;
  confidence: string;
  confidenceLevels: { 0: string; 1: string; 2: string; 3: string };
  for_: string;
}

/** Build labels from a vue-i18n `t` function. */
export function narrationLabelsFromI18n(t: (key: string) => string): NarrationLabels {
  return {
    born: t('narration.born'),
    died: t('narration.died'),
    in_: t('narration.in'),
    marriedTo: t('narration.marriedTo'),
    children: t('narration.children'),
    between: t('narration.between'),
    and: t('narration.and'),
    author: t('narration.author'),
    citationsLinked: t('narration.citationsLinked'),
    photo: t('narration.media.photo'),
    document: t('narration.media.document'),
    tagged: t('narration.media.tagged'),
    taken: t('narration.media.taken'),
    about: t('narration.media.about'),
    eventsRecorded: t('narration.place.eventsRecorded'),
    of: t('narration.event.of'),
    on: t('narration.event.on'),
    page: t('narration.citation.page'),
    confidence: t('narration.citation.confidence'),
    confidenceLevels: {
      0: t('narration.citation.confidenceLevels.0'),
      1: t('narration.citation.confidenceLevels.1'),
      2: t('narration.citation.confidenceLevels.2'),
      3: t('narration.citation.confidenceLevels.3'),
    },
    for_: t('narration.citation.for'),
  };
}

const EN_LABELS: NarrationLabels = {
  born: 'Born',
  died: 'Died',
  in_: 'in',
  marriedTo: 'Married to',
  children: 'children',
  between: 'between',
  and: 'and',
  author: 'Author',
  citationsLinked: 'citations linked',
  photo: 'Photo',
  document: 'Document',
  tagged: 'Tagged',
  taken: 'Taken',
  about: 'about',
  eventsRecorded: 'events recorded',
  of: 'of',
  on: 'on',
  page: 'page',
  confidence: 'Confidence',
  confidenceLevels: { 0: 'unreliable', 1: 'questionable', 2: 'secondary', 3: 'primary' },
  for_: 'For',
};

export function narratePerson(data: PersonNarration, labels: NarrationLabels = EN_LABELS): string {
  const parts: string[] = [data.name + '.'];

  if (data.birthDate || data.birthPlace) {
    const born = [labels.born, data.birthDate, data.birthPlace ? labels.in_ + ' ' + data.birthPlace : '']
      .filter(Boolean).join(' ');
    parts.push(born + '.');
  }

  if (data.deathDate || data.deathPlace) {
    const died = [labels.died, data.deathDate, data.deathPlace ? labels.in_ + ' ' + data.deathPlace : '']
      .filter(Boolean).join(' ');
    parts.push(died + '.');
  }

  if (data.spouseName) {
    parts.push(data.marriageYear
      ? labels.marriedTo + ' ' + data.spouseName + ' ' + data.marriageYear + '.'
      : labels.marriedTo + ' ' + data.spouseName + '.');
  }

  if (data.childrenNames && data.childrenNames.length > 0) {
    parts.push(data.childrenNames.length + ' ' + labels.children + ': ' + data.childrenNames.join(', ') + '.');
  }

  return parts.join(' ');
}

export function narrateRelationship(data: RelationshipNarration, labels: NarrationLabels = EN_LABELS): string {
  const parts: string[] = [];
  const typeLabel = data.type.charAt(0).toUpperCase() + data.type.slice(1).replace('_', ' ');
  parts.push(typeLabel + ' ' + labels.between + ' ' + data.person1Name + ' ' + labels.and + ' ' + data.person2Name + '.');

  if (data.eventSummary) {
    parts.push(data.eventSummary + '.');
  }

  if (data.childCount !== undefined && data.childCount > 0) {
    parts.push(data.childCount + ' ' + labels.children + '.');
  }

  return parts.join(' ');
}

export function narrateSource(data: SourceNarration, labels: NarrationLabels = EN_LABELS): string {
  const parts: string[] = [data.title + '.'];

  if (data.author) {
    parts.push(labels.author + ': ' + data.author + '.');
  }

  parts.push(data.citationCount + ' ' + labels.citationsLinked + '.');

  return parts.join(' ');
}

export interface MediaNarration {
  title: string;
  format?: string;
  taggedPersonNames?: string[];
  inferredDate?: string;
  notes?: string;
}

export function narrateMedia(data: MediaNarration, labels: NarrationLabels = EN_LABELS): string {
  const parts: string[] = [data.title + '.'];

  if (data.format) {
    const isImage = /^(jpe?g|png|gif|webp|bmp|tiff?|heic)$/i.test(data.format);
    parts.push((isImage ? labels.photo : labels.document) + '.');
  }

  if (data.taggedPersonNames && data.taggedPersonNames.length > 0) {
    parts.push(labels.tagged + ': ' + data.taggedPersonNames.join(', ') + '.');
  }

  if (data.inferredDate) {
    parts.push(labels.taken + ' ' + labels.about + ' ' + data.inferredDate + '.');
  }

  if (data.notes) {
    parts.push(data.notes);
  }

  return parts.join(' ');
}

export interface PlaceNarration {
  name: string;
  type?: string;
  parentPath?: string;
  eventCount?: number;
}

export function narratePlace(data: PlaceNarration, labels: NarrationLabels = EN_LABELS): string {
  const parts: string[] = [];

  const head = data.type ? data.name + ' ' + data.type : data.name;
  const headWithParent = data.parentPath ? head + ' ' + labels.in_ + ' ' + data.parentPath : head;
  parts.push(headWithParent + '.');

  if (data.eventCount !== undefined && data.eventCount > 0) {
    parts.push(data.eventCount + ' ' + labels.eventsRecorded + '.');
  }

  return parts.join(' ');
}

export interface EventNarration {
  type: string;
  date?: string;
  place?: string;
  primaryPersonName?: string;
}

export function narrateEvent(data: EventNarration, labels: NarrationLabels = EN_LABELS): string {
  let head = data.type;
  if (data.primaryPersonName) {
    head = head + ' ' + labels.of + ' ' + data.primaryPersonName;
  }

  const parts: string[] = [head];

  if (data.date) {
    parts.push(labels.on + ' ' + data.date);
  }

  if (data.place) {
    parts.push(labels.in_ + ' ' + data.place);
  }

  return parts.join(' ') + '.';
}

export interface CitationNarration {
  sourceTitle: string;
  page?: string;
  confidence?: 0 | 1 | 2 | 3;
  attachedToLabel?: string;
}

export function narrateCitation(data: CitationNarration, labels: NarrationLabels = EN_LABELS): string {
  const parts: string[] = [data.sourceTitle];

  if (data.page) {
    parts[0] += ', ' + labels.page + ' ' + data.page;
  }
  parts[0] += '.';

  if (data.confidence !== undefined) {
    parts.push(labels.confidence + ': ' + labels.confidenceLevels[data.confidence] + '.');
  }

  if (data.attachedToLabel) {
    parts.push(labels.for_ + ' ' + data.attachedToLabel + '.');
  }

  return parts.join(' ');
}
