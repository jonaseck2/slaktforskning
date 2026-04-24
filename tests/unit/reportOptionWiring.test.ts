/**
 * Static analysis tests verifying report option wiring is complete and consistent.
 *
 * Three invariants checked:
 *   1. Every prop in a report component's defineProps is actually used in the file
 *      (catches "prop accepted but silently ignored" bugs like the showExtraPhotos regression).
 *   2. Every :prop-name= binding in ReportsView corresponds to a prop in the component.
 *   3. Every v-model="store.X" in ReportPanel's Options binds to a field the store exports.
 *   4. Every boolean option prop in a keepsake report component is bound in ReportsView.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROOT = resolve(__dirname, '../..');

function readFile(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf-8');
}

function toKebab(name: string): string {
  return name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
}

function toCamel(kebab: string): string {
  return kebab.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Extract all prop names from a component's defineProps<{...}>() type block.
 * Handles both multiline and inline (single-line) forms, e.g.:
 *   defineProps<{ personId: string; colorMode?: ColorMode }>()
 *   defineProps<{\n  personId: string;\n  colorMode?: ColorMode;\n}>()
 */
function extractDefinedProps(content: string): string[] {
  const typeMatch = content.match(/defineProps\s*<\s*\{([\s\S]*?)\}\s*>/);
  if (!typeMatch) return [];
  // Match `propName:` or `propName?:` — works for both inline and multiline formats.
  return [...typeMatch[1].matchAll(/\b(\w+)\??\s*:/g)].map(m => m[1]);
}

/**
 * Remove the defineProps/withDefaults block to avoid false-positive usage matches.
 */
function stripDefineProps(content: string): string {
  return content
    .replace(/withDefaults\s*\(\s*defineProps\s*<\s*\{[\s\S]*?\}\s*>\s*\(\s*\)\s*,\s*\{[\s\S]*?\}\s*\)/g, '/* defineProps */')
    .replace(/defineProps\s*<\s*\{[\s\S]*?\}\s*>\s*\(\s*\)/g, '/* defineProps */');
}

/**
 * Return true if propName is referenced in the component outside its declaration.
 * Handles three usage patterns found in this codebase:
 *   • props.propName  (direct props access in script or template)
 *   • :kebab-name=   (prop forwarded to a child component)
 *   • propName       (word in template – Vue 3 allows prop access without "props." prefix)
 */
function isPropUsed(content: string, propName: string): boolean {
  const stripped = stripDefineProps(content);
  const kebab = toKebab(propName);

  if (stripped.includes(`props.${propName}`)) return true;
  if (stripped.includes(`:${kebab}=`)) return true;

  // Direct word reference inside <template>
  const templateContent = stripped.match(/<template>([\s\S]*?)<\/template>/s)?.[1] ?? '';
  return new RegExp(`\\b${propName}\\b`).test(templateContent);
}

/**
 * Parse ReportsView.vue and collect, per component, the camelCase prop names
 * that are bound with :prop-name="...".
 */
function extractReportsViewBindings(): Map<string, string[]> {
  const content = readFile('src/renderer/views/ReportsView.vue');
  const result = new Map<string, string[]>();

  for (const [, name, attrs] of content.matchAll(/<([A-Z][A-Za-z]+Report)\b([\s\S]*?)\/>/g)) {
    const props = [...attrs.matchAll(/:([a-z][a-z-]+)\s*=/g)].map(bm => toCamel(bm[1]));
    const existing = result.get(name) ?? [];
    result.set(name, [...new Set([...existing, ...props])]);
  }
  return result;
}

/**
 * Extract all v-model="store.FIELD" field names from ReportPanel.vue.
 */
function extractPanelCheckboxFields(): string[] {
  const content = readFile('src/renderer/components/ReportPanel.vue');
  return [...new Set([...content.matchAll(/v-model="store\.(\w+)"/g)].map(m => m[1]))];
}

/**
 * Extract the set of identifiers from the useReportConfigStore return block.
 */
function extractStoreExports(content: string): Set<string> {
  const returnBlock = content.match(/return\s*\{([\s\S]*?)\}\s*;\s*\}\)/)?.[1] ?? '';
  return new Set([...returnBlock.matchAll(/\b([a-zA-Z_]\w*)\b/g)].map(m => m[1]));
}

// ---------------------------------------------------------------------------
// Component registry
// ---------------------------------------------------------------------------

