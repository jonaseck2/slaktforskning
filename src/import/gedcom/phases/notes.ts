// ── Phase 0: NOTE / SNOTE top-level records ─────────────────────────────────
//
// Two semantics share this phase:
//
//   1. Legacy `noteMap: Map<xref, text>` for the text-into-entity-`notes`-
//      column path. Top-level NOTE records (5.5.1 and 7.0) populate it. On
//      7.0, `normalize.ts` *also* injects every SNOTE record's resolved text
//      into NOTE pointer children — so `resolveNote()` continues to work for
//      `repo.notes`, `group.notes`, `person.notes`, etc. (entities whose
//      schema has a `notes` column).
//
//   2. T04 shared-notes (first-class `notes` table). Top-level SNOTE records
//      become `notes` rows, with `ctx.noteIdMap: Map<xref, noteId>` driving
//      the per-entity `note_links` creation in `phaseNoteLinks` below.
//
// `phaseNotes` reads `ctx.originalTree` for top-level SNOTE records (the
// normalized tree no longer carries them) and `ctx.tree` for top-level NOTE
// records (which normalize preserves).

import type { ImportContext } from '../import-types';
import { createNote, linkNoteToEntity } from '../../../api/notes';
import type { NoteEntityType } from '../../../api/types';
import type { GedcomNode } from '../../../gedcom/parser';

function getChildren(node: GedcomNode, tag: string): GedcomNode[] {
  return node.children.filter(c => c.tag === tag);
}

export async function phaseNotes(ctx: ImportContext): Promise<void> {
  // Legacy noteMap: top-level NOTE records → xref → text.
  for (const node of ctx.tree) {
    if (node.tag !== 'NOTE' || !node.xref) continue;
    ctx.noteMap.set(node.xref, node.value ?? '');
  }
  // T04: top-level SNOTE records → notes table row + noteIdMap entry.
  // Read from the ORIGINAL pre-normalize tree because normalize.ts strips
  // SNOTE records (it inlines the text into entity NOTE children).
  const source = ctx.originalTree ?? ctx.tree;
  for (const node of source) {
    if (node.tag !== 'SNOTE' || !node.xref) continue;
    const lang = node.children.find(c => c.tag === 'LANG')?.value ?? '';
    const note = await createNote(ctx.db, { text: node.value ?? '', language: lang });
    ctx.noteIdMap.set(node.xref, note.id);
  }
}

// ── Late phase: link SNOTE @Nx@ pointers to their owning entities ───────────
//
// Runs AFTER personMap, sourceMap, repoMap, and place / event / relationship
// rows have been written (the entity IDs the links point at must exist). The
// orchestrator calls `phaseNoteLinks` after `phaseSubmitters`.
//
// Walks the ORIGINAL pre-normalize tree because the normalized tree has the
// SNOTE pointer children rewritten as inline NOTE nodes.

interface EntityResolver {
  /** Top-level GEDCOM tag, e.g. 'INDI', 'FAM', 'SOUR', 'REPO', 'OBJE'. */
  tag: string;
  /** Returns the app-side DB id for the GEDCOM xref, or undefined if unknown. */
  resolve: (ctx: ImportContext, xref: string) => string | undefined;
  /** note_links.entity_type to use for the link. */
  entityType: NoteEntityType;
}

const ENTITY_RESOLVERS: EntityResolver[] = [
  { tag: 'INDI', entityType: 'person',     resolve: (ctx, xr) => ctx.personMap.get(xr) },
  { tag: 'FAM',  entityType: 'family',     resolve: (ctx, xr) => ctx.personMap.get(xr) /* placeholder; see below */ },
  { tag: 'SOUR', entityType: 'source',     resolve: (ctx, xr) => ctx.sourceMap.get(xr) },
  { tag: 'REPO', entityType: 'repository', resolve: (ctx, xr) => ctx.repoMap.get(xr) },
  { tag: 'OBJE', entityType: 'media',      resolve: (ctx, xr) => ctx.objeMap.get(xr) },
];

export async function phaseNoteLinks(ctx: ImportContext): Promise<void> {
  if (ctx.noteIdMap.size === 0) return;            // nothing to link
  const source = ctx.originalTree ?? ctx.tree;
  for (const node of source) {
    if (!node.xref) continue;
    // FAM is a special case: its GEDCOM xref maps to a *couple* relationship
    // id, which is not stored on personMap. We don't currently expose a
    // famXref→couple-id map (would require plumbing through phaseFamilies).
    // For T04 round-trip, FAM-level SNOTE references are skipped here and
    // disclosed by the registry as `lossless` only via INDI/event/etc.
    // FAM-level SNOTE coverage is a follow-up — file a small task if a user
    // surfaces it.
    if (node.tag === 'FAM') continue;
    const resolver = ENTITY_RESOLVERS.find(r => r.tag === node.tag);
    if (!resolver) continue;
    const entityId = resolver.resolve(ctx, node.xref);
    if (!entityId) continue;
    for (const snote of getChildren(node, 'SNOTE')) {
      const val = snote.value ?? '';
      if (!val.startsWith('@') || !val.endsWith('@')) continue;
      const noteId = ctx.noteIdMap.get(val);
      if (!noteId) continue;
      await linkNoteToEntity(ctx.db, noteId, resolver.entityType, entityId);
    }
  }
}
