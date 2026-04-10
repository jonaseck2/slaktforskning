import type { LinkRule } from '../source-linker';

export const enRules: LinkRule[] = [
  {
    id: 'familysearch-ark',
    name: 'FamilySearch ARK',
    pattern: 'ark:/61903/([^\\s,;)]+)',
    urlTemplate: 'https://www.familysearch.org/ark:/61903/$1',
    locale: 'en',
    enabled: true,
    priority: 10,
  },
  {
    id: 'findagrave',
    name: 'FindAGrave Memorial',
    pattern: 'Find\\s*[Aa]\\s*Grave[^0-9]*(\\d{5,})',
    urlTemplate: 'https://www.findagrave.com/memorial/$1',
    locale: 'en',
    enabled: true,
    priority: 20,
  },
  {
    id: 'ancestry-record',
    name: 'Ancestry Record',
    pattern: 'ancestry\\.com/discoveryui-content/view/(\\d+):(\\d+)',
    urlTemplate: 'https://www.ancestry.com/discoveryui-content/view/$1:$2',
    locale: 'en',
    enabled: true,
    priority: 20,
  },
  {
    id: 'familysearch-film',
    name: 'FamilySearch Film',
    pattern: '[Ff]ilm\\s*#?\\s*(\\d{6,})',
    urlTemplate: 'https://www.familysearch.org/search/film/$1',
    locale: 'en',
    enabled: true,
    priority: 30,
  },
];
