# Hourglass Chart: Outline Placeholder Architecture

## Problem

The hourglass chart needs to show "add person" outline placeholders for the selected person — always injecting father, mother, child, and spouse outlines regardless of existing relationships. The current layout algorithm (ahnentafel-based ancestors, focal-only spouses/children) cannot support this because:

1. **Ahnentafel limits parents to 2** — a third parent outline breaks the numbering
2. **Spouses only exist for the focal person** — selecting a sibling or ancestor can't show spouse outlines
3. **Children only exist in the descendant tree** — ancestors and siblings can't show child outlines
4. **Layout special-cases focal vs non-focal** — outlines get filtered by focus logic

## Key Insight: Separation of Concerns

Three independent steps, strictly ordered:

### Step 1: Outline Injection (trivial, unconditional)

For the selected person, always inject exactly 4 outlines:
- **Father outline** — added to parent list
- **Mother outline** — added to parent list
- **Child outline** — added to children list
- **Spouse outline** — right of self/last-spouse if male, left if female

No conditions. No checking existing relationships. If the person has 2 real parents, they get 2 outline parents too (4 total). The injection logic is a simple function with zero branching.

### Step 2: Layout/Routing (complex, treats all nodes uniformly)

The algorithm positions ALL nodes — real and outline — identically. For any person in the tree:
- **0+ parents** above them, side by side, connected down
- **0+ children** below them, side by side, connected up
- **0+ spouses** beside them (males connect right, females connect left)

The layout never checks whether a node is real or outline. It sees N parents, M children, K spouses and positions them. This is the hard part.

### Step 3: Focus Person Filtering (tree scope)

The focal person determines which real nodes are loaded and visible. Collapse/expand toggles filter real nodes. **Outlines are never filtered.** This step only affects real nodes.

### Step 4: Rendering (visual distinction only)

Real nodes → solid boxes. Outlines → dashed boxes with "+" and role label. Click handlers differ (outlines open AddRelatedPersonModal). That's it.

## Architecture Change

### Current: Ahnentafel + Focal-centric

```
ancestorNodes: Map<ahnentafel_key, PersonNode>  // binary tree, max 2 parents
descendantRoot: DescendantNode                   // recursive tree, focal only
spouses: PersonNode[]                            // focal only
siblings: PersonNode[]                           // focal only
```

### Target: General Graph Model

Each person in the tree can have:
```typescript
interface TreePerson {
  person: PersonNode;
  parents: TreePerson[];       // 0+ (was: max 2 via ahnentafel)
  children: TreePerson[];      // 0+ (was: only for focal/descendants)
  spouses: TreePerson[];       // 0+ (was: only for focal)
  isPlaceholder?: boolean;     // outline vs real
  placeholderRole?: 'father' | 'mother' | 'child' | 'spouse';
  placeholderForPersonId?: string; // who the outline belongs to
}
```

The layout algorithm works on this uniform structure. The ahnentafel numbering is abandoned for layout purposes (kept only for data fetching).

## Implementation Tasks

### Phase 1: Data Model Refactor
- [ ] Define `TreePerson` interface in `chart-layout/types.ts`
- [ ] Create `buildHourglassTree()` that converts `HourglassTree` → `TreePerson` graph
- [ ] Wire outline injection into `buildHourglassTree()` for the selected person

### Phase 2: Layout Algorithm
- [ ] Rewrite `computeHourglassLayout()` to work on `TreePerson` graph
- [ ] Parent row: position N parents side by side above person, centered
- [ ] Spouse placement: position spouses beside any person (male→right, female→left)
- [ ] Child row: position N children side by side below person, centered
- [ ] Connector lines: fork from person to parents above, fork to children below, horizontal marriage line to spouses

### Phase 3: Rendering
- [ ] Extract placeholder boxes from layout (existing pattern)
- [ ] Convert solid lines touching placeholders to dashed (existing pattern)
- [ ] Ghost box click → AddRelatedPersonModal with correct mode
- [ ] Ensure collapse/expand buttons don't appear on placeholder nodes

### Phase 4: Edge Cases
- [ ] Selected person has 2 real parents + 2 outline parents (4 total)
- [ ] Selected person is a sibling (not in descendant tree) — spouse/child outlines
- [ ] Selected person is an ancestor — child outline below them
- [ ] Spouse outline for non-focal persons
- [ ] Deep descendant selected — child outline at max depth + 1
- [ ] Collapsed subtree — outlines still visible for selected person

## Files Changed

- `src/renderer/utils/chart-layout/types.ts` — add `TreePerson` interface
- `src/renderer/utils/chart-layout/hourglass.ts` — rewrite layout algorithm
- `src/renderer/components/charts/HourglassChart.vue` — update rendering
- `src/renderer/views/VisualizationView.vue` — pass selectedPersonId

## Risk

This is a significant refactor of the hourglass layout. The pedigree chart is unaffected. Unit tests for hourglass layout (in `chartLayout.test.ts`) will need updating.
