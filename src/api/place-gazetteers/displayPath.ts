// Scaffolding levels are present in every gazetteer path so that names
// disambiguate across continents and sources (e.g. "Georgia" the country vs
// the US state). They are infrastructure, not user-visible context — the
// genealogist already knows which country they're in. Strip them when rendering.
//
// Kept here (not in renderer/utils) so api/checks can produce the same
// scaffold-free strings in user-facing quality-check messages.
const SCAFFOLDING_HEAD: ReadonlySet<string> = new Set([
  'World',
  'Africa',
  'Antarctica',
  'Asia',
  'Europe',
  'North America',
  'Oceania',
  'South America',
]);

export function stripScaffolding(path: readonly string[]): string[] {
  let i = 0;
  while (i < path.length && SCAFFOLDING_HEAD.has(path[i])) i++;
  return path.slice(i);
}

export function displayPlacePath(path: readonly string[], separator = ' › '): string {
  return stripScaffolding(path).join(separator);
}
