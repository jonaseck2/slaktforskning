import type { Gazetteer, GazetteerNode, PlaceResolveResult, BoundaryResolveResult } from './types';

/**
 * Universal normalization — language-agnostic. Lowercase, trim, collapse
 * whitespace, strip parens (replace `(`/`)` with space), and treat hyphens
 * as equivalent to spaces so `Husby-Rekarne` and `Husby Rekarne` compare
 * equal. No language-specific suffix/prefix vocabulary lives here — that
 * belongs to per-gazetteer rules (see `normalizeForGazetteer`).
 */
function normalizeUniversal(s: string): string {
  return s
    .toLowerCase()
    .replace(/[()]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Per-gazetteer normalization. Runs `normalizeUniversal` first, then strips
 * suffixes / prefixes / patterns declared on the gazetteer itself. Used for
 * both indexing the gazetteer's nodes and for comparing input components.
 */
function normalizeForGazetteer(s: string, gaz: Gazetteer): string {
  let out = normalizeUniversal(s);
  const rules = gaz.normalize;
  if (!rules) return out;

  if (rules.stripSuffixes && rules.stripSuffixes.length > 0) {
    // Strip any trailing whitespace-separated suffix in the list (case-
    // insensitive — the input is already lowercased by normalizeUniversal).
    // Loop because legitimate inputs sometimes stack two ("Roskilde sogn kn").
    let changed = true;
    while (changed) {
      changed = false;
      for (const suf of rules.stripSuffixes) {
        const sufNorm = normalizeUniversal(suf);
        if (!sufNorm) continue;
        if (out === sufNorm) continue; // never strip the whole string
        if (out.endsWith(' ' + sufNorm)) {
          out = out.slice(0, -1 - sufNorm.length).trim();
          changed = true;
          break;
        }
      }
    }
  }

  if (rules.stripPatterns && rules.stripPatterns.length > 0) {
    for (const pat of rules.stripPatterns) {
      try {
        const re = new RegExp(pat, 'i');
        out = out.replace(re, '').replace(/\s+/g, ' ').trim();
      } catch {
        // Skip invalid regex sources rather than throw — gazetteer data is untrusted.
      }
    }
  }

  if (rules.stripPrefixes && rules.stripPrefixes.length > 0) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const pre of rules.stripPrefixes) {
        const preNorm = normalizeUniversal(pre);
        if (!preNorm) continue;
        if (out === preNorm) continue;
        if (out.startsWith(preNorm + ' ')) {
          out = out.slice(preNorm.length + 1).trim();
          changed = true;
          break;
        }
      }
    }
  }

  return out;
}

function nodeMatches(node: GazetteerNode, component: string, gaz: Gazetteer): boolean {
  const norm = normalizeForGazetteer(component, gaz);
  if (normalizeForGazetteer(node.name, gaz) === norm) return true;
  return node.aliases?.some(a => normalizeForGazetteer(a, gaz) === norm) ?? false;
}

interface MatchCandidate {
  path: GazetteerNode[];
  matched: string[];
  unmatched: string[];
  depth: number;
  /**
   * Number of unmatched input components that match a node elsewhere.
   * Set by `findMatches` as a local raw count (in-gazetteer only). For the
   * winner of each gazetteer, `resolvePlace` overwrites this with a global
   * depth-weighted score before cross-gazetteer comparison. Runners-up keep
   * their stale local value — they are not consulted further.
   */
  contradictions: number;
  /** Whether the last input component (typically the broadest geographic scope) matched a node on this path */
  lastComponentMatched: boolean;
  /**
   * Number of path nodes that the input filled in. Differs from `matched.length`
   * (which is the full path length) when the path has unmatched filler nodes.
   * Used as a strong signal — token-scan can promote a deep candidate that
   * consumed multiple input tokens over a shallow root-only candidate.
   */
  pathNodesMatched: number;
}