const REPORT_COMPONENTS: { name: string; file: string }[] = [
  { name: 'ALifeReport',          file: 'src/renderer/components/reports/ALifeReport.vue' },
  { name: 'AMarriageReport',       file: 'src/renderer/components/reports/AMarriageReport.vue' },
  { name: 'YourAncestorsReport',   file: 'src/renderer/components/reports/YourAncestorsReport.vue' },
  { name: 'PlaceChronicleReport',  file: 'src/renderer/components/reports/PlaceChronicleReport.vue' },
  { name: 'LifeOnOnePageReport',   file: 'src/renderer/components/reports/LifeOnOnePageReport.vue' },
  { name: 'FamilyInYearReport',    file: 'src/renderer/components/reports/FamilyInYearReport.vue' },
  { name: 'PhotoAlbumReport',      file: 'src/renderer/components/reports/PhotoAlbumReport.vue' },
  { name: 'PedigreeChartReport',   file: 'src/renderer/components/reports/PedigreeChartReport.vue' },
  { name: 'HourglassChartReport',  file: 'src/renderer/components/reports/HourglassChartReport.vue' },
  { name: 'DescendantChartReport', file: 'src/renderer/components/reports/DescendantChartReport.vue' },
  { name: 'FanChartReport',        file: 'src/renderer/components/reports/FanChartReport.vue' },
  { name: 'TimelineChartReport',   file: 'src/renderer/components/reports/TimelineChartReport.vue' },
];

const COMPONENT_FILE: Record<string, string> = Object.fromEntries(
  REPORT_COMPONENTS.map(c => [c.name, c.file]),
);

const KEEPSAKE_REPORTS = [
  'ALifeReport', 'AMarriageReport', 'YourAncestorsReport',
  'PlaceChronicleReport', 'LifeOnOnePageReport', 'FamilyInYearReport', 'PhotoAlbumReport',
];

// ---------------------------------------------------------------------------
// Suite 1 – Every defined prop is used somewhere in the component
// ---------------------------------------------------------------------------

describe('report component props: every defineProps entry must be referenced in the component', () => {
  for (const { name, file } of REPORT_COMPONENTS) {
    it(`${name}: no unused props`, () => {
      const content = readFile(file);
      const props = extractDefinedProps(content);
      if (props.length === 0) return;

      const unused = props.filter(p => !isPropUsed(content, p));
      expect(unused, `Unused props in ${name}: ${unused.join(', ')}`).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// Suite 2 – ReportsView bindings match component defineProps
// ---------------------------------------------------------------------------

describe('ReportsView: every :prop-name= binding must exist in the component defineProps', () => {
  const viewBindings = extractReportsViewBindings();

  for (const { name, file } of REPORT_COMPONENTS) {
    it(`${name}: all bound props are defined`, () => {
      const bound = viewBindings.get(name);
      if (!bound?.length) return;

      const defined = new Set(extractDefinedProps(readFile(file)));
      const unknown = bound.filter(p => !defined.has(p));
      expect(unknown, `Props bound in ReportsView but missing from ${name}: ${unknown.join(', ')}`).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// Suite 3 – Every boolean option prop in a keepsake report is bound in ReportsView
// ---------------------------------------------------------------------------

describe('ReportsView: every boolean option prop in a keepsake report must be bound', () => {
  const viewBindings = extractReportsViewBindings();

  for (const name of KEEPSAKE_REPORTS) {
    it(`${name}: all boolean props are bound`, () => {
      const content = readFile(COMPONENT_FILE[name]);
      const typeBlock = content.match(/defineProps\s*<\s*\{([\s\S]*?)\}\s*>/)?.[1] ?? '';
      const allProps = extractDefinedProps(content);
      const boolProps = allProps.filter(p =>
        new RegExp(`\\b${p}\\??\\s*:\\s*boolean`).test(typeBlock),
      );
      const bound = new Set(viewBindings.get(name) ?? []);
      const unbound = boolProps.filter(p => !bound.has(p));
      expect(unbound, `Boolean props in ${name} not bound in ReportsView: ${unbound.join(', ')}`).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// Suite 4 – ReportPanel checkbox store fields all exist in the store
// ---------------------------------------------------------------------------

describe('ReportPanel: every v-model="store.X" field must be exported from useReportConfigStore', () => {
  it('all panel checkbox fields are valid store exports', () => {
    const storeContent = readFile('src/renderer/stores/reportConfig.ts');
    const exported = extractStoreExports(storeContent);
    const fields = extractPanelCheckboxFields();

    const missing = fields.filter(f => !exported.has(f));
    expect(missing, `Panel checkboxes bound to non-existent store fields: ${missing.join(', ')}`).toEqual([]);
  });
});
