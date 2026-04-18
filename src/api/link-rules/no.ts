import type { LinkRule } from '../source-linker';

export const noRules: LinkRule[] = [
  {
    id: 'digitalarkivet',
    name: 'Digitalarkivet',
    pattern: 'DA:\\s*(.+?)(?:\\s*,|\\s*$)',
    urlTemplate: 'https://www.digitalarkivet.no/search/persons?q=$1',
    example: 'DA: Bergen 1801',
    locale: 'no',
    enabled: true,
    priority: 10,
  },
  {
    id: 'arkivverket',
    name: 'Arkivverket',
    pattern: 'arkivverket\\.no/[^\\s<>"\\)\\]]+',
    urlTemplate: '$0',
    example: 'arkivverket.no/search/archives',
    locale: 'no',
    enabled: true,
    priority: 20,
  },
];