// Name index: maps gazetteer-normalized name → list of entries. Each entry
// caches the node's pre-normalized name and aliases AND a normPath array
// holding the same data for every ancestor on the way down. findMatches'
// inner loop reads from normPath only — it never touches live GazetteerNode
// fields during a cache hit. The index is per-gazetteer because each
// gazetteer carries its own suffix/prefix vocabulary.
type NormPathEntry = { name: string; aliases: Set<string> };
type NodeEntry = {
  node: GazetteerNode;
  ancestors: GazetteerNode[];
  /** Pre-normalized node name. */
  normName: string;
  /** Pre-normalized aliases as a Set for O(1) membership tests. */
  normAliases: Set<string>;
  /**
   * Pre-normalized [...ancestors, node] in path order. findMatches walks
   * this instead of building a per-anchor list from live node fields, so
   * the warm path performs zero `node.name` reads.
   */
  normPath: NormPathEntry[];
  /**
   * Original (un-normalized) names for [...ancestors, node] in path order.
   * Used to build the `matched` field without touching live GazetteerNode
   * properties during a cache-hit run.
   */
  pathNames: string[];
};
const nameIndexCache = new WeakMap<Gazetteer, Map<string, NodeEntry[]>>();

function getNameIndex(gaz: Gazetteer): Map<string, NodeEntry[]> {
  const cached = nameIndexCache.get(gaz);
  if (cached) return cached;
  const index = new Map<string, NodeEntry[]>();
  function walk(
    node: GazetteerNode,
    ancestors: GazetteerNode[],
    ancestorsNorm: NormPathEntry[],
    ancestorNames: string[],
  ) {
    const nodeName = node.name;
    const normName = normalizeForGazetteer(nodeName, gaz);
    const normAliases = new Set<string>();
    if (node.aliases) {
      for (const alias of node.aliases) {
        const na = normalizeForGazetteer(alias, gaz);
        if (na) normAliases.add(na);
      }
    }
    const selfNorm: NormPathEntry = { name: normName, aliases: normAliases };
    const normPath = [...ancestorsNorm, selfNorm];
    const pathNames = [...ancestorNames, nodeName];
    const entry: NodeEntry = {
      node,
      ancestors,
      normName,
      normAliases,
      normPath,
      pathNames,
    };
    if (!index.has(normName)) index.set(normName, []);
    index.get(normName)!.push(entry);
    for (const na of normAliases) {
      if (na === normName) continue;
      if (!index.has(na)) index.set(na, []);
      index.get(na)!.push(entry);
    }
    if (node.children) {
      const nextAncestors = [...ancestors, node];
      for (const child of node.children) walk(child, nextAncestors, normPath, pathNames);
    }
  }
  walk(gaz.root, [], [], []);
  nameIndexCache.set(gaz, index);
  return index;
}

/**
 * Whitespace-tokenize a component, dropping empties. Used by the token-scan
 * pass that lets a single comma-component satisfy multiple path nodes (e.g.
 * "Stockholm A" matches both Stockholm and the län letter alias `A`).
 */
function tokenizeComponent(s: string): string[] {
  return s.split(/\s+/).filter(Boolean);
}

