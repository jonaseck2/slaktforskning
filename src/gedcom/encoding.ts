import * as fs from 'fs';

/**
 * Read a GEDCOM file from disk with correct character encoding.
 *
 * GEDCOM files declare their encoding in the HEAD record:
 *   1 CHAR UTF-8      → UTF-8
 *   1 CHAR ANSI       → Windows-1252 (read as latin1; Swedish/Nordic chars are identical)
 *   1 CHAR ANSEL      → ANSEL genealogy encoding (read as latin1 — best approximation)
 *   1 CHAR ASCII      → ASCII (latin1 is a superset, safe)
 *   1 CHAR UNICODE    → UTF-16 with BOM
 *
 * Detection order:
 *   1. UTF-8 BOM (EF BB BF)   → strip BOM, decode as utf-8
 *   2. UTF-16 BOM (FF FE / FE FF) → decode as utf-16
 *   3. Peek first 500 bytes as ASCII to find `1 CHAR xxx`
 *      - CHAR=UTF-8  → decode as utf-8
 *      - anything else (ANSI, ANSEL, ASCII, missing) → decode as latin1
 */
export function readGedcomFile(filePath: string): string {
  const buf = fs.readFileSync(filePath);

  // UTF-8 BOM
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    return buf.toString('utf-8').slice(1); // strip BOM
  }

  // UTF-16 LE BOM
  if (buf[0] === 0xFF && buf[1] === 0xFE) {
    return buf.toString('utf16le');
  }

  // UTF-16 BE BOM
  if (buf[0] === 0xFE && buf[1] === 0xFF) {
    // Node doesn't have 'utf16be'; swap bytes and decode as utf16le
    const swapped = Buffer.alloc(buf.length);
    for (let i = 0; i < buf.length - 1; i += 2) {
      swapped[i]     = buf[i + 1];
      swapped[i + 1] = buf[i];
    }
    return swapped.toString('utf16le');
  }

  // No BOM: peek at the first 500 bytes as ASCII to find the CHAR tag
  const peek = buf.slice(0, 500).toString('ascii');
  const charMatch = peek.match(/\d CHAR\s+(\S+)/);
  const gedChar = charMatch?.[1]?.trim().toUpperCase() ?? '';

  if (gedChar === 'UTF-8') {
    return buf.toString('utf-8');
  }

  // ANSI, WINDOWS-1252, ANSEL, ASCII, or unknown → latin1
  // Latin-1 (ISO-8859-1) maps bytes 0x00–0xFF directly to U+0000–U+00FF.
  // Swedish ä (0xE4), ö (0xF6), å (0xE5) etc. are identical in latin1 and
  // Windows-1252, so this is correct for Nordic genealogy data.
  return buf.toString('latin1');
}
