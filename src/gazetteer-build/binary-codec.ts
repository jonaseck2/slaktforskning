/**
 * Compact binary codec for bundled gazetteer JSON.
 *
 * The codec is a structural round-trip: JSON in → encode → decode → original
 * JSON out, modulo the documented `lat * 1e6` int32 precision (~5 cm at the
 * equator). It does NOT clean, normalise, or "improve" data on the way through
 * — gazetteer JSON files are authored truth, the binary form is a compressed
 * snapshot.
 *
 * On any unexpected input (bad magic, bad version, unknown geometry/type
 * code), the decoder throws — silent fallbacks would let a future contributor
 * add a field to the JSON and ship a packaged build with the field silently
 * dropped.
 *
 * Format:
 *
 *   Header (16 bytes):
 *     magic               : 4 bytes  "SLG1"  (0x53 0x4C 0x47 0x31)
 *     version             : u32 LE   = 1
 *     string_table_offset : u32 LE
 *     body_length         : u32 LE
 *
 *   Body (offset 16..16+body_length):
 *     Gazetteer metadata (id, name, locale, description varstrings),
 *     shape u8, kind u8, flags u8 (hasRoot|hasContributions|hasSource|hasNormalize|hasTranslations),
 *     optional Source / Normalize / Translations / Root / Contributions blocks.
 *
 *   Node:
 *     flags u8 (hasAliases|hasChildren|hasGeometry|hasYearRange),
 *     type code u8 (0=world, 1=continent, 2=country, 0xFF=variable + varstring),
 *     name index vu32, lat i32, lon i32,
 *     optional aliases / yearRange / geometry / children blocks.
 *
 *   Geometry (Polygon=1, MultiPolygon=2): rings of delta-encoded i32 lon/lat
 *   pairs (×1e6).
 *
 *   String table (offset string_table_offset..end): vu32 count, then for each
 *   string vu32 length + UTF-8 bytes. Body references strings by vu32 index.
 *
 * "varstring" in the body = vu32 string-table index (1 byte for the first 128
 * unique strings, 2 bytes for the next ~16k, etc.). Repeated names — country
 * names, "admin1", etc. — cost just 1 byte each in the body after interning.
 */

import type {
  Gazetteer,
  GazetteerNode,
  GazetteerNodeType,
  GazetteerNormalizeRules,
  GazetteerSource,
  GazetteerGeometry,
} from '../api/place-gazetteers/types';

const MAGIC = Buffer.from([0x53, 0x4c, 0x47, 0x31]); // "SLG1"
const VERSION = 1;

const SHAPE_CODE = { undefined: 0, scaffolding: 1, contributions: 2, language: 3 } as const;
const KIND_CODE = { undefined: 0, point: 1, boundary: 2, language: 3 } as const;

// Fixed type indices for compact encoding. admin{N} types use index 255 +
// a separate varstring to carry the level number.
const FIXED_TYPE_CODES: Record<string, number> = {
  world: 0,
  continent: 1,
  country: 2,
};
const TYPE_ADMIN_VARIABLE = 0xff;

// --- LEB128 helpers ---
function writeVU32(out: number[], n: number): void {
  if (n < 0 || !Number.isInteger(n)) throw new Error(`vu32 expects non-negative int, got ${n}`);
  while (n >= 0x80) {
    out.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  out.push(n & 0x7f);
}

function readVU32(buf: Buffer, cursor: { offset: number }): number {
  let result = 0;
  let shift = 0;
  for (;;) {
    if (cursor.offset >= buf.length) throw new Error('vu32: unexpected EOF');
    const b = buf[cursor.offset++];
    result |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) return result >>> 0;
    shift += 7;
    if (shift > 35) throw new Error('vu32: overflow');
  }
}

// --- String interning ---
class StringTable {
  private indexByValue = new Map<string, number>();
  private values: string[] = [];

  intern(s: string): number {
    const existing = this.indexByValue.get(s);
    if (existing !== undefined) return existing;
    const idx = this.values.length;
    this.values.push(s);
    this.indexByValue.set(s, idx);
    return idx;
  }

  toBuffer(): Buffer {
    const out: number[] = [];
    writeVU32(out, this.values.length);
    for (const v of this.values) {
      const utf8 = Buffer.from(v, 'utf8');
      writeVU32(out, utf8.length);
      for (const b of utf8) out.push(b);
    }
    return Buffer.from(out);
  }

  static read(buf: Buffer, cursor: { offset: number }): string[] {
    const count = readVU32(buf, cursor);
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
      const len = readVU32(buf, cursor);
      out.push(buf.slice(cursor.offset, cursor.offset + len).toString('utf8'));
      cursor.offset += len;
    }
    return out;
  }
}

