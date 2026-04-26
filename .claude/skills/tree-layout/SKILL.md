---
name: tree-layout
description: Layout algorithm patterns for tree charts (pedigree, hourglass, descendant). Use when building or modifying any chart layout that positions boxes in a tree structure.
---

# Tree Layout Skill

## The Pipeline

Every tree chart layout follows this pipeline:

1. **Clone** - deep-clone input tree (Vue computed re-runs on same ref)
2. **Inject** - add outline placeholders for the selected person (`injectOutlines`)
3. **Collapse** - prune collapsed branches (preserve placeholders)
4. **Measure heights** - pre-compute per-box `h` via `measureBoxHeight(person)` into a `heightOf: Map<string, number>`; `hOf(node)` accessor
5. **Measure footprint** - horizontal bounding extents per person (see Footprint section)
6. **Place** - position all boxes using both measurements
7. **Connect** - emit curved `<path>` strings via `curvedElbow()` into `paths: string[]` (solid); dashed placeholder connectors prefixed `"D:"`
8. **Finalize** - SVG dimensions, shift, collapse buttons, extract placeholders

## Placeholder Handling — Critical Rule

**Recursive spacing and placement functions MUST filter out `isPlaceholder` nodes.** Only Pass 4 (collision avoidance) handles placeholders. This was the root cause of the grandparent clipping bug (v0.78.4).

Functions that must skip placeholders:
- `maxAncestorDepth` / `maxDescDepth` — skip placeholder parents/children (prevents phantom rows)
- `ancestorWidth` — skip placeholder parents in recursion (prevents subtree inflation)
- `ancestorRelCX` — skip placeholder parents in recursion
- `descExtents` — skip placeholder children in recursion
- `placeAncestors` / `placeDescendants` — only recurse into real parents/children

**Exception:** `computeFootprint` DOES include placeholder spouse width. This reserves room in `ancestorWidth` so the outline fits between adjacent ancestors. The room reservation flows through spacing but the outline itself is placed by Pass 4.

## Measurement: Box Height (vertical)

Each person box has a dynamic height driven by its name wrap + optional birth/death lines. Boxes are never pushed with a fixed height.

```typescript
// In every layout, right after injectOutlines + collapse pruning:
const heightOf = new Map<string, number>();
function measureAll(node: TreePerson, visited = new Set<string>()): void {
  if (visited.has(node.person.id)) return;
  visited.add(node.person.id);
  heightOf.set(node.person.id, node.isPlaceholder ? MIN_BOX_H : measureBoxHeight(node.person));
  for (const p of node.parents) measureAll(p, visited);
  for (const c of node.children) measureAll(c, visited);
  for (const s of node.spouses) measureAll(s, visited);
}
measureAll(root);
const hOf = (node: TreePerson) => heightOf.get(node.person.id) ?? MIN_BOX_H;
```

Then every `boxes.push({ ..., w: BOX_W, h: hOf(node) })` — never `h: MIN_BOX_H` unless it's a placeholder. `measureBoxHeight` lives in `chart-layout/measure.ts` and uses the Canvas `measureText` API via `wrapName(name, TEXT_AREA_W, 12)`.

**Row Y spacing depends on chart type:**
- **Pedigree (leaves along Y):** per-leaf running cumulative cursor — `cursorY += hOf(leaf) + V_GAP` — leafCY set from that. Internal `cy` averages parent centers as before.
- **Descendant + Hourglass (rows by generation):** per-row max height array. `rowMaxH[d] = Math.max(MIN_BOX_H, ...hOf(all nodes at depth d))`, then cumulative `rowTopY[d] = rowTopY[d-1] + rowMaxH[d-1] + GEN_GAP`. Hourglass needs two arrays — `ancestorRowTopY[]` going up and `descendantRowTopY[]` going down, with the focal row height = `max(ancRowMaxH[0], descRowMaxH[0], hOf(root), spouses..., siblings...)`.

