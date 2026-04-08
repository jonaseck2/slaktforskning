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