function findMatches(
  components: string[],
  gaz: Gazetteer,
): MatchCandidate[] {
  const index = getNameIndex(gaz);
  const candidates: MatchCandidate[] = [];
  const lastIndex = components.length - 1;
  // Each anchor node should produce exactly one candidate, even if the same
  // name appears repeatedly in the input ("Stockholm, Stockholm, Sverige").
  const anchored = new Set<GazetteerNode>();

  // Anchor candidates from any whole component OR any whitespace-token of a
  // component. Token-scan widens the seed set so inputs like
  // `(Roskilde) Danmark` (single component after universal normalize) can
  // still anchor on Roskilde or Danmark.
  const seedNorms = new Set<string>();
  for (const component of components) {
    seedNorms.add(normalizeForGazetteer(component, gaz));
    for (const tok of tokenizeComponent(component)) {
      seedNorms.add(normalizeForGazetteer(tok, gaz));
    }
  }

  for (const norm of seedNorms) {
    if (!norm) continue;
    const entries = index.get(norm);
    if (!entries) continue;

    for (const entry of entries) {
      if (anchored.has(entry.node)) continue;
      anchored.add(entry.node);

      const fullPath = [...entry.ancestors, entry.node];
      const pathSet = new Set(fullPath);
      // Greedy 1:1 matching: each input component can satisfy at most one
      // path node — prevents "Iowa" from matching both Iowa (state) and
      // Iowa (county) on the same path. Track input positions (not values)
      // so duplicate component strings each get one shot.
      //
      // Token-scan extension: a single comma-component may also be tried as
      // its whitespace-tokens, so "Stockholm A" can satisfy two path nodes
      // (Stockholm + län letter alias) in one component. The component is
      // counted as matched once any one of its tokens matches.
      // The entry carries a pre-normalized normPath built at index time.
      // Reading it does not touch any live GazetteerNode field — that is
      // the whole point of the cache, and the Task 1 test asserts it
      // (zero name reads on warm calls).
      const normPath = entry.normPath;

      const usedPathIndices = new Set<number>();
      const matchedInputIndices = new Set<number>();
      for (let ci = 0; ci < components.length; ci++) {
        // Build a candidate list of forms for this component: the whole
        // component first (preferred — exact comma-component match), then
        // its tokens (longest-first so multi-word names like "New York"
        // beat "New").
        const whole = normalizeForGazetteer(components[ci], gaz);
        const tokens = tokenizeComponent(components[ci])
          .map(t => normalizeForGazetteer(t, gaz))
          .filter(t => t && t !== whole)
          .sort((a, b) => b.length - a.length);
        const forms = whole ? [whole, ...tokens] : tokens;

        // Allow multiple tokens within the same component to each consume a
        // distinct path node (this is the whole point of the token-scan).
        let matched = false;
        for (const form of forms) {
          for (let pi = 0; pi < normPath.length; pi++) {
            if (usedPathIndices.has(pi)) continue;
            const np = normPath[pi];
            if (np.name === form || np.aliases.has(form)) {
              usedPathIndices.add(pi);
              matched = true;
              if (form === whole) break; // whole-component match: stop, don't double-count tokens
              // For token matches, keep scanning forms so a second token in the
              // same component can match a different path node.
              break;
            }
          }
          if (matched && form === whole) break;
        }
        if (matched) matchedInputIndices.add(ci);
      }
      const remaining = components.filter((_, i) => !matchedInputIndices.has(i));

      // Count contradictions: unmatched components that match nodes
      // ELSEWHERE in the tree (i.e. the input names a place that exists
      // but in a different branch than this candidate).
      let contradictions = 0;
      for (const um of remaining) {
        const umEntries = index.get(normalizeForGazetteer(um, gaz));
        if (umEntries && umEntries.every(e => !pathSet.has(e.node))) {
          contradictions++;
        }
      }

      candidates.push({
        path: fullPath,
        matched: entry.pathNames,
        unmatched: remaining,
        depth: fullPath.length,
        contradictions,
        lastComponentMatched: matchedInputIndices.has(lastIndex),
        pathNodesMatched: usedPathIndices.size,
      });
    }
  }

  return candidates;
}

