# Set profile picture from face tag / media row

## Goal

Let users set a person's profile picture directly from:
1. The face-tags list in `MediaPanel` (when a face is tagged to a person)
2. The per-person media list in `PersonMediaSection`

Use a radio-button-style star interaction. Outline star (☆) = "make this the profile", filled star (★) = "is the profile". Clicking one fills it and unfills whichever row was previously filled.

## Background

Profile picture = first `MediaLink` (entity_type=`person`) for a person, ordered by `sort_order`. Today, the only way to change it is to click the up-arrow in `PersonMediaSection` repeatedly until the row reaches index 0. There is no way at all to do this from the media viewer / face tag list.

Assigning a person to a face tag already creates a `MediaLink` between the media and the person if one does not exist (see `MediaPanel.assignPersonToRegion`), so the link always exists for any tagged person.

## UX

### MediaPanel — face tag rows

Only rows where `r.person_id` is set get the star control. Star sits between the face-tag name and the delete (✕) button.

- ☆ + tooltip "Set as profile picture" → click reorders the person's `media_links` so the current media's link_id is first; row turns ★
- ★ + tooltip "Current profile picture" → no-op on click

Rows without a `person_id` (unassigned faces) render no star (the space collapses — existing layout for those rows is unchanged).

**Important: multiple stars can be filled simultaneously in this list.** Each row is a different person, and the star is a per-person state ("is this media this person's profile?"). If the same photo is the profile picture for three different tagged persons, all three rows show ★. Clicking ☆ on row A only changes person A's profile; it does not unfill other rows.

### PersonMediaSection — media rows

Replace the existing `{{ $t('media.profile') }}` text badge on `idx === 0` with the same ☆/★ radio:

- Every row: ☆ or ★
- Click ☆ on row N → reorder `media_links` array putting row N's `link_id` first → call `media.reorder` → emit `profileChanged`
- The up/down arrows stay (still useful to reorder non-profile rows relative to each other)

Because this list is one person's media, exactly one row is filled at a time here — true radio behavior within the list.

Also improves alignment: the text badge currently takes a variable slot; a fixed-size star sits consistently with the arrow buttons.

### i18n keys (new)

Add to both `sv.ts` and `en.ts`:

- `media.setAsProfile` — "Sätt som profilbild" / "Set as profile picture"
- `media.currentProfile` — "Nuvarande profilbild" / "Current profile picture"

## Implementation

### Shared logic

Extract a small helper used by both components:

```ts
// src/renderer/utils/mediaProfile.ts
export async function setMediaAsPersonProfile(personId: string, mediaId: string): Promise<void> {
  const links = await window.api.media.forEntity('person', personId) as { id: string; link_id: string }[];
  const target = links.find(l => l.id === mediaId);
  if (!target) return;
  const reordered = [target.link_id, ...links.filter(l => l.id !== mediaId).map(l => l.link_id)];
  await window.api.media.reorder(reordered);
}
```

This is the one code path. Both the face-tag star and the media-row star call it.

### MediaPanel changes

`RegionData` interface already carries `person_id`. Add a derived reactive map `regionIsProfile: Record<string, boolean>` keyed by region id, computed after `regions.value` is loaded:

```ts
async function computeRegionProfileState() {
  const newState: Record<string, boolean> = {};
  for (const r of regions.value) {
    if (!r.person_id) continue;
    const links = await window.api.media.forEntity('person', r.person_id) as { id: string; link_id: string }[];
    newState[r.id] = links.length > 0 && links[0].id === props.mediaId;
  }
  regionIsProfile.value = newState;
}
```

Called at the end of `load()` and after `setProfile()` resolves.

Template adds the star between the name span and the ✕ button:

```vue
<button
  v-if="r.person_id"
  class="star-btn"
  :class="{ 'is-profile': regionIsProfile[r.id] }"
  :title="regionIsProfile[r.id] ? $t('media.currentProfile') : $t('media.setAsProfile')"
  :disabled="regionIsProfile[r.id]"
  @click="setProfileForRegion(r)"
>{{ regionIsProfile[r.id] ? '★' : '☆' }}</button>
```

`setProfileForRegion(r)` calls the shared helper, then `computeRegionProfileState()`, then `emit('link-changed')`.

### PersonMediaSection changes

Replace the profile-badge cell content:

```vue
<td class="td-shrink order-cell">
  <button
    class="star-btn"
    :class="{ 'is-profile': idx === 0 }"
    :title="idx === 0 ? $t('media.currentProfile') : $t('media.setAsProfile')"
    :disabled="idx === 0"
    @click.stop="setAsProfile(idx)"
  >{{ idx === 0 ? '★' : '☆' }}</button>
  <button class="btn-order" :disabled="idx === 0" @click.stop="moveUp(idx)" :title="$t('media.moveUp')">&#9650;</button>
  <button class="btn-order" :disabled="idx === media.length - 1" @click.stop="moveDown(idx)" :title="$t('media.moveDown')">&#9660;</button>
</td>
```

```ts
function setAsProfile(idx: number) {
  if (idx === 0) return;
  const items = [...media.value];
  const [picked] = items.splice(idx, 1);
  items.unshift(picked);
  reorder(items); // existing function already calls media.reorder + emit
}
```

`setAsProfile` reuses the component's existing `reorder()`, so no dependency on the shared helper here (PersonMediaSection already has the link_id array in memory).

### CSS

In `shared.css` or each component's scoped block (pick whichever matches existing patterns — both files keep local styling for button groups, so scoped is fine). Minimal button style: transparent background, star-sized, color-muted default, accent when `is-profile`, disabled cursor when profile.

```css
.star-btn {
  background: none;
  border: 1px solid transparent;
  cursor: pointer;
  padding: 0 3px;
  font-size: 14px;
  color: var(--text-muted);
  line-height: 1;
}
.star-btn:hover:not(:disabled) { color: var(--accent); border-color: var(--surface-border); }
.star-btn.is-profile { color: var(--accent); cursor: default; }
.star-btn:disabled { cursor: default; }
```

## Out of scope

- No backend/schema changes. This is a pure renderer feature on existing `media.reorder` IPC.
- `EntityMediaSection` (generic entity media) is not touched — profile concept is person-specific.
- No new MCP tools.

## Testing

Manual:
- Open a media with multiple face tags (≥2 tagged persons) and verify each person's star reflects their current profile.
- Click ☆ on a face tag → that media becomes that person's profile (verify in `PersonDetailView` → Media section, first row is starred).
- In `PersonMediaSection`, click ☆ on row 2 → that row moves to row 0 and the star fills; previously filled row becomes ☆.
- Click ★ → no-op.
- Verify tooltips show expected Swedish/English strings in both locales.

No unit tests needed — this is presentation over existing `media.reorder` which has existing coverage.

## Version

Minor bump on completion: `v0.119.6` → `v0.120.0` (feature).
