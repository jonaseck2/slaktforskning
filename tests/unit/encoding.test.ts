import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect } from 'vitest';
import { readGedcomFile } from '../../src/gedcom/encoding';

function writeTempFile(content: Buffer | string, ext = '.ged'): string {
  const tmp = path.join(os.tmpdir(), `encoding-test-${Date.now()}${ext}`);
  fs.writeFileSync(tmp, content);
  return tmp;
}

describe('readGedcomFile encoding detection', () => {
  it('reads UTF-8 with BOM correctly', () => {
    const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
    const content = Buffer.from('0 HEAD\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NAME Ångström /Björk/\n');
    const tmp = writeTempFile(Buffer.concat([bom, content]));
    try {
      const result = readGedcomFile(tmp);
      expect(result).toContain('Ångström');
      expect(result).toContain('Björk');
      expect(result).not.toContain('\uFEFF'); // BOM stripped
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it('reads UTF-8 without BOM when CHAR tag declares it', () => {
    const content = Buffer.from('0 HEAD\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NAME Växjö /Släkt/\n', 'utf-8');
    const tmp = writeTempFile(content);
    try {
      const result = readGedcomFile(tmp);
      expect(result).toContain('Växjö');
      expect(result).toContain('Släkt');
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it('auto-detects UTF-8 without BOM or CHAR tag (Holger 8 pattern)', () => {
    // File with multi-byte UTF-8 chars but no BOM and no CHAR tag
    const content = Buffer.from('0 HEAD\n1 SOUR Holger\n0 @I1@ INDI\n1 NOTE Linda har ett stort släktintresse\n1 NAME Växjö /Björk/\n', 'utf-8');
    const tmp = writeTempFile(content);
    try {
      const result = readGedcomFile(tmp);
      expect(result).toContain('släktintresse');
      expect(result).toContain('Växjö');
      expect(result).not.toContain('slï¿½ktintresse'); // NOT mojibake
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it('reads latin1 when file has CHAR ANSI and no multi-byte UTF-8', () => {
    // Latin-1 encoded: ä=0xE4, ö=0xF6, å=0xE5
    const content = Buffer.from([
      ...Buffer.from('0 HEAD\n1 CHAR ANSI\n0 @I1@ INDI\n1 NAME '),
      0xC5, 0x6E, 0x67, 0x73, 0x74, 0x72, 0xF6, 0x6D, // Ångström in latin1
      ...Buffer.from(' /Test/\n'),
    ]);
    const tmp = writeTempFile(content);
    try {
      const result = readGedcomFile(tmp);
      expect(result).toContain('Ångström');
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it('reads ASCII-only files without issues', () => {
    const content = Buffer.from('0 HEAD\n1 SOUR Test\n0 @I1@ INDI\n1 NAME John /Smith/\n');
    const tmp = writeTempFile(content);
    try {
      const result = readGedcomFile(tmp);
      expect(result).toContain('John');
      expect(result).toContain('Smith');
    } finally {
      fs.unlinkSync(tmp);
    }
  });
});