function pickBest(candidates: MatchCandidate[]): { best: MatchCandidate; ambiguous: boolean } | null {
  if (candidates.length === 0) return null;

  // NOTE: tiebreaker order here differs from `isBetterCandidate` by design.
  // Within one gazetteer, contradictions reflect in-tree conflicts only and
  // are the strongest signal. Across gazetteers, `isBetterCandidate` puts
  // `lastComponentMatched` first because the country/region anchor is the
  // strongest signal for picking the right gazetteer (the contradiction
  // count is then the depth-weighted global score from `resolvePlace`).
  candidates.sort((a, b) => {
    // 1. Fewer contradictions first (unmatched components that exist elsewhere)
    if (a.contradictions !== b.contradictions) return a.contradictions - b.contradictions;
    // 2. Prefer candidates where the last input component matched (geographic anchor)
    // In genealogy, places are formatted specific→general, so the last component
    // is typically the country/region — matching it is a strong signal.
    if (a.lastComponentMatched !== b.lastComponentMatched) return a.lastComponentMatched ? -1 : 1;
    // 3. Fewer unmatched components
    if (a.unmatched.length !== b.unmatched.length) return a.unmatched.length - b.unmatched.length;
    // 4. More path nodes filled by input wins. With token-scan a single
    // component "Roskilde Danmark" can fill two path nodes on the deep
    // Roskilde→Danmark path but only one on the bare Danmark root, and we
    // want the deeper candidate then. Without this rule the depth tiebreaker
    // below would always favor the root-only path.
    if (a.pathNodesMatched !== b.pathNodesMatched) return b.pathNodesMatched - a.pathNodesMatched;
    // 5. Prefer the stem over the leaf: when the same name appears at multiple
    // depths and input fully matches both, the shallower path has fewer
    // "filler" nodes that don't correspond to any input. Example:
    // "California, USA" → prefer USA→California (state) over
    // USA→Maryland→Saint Mary's County→California (CDP).
    return a.depth - b.depth;
  });

  const best = candidates[0];
  // Ambiguous if multiple candidates with the same quality resolve to
  // different leaf nodes (i.e. different geographical locations)
  const sameQuality = candidates.filter(
    c => c.contradictions === best.contradictions &&
         c.unmatched.length === best.unmatched.length
  );
  const distinctLocations = new Set(
    sameQuality.map(c => {
      const node = c.path[c.path.length - 1];
      return `${node.lat},${node.lon}`;
    })
  );
  return { best, ambiguous: distinctLocations.size > 1 };
}

export interface GazetteerSearchHit {
  node: GazetteerNode;
  path: GazetteerNode[];
  gazetteer: string;
}

/**
 * Search for all nodes whose name matches the query, returning every match
 * at every level (county, municipality, locality, etc.).
 */
/**
 * Tokenize a place string into discrete components, handling Swedish
 * conventions where the most specific name is on the LEFT and broader scopes
 * (parish, municipality, county) trail to the right. Parenthesized tokens
 * (e.g. "(T)" for Örebro län) are extracted as separate components.
 *
 * Example: "Hörningsholm, Mosås (T)" → ["Hörningsholm", "Mosås", "T"]
 */
export function tokenizePlaceString(input: string): string[] {
  const tokens: string[] = [];
  // Split on commas first; then within each part, pull out anything in parens
  // as its own token. This preserves the order specific → general.
  for (const part of input.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    // Match all parenthesized groups; collect them and the surrounding text
    const parenRe = /\(([^)]+)\)/g;
    const parens: string[] = [];
    const stripped = trimmed.replace(parenRe, (_m, g1) => {
      parens.push(String(g1).trim());
      return ' ';
    }).trim();
    if (stripped) tokens.push(stripped);
    for (const p of parens) {
      if (p) tokens.push(p);
    }
  }
  return tokens;
}

export interface HierarchicalMatch {
  /** The matched gazetteer node */
  node: GazetteerNode;
  /** Full path to this node (root → ... → node) */
  path: GazetteerNode[];
  /** Gazetteer the match came from */
  gazetteer: string;
  /** Input tokens that the path consumed (right-to-left walk) */
  consumedTokens: string[];
  /** Input tokens to the LEFT of the deepest match — typically a leaf
   * (farm/locality) name not present in any gazetteer */
  unmatchedLeftTokens: string[];
}

export interface HierarchicalResolveResult {
  /** Best match across all gazetteers (deepest path consuming the most
   * right-side tokens). Null when no token matches anything. */
  best: HierarchicalMatch | null;
  /** All viable matches sorted best-first. Useful for picker suggestions. */
  candidates: HierarchicalMatch[];
  /** Tokens parsed from the input (specific → general) */
  tokens: string[];
}

