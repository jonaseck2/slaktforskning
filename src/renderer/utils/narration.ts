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

export function narratePerson(data: PersonNarration): string {
  const parts: string[] = [data.name + '.'];

  if (data.birthDate || data.birthPlace) {
    const born = ['Born', data.birthDate, data.birthPlace ? 'in ' + data.birthPlace : '']
      .filter(Boolean).join(' ');
    parts.push(born + '.');
  }

  if (data.deathDate || data.deathPlace) {
    const died = ['Died', data.deathDate, data.deathPlace ? 'in ' + data.deathPlace : '']
      .filter(Boolean).join(' ');
    parts.push(died + '.');
  }

  if (data.spouseName) {
    parts.push(data.marriageYear
      ? 'Married to ' + data.spouseName + ' in ' + data.marriageYear + '.'
      : 'Married to ' + data.spouseName + '.');
  }

  if (data.childrenNames && data.childrenNames.length > 0) {
    parts.push(data.childrenNames.length + ' children: ' + data.childrenNames.join(', ') + '.');
  }

  return parts.join(' ');
}

export function narrateRelationship(data: RelationshipNarration): string {
  const parts: string[] = [];
  const typeLabel = data.type.charAt(0).toUpperCase() + data.type.slice(1).replace('_', ' ');
  parts.push(typeLabel + ' between ' + data.person1Name + ' and ' + data.person2Name + '.');

  if (data.eventSummary) {
    parts.push(data.eventSummary + '.');
  }

  if (data.childCount !== undefined && data.childCount > 0) {
    parts.push(data.childCount + ' children.');
  }

  return parts.join(' ');
}

export function narrateSource(data: SourceNarration): string {
  const parts: string[] = [data.title + '.'];

  if (data.author) {
    parts.push('Author: ' + data.author + '.');
  }

  parts.push(data.citationCount + ' citations linked.');

  return parts.join(' ');
}