// --- Encoder ---
export function encodeGazetteer(gaz: Gazetteer): Buffer {
  const strings = new StringTable();
  const body: number[] = [];

  // Required varstrings
  encodeVarstring(body, strings, gaz.id);
  encodeVarstring(body, strings, gaz.name);
  encodeVarstring(body, strings, gaz.locale);
  encodeVarstring(body, strings, gaz.description ?? '');

  body.push(SHAPE_CODE[(gaz.shape ?? 'undefined') as keyof typeof SHAPE_CODE] ?? 0);
  body.push(KIND_CODE[(gaz.kind ?? 'undefined') as keyof typeof KIND_CODE] ?? 0);

  // Flags
  let flags = 0;
  if (gaz.root) flags |= 0x01;
  if (gaz.contributions) flags |= 0x02;
  if (gaz.source) flags |= 0x04;
  if (gaz.normalize) flags |= 0x08;
  if (gaz.translations) flags |= 0x10;
  body.push(flags);

  if (gaz.source) writeSource(body, strings, gaz.source);
  if (gaz.normalize) writeNormalize(body, strings, gaz.normalize);
  if (gaz.translations) {
    // Translations are rare and structurally heterogeneous; round-trip via a
    // JSON string is correct and small. If perf shows up later, replace with
    // a structured encoding.
    encodeVarstring(body, strings, JSON.stringify(gaz.translations));
  }
  if (gaz.root) writeNode(body, strings, gaz.root);
  if (gaz.contributions) writeContributions(body, strings, gaz.contributions);

  const stringBuf = strings.toBuffer();
  const bodyBuf = Buffer.from(body);

  const stringTableOffset = 16 + bodyBuf.length;
  const header = Buffer.alloc(16);
  MAGIC.copy(header, 0);
  header.writeUInt32LE(VERSION, 4);
  header.writeUInt32LE(stringTableOffset, 8);
  header.writeUInt32LE(bodyBuf.length, 12);

  return Buffer.concat([header, bodyBuf, stringBuf]);
}

function encodeVarstring(out: number[], strings: StringTable, s: string): void {
  // Interned-by-value form: vu32 string-table index. Empty string is index 0
  // by convention if encountered first.
  writeVU32(out, strings.intern(s));
}

function writeNode(out: number[], strings: StringTable, node: GazetteerNode): void {
  let flags = 0;
  if (node.aliases && node.aliases.length > 0) flags |= 0x01;
  if (node.children && node.children.length > 0) flags |= 0x02;
  if (node.geometry) flags |= 0x04;
  if (node.startYear !== undefined || node.endYear !== undefined) flags |= 0x08;
  out.push(flags);

  if (node.type === 'world' || node.type === 'continent' || node.type === 'country') {
    out.push(FIXED_TYPE_CODES[node.type]);
  } else {
    out.push(TYPE_ADMIN_VARIABLE);
    encodeVarstring(out, strings, node.type);
  }

  writeVU32(out, strings.intern(node.name));
  writeI32LE(out, Math.round(node.lat * 1e6));
  writeI32LE(out, Math.round(node.lon * 1e6));

  if (flags & 0x01) {
    writeVU32(out, node.aliases!.length);
    for (const a of node.aliases!) writeVU32(out, strings.intern(a));
  }
  if (flags & 0x08) {
    writeI32LE(out, node.startYear ?? -2147483648);
    writeI32LE(out, node.endYear ?? -2147483648);
  }
  if (flags & 0x04) writeGeometry(out, node.geometry!);
  if (flags & 0x02) {
    writeVU32(out, node.children!.length);
    for (const c of node.children!) writeNode(out, strings, c);
  }
}

function writeI32LE(out: number[], n: number): void {
  out.push(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff);
}

function writeGeometry(out: number[], geom: GazetteerGeometry): void {
  if (geom.type === 'Polygon') {
    out.push(1);
    writePolygon(out, geom.coordinates);
  } else if (geom.type === 'MultiPolygon') {
    out.push(2);
    writeVU32(out, geom.coordinates.length);
    for (const poly of geom.coordinates) writePolygon(out, poly);
  } else {
    throw new Error(`binary gazetteer: unknown geometry type ${(geom as { type: string }).type}`);
  }
}

function writePolygon(out: number[], rings: number[][][]): void {
  writeVU32(out, rings.length);
  for (const ring of rings) {
    writeVU32(out, ring.length);
    let lastLat = 0;
    let lastLon = 0;
    for (const [lon, lat] of ring) {
      // GeoJSON convention: [lon, lat]. Delta-encode against previous point.
      const latI = Math.round(lat * 1e6);
      const lonI = Math.round(lon * 1e6);
      writeI32LE(out, latI - lastLat);
      writeI32LE(out, lonI - lastLon);
      lastLat = latI;
      lastLon = lonI;
    }
  }
}