/**
 * Walk an input place string right-to-left, anchoring on the broadest
 * geographic token first and then narrowing on each more-specific token.
 *
 * In Swedish genealogical writing, place strings run specific → general:
 * `farm, parish, municipality, län` (and often a parenthesized county
 * letter code). Bengt #27: "Hörningsholm, Mosås (T)" — the picker should
 * read `(T)` first, anchor on Örebro län, then look for "Mosås" only
 * inside Örebro län (not in Norrland), and use "Hörningsholm" as a
 * leaf name (a farm not in any gazetteer).
 *
 * Each successful right-to-left match constrains the search space for the
 * next more-specific token. The final unmatched tokens to the left are
 * returned as `unmatchedLeftTokens` — typically the leaf farm/locality
 * name the user wants to create a Place for.
 */
export function resolveHierarchical(
  input: string,
  gazetteers: Gazetteer[],
): HierarchicalResolveResult {
  const tokens = tokenizePlaceString(input);
  if (tokens.length === 0 || gazetteers.length === 0) {
    return { best: null, candidates: [], tokens };
  }

  const matches: HierarchicalMatch[] = [];

  for (const gaz of gazetteers) {
    // Skip language gazetteers — they don't carry coordinates we want to use
    if (gaz.kind === 'language') continue;
    const index = getNameIndex(gaz);

    // Walk tokens right-to-left. For the rightmost matched token, all
    // entries in the index that match it are candidate anchors. Then for
    // each anchor, walk further left and try to find descendants.
    // We explore every anchor candidate so that ambiguous broad tokens
    // (e.g. "Stockholm" matches county and city) still produce candidates.
    const reversed = [...tokens].reverse();

    function explore(
      tokenIdx: number,                  // index in reversed (broadest first)
      anchorPath: GazetteerNode[],       // path from root to current anchor
      consumed: string[],
    ): void {
      if (tokenIdx >= reversed.length) {
        // All tokens consumed — record match
        matches.push({
          node: anchorPath[anchorPath.length - 1],
          path: anchorPath,
          gazetteer: gaz.id,
          consumedTokens: consumed,
          unmatchedLeftTokens: [],
        });
        return;
      }
      const tok = reversed[tokenIdx];
      const norm = normalizeForGazetteer(tok, gaz);
      // Find descendants of the current anchor whose name/alias === tok
      const anchor = anchorPath[anchorPath.length - 1];
      const childMatches = findDescendantMatches(anchor, norm, gaz);
      if (childMatches.length === 0) {
        // The current token doesn't match anything inside this anchor.
        // Stop here and record the match so far; tokens to the LEFT
        // (more specific) become the unmatched leaf tokens.
        const remainingLeft = reversed.slice(tokenIdx).reverse();
        matches.push({
          node: anchor,
          path: anchorPath,
          gazetteer: gaz.id,
          consumedTokens: consumed,
          unmatchedLeftTokens: remainingLeft,
        });
        return;
      }
      // Recurse into each descendant match
      for (const cm of childMatches) {
        explore(tokenIdx + 1, [...anchorPath, ...cm.relPath], [...consumed, tok]);
      }
    }

    // Seed: any node in the index that matches the rightmost (broadest)
    // token serves as a starting anchor. We don't restrict to root — Bengt
    // #27 type strings often skip the country.
    const rightmost = reversed[0];
    const seedEntries = index.get(normalizeForGazetteer(rightmost, gaz));
    if (seedEntries) {
      const seenAnchors = new Set<GazetteerNode>();
      for (const entry of seedEntries) {
        if (seenAnchors.has(entry.node)) continue;
        seenAnchors.add(entry.node);
        const path = [...entry.ancestors, entry.node];
        explore(1, path, [rightmost]);
      }
    }
  }

  if (matches.length === 0) {
    return { best: null, candidates: [], tokens };
  }

  // Score each candidate: more consumed tokens = better. Ties broken by
  // path depth (prefer specific levels) and fewer unmatched tokens.
  matches.sort((a, b) => {
    if (a.consumedTokens.length !== b.consumedTokens.length) {
      return b.consumedTokens.length - a.consumedTokens.length;
    }
    if (a.path.length !== b.path.length) return b.path.length - a.path.length;
    if (a.unmatchedLeftTokens.length !== b.unmatchedLeftTokens.length) {
      return a.unmatchedLeftTokens.length - b.unmatchedLeftTokens.length;
    }
    return 0;
  });

  return { best: matches[0], candidates: matches, tokens };
}

