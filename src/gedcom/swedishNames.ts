/**
 * Detects Swedish patronymic surnames and extracts the base given name.
 * Used in the Genney 4.1 import profile.
 *
 * Swedish patronymics (-son / -sson / -dotter / -sdotter) were the norm until
 * roughly 1900. Detecting them lets the importer populate `patronymic_base` so
 * the relationship to the parent's given name is preserved.
 *
 * Examples:
 *   "Johansson"   → "Johan"   (Johan + sson)
 *   "Persdotter"  → "Per"     (Per + sdotter)
 *   "Andersson"   → "Ander"   (Ander + sson)
 *   "Eriksdotter" → "Erik"    (Erik + sdotter)
 *   "Lindström"   → null      (not a patronymic)
 */
export function extractPatronymic(surname: string): string | null {
  const m = surname.match(/^(.+?)(s?son|s?dotter)$/i);
  return m ? m[1] : null;
}