function writeSource(out: number[], strings: StringTable, src: GazetteerSource): void {
  // Real-world gazetteers in src/api/place-gazetteers/data/ sometimes omit
  // fields the type calls "required" (e.g. several boundary files have no
  // `fetched` date). Coalesce to '' so the round-trip is structural — we
  // round-trip what the JSON actually says, not what TypeScript says it
  // should say.
  encodeVarstring(out, strings, src.name ?? '');
  encodeVarstring(out, strings, src.url ?? '');
  encodeVarstring(out, strings, src.license ?? '');
  encodeVarstring(out, strings, src.created ?? '');
  encodeVarstring(out, strings, src.fetched ?? '');
  encodeVarstring(out, strings, src.kgmid ?? '');
}

function writeNormalize(out: number[], strings: StringTable, n: GazetteerNormalizeRules): void {
  writeStringArray(out, strings, n.stripSuffixes ?? []);
  writeStringArray(out, strings, n.stripPatterns ?? []);
  writeStringArray(out, strings, n.stripPrefixes ?? []);
}

function writeStringArray(out: number[], strings: StringTable, arr: string[]): void {
  writeVU32(out, arr.length);
  for (const s of arr) encodeVarstring(out, strings, s);
}

function writeContributions(
  out: number[],
  strings: StringTable,
  contribs: NonNullable<Gazetteer['contributions']>,
): void {
  writeVU32(out, contribs.length);
  for (const c of contribs) {
    writeStringArray(out, strings, c.parentPath);
    writeVU32(out, c.nodes.length);
    for (const n of c.nodes) writeNode(out, strings, n);
  }
}

// --- Decoder ---

export function decodeGazetteer(buf: Buffer): Gazetteer {
  if (buf.length < 4 || buf.compare(MAGIC, 0, 4, 0, 4) !== 0) {
    throw new Error('binary gazetteer: bad magic / not SLG1 format');
  }
  if (buf.length < 16) throw new Error('binary gazetteer: buffer too short for header');
  const version = buf.readUInt32LE(4);
  if (version !== VERSION) throw new Error(`binary gazetteer: unsupported version ${version}`);
  const stringTableOffset = buf.readUInt32LE(8);
  // body_length not strictly needed for read but validates header
  buf.readUInt32LE(12);

  // Read string table first so body indices resolve.
  const stCursor = { offset: stringTableOffset };
  const strings = StringTable.read(buf, stCursor);

  const cursor = { offset: 16 };
  const id = readVarstring(buf, cursor, strings);
  const name = readVarstring(buf, cursor, strings);
  const locale = readVarstring(buf, cursor, strings);
  const description = readVarstring(buf, cursor, strings);
  const shapeCode = buf[cursor.offset++];
  const kindCode = buf[cursor.offset++];
  const flags = buf[cursor.offset++];

  const out: Gazetteer = { id, name, locale };
  if (description) out.description = description;
  const shape = invertShape(shapeCode);
  if (shape) out.shape = shape;
  const kind = invertKind(kindCode);
  if (kind) out.kind = kind;

  if (flags & 0x04) out.source = readSource(buf, cursor, strings);
  if (flags & 0x08) out.normalize = readNormalize(buf, cursor, strings);
  if (flags & 0x10) {
    out.translations = JSON.parse(readVarstring(buf, cursor, strings)) as Gazetteer['translations'];
  }
  if (flags & 0x01) out.root = readNode(buf, cursor, strings);
  if (flags & 0x02) out.contributions = readContributions(buf, cursor, strings);

  return out;
}

function readVarstring(buf: Buffer, cursor: { offset: number }, strings: string[]): string {
  const idx = readVU32(buf, cursor);
  if (idx >= strings.length) throw new Error(`binary gazetteer: string index ${idx} out of range`);
  return strings[idx];
}

function invertShape(code: number): Gazetteer['shape'] | undefined {
  if (code === 0) return undefined;
  if (code === 1) return 'scaffolding';
  if (code === 2) return 'contributions';
  if (code === 3) return 'language';
  throw new Error(`binary gazetteer: unknown shape code ${code}`);
}

function invertKind(code: number): Gazetteer['kind'] | undefined {
  if (code === 0) return undefined;
  if (code === 1) return 'point';
  if (code === 2) return 'boundary';
  if (code === 3) return 'language';
  throw new Error(`binary gazetteer: unknown kind code ${code}`);
}

function readI32LE(buf: Buffer, cursor: { offset: number }): number {
  const v = buf.readInt32LE(cursor.offset);
  cursor.offset += 4;
  return v;
}