/**
 * Find descendants of `anchor` whose name (or alias) normalizes to `norm`.
 * Returns relative path segments from anchor down to each match.
 */
function findDescendantMatches(
  anchor: GazetteerNode,
  norm: string,
  gaz: Gazetteer,
): Array<{ relPath: GazetteerNode[] }> {
  const out: Array<{ relPath: GazetteerNode[] }> = [];
  function walk(node: GazetteerNode, rel: GazetteerNode[]) {
    if (!node.children) return;
    for (const child of node.children) {
      const childRel = [...rel, child];
      const childNorm = normalizeForGazetteer(child.name, gaz);
      const matched =
        childNorm === norm ||
        (child.aliases?.some(a => normalizeForGazetteer(a, gaz) === norm) ?? false);
      if (matched) {
        out.push({ relPath: childRel });
      }
      walk(child, childRel);
    }
  }
  walk(anchor, []);
  return out;
}

export function searchGazetteer(
  query: string,
  gazetteers: Gazetteer[],
  limit = 10,
): GazetteerSearchHit[] {
  if (!query.trim() || gazetteers.length === 0) return [];
  if (!normalizeUniversal(query)) return [];

  const hits: GazetteerSearchHit[] = [];

  function walk(node: GazetteerNode, path: GazetteerNode[], gaz: Gazetteer) {
    const currentPath = [...path, node];
    if (nodeMatches(node, query, gaz)) {
      hits.push({ node, path: currentPath, gazetteer: gaz.id });
    }
    if (hits.length >= limit) return;
    if (node.children) {
      for (const child of node.children) {
        walk(child, currentPath, gaz);
        if (hits.length >= limit) return;
      }
    }
  }

  for (const gaz of gazetteers) {
    walk(gaz.root, [], gaz);
    if (hits.length >= limit) break;
  }

  return hits;
}

function isBetterCandidate(a: MatchCandidate, b: MatchCandidate): boolean {
  // 1. Last component = broadest geographic scope (country/region) — strongest signal.
  //    "Pitcairn, Skottland" matching Scotland beats matching Pitcairn, PA.
  if (a.lastComponentMatched !== b.lastComponentMatched) return a.lastComponentMatched;
  // 2. Fewer contradictions (unmatched components that exist elsewhere)
  if (a.contradictions !== b.contradictions) return a.contradictions < b.contradictions;
  // 3. Fewer unmatched components
  if (a.unmatched.length !== b.unmatched.length) return a.unmatched.length < b.unmatched.length;
  // 4. More path nodes filled by input — see pickBest comment.
  if (a.pathNodesMatched !== b.pathNodesMatched) return a.pathNodesMatched > b.pathNodesMatched;
  // 5. Prefer the stem: shallower path = fewer filler nodes when input fully
  //    matches at multiple depths (e.g. "California, USA" → state, not CDP).
  return a.depth < b.depth;
}

// Cache: per-gazetteer name → minimum depth, built lazily and keyed on root
// identity via WeakMap so the entry survives any number of caller-side
// gazetteer-array reshuffles. Once a gazetteer root is walked we never re-walk
// it. The merged depth map for a given gazetteer-array call is rebuilt by
// iterating the (already-built) per-gazetteer maps — cheap.
//
// Keys are universal-normalized (no per-gazetteer suffix vocabulary applied)
// because contradiction lookups need to work across gazetteers, and a
// component normalized for gazetteer A wouldn't be findable under gazetteer
// B's key. Since the universal form is the lowest common denominator, any
// hit there means at least one gazetteer indexes that bare form.
const perGazetteerNameDepth = new WeakMap<GazetteerNode, Map<string, number>>();

