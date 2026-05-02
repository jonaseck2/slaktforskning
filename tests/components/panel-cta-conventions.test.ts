import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const COMPONENTS_DIR = resolve(__dirname, '../../src/renderer/components');

function listFiles(dir: string, suffix: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isFile() && d.name.endsWith(suffix))
    .map(d => join(dir, d.name));
}

const panelFiles = [
  ...listFiles(COMPONENTS_DIR, 'Panel.vue'),
  ...listFiles(COMPONENTS_DIR, 'Section.vue'),
];

// Convention 1
describe('panel CTA conventions: no raw ✕ glyph in panels/sections', () => {
  it.each(panelFiles)('%s does not use raw &#10005; in a button', (file) => {
    const src = readFileSync(file, 'utf8');
    const buttonGlyph = /<(button|AppButton)\b[^>]*>\s*&#10005;\s*<\/(button|AppButton)>/;
    expect(
      buttonGlyph.test(src),
      `${file} contains a raw &#10005; glyph inside a button. Use <IconUnlink /> for unlink (severs link, keeps entity) or <IconTrash /> for delete (destroys row). The ✕ glyph is reserved for modal close affordances in src/renderer/components/modals/.`,
    ).toBe(false);
  });
});

// Convention 2
const SELECT_EMITTING_TABLES = ['GroupsTable', 'ResearchTasksTable', 'PersonNamesTable'] as const;

describe('panel CTA conventions: select-emitting tables are wired', () => {
  for (const table of SELECT_EMITTING_TABLES) {
    it.each(listFiles(COMPONENTS_DIR, 'Panel.vue'))(`%s wires @select when mounting <${table}>`, (file) => {
      const src = readFileSync(file, 'utf8');
      const mountRegex = new RegExp(`<${table}\\b([^>]*?)/?>`, 'g');
      const mounts = [...src.matchAll(mountRegex)];
      for (const m of mounts) {
        const attrs = m[1];
        expect(
          /@select=/.test(attrs),
          `${file} mounts <${table}> without @select. Rows in ${table} announce role="button" and emit 'select' on click; without @select they are dead. Wire @select="(id) => router.push(...)" or open a modal.`,
        ).toBe(true);
      }
    });
  }
});
