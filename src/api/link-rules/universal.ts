import type { LinkRule } from '../source-linker';

export const universalRules: LinkRule[] = [
  {
    id: 'plain-url',
    name: 'URL',
    pattern: 'https?://[^\\s<>"\\)\\]]+',
    urlTemplate: '$0',
    locale: '*',
    enabled: true,
    priority: 100,
  },
];