// Secondary memo for the merged array result: array-identity-keyed via
// WeakMap on the array itself, so callers that hand the same gazetteer-list
// reference repeatedly (the common runAllChecks path) skip the merge step
// entirely. Falls through to the per-root cache when the array identity
// changes (e.g. after a fresh loadGazetteers).
const mergedDepthByArray = new WeakMap<Gazetteer[], Map<string, number>>();

function buildDepthForRoot(root: GazetteerNode): Map<string, number> {
  const cached = perGazetteerNameDepth.get(root);
  if (cached) return cached;
  const map = new Map<string, number>();
  function walk(node: GazetteerNode, depth: number) {
    const keys = [normalizeUniversal(node.name)];
    if (node.aliases) for (const a of node.aliases) keys.push(normalizeUniversal(a));
    for (const k of keys) {
      if (!k) continue;
      const existing = map.get(k);
      if (existing === undefined || depth < existing) map.set(k, depth);
    }
    if (node.children) for (const c of node.children) walk(c, depth + 1);
  }
  walk(root, 1);
  perGazetteerNameDepth.set(root, map);
  return map;
}

function getGlobalNameDepth(gazetteers: Gazetteer[]): Map<string, number> {
  const memo = mergedDepthByArray.get(gazetteers);
  if (memo) return memo;
  const merged = new Map<string, number>();
  for (const gaz of gazetteers) {
    for (const [k, depth] of buildDepthForRoot(gaz.root)) {
      const existing = merged.get(k);
      if (existing === undefined || depth < existing) merged.set(k, depth);
    }
  }
  mergedDepthByArray.set(gazetteers, merged);
  return merged;
}

/**
 * Split a raw place string into comma-components, ALSO splitting on
 * `.` directly followed by an uppercase letter (no whitespace between).
 * This handles abbreviations stuck onto the next country/state name like
 * `Saint-Claude College, Minn.USA` → `["Saint-Claude College", "Minn", "USA"]`.
 */
function splitComponents(placeName: string): string[] {
  return placeName
    .split(/,|\.(?=[A-Z])/)
    .map(p => p.trim())
    .filter(Boolean);
}

export function resolvePlace(
  placeName: string,
  gazetteers: Gazetteer[],
): PlaceResolveResult | null {
  if (!placeName.trim() || gazetteers.length === 0) return null;

  const components = splitComponents(placeName);
  if (components.length === 0) return null;

  // Global name → minimum depth, cached across calls for the same gazetteer set.
  // Shallow entries (countries, depth 1–2) are strong geographic anchors;
  // deep entries (localities, depth 4+) are weak ones.
  const globalNameDepth = getGlobalNameDepth(gazetteers);

  // Collect best candidate per gazetteer, then compute contradiction weight
  // using global depth info so cross-gazetteer conflicts are detected.
  const perGaz: { candidate: MatchCandidate; ambiguous: boolean; gazId: string }[] = [];

  for (const gaz of gazetteers) {
    const candidates = findMatches(components, gaz);
    const picked = pickBest(candidates);
    if (!picked) continue;

    // Compute contradiction weight: sum of 1/depth for each unmatched
    // component that exists in another gazetteer.  Shallow matches (country
    // names) produce large weights; deep matches (localities) produce small
    // ones.  Stored as integer (×1000) to avoid floating-point comparison.
    let weightedContradictions = 0;
    for (const um of picked.best.unmatched) {
      const depth = globalNameDepth.get(normalizeUniversal(um));
      if (depth !== undefined) {
        weightedContradictions += Math.round(1000 / depth);
      }
    }
    picked.best.contradictions = weightedContradictions;

    perGaz.push({ candidate: picked.best, ambiguous: picked.ambiguous, gazId: gaz.id });
  }

  let bestOverall: { candidate: MatchCandidate; ambiguous: boolean; gazId: string } | null = null;
  for (const entry of perGaz) {
    if (!bestOverall || isBetterCandidate(entry.candidate, bestOverall.candidate)) {
      bestOverall = entry;
    }
  }

  if (!bestOverall) return null;

  const { candidate, ambiguous, gazId } = bestOverall;
  const deepestNode = candidate.path[candidate.path.length - 1];
  const isLeaf = !deepestNode.children || deepestNode.children.length === 0;

  let matchQuality: PlaceResolveResult['matchQuality'];
  if (ambiguous) {
    matchQuality = 'ambiguous';
  } else if (candidate.unmatched.length === 0 && isLeaf) {
    matchQuality = 'exact';
  } else {
    matchQuality = 'partial';
  }

  return {
    lat: deepestNode.lat,
    lon: deepestNode.lon,
    matchedPath: candidate.matched,
    matchedNodes: candidate.path,
    matchDepth: candidate.depth,
    matchQuality,
    matchedNode: deepestNode,
    gazetteer: gazId,
    unmatchedComponents: candidate.unmatched,
  };
}

