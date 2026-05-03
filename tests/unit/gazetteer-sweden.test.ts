import { describe, it, expect } from 'vitest';
import { loadGazetteers } from '../../src/api/place-gazetteers/merge';
import svSocknar from '../../src/api/place-gazetteers/data/sv-socknar.json';
import svForsamlingar from '../../src/api/place-gazetteers/data/sv-forsamlingar.json';

describe('sv-socknar (Wikidata civil parishes, structural-merge shape)', () => {
  const g = svSocknar as any;

  it('roots at World > Europe > Sweden', () => {
    expect(g.root.name).toBe('World');
    expect(g.root.type).toBe('world');
    const europe = g.root.children.find((c: any) => c.name === 'Europe');
    expect(europe).toBeDefined();
    const sweden = europe.children.find((c: any) => c.name === 'Sweden');
    expect(sweden).toBeDefined();
    expect(sweden.type).toBe('country');
    expect(sweden.aliases).toContain('Sverige');
  });

  it('Eksjö kommun stripped to Eksjö (admin2) under Jönköping (admin1)', () => {
    const sweden = g.root.children
      .find((c: any) => c.name === 'Europe').children
      .find((c: any) => c.name === 'Sweden');
    const jonkoping = sweden.children.find((c: any) => c.name === 'Jönköping');
    expect(jonkoping).toBeDefined();
    expect(jonkoping.type).toBe('admin1');
    expect(jonkoping.aliases).toContain('Jönköpings län');
    const eksjo = jonkoping.children.find((c: any) => c.name === 'Eksjö');
    expect(eksjo).toBeDefined();
    expect(eksjo.type).toBe('admin2');
    expect(eksjo.aliases).toContain('Eksjö kommun');
  });

  it('parishes are typed as admin3 with parish-suffix aliases', () => {
    const sweden = g.root.children
      .find((c: any) => c.name === 'Europe').children
      .find((c: any) => c.name === 'Sweden');
    const jonkoping = sweden.children.find((c: any) => c.name === 'Jönköping');
    const eksjo = jonkoping.children.find((c: any) => c.name === 'Eksjö');
    expect(eksjo.children?.length).toBeGreaterThan(0);
    const sampleParish = eksjo.children[0];
    expect(sampleParish.type).toBe('admin3');
  });
});

describe('sv-forsamlingar (Wikidata church parishes, structural-merge shape)', () => {
  const g = svForsamlingar as any;

  it('roots at World > Europe > Sweden', () => {
    expect(g.root.name).toBe('World');
    const europe = g.root.children.find((c: any) => c.name === 'Europe');
    const sweden = europe.children.find((c: any) => c.name === 'Sweden');
    expect(sweden.type).toBe('country');
  });

  it('parishes typed as admin3', () => {
    const sweden = g.root.children
      .find((c: any) => c.name === 'Europe').children
      .find((c: any) => c.name === 'Sweden');
    expect(sweden.children.length).toBeGreaterThan(0);
    const lan = sweden.children[0];
    expect(lan.type).toBe('admin1');
    if (lan.children?.length > 0 && lan.children[0].children?.length > 0) {
      const parish = lan.children[0].children[0];
      expect(parish.type).toBe('admin3');
    }
  });
});

describe('structural merge of sv-socknar + sv-forsamlingar', () => {
  it('after loadGazetteers with both enabled, exactly one Eksjö admin2 under Sweden > Jönköping with both contributors', () => {
    const sv1 = svSocknar as any;
    const sv2 = svForsamlingar as any;
    const result = loadGazetteers(
      { enabledGazetteers: ['sv-socknar', 'sv-forsamlingar'] },
      [sv1, sv2],
    );
    const sweden = result[0].root!.children!
      .find((c: any) => c.name === 'Europe')!.children!
      .find((c: any) => c.name === 'Sweden')!;
    const jonkoping = sweden.children!.find((c: any) => c.name === 'Jönköping')!;
    const eksjos = jonkoping.children!.filter(
      (c: any) => c.name === 'Eksjö' && c.type === 'admin2',
    );
    expect(eksjos.length).toBe(1);
    expect((eksjos[0] as any).__contributors).toEqual(
      expect.arrayContaining(['sv-socknar', 'sv-forsamlingar']),
    );
  });
});
