import { describe, it, expect } from 'vitest';
import { narratePerson, narrateRelationship, narrateSource } from '../../src/renderer/utils/narration';

describe('narratePerson', () => {
  it('narrates a person with birth and death', () => {
    const text = narratePerson({
      name: 'Erik Johansson',
      birthDate: '1842-03-15',
      birthPlace: 'Göteborg',
      deathDate: '1910-01-03',
      deathPlace: 'Stockholm',
      spouseName: 'Anna Nilsson',
      marriageYear: '1868',
      childrenNames: ['Karl', 'Maria', 'Gustaf'],
    });
    expect(text).toContain('Erik Johansson');
    expect(text).toContain('1842');
    expect(text).toContain('Göteborg');
    expect(text).toContain('1910');
    expect(text).toContain('Stockholm');
    expect(text).toContain('Anna Nilsson');
    expect(text).toContain('Karl');
  });

  it('handles missing data gracefully', () => {
    const text = narratePerson({ name: 'Unknown Person' });
    expect(text).toContain('Unknown Person');
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('null');
  });

  it('handles only birth data', () => {
    const text = narratePerson({ name: 'Test', birthDate: '1900', birthPlace: 'Stockholm' });
    expect(text).toContain('Born');
    expect(text).toContain('Stockholm');
    expect(text).not.toContain('Died');
  });
});

describe('narrateRelationship', () => {
  it('narrates a couple relationship', () => {
    const text = narrateRelationship({
      type: 'couple',
      person1Name: 'Erik Johansson',
      person2Name: 'Anna Nilsson',
      eventSummary: 'Married 12 June 1868 in Göteborg',
      childCount: 3,
    });
    expect(text).toContain('Erik Johansson');
    expect(text).toContain('Anna Nilsson');
    expect(text).toContain('3');
  });

  it('handles parent_child type', () => {
    const text = narrateRelationship({
      type: 'parent_child',
      person1Name: 'Erik',
      person2Name: 'Karl',
    });
    expect(text).toContain('Parent child');
    expect(text).not.toContain('undefined');
  });
});

describe('narrateSource', () => {
  it('narrates a source with author', () => {
    const text = narrateSource({
      title: 'Church records, Göteborg parish',
      author: 'Swedish Church',
      citationCount: 4,
    });
    expect(text).toContain('Church records');
    expect(text).toContain('Swedish Church');
    expect(text).toContain('4');
  });

  it('narrates source without author', () => {
    const text = narrateSource({ title: 'Census 1880', citationCount: 0 });
    expect(text).toContain('Census 1880');
    expect(text).not.toContain('Author');
  });
});
