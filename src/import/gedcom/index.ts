// Public API for the GEDCOM importer.
// Same signature as src/gedcom/importer.ts — drop-in replacement.
export { importGedcom } from './import-core';
export type { ImportOptions, ImportReport, ValidationReport, UnmappedItem } from './import-core';
export { detectGedcomVersion } from './detect';
export type { GedcomVersion } from './detect';