function distanceSq(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = lat1 - lat2;
  const dLon = lon1 - lon2;
  return dLat * dLat + dLon * dLon;
}

export interface BoundaryHint {
  lat: number;
  lon: number;
}

export function resolveBoundary(
  placeName: string,
  gazetteers: Gazetteer[],
  hint?: BoundaryHint,
): BoundaryResolveResult | null {
  if (!placeName.trim() || gazetteers.length === 0) return null;

  const boundaryGazetteers = gazetteers.filter(g => g.kind === 'boundary');
  if (boundaryGazetteers.length === 0) return null;

  const components = splitComponents(placeName);
  if (components.length === 0) return null;

  // Collect all candidates across all boundary gazetteers
  const allCandidates: MatchCandidate[] = [];

  for (const gaz of boundaryGazetteers) {
    allCandidates.push(...findMatches(components, gaz));
  }

  if (allCandidates.length === 0) return null;

  // Sort by match quality (fewest contradictions, then fewest unmatched,
  // then prefer the stem — same rule as `pickBest`, see resolver.ts above).
  allCandidates.sort((a, b) => {
    if (a.contradictions !== b.contradictions) return a.contradictions - b.contradictions;
    if (a.unmatched.length !== b.unmatched.length) return a.unmatched.length - b.unmatched.length;
    return a.depth - b.depth;
  });

  const bestUnmatched = allCandidates[0].unmatched.length;
  const topCandidates = allCandidates.filter(c => c.unmatched.length === bestUnmatched);

  // Pick the best candidate — use hint lat/lon to disambiguate if multiple match
  let chosen: MatchCandidate;
  if (topCandidates.length > 1 && hint) {
    chosen = topCandidates.reduce((best, c) => {
      const node = c.path[c.path.length - 1];
      const bestNode = best.path[best.path.length - 1];
      return distanceSq(node.lat, node.lon, hint.lat, hint.lon) <
             distanceSq(bestNode.lat, bestNode.lon, hint.lat, hint.lon)
        ? c : best;
    });
  } else {
    chosen = topCandidates[0];
  }

  const deepestNode = chosen.path[chosen.path.length - 1];
  if (!deepestNode.geometry) return null;

  const isLeaf = !deepestNode.children || deepestNode.children.length === 0;
  const ambiguous = !hint && topCandidates.length > 1 &&
    new Set(topCandidates.map(c => {
      const n = c.path[c.path.length - 1];
      return `${n.lat},${n.lon}`;
    })).size > 1;

  let matchQuality: BoundaryResolveResult['matchQuality'];
  if (ambiguous) {
    matchQuality = 'ambiguous';
  } else if (chosen.unmatched.length === 0 && isLeaf) {
    matchQuality = 'exact';
  } else {
    matchQuality = 'partial';
  }

  return {
    geometry: deepestNode.geometry,
    matchedPath: chosen.matched,
    matchQuality,
    nodeType: deepestNode.type,
  };
}
