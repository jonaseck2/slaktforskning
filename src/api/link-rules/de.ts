import type { LinkRule } from '../source-linker';

export const deRules: LinkRule[] = [
  {
    id: 'archion',
    name: 'Archion',
    pattern: 'Archion:\\s*(.+?)(?:\\s*,|\\s*$)',
    urlTemplate: 'https://www.archion.de/en/search/?search_string=$1',
    example: 'Archion: Taufregister 1680-1720',
    locale: 'de',
    enabled: true,
    priority: 10,
  },
  {
    id: 'matricula',
    name: 'Matricula',
    pattern: 'Matricula:\\s*(.+?)(?:\\s*,|\\s*$)',
    urlTemplate: 'https://data.matricula-online.eu/en/search/?place=$1',
    example: 'Matricula: Wien, St. Stephan',
    locale: 'de',
    enabled: true,
    priority: 10,
  },
  {
    id: 'ancestry-de',
    name: 'Ancestry.de Record',
    pattern: 'ancestry\\.de/discoveryui-content/view/(\\d+):(\\d+)',
    urlTemplate: 'https://www.ancestry.de/discoveryui-content/view/$1:$2',
    example: 'ancestry.de/discoveryui-content/view/45678:1234',
    locale: 'de',
    enabled: true,
    priority: 20,
  },
];