function readNode(buf: Buffer, cursor: { offset: number }, strings: string[]): GazetteerNode {
  const flags = buf[cursor.offset++];
  const typeCode = buf[cursor.offset++];
  let type: GazetteerNodeType;
  if (typeCode === 0) type = 'world';
  else if (typeCode === 1) type = 'continent';
  else if (typeCode === 2) type = 'country';
  else if (typeCode === TYPE_ADMIN_VARIABLE) {
    type = readVarstring(buf, cursor, strings) as GazetteerNodeType;
  } else throw new Error(`binary gazetteer: unknown type code ${typeCode}`);

  const name = readVarstring(buf, cursor, strings);
  const latI = readI32LE(buf, cursor);
  const lonI = readI32LE(buf, cursor);

  const node: GazetteerNode = { name, type, lat: latI / 1e6, lon: lonI / 1e6 };

  if (flags & 0x01) {
    const count = readVU32(buf, cursor);
    const aliases: string[] = [];
    for (let i = 0; i < count; i++) aliases.push(readVarstring(buf, cursor, strings));
    node.aliases = aliases;
  }
  if (flags & 0x08) {
    const sy = readI32LE(buf, cursor);
    const ey = readI32LE(buf, cursor);
    if (sy !== -2147483648) node.startYear = sy;
    if (ey !== -2147483648) node.endYear = ey;
  }
  if (flags & 0x04) node.geometry = readGeometry(buf, cursor);
  if (flags & 0x02) {
    const count = readVU32(buf, cursor);
    const children: GazetteerNode[] = [];
    for (let i = 0; i < count; i++) children.push(readNode(buf, cursor, strings));
    node.children = children;
  }
  return node;
}

function readGeometry(buf: Buffer, cursor: { offset: number }): GazetteerGeometry {
  const t = buf[cursor.offset++];
  if (t === 1) {
    return { type: 'Polygon', coordinates: readPolygon(buf, cursor) };
  } else if (t === 2) {
    const count = readVU32(buf, cursor);
    const polys: number[][][][] = [];
    for (let i = 0; i < count; i++) polys.push(readPolygon(buf, cursor));
    return { type: 'MultiPolygon', coordinates: polys };
  }
  throw new Error(`binary gazetteer: unknown geometry type code ${t}`);
}

function readPolygon(buf: Buffer, cursor: { offset: number }): number[][][] {
  const ringCount = readVU32(buf, cursor);
  const rings: number[][][] = [];
  for (let r = 0; r < ringCount; r++) {
    const pointCount = readVU32(buf, cursor);
    const ring: number[][] = [];
    let lastLat = 0;
    let lastLon = 0;
    for (let p = 0; p < pointCount; p++) {
      const dLat = readI32LE(buf, cursor);
      const dLon = readI32LE(buf, cursor);
      lastLat += dLat;
      lastLon += dLon;
      // GeoJSON convention: [lon, lat]
      ring.push([lastLon / 1e6, lastLat / 1e6]);
    }
    rings.push(ring);
  }
  return rings;
}

function readSource(buf: Buffer, cursor: { offset: number }, strings: string[]): GazetteerSource {
  const name = readVarstring(buf, cursor, strings);
  const url = readVarstring(buf, cursor, strings);
  const license = readVarstring(buf, cursor, strings);
  const created = readVarstring(buf, cursor, strings);
  const fetched = readVarstring(buf, cursor, strings);
  const kgmid = readVarstring(buf, cursor, strings);
  // Match writeSource's structural round-trip: empty strings round-trip back
  // to "field not present". The type declares some of these required; real
  // bundled gazetteers don't always carry them.
  const out = { name, url, license } as GazetteerSource;
  if (fetched) out.fetched = fetched;
  if (created) out.created = created;
  if (kgmid) out.kgmid = kgmid;
  return out;
}

function readNormalize(
  buf: Buffer,
  cursor: { offset: number },
  strings: string[],
): GazetteerNormalizeRules {
  return {
    stripSuffixes: readStringArray(buf, cursor, strings),
    stripPatterns: readStringArray(buf, cursor, strings),
    stripPrefixes: readStringArray(buf, cursor, strings),
  };
}

function readStringArray(buf: Buffer, cursor: { offset: number }, strings: string[]): string[] {
  const count = readVU32(buf, cursor);
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(readVarstring(buf, cursor, strings));
  return out;
}

function readContributions(
  buf: Buffer,
  cursor: { offset: number },
  strings: string[],
): NonNullable<Gazetteer['contributions']> {
  const count = readVU32(buf, cursor);
  const out: NonNullable<Gazetteer['contributions']> = [];
  for (let i = 0; i < count; i++) {
    const parentPath = readStringArray(buf, cursor, strings);
    const nodeCount = readVU32(buf, cursor);
    const nodes: GazetteerNode[] = [];
    for (let n = 0; n < nodeCount; n++) nodes.push(readNode(buf, cursor, strings));
    out.push({ parentPath, nodes });
  }
  return out;
}
