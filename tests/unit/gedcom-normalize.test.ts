import { describe, it, expect } from 'vitest';
import { parseGedcom } from '../../src/gedcom/parser';
import { normalizeForImport } from '../../src/import/gedcom/normalize';

// Helper to find a top-level node by tag
function findTop(nodes: ReturnType<typeof parseGedcom>, tag: string) {
  return nodes.find(n => n.tag === tag);
}

// Helper to find a direct child by tag
function child(node: ReturnType<typeof parseGedcom>[0], tag: string) {
  return node.children.find(c => c.tag === tag);
}

function childAll(node: ReturnType<typeof parseGedcom>[0], tag: string) {
  return node.children.filter(c => c.tag === tag);
}

describe('normalizeForImport', () => {
  it('returns input unchanged for version 5.5.1', () => {
    const nodes = parseGedcom('0 HEAD\n1 GEDC\n2 VERS 5.5.1\n0 @I1@ INDI\n1 NAME John /Smith/\n0 TRLR');
    const result = normalizeForImport(nodes, '5.5.1');
    expect(result).toBe(nodes); // same reference
  });

  it('returns input unchanged for version 5.5.5', () => {
    const nodes = parseGedcom('0 HEAD\n1 GEDC\n2 VERS 5.5.5\n0 TRLR');
    const result = normalizeForImport(nodes, '5.5.5');
    expect(result).toBe(nodes);
  });

  describe('SNOTE pointer → inlined NOTE text', () => {
    it('inlines a shared note into a NOTE tag on the referencing record', () => {
      const gedcom = [
        '0 HEAD',
        '1 GEDC',
        '2 VERS 7.0',
        '0 @I1@ INDI',
        '1 NAME John /Smith/',
        '1 SNOTE @N1@',
        '0 @N1@ SNOTE This is a shared note',
        '0 TRLR',
      ].join('\n');
      const nodes = parseGedcom(gedcom);
      const result = normalizeForImport(nodes, '7.0');

      // Top-level SNOTE record should be removed
      expect(result.some(n => n.tag === 'SNOTE')).toBe(false);

      // The INDI should have a NOTE child with the resolved text
      const indi = result.find(n => n.tag === 'INDI');
      expect(indi).toBeDefined();
      const noteNode = child(indi!, 'NOTE');
      expect(noteNode).toBeDefined();
      expect(noteNode!.value).toBe('This is a shared note');

      // The SNOTE sub-node should be gone
      expect(indi!.children.some(c => c.tag === 'SNOTE')).toBe(false);
    });

    it('handles multiple SNOTE pointers', () => {
      const gedcom = [
        '0 @I1@ INDI',
        '1 SNOTE @N1@',
        '1 SNOTE @N2@',
        '0 @N1@ SNOTE Note one',
        '0 @N2@ SNOTE Note two',
        '0 TRLR',
      ].join('\n');
      const nodes = parseGedcom(gedcom);
      const result = normalizeForImport(nodes, '7.0');

      const indi = result.find(n => n.tag === 'INDI');
      const noteNodes = childAll(indi!, 'NOTE');
      expect(noteNodes).toHaveLength(2);
      expect(noteNodes.map(n => n.value)).toContain('Note one');
      expect(noteNodes.map(n => n.value)).toContain('Note two');
    });
  });

  describe('EXID → REFN conversion', () => {
    it('converts an EXID on an INDI record to a REFN sub-node', () => {
      const gedcom = [
        '0 @I1@ INDI',
        '1 EXID 12345',
        '2 TYPE https://example.com/ns/id',
        '0 TRLR',
      ].join('\n');
      const nodes = parseGedcom(gedcom);
      const result = normalizeForImport(nodes, '7.0');

      const indi = result.find(n => n.tag === 'INDI');
      expect(indi!.children.some(c => c.tag === 'EXID')).toBe(false);

      const refnNode = child(indi!, 'REFN');
      expect(refnNode).toBeDefined();
      expect(refnNode!.value).toBe('12345');

      const typeChild = child(refnNode!, 'TYPE');
      expect(typeChild).toBeDefined();
      expect(typeChild!.value).toBe('https://example.com/ns/id');
    });

    it('converts EXID without TYPE', () => {
      const gedcom = '0 @I1@ INDI\n1 EXID abc\n0 TRLR';
      const nodes = parseGedcom(gedcom);
      const result = normalizeForImport(nodes, '7.0');

      const indi = result.find(n => n.tag === 'INDI');
      const refnNode = child(indi!, 'REFN');
      expect(refnNode).toBeDefined();
      expect(refnNode!.value).toBe('abc');
      expect(refnNode!.children).toHaveLength(0);
    });

    it('does not convert EXID on non-INDI records', () => {
      const gedcom = '0 @F1@ FAM\n1 EXID fam-id\n0 TRLR';
      const nodes = parseGedcom(gedcom);
      const result = normalizeForImport(nodes, '7.0');

      const fam = result.find(n => n.tag === 'FAM');
      // EXID should still be present on FAM (not converted)
      expect(fam!.children.some(c => c.tag === 'EXID')).toBe(true);
    });
  });

  describe('Uppercase TYPE values → lowercase', () => {
    it('lowercases TYPE sub-node values', () => {
      const gedcom = [
        '0 @I1@ INDI',
        '1 NAME John /Smith/',
        '2 TYPE BIRTH',
        '0 TRLR',
      ].join('\n');
      const nodes = parseGedcom(gedcom);
      const result = normalizeForImport(nodes, '7.0');

      const indi = result.find(n => n.tag === 'INDI');
      const nameNode = child(indi!, 'NAME');
      const typeNode = child(nameNode!, 'TYPE');
      expect(typeNode!.value).toBe('birth');
    });

    it('lowercases PEDI values', () => {
      const gedcom = [
        '0 @I1@ INDI',
        '1 FAMC @F1@',
        '2 PEDI ADOPTED',
        '0 TRLR',
      ].join('\n');
      const nodes = parseGedcom(gedcom);
      const result = normalizeForImport(nodes, '7.0');

      const indi = result.find(n => n.tag === 'INDI');
      const famcNode = child(indi!, 'FAMC');
      const pediNode = child(famcNode!, 'PEDI');
      expect(pediNode!.value).toBe('adopted');
    });
  });

  describe('CONC nodes dropped', () => {
    it('removes CONC nodes from record children', () => {
      // The parser folds CONC into the parent's value, but if a stray CONC node exists
      // in parsed output it should be dropped by normalization.
      // We build nodes manually to simulate a stray CONC.
      const nodes = parseGedcom('0 @I1@ INDI\n1 NOTE Some note text\n0 TRLR');
      // Inject a stray CONC child manually
      const indi = nodes.find(n => n.tag === 'INDI')!;
      indi.children.push({ level: 2, xref: null, tag: 'CONC', value: ' extra', children: [] });

      const result = normalizeForImport(nodes, '7.0');
      const indiOut = result.find(n => n.tag === 'INDI');
      expect(indiOut!.children.some(c => c.tag === 'CONC')).toBe(false);
    });
  });

  describe('PHRASE under DATE used when date value missing', () => {
    it('uses PHRASE text as DATE value when DATE value is empty', () => {
      const gedcom = [
        '0 @I1@ INDI',
        '1 BIRT',
        '2 DATE',
        '3 PHRASE early spring of some year',
        '0 TRLR',
      ].join('\n');
      const nodes = parseGedcom(gedcom);
      const result = normalizeForImport(nodes, '7.0');

      const indi = result.find(n => n.tag === 'INDI');
      const birt = child(indi!, 'BIRT');
      const dateNode = child(birt!, 'DATE');
      expect(dateNode!.value).toBe('early spring of some year');
    });

    it('does not overwrite a non-empty DATE value with PHRASE', () => {
      const gedcom = [
        '0 @I1@ INDI',
        '1 BIRT',
        '2 DATE 15 JUN 1900',
        '3 PHRASE mid-summer 1900',
        '0 TRLR',
      ].join('\n');
      const nodes = parseGedcom(gedcom);
      const result = normalizeForImport(nodes, '7.0');

      const indi = result.find(n => n.tag === 'INDI');
      const birt = child(indi!, 'BIRT');
      const dateNode = child(birt!, 'DATE');
      expect(dateNode!.value).toBe('15 JUN 1900');
    });
  });

  describe('Multiple GIVN → concatenated single GIVN', () => {
    it('merges multiple GIVN children into one', () => {
      const gedcom = [
        '0 @I1@ INDI',
        '1 NAME John Carl /Smith/',
        '2 GIVN John',
        '2 GIVN Carl',
        '2 SURN Smith',
        '0 TRLR',
      ].join('\n');
      const nodes = parseGedcom(gedcom);
      const result = normalizeForImport(nodes, '7.0');

      const indi = result.find(n => n.tag === 'INDI');
      const nameNode = child(indi!, 'NAME');
      const givnNodes = childAll(nameNode!, 'GIVN');
      expect(givnNodes).toHaveLength(1);
      expect(givnNodes[0].value).toBe('John Carl');
    });

    it('merges multiple SURN children into one', () => {
      const gedcom = [
        '0 @I1@ INDI',
        '1 NAME Maria /Garcia Lopez/',
        '2 GIVN Maria',
        '2 SURN Garcia',
        '2 SURN Lopez',
        '0 TRLR',
      ].join('\n');
      const nodes = parseGedcom(gedcom);
      const result = normalizeForImport(nodes, '7.0');

      const indi = result.find(n => n.tag === 'INDI');
      const nameNode = child(indi!, 'NAME');
      const surnNodes = childAll(nameNode!, 'SURN');
      expect(surnNodes).toHaveLength(1);
      expect(surnNodes[0].value).toBe('Garcia Lopez');
    });

    it('leaves single GIVN/SURN unchanged', () => {
      const gedcom = [
        '0 @I1@ INDI',
        '1 NAME John /Smith/',
        '2 GIVN John',
        '2 SURN Smith',
        '0 TRLR',
      ].join('\n');
      const nodes = parseGedcom(gedcom);
      const result = normalizeForImport(nodes, '7.0');

      const indi = result.find(n => n.tag === 'INDI');
      const nameNode = child(indi!, 'NAME');
      expect(childAll(nameNode!, 'GIVN')).toHaveLength(1);
      expect(childAll(nameNode!, 'SURN')).toHaveLength(1);
    });
  });

  describe('TRAN → additional NAME node (aka)', () => {
    it('creates an aka NAME node from a TRAN child on NAME', () => {
      const gedcom = [
        '0 @I1@ INDI',
        '1 NAME Johann /Müller/',
        '2 TRAN Johan /Miller/',
        '0 TRLR',
      ].join('\n');
      const nodes = parseGedcom(gedcom);
      const result = normalizeForImport(nodes, '7.0');

      const indi = result.find(n => n.tag === 'INDI');
      // Get all NAME children of INDI
      const nameNodes = childAll(indi!, 'NAME');
      expect(nameNodes).toHaveLength(2);
      const akaName = nameNodes.find(n =>
        n.children.some(c => c.tag === 'TYPE' && c.value === 'aka')
      );
      expect(akaName).toBeDefined();
      expect(akaName!.value).toBe('Johan /Miller/');
    });
  });
});