## Measurement: Footprint

Every person has a bounding footprint - the total horizontal space they need including their real spouses and outline placeholders.

```typescript
interface Footprint {
  left: number;   // extent left of person's center
  right: number;  // extent right of person's center
}
```

Two variants:
- **`computeFootprint(node)`** — includes real spouses + placeholder spouse. Used by `ancestorWidth` and `descExtents` for room reservation.
- **`ancestorFootprint(node)`** — real spouses only, no placeholder. Available for cases needing stable centering.

Spouse direction:
- Real spouses: left for F, right for M/U
- Placeholder spouse: opposite side (away from real spouses)

## Spacing

Recursive spacing functions consume footprints:
- `ancestorWidth(node)` = max(sum of **real** parent subtree widths, node footprint width)
- `ancestorRelCX(node)` = clamp(parentMidCX, max(fp.left, halfParent), min(w-fp.right, w-halfParent))
- `descExtents(node)` = [max(fp.left, childSpan/2 + first.left), max(fp.right, childSpan/2 + last.right)]
- Focal row: walk outward accumulating directional footprint (toward-focal + away-from-focal)

**halfParent constraint:** `ancestorRelCX` constrains the center so that the parent span fits within the subtree slot. Without this, asymmetric placeholder widths cause parents to overshoot their allocated space.

## Placement

Four passes:
1. **Ancestors** (upward recursion) - places boxes + real spouses. **Skips placeholder parents.**
2. **Descendants** (downward recursion) - places boxes + real spouses. **Skips placeholder children.**
3. **Focal row** - focal box + manual spouse/sibling placement
4. **Outlines** - collision avoidance for ALL unplaced placeholders (spouse, parent, child)

Pass 4 checks `placedIds` — any node not yet in the boxes array is placed with collision avoidance.

## Collision Avoidance

```
function placeOutlineGroup(nodes, ownerCX, ownerY, direction):
  1. Compute targetY one row away from owner
  2. Try centered group at ownerCX
  3. If collides with any placed box, scan candidate positions (after/before each row box)
  4. Pick the closest non-colliding position to ownerCX
  5. Place boxes + fork connectors
```

Spouse outlines use `findClearX` — starts at ideal position, scans outward in the direction determined by the selected person's sex.

## Connector Routing — curved paths

As of v0.114.0 connectors are SVG `<path>` elements with Q-bezier elbows, not straight `<line>` segments. Every layout emits path `d` strings into `ChartLayout.paths: string[]`; `lines` is always `[]`.

```typescript
import { curvedElbow } from './connectors';

// Pedigree: child right edge → parent left edge
paths.push(curvedElbow(childRightX, childCY, parentLeftX, parentCY, 'right'));

// Descendant / hourglass: parent bottom → child top
paths.push(curvedElbow(parentCX, parentBottomY, childCX, childTopY, 'down'));
```

`curvedElbow(fromX, fromY, toX, toY, 'right' | 'down')` returns a single valid SVG `d` string — one curve per edge. Collinear endpoints collapse to `M … H …` or `M … V …` (still a valid path). No more three-segment fork/horizontal/vertical patterns.

**Dashed placeholder convention.** Solid connectors between real boxes start with `M `; dashed connectors from a real box to an outline placeholder are prefixed with `"D:"` before being appended to the same `paths` array:

```typescript
for (const d of placeholderPaths) paths.push('D:' + d);
```

The Vue components (`PedigreeChart.vue`, `DescendantChart.vue`, `HourglassChart.vue`) split them at render time with two computeds:

```typescript
const solidPaths  = computed(() => layout.value.paths.filter(d => !d.startsWith('D:')));
const dashedPaths = computed(() => layout.value.paths.filter(d => d.startsWith('D:')).map(d => d.slice(2)));
```

`placeholderLines: Line[]` is retained in the return type for backwards compatibility but is always `[]`.

## Chart box rendering (Vue side)

