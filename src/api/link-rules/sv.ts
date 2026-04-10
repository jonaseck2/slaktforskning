import type { LinkRule } from '../source-linker';

export const svRules: LinkRule[] = [
  {
    id: 'arkivdigital-aid',
    name: 'ArkivDigital (AID)',
    pattern: 'AID:\\s*v(\\d+)\\.b(\\d+)(?:\\.s\\d+)?',
    urlTemplate: 'https://app.arkivdigital.se/volume/v$1?image=$2',
    locale: 'sv',
    enabled: true,
    priority: 10,
  },
  {
    id: 'riksarkivet-nad',
    name: 'Riksarkivet (NAD)',
    pattern: 'NAD:\\s*(SE/[A-Za-z]+/\\d+)',
    urlTemplate: 'https://sok.riksarkivet.se/nad?postid=ArkisRef+$1',
    locale: 'sv',
    enabled: true,
    priority: 10,
  },
  {
    id: 'riksarkivet-bildvisning',
    name: 'Riksarkivet Image',
    pattern: 'sok\\.riksarkivet\\.se/bildvisning/([A-Z0-9_]+)',
    urlTemplate: 'https://sok.riksarkivet.se/bildvisning/$1',
    locale: 'sv',
    enabled: true,
    priority: 20,
  },
  {
    id: 'svbf',
    name: 'Sveriges Befolkning',
    pattern: 'SvBf\\d{4}|Sveriges [Bb]efolkning \\d{4}',
    urlTemplate: 'https://www.genealogi.se/',
    locale: 'sv',
    enabled: true,
    priority: 50,
  },
];
