// GEDCOM 5.5.1 / 7.0 tag <-> event_type bidirectional map.
// Source of truth for both round-trip and renderer-side fact-shape detection.
// Pure TypeScript, no Electron dependencies — safe for src/api/.

export const EVENT_TYPE_TO_GEDCOM_TAG: Record<string, string> = {
  birth: 'BIRT', death: 'DEAT', christening: 'CHR', burial: 'BURI',
  baptism: 'BAPM', confirmation: 'CONF', occupation: 'OCCU',
  residence: 'RESI', education: 'EDUC', emigration: 'EMIG',
  immigration: 'IMMI', naturalization: 'NATU', census: 'CENS',
  probate: 'PROB', will: 'WILL', graduation: 'GRAD', retirement: 'RETI',
  marriage: 'MARR', divorce: 'DIV', engagement: 'ENGA', adoption: 'ADOP',
  ordination: 'ORDN', military: '_MILT', mention: 'EVEN',
  wedding: 'MARR', foster_placement: 'EVEN', travel: 'EVEN',
  // Fact-shaped event types — value lives in events.value, round-trips as line value.
  title: 'TITL', religion: 'RELI', description: 'DSCR', fact: 'FACT',
  other: 'EVEN',
};

// GEDCOM tags whose line value is meaningful per the GEDCOM 5.5.1 spec.
// These map to GEDCOM-X "Fact.value" — the primary value of the fact.
// Events whose tag is NOT in this set should not have a non-empty line value.
export const FACT_VALUE_GEDCOM_TAGS = new Set<string>([
  'OCCU', 'RELI', 'EDUC', 'TITL', 'PROP', 'NATI',
  // ArkivDigital's spelling of TITL. Its line value is the title itself
  // ('Soldat'), so it belongs here or the value is parsed and discarded.
  '_TITLE',
  'NCHI', 'NMR', 'SSN', 'IDNO', 'CAST', 'DSCR',
  'FACT', 'EVEN',
]);

export function eventTypeHasFactValue(eventType: string): boolean {
  const tag = EVENT_TYPE_TO_GEDCOM_TAG[eventType];
  return tag ? FACT_VALUE_GEDCOM_TAGS.has(tag) : false;
}

// Returns the i18n key to use as the label of the value field for a given event type.
export function valueFieldI18nKey(eventType: string): string {
  const tag = EVENT_TYPE_TO_GEDCOM_TAG[eventType];
  switch (tag) {
    case 'OCCU': return 'events.value.occupation';
    case 'EDUC': return 'events.value.education';
    case 'RELI': return 'events.value.religion';
    case 'TITL': return 'events.value.title';
    case 'DSCR': return 'events.value.description_dscr';
    case 'PROP': return 'events.value.property';
    case 'NATI': return 'events.value.nationality';
    case 'NCHI': return 'events.value.children_count';
    case 'NMR':  return 'events.value.marriages_count';
    case 'SSN':  return 'events.value.ssn';
    case 'IDNO': return 'events.value.id_number';
    case 'CAST': return 'events.value.caste';
    case 'FACT': return 'events.value.fact';
    case 'EVEN': return 'events.value.event';
    default:     return 'events.value.event';
  }
}
