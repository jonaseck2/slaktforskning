// ── SUBM: collect submitter name + contact info ───────────────────────────
//
// SUBM identifies the submitter — the genealogist filing the file. The
// exporter writes our researcher_* settings out as a single SUBM record with
// NAME / ADDR / PHON / EMAIL; the importer mirrors that.
//
// • NAME values feed person-matching to set default_person_id (tree subject).
// • The first SUBM that has a NAME also contributes contact info to populate
//   researcher_address / researcher_phone / researcher_email at end-of-import
//   (only if those settings are currently empty — see import-core.ts).

import type { ImportContext } from '../import-types';
import { getChild } from '../node-utils';

export async function phaseSubmitters(ctx: ImportContext): Promise<void> {
  for (const node of ctx.tree) {
    if (node.tag !== 'SUBM') continue;
    const name = getChild(node, 'NAME')?.value;
    if (!name) continue;
    ctx.submitterNames.push(name.trim());
    if (!ctx.submitterContact) {
      // Parser already joined CONT lines into ADDR's value with '\n'.
      const addr = getChild(node, 'ADDR')?.value?.trim();
      const phone = getChild(node, 'PHON')?.value?.trim();
      const email = getChild(node, 'EMAIL')?.value?.trim();
      ctx.submitterContact = {
        address: addr || undefined,
        phone: phone || undefined,
        email: email || undefined,
      };
    }
  }
}
