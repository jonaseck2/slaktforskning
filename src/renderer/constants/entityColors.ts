export const ENTITY_COLORS = {
  person:       { fg: '#4f46e5', hd: '#f5f3ff', border: '#c7d2fe' },
  event:        { fg: '#c2410c', hd: '#fff3e8', border: '#fed7aa' },
  source:       { fg: '#7e22ce', hd: '#faf5ff', border: '#e9d5ff' },
  citation:     { fg: '#166534', hd: '#f0fdf4', border: '#bbf7d0' },
  place:        { fg: '#166534', hd: '#f0fdf4', border: '#bbf7d0' },
  relationship: { fg: '#166534', hd: '#f0fdf4', border: '#bbf7d0' },
  task:         { fg: '#92400e', hd: '#fffbeb', border: '#fde68a' },
} as const;

export type EntityType = keyof typeof ENTITY_COLORS;