Each chart component renders per-box with dynamic `h`:

```vue
<g v-for="box in layout.boxes" filter="url(#chart-shadow)" ...>
  <rect :x="box.x" :y="box.y" :width="box.w" :height="box.h" rx="6" ... />
  <!-- sex bar (3px), portrait (34×44), wrapped name, birth/death lines ... -->
</g>
```

All three charts wrap the box group in `filter="url(#chart-shadow)"`, with the filter defined once at the top of the `<svg>`:

```vue
<defs>
  <filter id="chart-shadow" x="-3%" y="-6%" width="106%" height="116%">
    <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-opacity="0.06" />
  </filter>
</defs>
```

Portrait photos: `PersonNode.photoUrl` is a **square cropped face**, not the raw media. `chartData.fetchPersonNode` calls `window.api.media.profilePicRef(personId)` to get the `(mediaId, region)` pair the avatar store uses, fetches the source via `media.readAsDataUrl`, and runs it through `cropImageToDataUrl(raw, region)` (in [`src/renderer/utils/cropImage.ts`](../../../src/renderer/utils/cropImage.ts)) to produce a 128×128 jpeg centred on the tagging region. SVG `<image href>` cannot load raw filesystem paths from the renderer origin — always route through `readAsDataUrl`. `chartData.ts` caches the cropped result per `personId` (siblings sharing one family portrait pay one fetch but get a separate crop each).

**Trees show the tagged face or nothing** — never the raw media. If `profilePicRef` returns `{ mediaId, region: null }` (a media link without a face tag), `chartData` returns `null` and the box falls through to the initials placeholder. Don't add a centre-crop fallback for the untagged case: that path renders as "the whole media zoomed in" and was the bug v0.157.7 fixed. The avatar store ([`stores/profilePic.ts`](../../../src/renderer/stores/profilePic.ts)) follows the same rule, so list rows / panel headers / mini cards / tree boxes stay in lockstep — and `profilePicStore.invalidatePerson(id)` propagates into `chartData.invalidatePersonPhoto(id)` automatically. To get a tree photo, the user must tag the face.

Don't render `<AppAvatar>` directly inside chart SVGs — charts use `<image>` / SVG primitives so the rendered tree can also be exported as a self-contained SVG. Pull the same cropped data URL via `box.person.photoUrl` and render it in an `<image>` element with `preserveAspectRatio="xMidYMid slice"`.

## Invariants

1. No box overlaps any other box
2. No line passes through any box
3. Every outline is connected to its owner
4. Outlines are as close to their owner as possible
5. **Selecting a person never adds phantom generation rows**
6. **Placeholder nodes never participate in recursive spacing/placement**

## Files

- `src/renderer/utils/chart-layout/hourglass.ts` - hourglass layout
- `src/renderer/utils/chart-layout/hourglass-tree.ts` - TreePerson builders + `injectOutlines()`
- `src/renderer/utils/chart-layout/pedigree.ts` - pedigree layout
- `src/renderer/utils/chart-layout/descendant.ts` - descendant layout
- `src/renderer/utils/chart-layout/measure.ts` - `wrapName()`, `measureBoxHeight()` — Canvas-backed text measurement for dynamic box heights
- `src/renderer/utils/chart-layout/connectors.ts` - `curvedElbow()` — SVG path builder for Q-bezier elbow connectors
- `src/renderer/utils/chart-layout/types.ts` - TreePerson, BoxLayout, ChartLayout (with `paths: string[]`), etc.
- `src/renderer/utils/chart-layout/constants.ts` - BOX_W, MIN_BOX_H, V_GAP, H_GAP, GEN_GAP, PAD, PORTRAIT_W/H, BOX_PAD_Y, CURVE_R, TEXT_AREA_W (no `BOX_H` — heights are per-node)
- `src/renderer/utils/chartData.ts` - `fetchPersonNode()` with photo data-URL resolution + session cache
