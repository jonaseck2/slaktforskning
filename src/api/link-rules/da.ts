import type { LinkRule } from '../source-linker';

export const daRules: LinkRule[] = [
  {
    id: 'arkivalieronline',
    name: 'Arkivalieronline (AO)',
    pattern: 'AO:\\s*(\\d+)',
    urlTemplate: 'https://www.sa.dk/ao-soegesider/da/billedviser?bession=$1',
    example: 'AO: 12345',
    locale: 'da',
    enabled: true,
    priority: 10,
  },
  {
    id: 'kip',
    name: 'KIP (KildeIndtastningsProjektet)',
    pattern: 'KIP:\\s*(.+?)(?:\\s*,|\\s*$)',
    urlTemplate: 'https://kip.rfrn.dk/search?q=$1',
    example: 'KIP: Odense 1787',
    locale: 'da',
    enabled: true,
    priority: 10,
  },
];
